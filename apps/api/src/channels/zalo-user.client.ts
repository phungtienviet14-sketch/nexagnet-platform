import { Injectable, Logger, type OnModuleDestroy, type OnModuleInit } from '@nestjs/common';
import { mkdir, readFile, writeFile } from 'node:fs/promises';
import { dirname, join } from 'node:path';
import { loadEnv } from '@ultty/shared';
import {
  LoginQRCallbackEventType,
  ThreadType,
  Zalo,
  type API,
  type Credentials,
  type LoginQRCallbackEvent,
  type Message,
} from 'zca-js';

/** Callback nhan 1 tin tu listener zca-js (ingest dang ky qua setMessageHandler). */
export type ZcaMessageHandler = (message: Message) => void | Promise<void>;

/** User-Agent mac dinh khi quet QR lan dau (zca-js gan vao phien; luu cung cred). */
const DEFAULT_USER_AGENT =
  'Mozilla/5.0 (Windows NT 10.0; Win64; x64) AppleWebKit/537.36 (KHTML, like Gecko) Chrome/122.0.0.0 Safari/537.36';

/** Quyen han che cho secret at-rest (cred = session token). No-op tren Windows (NTFS ACL). */
const SECRET_FILE_MODE = 0o600;
const SECRET_DIR_MODE = 0o700;

/**
 * Tang 1 (kenh zca) — quan ly PHIEN dang nhap tai khoan ca nhan qua thu vien ngoai zca-js.
 * Tach bach: client nay lo dang nhap + giu `api` + gui/nhan tin; ZcaListener (ingest) chi
 * dang ky handler, ZcaAdapter (gui) chi goi sendMessage. KHONG phu thuoc PipelineService.
 *
 * Dang nhap: co file cred (ZALO_CRED_PATH) -> login lai khong can QR; chua co -> quet QR 1 lan
 * roi luu cred. Dang nhap chay NEN (khong chan boot API): loi dang nhap chi tat kenh zca,
 * app van chay (mock/bot lam luoi an toan).
 *
 * CANH BAO: zca-js vi pham ToS Zalo, co the bi khoa tai khoan -> dung TAI KHOAN PHU (xem CLAUDE.md).
 */
@Injectable()
export class ZaloUserClient implements OnModuleInit, OnModuleDestroy {
  private readonly logger = new Logger('ZaloUserClient');
  private readonly env = loadEnv();
  private readonly channelMode = this.env.CHANNEL_MODE;
  private readonly credPath = this.env.ZALO_CRED_PATH;
  private readonly qrPath = join(dirname(this.env.ZALO_CRED_PATH), 'zalo-qr.png');
  private readonly selfListen = this.env.ZALO_SELF_LISTEN === 'on';

  private api: API | null = null;
  private started = false;
  private destroyed = false;
  private messageHandler: ZcaMessageHandler | null = null;
  /** Nho loai hoi thoai (group/user) theo threadId de gui dung endpoint (tin 1-1 vs nhom). */
  private readonly threadTypes = new Map<string, ThreadType>();

  onModuleInit(): void {
    if (this.channelMode !== 'zca') {
      this.logger.log(`CHANNEL_MODE=${this.channelMode} -> khong khoi tao zca-js.`);
      return;
    }
    // Chay nen: khong await de tranh chan boot (nhat la khi phai quet QR). connect() tu bat loi.
    void this.connect();
  }

  onModuleDestroy(): void {
    // Danh dau tat truoc: neu login dang cho (quet QR) roi moi xong, connect() se KHONG start listener.
    this.destroyed = true;
    try {
      this.api?.listener.stop();
    } catch {
      /* dang tat — bo qua loi stop */
    }
    this.api = null;
  }

  /** Ingest dang ky nhan tin. Neu listener da chay thi gan them ngay (chong dua thu tu init). */
  setMessageHandler(handler: ZcaMessageHandler): void {
    this.messageHandler = handler;
    if (this.api && this.started) {
      this.api.listener.on('message', handler);
    }
  }

  isReady(): boolean {
    return this.api !== null;
  }

  /**
   * Gui tin ra 1 hoi thoai. Loai (group/user) suy tu threadId da thay (mac dinh Group neu chua thay).
   * Nem loi ro rang neu chua dang nhap -> caller xu ly (H1).
   */
  async sendMessage(threadId: string, text: string, type?: ThreadType): Promise<void> {
    if (!this.api) {
      throw new Error('zca-js chua dang nhap — khong the gui tin (kiem tra QR/phien ZALO_CRED_PATH).');
    }
    const resolvedType = type ?? this.threadTypes.get(threadId) ?? ThreadType.Group;
    await this.api.sendMessage(text, threadId, resolvedType);
  }

  private async connect(): Promise<void> {
    const zalo = new Zalo({ selfListen: this.selfListen, checkUpdate: false, logging: false });
    try {
      const cred = await this.readCred();
      if (cred) {
        this.logger.log('Dang nhap zca-js bang phien da luu (khong can QR)...');
        this.api = await zalo.login(cred);
      } else {
        this.logger.warn('Chua co phien zca-js — se tao ma QR de quet (dung TAI KHOAN PHU).');
        this.api = await zalo.loginQR({ userAgent: DEFAULT_USER_AGENT, qrPath: this.qrPath }, (ev) =>
          this.onQrEvent(ev),
        );
      }
      // App da tat trong luc dang nhap -> khong start listener mo coi (chong ro ri sau teardown).
      if (this.destroyed) {
        this.logger.warn('App da tat trong luc dang nhap zca-js — bo qua khoi dong listener.');
        try {
          this.api.listener.stop();
        } catch {
          /* bo qua */
        }
        this.api = null;
        return;
      }
      this.logger.log('zca-js dang nhap THANH CONG — bat dau nghe tin nhom.');
      this.attachListener();
    } catch (error) {
      this.logger.error(
        `zca-js dang nhap that bai: ${errMsg(error)}. Kenh zca tam ngung (dung CHANNEL_MODE=mock/bot lam luoi an toan).`,
      );
    }
  }

  private attachListener(): void {
    if (!this.api || this.destroyed) return;
    const listener = this.api.listener;
    // Ghi nho loai hoi thoai cho moi tin den -> sendMessage gui dung endpoint group/user.
    listener.on('message', (m) => this.threadTypes.set(m.threadId, m.type));
    listener.on('connected', () => this.logger.log('zca-js listener: connected'));
    listener.on('closed', (code, reason) => this.logger.warn(`zca-js listener closed (${code}): ${reason}`));
    listener.on('error', (err) => this.logger.warn(`zca-js listener error: ${errMsg(err)}`));
    if (this.messageHandler) {
      listener.on('message', this.messageHandler);
    }
    listener.start({ retryOnClose: true });
    this.started = true;
  }

  private onQrEvent(ev: LoginQRCallbackEvent): void {
    switch (ev.type) {
      case LoginQRCallbackEventType.QRCodeGenerated:
        // QUAN TRONG: khi truyen callback, zca-js KHONG tu ghi file — phai goi saveToFile thu cong.
        void ev.actions.saveToFile(this.qrPath).catch((error: unknown) => {
          this.logger.error(`Ghi file QR that bai (${this.qrPath}): ${errMsg(error)}`);
        });
        this.logger.warn(
          `📱 QUET MA QR de dang nhap zca-js: mo file ${this.qrPath} bang dien thoai (Zalo > quet QR). Dung TAI KHOAN PHU.`,
        );
        break;
      case LoginQRCallbackEventType.QRCodeScanned:
        this.logger.log(`Da quet QR (${ev.data.display_name}). Xac nhan tren dien thoai de hoan tat...`);
        break;
      case LoginQRCallbackEventType.QRCodeExpired:
        this.logger.warn('Ma QR het han — se tao lai.');
        break;
      case LoginQRCallbackEventType.QRCodeDeclined:
        this.logger.warn('Dang nhap bi tu choi tren dien thoai.');
        break;
      case LoginQRCallbackEventType.GotLoginInfo:
        void this.saveCred({ imei: ev.data.imei, cookie: ev.data.cookie, userAgent: ev.data.userAgent });
        break;
    }
  }

  /** Doc cred da luu; null neu chua co / hong -> se quet QR. KHONG log noi dung cred (bao mat). */
  private async readCred(): Promise<Credentials | null> {
    try {
      const raw = await readFile(this.credPath, 'utf8');
      const json: unknown = JSON.parse(raw);
      if (isCredentials(json)) return json;
      this.logger.warn(`File phien ${this.credPath} sai dinh dang — se quet QR lai.`);
      return null;
    } catch {
      return null; // file chua ton tai -> quet QR lan dau
    }
  }

  private async saveCred(cred: Credentials): Promise<void> {
    try {
      await mkdir(dirname(this.credPath), { recursive: true, mode: SECRET_DIR_MODE });
      await writeFile(this.credPath, JSON.stringify(cred, null, 2), { encoding: 'utf8', mode: SECRET_FILE_MODE });
      this.logger.log(`Da luu phien zca-js vao ${this.credPath} (lan sau khong can quet QR).`);
    } catch (error) {
      this.logger.warn(`Luu phien zca-js that bai: ${errMsg(error)}`);
    }
  }
}

/** Kiem tra toi thieu 1 object cred hop le (imei + cookie + userAgent). Export de test. */
export function isCredentials(value: unknown): value is Credentials {
  if (value === null || typeof value !== 'object') return false;
  const v = value as Record<string, unknown>;
  return typeof v.imei === 'string' && typeof v.userAgent === 'string' && v.cookie !== undefined;
}

function errMsg(error: unknown): string {
  return error instanceof Error ? error.message : String(error);
}
