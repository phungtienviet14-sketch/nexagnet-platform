import { Injectable, Logger, type OnModuleDestroy, type OnModuleInit } from '@nestjs/common';
import { mkdir, readFile, rename, writeFile } from 'node:fs/promises';
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

export type ZcaMessageHandler = (message: Message) => void | Promise<void>;

export type ZaloConnectionState =
  | 'disabled'
  | 'logged_out'
  | 'connecting'
  | 'qr_ready'
  | 'qr_scanned'
  | 'ready'
  | 'error';

export interface ZaloStatus {
  channelMode: 'mock' | 'bot' | 'zca';
  state: ZaloConnectionState;
  displayName?: string;
  qrVersion: number;
  qrExpiresAt?: string;
  allowedGroupIds: string[];
  error?: string;
}

export interface ZaloGroupView {
  id: string;
  name: string;
  memberCount: number;
  allowed: boolean;
}

const DEFAULT_USER_AGENT =
  'Mozilla/5.0 (Windows NT 10.0; Win64; x64) AppleWebKit/537.36 (KHTML, like Gecko) Chrome/122.0.0.0 Safari/537.36';
const SECRET_FILE_MODE = 0o600;
const SECRET_DIR_MODE = 0o700;
const MAX_ALLOWED_GROUPS = 10;
const QR_TTL_MS = 100_000;
const GROUP_INFO_BATCH_SIZE = 50;

/**
 * Quan ly phien zca-js va allowlist nhom. Neu da co credential thi tu reconnect khi boot;
 * neu chua co, QR chi duoc tao sau thao tac xac nhan rui ro tren trang operator.
 */
@Injectable()
export class ZaloUserClient implements OnModuleInit, OnModuleDestroy {
  private readonly logger = new Logger('ZaloUserClient');
  private readonly env = loadEnv();
  private readonly channelMode = this.env.CHANNEL_MODE;
  private readonly credPath = this.env.ZALO_CRED_PATH;
  private readonly allowedGroupsPath = this.env.ZALO_ALLOWED_GROUPS_PATH;
  private readonly qrPath = join(dirname(this.env.ZALO_CRED_PATH), 'zalo-qr.png');
  private readonly selfListen = this.env.ZALO_SELF_LISTEN === 'on';

  private api: API | null = null;
  private connectionTask: Promise<void> | null = null;
  private started = false;
  private destroyed = false;
  private messageHandler: ZcaMessageHandler | null = null;
  private connectionState: ZaloConnectionState = 'disabled';
  private displayName: string | undefined;
  private lastError: string | undefined;
  private qrImage: string | null = null;
  private qrVersion = 0;
  private qrExpiresAt: Date | null = null;
  private allowedGroupIds = new Set<string>();
  private readonly threadTypes = new Map<string, ThreadType>();

  async onModuleInit(): Promise<void> {
    await this.loadAllowedGroups();
    if (this.channelMode !== 'zca') {
      this.connectionState = 'disabled';
      this.logger.log(`CHANNEL_MODE=${this.channelMode} -> khong khoi tao zca-js.`);
      return;
    }
    // Da co phien thi tu reconnect. Khong co phien thi cho operator xac nhan tren UI.
    void this.connect(false);
  }

  onModuleDestroy(): void {
    this.destroyed = true;
    this.stopListener();
    this.api = null;
  }

  setMessageHandler(handler: ZcaMessageHandler): void {
    this.messageHandler = handler;
    if (this.api && this.started) this.api.listener.on('message', handler);
  }

  isReady(): boolean {
    return this.api !== null;
  }

  isGroupAllowed(groupId: string): boolean {
    return this.allowedGroupIds.has(groupId);
  }

  status(): ZaloStatus {
    return {
      channelMode: this.channelMode,
      state: this.connectionState,
      ...(this.displayName ? { displayName: this.displayName } : {}),
      qrVersion: this.qrVersion,
      ...(this.qrExpiresAt ? { qrExpiresAt: this.qrExpiresAt.toISOString() } : {}),
      allowedGroupIds: [...this.allowedGroupIds].sort(),
      ...(this.lastError ? { error: this.lastError } : {}),
    };
  }

  qrDataUrl(): string | null {
    if (this.connectionState !== 'qr_ready' || !this.qrImage) return null;
    return `data:image/png;base64,${this.qrImage}`;
  }

  startQrLogin(): void {
    if (this.channelMode !== 'zca') throw new Error('CHANNEL_MODE khong phai zca');
    if (this.api || this.connectionTask) return;
    void this.connect(true);
  }

  async setAllowedGroupIds(groupIds: readonly string[]): Promise<void> {
    const normalized = normalizeAllowedGroupIds(groupIds);
    await this.writePrivateJson(this.allowedGroupsPath, normalized);
    this.allowedGroupIds = new Set(normalized);
  }

  async listGroups(): Promise<ZaloGroupView[]> {
    if (!this.api) throw new Error('Zalo chua ket noi');
    const all = await this.api.getAllGroups();
    const ids = Object.keys(all.gridVerMap);
    const groups: ZaloGroupView[] = [];
    for (let offset = 0; offset < ids.length; offset += GROUP_INFO_BATCH_SIZE) {
      const batch = ids.slice(offset, offset + GROUP_INFO_BATCH_SIZE);
      const response = await this.api.getGroupInfo(batch);
      for (const group of Object.values(response.gridInfoMap)) {
        groups.push({
          id: group.groupId,
          name: group.name,
          memberCount: group.totalMember,
          allowed: this.allowedGroupIds.has(group.groupId),
        });
      }
    }
    return groups.sort((a, b) => a.name.localeCompare(b.name, 'vi'));
  }

  async sendMessage(threadId: string, text: string, type?: ThreadType): Promise<void> {
    if (!this.api) throw new Error('zca-js chua dang nhap - khong the gui tin');
    const resolvedType = type ?? this.threadTypes.get(threadId) ?? ThreadType.Group;
    await this.api.sendMessage(text, threadId, resolvedType);
  }

  private connect(allowQr: boolean): Promise<void> {
    if (this.connectionTask) return this.connectionTask;
    this.connectionTask = this.performConnect(allowQr).finally(() => {
      this.connectionTask = null;
    });
    return this.connectionTask;
  }

  private async performConnect(allowQr: boolean): Promise<void> {
    this.connectionState = 'connecting';
    this.lastError = undefined;
    const zalo = new Zalo({ selfListen: this.selfListen, checkUpdate: false, logging: false });
    try {
      const cred = await this.readCred();
      if (cred) {
        this.logger.log('Dang nhap zca-js bang phien da luu...');
        this.api = await zalo.login(cred);
      } else if (allowQr) {
        this.api = await zalo.loginQR({ userAgent: DEFAULT_USER_AGENT, qrPath: this.qrPath }, (event) =>
          this.onQrEvent(event),
        );
      } else {
        this.connectionState = 'logged_out';
        return;
      }
      if (this.destroyed) {
        this.stopListener();
        this.api = null;
        return;
      }
      this.connectionState = 'ready';
      this.qrImage = null;
      this.qrExpiresAt = null;
      this.logger.log('zca-js dang nhap thanh cong - listener chi xu ly nhom trong allowlist.');
      this.attachListener();
    } catch (error) {
      const message = errMsg(error);
      this.api = null;
      this.connectionState = 'error';
      this.qrImage = null;
      this.qrExpiresAt = null;
      this.lastError = 'Khong the ket noi Zalo. Hay tao QR moi hoac kiem tra phien da luu.';
      this.logger.error(`zca-js dang nhap that bai: ${message}`);
    }
  }

  private attachListener(): void {
    if (!this.api || this.destroyed) return;
    const listener = this.api.listener;
    listener.on('message', (message) => this.threadTypes.set(message.threadId, message.type));
    listener.on('connected', () => this.logger.log('zca-js listener: connected'));
    listener.on('closed', (code, reason) => this.logger.warn(`zca-js listener closed (${code}): ${reason}`));
    listener.on('error', (error) => this.logger.warn(`zca-js listener error: ${errMsg(error)}`));
    if (this.messageHandler) listener.on('message', this.messageHandler);
    listener.start({ retryOnClose: true });
    this.started = true;
  }

  private stopListener(): void {
    try {
      this.api?.listener.stop();
    } catch {
      // Dang teardown; listener co the chua start.
    }
    this.started = false;
  }

  private onQrEvent(event: LoginQRCallbackEvent): void {
    switch (event.type) {
      case LoginQRCallbackEventType.QRCodeGenerated:
        this.qrImage = event.data.image;
        this.qrVersion += 1;
        this.qrExpiresAt = new Date(Date.now() + QR_TTL_MS);
        this.connectionState = 'qr_ready';
        void event.actions.saveToFile(this.qrPath).catch((error: unknown) => {
          this.logger.warn(`Khong ghi duoc ban QR tam: ${errMsg(error)}`);
        });
        break;
      case LoginQRCallbackEventType.QRCodeScanned:
        this.displayName = event.data.display_name;
        this.connectionState = 'qr_scanned';
        this.qrImage = null;
        this.qrExpiresAt = null;
        break;
      case LoginQRCallbackEventType.QRCodeExpired:
        this.qrImage = null;
        this.qrExpiresAt = null;
        event.actions.retry();
        break;
      case LoginQRCallbackEventType.QRCodeDeclined:
        this.connectionState = 'error';
        this.lastError = 'Dang nhap da bi tu choi tren dien thoai.';
        this.qrImage = null;
        this.qrExpiresAt = null;
        event.actions.abort();
        break;
      case LoginQRCallbackEventType.GotLoginInfo:
        void this.saveCred({
          imei: event.data.imei,
          cookie: event.data.cookie,
          userAgent: event.data.userAgent,
        }).catch((error: unknown) => this.logger.warn(`Khong luu duoc phien zca-js: ${errMsg(error)}`));
        break;
    }
  }

  private async readCred(): Promise<Credentials | null> {
    try {
      const raw = await readFile(this.credPath, 'utf8');
      const json: unknown = JSON.parse(raw);
      return isCredentials(json) ? json : null;
    } catch {
      return null;
    }
  }

  private async saveCred(cred: Credentials): Promise<void> {
    await this.writePrivateJson(this.credPath, cred);
    this.logger.log('Da luu phien zca-js vao volume rieng.');
  }

  private async loadAllowedGroups(): Promise<void> {
    try {
      const raw = await readFile(this.allowedGroupsPath, 'utf8');
      const json: unknown = JSON.parse(raw);
      if (!Array.isArray(json) || !json.every((value) => typeof value === 'string')) return;
      this.allowedGroupIds = new Set(normalizeAllowedGroupIds(json));
    } catch {
      this.allowedGroupIds = new Set();
    }
  }

  private async writePrivateJson(path: string, value: unknown): Promise<void> {
    await mkdir(dirname(path), { recursive: true, mode: SECRET_DIR_MODE });
    const temporaryPath = `${path}.tmp`;
    await writeFile(temporaryPath, JSON.stringify(value, null, 2), {
      encoding: 'utf8',
      mode: SECRET_FILE_MODE,
    });
    await rename(temporaryPath, path);
  }
}

export function isCredentials(value: unknown): value is Credentials {
  if (value === null || typeof value !== 'object') return false;
  const candidate = value as Record<string, unknown>;
  return (
    typeof candidate.imei === 'string' &&
    typeof candidate.userAgent === 'string' &&
    candidate.cookie !== undefined
  );
}

export function normalizeAllowedGroupIds(groupIds: readonly string[]): string[] {
  if (groupIds.length > MAX_ALLOWED_GROUPS) throw new Error(`Chi duoc cho phep toi da ${MAX_ALLOWED_GROUPS} nhom`);
  const normalized = [...new Set(groupIds.map((groupId) => groupId.trim()))].sort();
  if (normalized.some((groupId) => groupId.length === 0 || groupId.length > 128)) {
    throw new Error('ID nhom khong hop le');
  }
  return normalized;
}

function errMsg(error: unknown): string {
  return error instanceof Error ? error.message : String(error);
}
