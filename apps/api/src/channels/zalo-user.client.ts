import {
  Injectable,
  Logger,
  Optional,
  type OnModuleDestroy,
  type OnModuleInit,
} from '@nestjs/common';
import { mkdir, readFile, rename, unlink, writeFile } from 'node:fs/promises';
import { dirname, join } from 'node:path';
import { loadEnv } from '@netviet/shared';
import type { GroupParticipantProfile, GroupParticipantSyncSnapshot } from '@netviet/shared';
import {
  LoginQRCallbackEventType,
  ThreadType,
  Zalo,
  type API,
  type Credentials,
  type LoginQRCallbackEvent,
  type Message,
  type SendMessageQuote,
} from 'zca-js';
import type { ZaloQuoteTarget } from '@netviet/shared';
import type { OutboundReceipt } from '../messages/outbound-recorder.js';
import { ChannelHealthService } from './channel-health.js';
import {
  nextReconnectDelayMs,
  RECONNECT_VERIFY_MS,
  shouldReconnectAfterClose,
  STABLE_CONNECTION_MS,
} from './listener-reconnect.js';
import type { SendOptions } from './channel-adapter.js';

export type ZcaMessageHandler = (message: Message) => void | Promise<void>;

export type ZaloConnectionState =
  'disabled' | 'logged_out' | 'connecting' | 'qr_ready' | 'qr_scanned' | 'ready' | 'error';

export interface ZaloStatus {
  channelMode: 'mock' | 'bot' | 'zca' | 'hybrid';
  state: ZaloConnectionState;
  displayName?: string;
  qrVersion: number;
  qrExpiresAt?: string;
  allowedGroupIds: string[];
  error?: string;
}

export interface ZaloGroupView {
  id: string;
  globalId?: string;
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
const MEMBER_PROFILE_BATCH_SIZE = 50;

export class ZaloNotConnectedError extends Error {}
export class ZaloGroupNotAllowedError extends Error {}
export class ZaloGroupNotFoundError extends Error {
  constructor(message = 'Khong tim thay nhom Zalo da cho phep') {
    super(message);
    this.name = 'ZaloGroupNotFoundError';
  }
}
export class ZaloApiCommunicationError extends Error {
  constructor(message: string, override readonly cause?: unknown) {
    super(message, cause !== undefined ? { cause } : undefined);
    this.name = 'ZaloApiCommunicationError';
  }
}

/**
 * Quan ly phien zca-js va allowlist nhom. Neu da co credential thi tu reconnect khi boot;
 * neu chua co, QR chi duoc tao sau thao tac xac nhan rui ro tren trang operator.
 */
/** Anh gui kem qua zca. `filename` phai co duoi — zca-js doi kieu `${string}.${string}`. */
export interface ZaloOutboundImage {
  readonly data: Buffer;
  readonly filename: `${string}.${string}`;
  readonly width?: number;
  readonly height?: number;
}

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
  private errorKind: 'saved_credential' | 'listener' | 'qr' | undefined;
  private displayName: string | undefined;
  private lastError: string | undefined;
  private qrImage: string | null = null;
  private qrVersion = 0;
  private qrExpiresAt: Date | null = null;
  private allowedGroupIds = new Set<string>();
  private readonly threadTypes = new Map<string, ThreadType>();
  private connectionGeneration = 0;
  /** Lich noi lai. `null` = khong co lan thu nao dang cho — xem `scheduleReconnect`. */
  private reconnectTimer: ReturnType<typeof setTimeout> | null = null;
  private reconnectAttempt = 0;
  /**
   * Hen gio THA BO DEM. Chi chay khi ket noi da song du lau — xem `STABLE_CONNECTION_MS`.
   * Socket dut truoc khi no no thi bo dem GIU NGUYEN, va khoang cho tiep tuc tang.
   */
  private stabilityTimer: ReturnType<typeof setTimeout> | null = null;

  /**
   * `@Optional()` KEM MAC DINH, khong phai bat buoc: `ZaloUserClient` duoc dung truc tiep
   * (`new ZaloUserClient()`) o mot so duong test va script. Khi chay that thi `ChannelsModule`
   * cung cap dung MOT the hien, va do la the hien ma `/health` doc — nen so lieu tren man hinh
   * la so lieu cua chinh socket nay, khong phai cua mot ban sao khong ai ghi vao.
   */
  constructor(
    @Optional() private readonly health: ChannelHealthService = new ChannelHealthService(),
  ) {}

  async onModuleInit(): Promise<void> {
    await this.loadAllowedGroups();
    this.health.setEnabled(this.channelMode === 'zca' || this.channelMode === 'hybrid');
    if (this.channelMode !== 'zca' && this.channelMode !== 'hybrid') {
      this.connectionState = 'disabled';
      this.logger.log(`CHANNEL_MODE=${this.channelMode} -> khong khoi tao zca-js.`);
      return;
    }
    // Da co phien thi tu reconnect. Khong co phien thi cho operator xac nhan tren UI.
    void this.connect(false);
  }

  onModuleDestroy(): void {
    this.destroyed = true;
    this.cancelReconnect();
    this.clearStabilityTimer();
    this.stopListener();
    this.api = null;
  }

  setMessageHandler(handler: ZcaMessageHandler): void {
    this.messageHandler = handler;
    if (this.api && this.started) this.api.listener.on('message', handler);
  }

  isReady(): boolean {
    return this.api !== null && this.connectionState === 'ready';
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
    if (this.channelMode !== 'zca' && this.channelMode !== 'hybrid') {
      throw new Error('CHANNEL_MODE khong bat zca');
    }
    if (this.api || this.connectionTask) return;
    // QR moi co the la tai khoan khac. Allowlist cu phai bi cach ly vi groupId phu thuoc tai khoan.
    void this.connect(true, this.errorKind === 'saved_credential');
  }

  async setAllowedGroupIds(groupIds: readonly string[]): Promise<void> {
    const normalized = normalizeAllowedGroupIds(groupIds);
    await this.writePrivateJson(this.allowedGroupsPath, normalized);
    this.allowedGroupIds = new Set(normalized);
  }

  /** Ngat listener, xoa credential cuc bo va xoa allowlist de tai khoan sau khong ke thua pham vi cu. */
  async logout(): Promise<void> {
    this.connectionGeneration += 1;
    // Nguoi CHU DONG dang xuat thi khong duoc tu noi lai — neu khong, mot lan dang xuat se bi
    // mot lan hen truoc do dap lai sau vai phut.
    this.cancelReconnect();
    this.reconnectAttempt = 0;
    this.stopListener();
    this.api = null;
    this.connectionState = 'logged_out';
    this.displayName = undefined;
    this.lastError = undefined;
    this.errorKind = undefined;
    this.qrImage = null;
    this.qrExpiresAt = null;
    this.threadTypes.clear();
    await Promise.all([this.removePrivateFile(this.credPath), this.removePrivateFile(this.qrPath)]);
    await this.setAllowedGroupIds([]);
    this.logger.log('Da dang xuat zca-js: dung listener, xoa phien cuc bo va allowlist.');
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
          ...(normalizeExternalId(group.globalId)
            ? { globalId: normalizeExternalId(group.globalId) }
            : {}),
          name: group.name,
          memberCount: group.totalMember,
          allowed: this.allowedGroupIds.has(group.groupId),
        });
      }
    }
    return groups.sort((a, b) => a.name.localeCompare(b.name, 'vi'));
  }

  async listGroupIdentities(groupIds: readonly string[]): Promise<ZaloGroupView[]> {
    const requested = new Set(normalizeAllowedGroupIds(groupIds));
    return (await this.listGroups()).filter((group) => requested.has(group.id));
  }

  /**
   * Lay snapshot member tu zca-js. Batch loi duoc tra ve nhu partial de lop persistence
   * tuyet doi khong danh inactive nhung member khong fetch duoc.
   */
  async fetchGroupMembers(
    groupId: string,
    excludeExternalIds: readonly string[] = [],
  ): Promise<GroupParticipantSyncSnapshot> {
    const api = this.api;
    if (!api) throw new ZaloNotConnectedError('Zalo chua dang nhap');
    if (!this.allowedGroupIds.has(groupId)) {
      throw new ZaloGroupNotAllowedError('Nhom khong nam trong allowlist');
    }

    let groupResponse: Awaited<ReturnType<API['getGroupInfo']>>;
    try {
      groupResponse = await api.getGroupInfo(groupId);
    } catch (err) {
      this.logger.error(`Loi goi getGroupInfo tren Zalo Web cho nhom ${groupId}: ${errMsg(err)}`);
      throw new ZaloApiCommunicationError(
        `Khong the lay thong tin nhom tu Zalo Web: ${errMsg(err)}`,
        err,
      );
    }

    const gridInfoMap = groupResponse?.gridInfoMap;
    if (!gridInfoMap || typeof gridInfoMap !== 'object') {
      this.logger.error(
        `Response getGroupInfo tu Zalo Web khong co gridInfoMap: ${JSON.stringify(groupResponse)}`,
      );
      throw new ZaloApiCommunicationError('Zalo Web tra ve phan hoi khong hop le khi lay thong tin nhom');
    }

    const group =
      gridInfoMap[groupId] ??
      Object.values(gridInfoMap).find((candidate) => candidate.groupId === groupId);
    if (!group) throw new ZaloGroupNotFoundError('Khong tim thay nhom Zalo da cho phep');

    // Tai khoan phu dang chay listener va Bot Platform KHONG phai "thanh vien can phan loai":
    // ho la cong cu cua chinh he thong. De lot vao danh sach thi nguoi van hanh phai tu doan xem
    // dong nao moi la nguoi that. Loai o day, truoc khi ton request lay ho so.
    const excluded = new Set(
      [...excludeExternalIds, safeOwnId(api)]
        .map((value) => value?.trim())
        .filter((value): value is string => Boolean(value)),
    );
    // Zalo tra thanh vien qua HAI truong: `memberIds` (chi UID) va `currentMems` (UID kem san
    // ho so). Nhom that trong pilot tra `memberIds` RONG va do toan bo thanh vien vao
    // `currentMems` -> chi doc `memberIds` thi dong bo ve 0 nguoi ma van bao "complete".
    // Gop ca hai, va dung luon ho so nhung san de khoi goi getGroupMembersInfo.
    const embeddedProfiles = new Map<string, GroupParticipantProfile>();
    for (const member of group.currentMems ?? []) {
      const externalUserId = member.id?.trim();
      if (!externalUserId) continue;
      embeddedProfiles.set(
        externalUserId,
        normalizeMemberProfile(externalUserId, {
          displayName: member.dName ?? '',
          zaloName: member.zaloName ?? '',
          avatar: member.avatar ?? '',
        }),
      );
    }

    // Nguon UID thu BA. Nhom that trong pilot tra ca `memberIds` lan `currentMems` RONG trong khi
    // `totalMember` van bao 4-5 nguoi (log VM 04/08/2026, `lockViewMember=0` -> nhom KHONG khoa).
    // Nhung cung response do con `memVerList` — danh sach "uid_version" Zalo dung de bat cache.
    // Doc them truong nay la lay lai duoc UID ma khong ton request nao; ho so con thieu se lay qua
    // `getGroupMembersInfo` o vong duoi nhu cu.
    const versionListIds = memberIdsFromVersionList(group.memVerList);
    const primaryIds = normalizeMemberIds([
      ...(group.memberIds ?? []),
      ...embeddedProfiles.keys(),
      ...versionListIds,
    ]).filter((memberId) => !excluded.has(memberId));

    // Duong VET VAT: ca ba truong tren deu rong ma Zalo van bao co nguoi. `getGroupLinkInfo` doc
    // qua endpoint KHAC (`group/link/ginfo`) va van tra `currentMems` kem ho so. Chi goi khi duong
    // chinh khong ra gi — dung nen tra them phai la tra them, khong phai tra moi lan.
    const totalMember = typeof group.totalMember === 'number' ? group.totalMember : 0;
    const viaLink =
      primaryIds.length === 0 && totalMember > excluded.size
        ? await this.membersViaInviteLink(api, groupId)
        : null;
    for (const profile of viaLink?.profiles ?? []) {
      embeddedProfiles.set(profile.externalUserId, profile);
    }

    const memberIds = viaLink
      ? normalizeMemberIds([
          ...primaryIds,
          ...viaLink.profiles.map((profile) => profile.externalUserId),
        ]).filter((memberId) => !excluded.has(memberId))
      : primaryIds;
    const members: GroupParticipantProfile[] = memberIds
      .map((memberId) => embeddedProfiles.get(memberId))
      .filter((profile): profile is GroupParticipantProfile => profile !== undefined);
    const failedMemberIds: string[] = [];
    // `currentMems`/invite-link co ten + avatar nhung khong co stable `globalId`. Van batch-fetch
    // nhung profile nay de giu phan loai thanh vien khi routing UID thay doi theo tai khoan.
    const missingProfileIds = memberIds.filter(
      (memberId) => !embeddedProfiles.get(memberId)?.globalId,
    );
    for (let offset = 0; offset < missingProfileIds.length; offset += MEMBER_PROFILE_BATCH_SIZE) {
      const batch = missingProfileIds.slice(offset, offset + MEMBER_PROFILE_BATCH_SIZE);
      try {
        const response = await api.getGroupMembersInfo(batch);
        for (const memberId of batch) {
          const profile = response.profiles[memberId];
          if (!profile) {
            if (!embeddedProfiles.has(memberId)) failedMemberIds.push(memberId);
            continue;
          }
          const normalized = normalizeMemberProfile(memberId, profile);
          const existingIndex = members.findIndex((member) => member.externalUserId === memberId);
          if (existingIndex >= 0) members[existingIndex] = normalized;
          else members.push(normalized);
        }
      } catch {
        failedMemberIds.push(...batch.filter((memberId) => !embeddedProfiles.has(memberId)));
        this.logger.warn(
          `Dong bo profile Zalo bi partial: group=${groupId}, batchSize=${batch.length}, failed=${batch.length}`,
        );
      }
    }

    // Zalo co luc tra group co `totalMember` > 0 nhung KHONG kem danh sach thanh vien (ca
    // `memberIds` lan `currentMems` deu rong). Neu coi do la "dong bo day du" thi tang persistence
    // se danh INACTIVE toan bo thanh vien da luu -> mat sach phan loai chi vi mot cu API hut.
    // Phai coi la KHONG day du, va noi ro trong log de con lan ra nguyen nhan.
    const memberListMissing = memberIds.length === 0 && totalMember > excluded.size;
    if (memberListMissing) {
      // `lockViewMember` = nhom bat "khoa xem thanh vien" -> Zalo khong tra danh sach cho thanh
      // vien thuong. Day la nghi can so mot; log ro de nguoi van hanh biet phai chinh o dau
      // thay vi doan mo. `e2ee` va `adminIds` de loai tru hai kha nang con lai.
      const setting = (group.setting ?? {}) as Record<string, unknown>;
      this.logger.warn(
        `Zalo khong tra danh sach thanh vien: group=${groupId} totalMember=${totalMember} ` +
          `memberIds=${(group.memberIds ?? []).length} currentMems=${(group.currentMems ?? []).length} ` +
          `memVerList=${(group.memVerList ?? []).length} ` +
          `hasMoreMember=${String(group.hasMoreMember)} e2ee=${String(group.e2ee)} ` +
          `adminIds=${(group.adminIds ?? []).length} lockViewMember=${String(setting.lockViewMember)} ` +
          `setting=${JSON.stringify(setting)}`,
      );
    }

    return {
      groupId,
      // `viaLink.hasMore` = con trang thanh vien chua doc. Bao `complete` luc do thi tang
      // persistence se danh INACTIVE nhung nguoi nam o trang sau.
      complete: failedMemberIds.length === 0 && !memberListMissing && !viaLink?.hasMore,
      // `expectedCount` la so UID DA THU lay, khong phai so Zalo khai bao — schema giu bat bien
      // members + failedMemberIds === expectedCount. Viec "Zalo noi co 4 ma khong tra ai" the
      // hien bang complete=false (0 nguoi + chua xong = khong tra danh sach).
      expectedCount: memberIds.length,
      members,
      failedMemberIds,
    };
  }

  /**
   * Doc thanh vien qua LINK MOI cua nhom — duong duy nhat con lai khi `getGroupInfo` bo trong ca
   * `memberIds`, `currentMems` lan `memVerList`.
   *
   * CO Y KHONG goi `enableGroupLink`: bat link moi la doi CAI DAT NHOM cua khach, ai co link deu
   * vao duoc nhom. Do la quyet dinh cua nguoi van hanh, khong phai viec he thong tu lam de cho
   * tien. Nhom chua bat link thi bo qua.
   *
   * Zalo dang siet duong nay (zca-js #349 "link moi la khong thay members", #359 "gio bi lock
   * roi") nen phai coi that bai la BINH THUONG: tra `null`, lan dong bo di tiep voi nhung gi co.
   */
  private async membersViaInviteLink(
    api: API,
    groupId: string,
  ): Promise<{ profiles: GroupParticipantProfile[]; hasMore: boolean } | null> {
    if (
      typeof api.getGroupLinkDetail !== 'function' ||
      typeof api.getGroupLinkInfo !== 'function'
    ) {
      return null;
    }
    try {
      const detail = await api.getGroupLinkDetail(groupId);
      const link = detail?.link?.trim();
      if (!link || detail.enabled !== 1) {
        this.logger.warn(
          `Nhom ${groupId} chua bat link moi -> bo qua duong link. He thong KHONG tu bat link ` +
            `(bat la ai co link cung vao duoc nhom) — nguoi van hanh tu quyet.`,
        );
        return null;
      }
      const info = await api.getGroupLinkInfo({ link });
      const profiles: GroupParticipantProfile[] = [];
      for (const member of info?.currentMems ?? []) {
        const externalUserId = member.id?.trim();
        if (!externalUserId || externalUserId.length > 128) continue;
        profiles.push(
          normalizeMemberProfile(externalUserId, {
            displayName: member.dName ?? '',
            zaloName: member.zaloName ?? '',
            avatar: member.avatar ?? '',
          }),
        );
      }
      this.logger.log(
        `Lay thanh vien qua link moi: group=${groupId} duoc=${profiles.length} ` +
          `hasMoreMember=${String(info?.hasMoreMember)}`,
      );
      return { profiles, hasMore: Boolean(info?.hasMoreMember) };
    } catch (error) {
      const reason = error instanceof Error ? error.message : String(error);
      this.logger.warn(`Doc thanh vien qua link moi that bai: group=${groupId} — ${reason}`);
      return null;
    }
  }

  /**
   * Tra ve id tin da gui (Pha 1). zca-js tra `{ message: { msgId: number } }`; day CUNG khong
   * gian id voi `TMessage.msgId` cua tin inbound (chi khac kieu: number vs string), nen tin
   * outbound luu trong DB tra cuu duoc bang cung mot khoa.
   */
  async sendMessage(
    threadId: string,
    text: string,
    options?: SendOptions,
    type?: ThreadType,
  ): Promise<OutboundReceipt> {
    if (!this.api) throw new Error('zca-js chua dang nhap - khong the gui tin');
    const resolvedType = type ?? this.threadTypes.get(threadId) ?? ThreadType.Group;
    // Khong co quote thi gui CHUOI THUAN nhu truoc — giu nguyen duong dang chay.
    const payload = options?.quote
      ? { msg: text, quote: toSendQuote(options.quote) }
      : text;
    const result = await this.api.sendMessage(payload, threadId, resolvedType);
    return toReceipt(result);
  }

  /**
   * Gui tin KEM ANH. zca-js nhan attachment thang bang Buffer (`AttachmentSource`), nen khong phai
   * ghi file tam — khong co rac de don, khong co duong ro anh ra dia may chu.
   *
   * Khac han Bot Platform: ben do moi anh la mot `sendPhoto` rieng, con o day ca chum anh di trong
   * MOT tin, dung nhu nguoi that gui.
   */
  async sendMessageWithImages(
    threadId: string,
    text: string,
    images: readonly ZaloOutboundImage[],
    options?: SendOptions,
    type?: ThreadType,
  ): Promise<OutboundReceipt> {
    if (!this.api) throw new Error('zca-js chua dang nhap - khong the gui tin');
    if (!images.length) return this.sendMessage(threadId, text, options, type);
    const resolvedType = type ?? this.threadTypes.get(threadId) ?? ThreadType.Group;
    const result = await this.api.sendMessage(
      {
        msg: text,
        ...(options?.quote ? { quote: toSendQuote(options.quote) } : {}),
        attachments: images.map((image) => ({
          data: image.data,
          filename: image.filename,
          metadata: {
            totalSize: image.data.length,
            ...(image.width ? { width: image.width } : {}),
            ...(image.height ? { height: image.height } : {}),
          },
        })),
      },
      threadId,
      resolvedType,
    );
    return toReceipt(result);
  }

  private connect(allowQr: boolean, replaceSavedCredential = false): Promise<void> {
    if (this.connectionTask) return this.connectionTask;
    this.connectionTask = this.performConnect(allowQr, replaceSavedCredential).finally(() => {
      this.connectionTask = null;
    });
    return this.connectionTask;
  }

  private async performConnect(allowQr: boolean, replaceSavedCredential: boolean): Promise<void> {
    const generation = this.connectionGeneration;
    this.connectionState = 'connecting';
    this.lastError = undefined;
    this.errorKind = undefined;
    const zalo = new Zalo({ selfListen: this.selfListen, checkUpdate: false, logging: false });
    let usedSavedCredential = false;
    try {
      if (replaceSavedCredential) {
        await Promise.all([
          this.removePrivateFile(this.credPath),
          this.removePrivateFile(this.qrPath),
          this.setAllowedGroupIds([]),
        ]);
        this.logger.log(
          'Operator yeu cau QR moi sau loi phien cu; da bo phien va cach ly allowlist cu.',
        );
      }
      const cred = await this.readCred();
      if (cred) {
        usedSavedCredential = true;
        this.logger.log('Dang nhap zca-js bang phien da luu...');
        this.api = await zalo.login(cred);
      } else if (allowQr) {
        this.api = await zalo.loginQR(
          { userAgent: DEFAULT_USER_AGENT, qrPath: this.qrPath },
          (event) => this.onQrEvent(event),
        );
      } else {
        this.connectionState = 'logged_out';
        return;
      }
      if (this.destroyed || generation !== this.connectionGeneration) {
        this.stopListener();
        this.api = null;
        return;
      }
      // `login()` tra ve API chua co nghia la receive-side da nghe duoc. Chi event `connected`
      // cua listener moi duoc phep dua state sang ready.
      this.connectionState = 'connecting';
      this.qrImage = null;
      this.qrExpiresAt = null;
      this.logger.log('zca-js dang nhap thanh cong - listener chi xu ly nhom trong allowlist.');
      this.attachListener();
    } catch (error) {
      if (this.destroyed || generation !== this.connectionGeneration) return;
      const message = errMsg(error);
      this.api = null;
      this.connectionState = 'error';
      this.errorKind = usedSavedCredential ? 'saved_credential' : 'qr';
      this.qrImage = null;
      this.qrExpiresAt = null;
      this.lastError =
        'Khong the ket noi bang phien da luu. Hay chon Tao QR moi va chon lai nhom cho tai khoan moi.';
      this.logger.error(`zca-js dang nhap that bai: ${message}`);
    }
  }

  private attachListener(): void {
    if (!this.api || this.destroyed) return;
    const listener = this.api.listener;
    listener.on('message', (message) => this.threadTypes.set(message.threadId, message.type));
    listener.on('connected', () => {
      this.connectionState = 'ready';
      this.lastError = undefined;
      this.errorKind = undefined;
      /*
       * BO DEM KHONG DUOC THA NGAY O DAY.
       *
       * Tha ngay nghe hop ly — "da noi lai duoc thi coi nhu chua co gi xay ra". Nhung do do tren
       * stack that: socket dong `1000` chi 8 GIAY sau khi connect. Voi mot socket chap chon nhu
       * vay, tha ngay bien thanh vong lap dang nhap ~10 giay/lan vao tai khoan Zalo — va tai
       * khoan zca CO THE BI KHOA vi dieu do (CLAUDE.md, muc rui ro cua kenh zca).
       *
       * Nen bo dem chi duoc tha sau khi ket noi DUNG VUNG duoc `STABLE_CONNECTION_MS`. Dut som
       * hon thi bo dem giu nguyen va khoang cho tiep tuc tang — dung hanh vi ta muon voi mot kenh
       * dang chap chon.
       */
      const wasReconnect = this.reconnectAttempt > 0;
      this.cancelReconnect();
      this.clearStabilityTimer();
      this.stabilityTimer = setTimeout(() => {
        this.stabilityTimer = null;
        this.reconnectAttempt = 0;
      }, STABLE_CONNECTION_MS);
      this.stabilityTimer.unref?.();
      this.health.markConnected();
      this.logger.log(
        wasReconnect ? 'zca-js listener: da NOI LAI thanh cong' : 'zca-js listener: connected',
      );
    });
    listener.on('closed', (code, reason) => {
      this.connectionState = 'connecting';
      this.lastError = 'Listener Zalo mat ket noi; he thong dang thu ket noi lai.';
      this.clearStabilityTimer();
      this.health.markClosed(code ?? null, reason ?? null);
      this.logger.warn(`zca-js listener closed (${code}): ${reason}`);
      this.scheduleReconnect(code ?? null);
    });
    listener.on('error', (error) => {
      /*
       * `error` CUNG PHAI NOI LAI — va day la mot ban sua, khong phai mot noi long.
       *
       * Ban truoc dung han o day: coi moi loi cua listener la "credential hong, doi nguoi quet QR
       * moi". Nhung mot lan dut MANG cung roi vao dung nhanh nay, va luc do ket qua la mot kenh
       * doc chet im lang — dung hinh dang cua su co §7.1, chi khac cua vao.
       *
       * Tu bang chung: khong the phan biet hai nguyen nhan do TU CHINH su kien nay. Nen thay vi
       * doan, ta thu lai — va de phep thu TU tra loi:
       *   · dut mang    -> lan `connect()` ke tiep thanh cong, kenh song lai;
       *   · khoa hong   -> `performConnect()` that bai o buoc dang nhap, dat `errorKind` va giu
       *                    nguyen trang thai `error`, va duong QR van con do cho nguoi van hanh.
       *
       * Thu mai mai mot credential da hong khong ton gi dang ke: khoang cho tang gap doi toi tran
       * 5 phut, tuc 12 lan mot gio — re hon nhieu so voi mot kenh doc chet ma khong ai biet.
       */
      this.stopListener();
      this.api = null;
      this.connectionState = 'error';
      this.errorKind = 'listener';
      this.lastError = 'Listener Zalo dang loi; he thong dang thu ket noi lai.';
      this.clearStabilityTimer();
      this.health.markClosed(null, `listener error: ${errMsg(error)}`);
      this.logger.warn(`zca-js listener error: ${errMsg(error)}`);
      this.scheduleReconnect(null);
    });
    if (this.messageHandler) listener.on('message', this.messageHandler);
    listener.start({ retryOnClose: true });
    this.started = true;
    this.health.markAuthenticated();
  }

  /**
   * HEN MOT LAN NOI LAI. Day la ban va cho su co §7.1.
   *
   * `listener.start({ retryOnClose: true })` o tren DA duoc bat, va no VAN khong cuu duoc lan
   * `closed (1000): NORMAL_CLOSURE` ngay 27/08/2026: thu vien coi ma `1000` la "ben kia dong tu
   * te, khong co gi de thu lai". Voi mot kenh DOC thi khong co khac biet nao giua mot socket dong
   * tu te va mot socket chet — ca hai deu la khong nghe duoc.
   *
   * NOI LAI BANG CACH DUNG HAN ROI KET NOI TU DAU, khong phai goi `listener.start()` lan hai tren
   * cung mot doi tuong: `attachListener()` dang ky `on('message', …)`, nen mot lan gan lai tren
   * listener cu se lam MOI TIN duoc xu ly hai lan. `MessageGuard` se chan ban sao do, nhung dua
   * mot loi tinh dung dan cho mot luoi an toan o tang duoi la cach de sau nay no im lang hong.
   */
  private scheduleReconnect(code: number | null): void {
    if (this.destroyed) return;
    if (this.channelMode !== 'zca' && this.channelMode !== 'hybrid') return;
    if (!shouldReconnectAfterClose(code)) return;
    // Mot lan hen dang cho la du. `listener.stop()` co the tu phat `closed`, nen khong co cong
    // nay thi mot lan dut se sinh ra mot chum hen chong len nhau.
    if (this.reconnectTimer) return;

    this.reconnectAttempt += 1;
    const attempt = this.reconnectAttempt;
    const delayMs = nextReconnectDelayMs({ attempt });
    this.health.markReconnectScheduled();
    this.logger.warn(
      `zca-js listener: hen noi lai lan ${attempt} sau ${Math.round(delayMs / 1000)}s ` +
        `(ma dong ${code ?? 'khong ro'}).`,
    );

    this.reconnectTimer = setTimeout(() => {
      this.reconnectTimer = null;
      if (this.destroyed) return;
      this.logger.warn(`zca-js listener: dang noi lai (lan ${attempt})...`);
      this.stopListener();
      this.api = null;
      // `connect(false)` = dung phien DA LUU, khong mo QR. Mot lan dut socket khong phai ly do
      // de doi nguoi ngoi quet ma; con neu phien that su hong thi `performConnect` se dua trang
      // thai sang `error` va duong QR van con do.
      //
      // ⚠️ `.catch()` MOT MINH LA KHONG DU, va day la mot lo hong that cua ban truoc:
      // `performConnect()` TU NUOT loi dang nhap — no bat `catch`, dat `connectionState='error'`,
      // roi tra ve BINH THUONG. Nen mot lan noi lai that bai se khong hen duoc lan ke tiep, va
      // kenh "tu chua" chi chua duoc DUNG MOT LAN roi bo cuoc im lang.
      //
      // Nen sau moi lan thu ta HOI LAI TRANG THAI thay vi tin vao gia tri tra ve.
      void this.connect(false)
        .catch((error: unknown) => {
          this.logger.warn(`zca-js listener: noi lai nem loi: ${errMsg(error)}`);
        })
        .finally(() => {
          if (this.destroyed) return;
          const verify = setTimeout(() => {
            if (this.destroyed || this.connectionState === 'ready') return;
            this.logger.warn(
              `zca-js listener: sau lan noi lai ${attempt}, trang thai van la ` +
                `'${this.connectionState}' — hen tiep.`,
            );
            this.scheduleReconnect(code);
          }, RECONNECT_VERIFY_MS);
          verify.unref?.();
        });
    }, delayMs);
    // `unref` de mot lan hen dang cho khong giu tien trinh song khi moi thu khac da xong.
    this.reconnectTimer.unref?.();
  }

  private cancelReconnect(): void {
    if (this.reconnectTimer) {
      clearTimeout(this.reconnectTimer);
      this.reconnectTimer = null;
    }
    this.health.markReconnectAbandoned();
  }

  private clearStabilityTimer(): void {
    if (this.stabilityTimer) {
      clearTimeout(this.stabilityTimer);
      this.stabilityTimer = null;
    }
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
        this.errorKind = 'qr';
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
        }).catch((error: unknown) =>
          this.logger.warn(`Khong luu duoc phien zca-js: ${errMsg(error)}`),
        );
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

  private async removePrivateFile(path: string): Promise<void> {
    try {
      await unlink(path);
    } catch (error) {
      if ((error as NodeJS.ErrnoException).code !== 'ENOENT') throw error;
    }
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
  if (groupIds.length > MAX_ALLOWED_GROUPS)
    throw new Error(`Chi duoc cho phep toi da ${MAX_ALLOWED_GROUPS} nhom`);
  const normalized = [...new Set(groupIds.map((groupId) => groupId.trim()))].sort();
  if (normalized.some((groupId) => groupId.length === 0 || groupId.length > 128)) {
    throw new Error('ID nhom khong hop le');
  }
  return normalized;
}

/**
 * UID cua chinh tai khoan dang dang nhap. `getOwnId()` chi tra duoc sau khi login xong, va cac
 * mock trong test khong khai bao no — nen khong duoc de loi o day lam hong ca lan dong bo.
 */
function safeOwnId(api: API): string | undefined {
  try {
    return typeof api.getOwnId === 'function' ? api.getOwnId() : undefined;
  } catch {
    return undefined;
  }
}

/**
 * `memVerList` la danh sach "uid_version" (VD `"1000000000000000001_7"`) Zalo gui kem group info de
 * client biet ho so nao da cu. Ta chi can phan UID dang truoc dau `_`.
 *
 * KHONG duoc nem loi o day: day la nguon vet vat, mot phan tu la dang khong doan truoc ma lam hong
 * ca lan dong bo thi te hon la bo qua phan tu do. `normalizeMemberIds` moi la cho kiem tinh chat
 * chat, nen phan tu khong dat chuan bi loai truoc khi den do.
 */
function memberIdsFromVersionList(memVerList: readonly string[] | undefined): string[] {
  if (!Array.isArray(memVerList)) return [];
  const ids: string[] = [];
  for (const entry of memVerList) {
    if (typeof entry !== 'string') continue;
    const [rawId] = entry.split('_');
    const memberId = rawId?.trim() ?? '';
    if (memberId.length === 0 || memberId.length > 128) continue;
    ids.push(memberId);
  }
  return ids;
}

function normalizeMemberIds(memberIds: readonly string[]): string[] {
  const normalized = memberIds.map((memberId) => memberId.trim());
  if (normalized.some((memberId) => memberId.length === 0 || memberId.length > 128)) {
    throw new Error('Danh sach UID thanh vien Zalo khong hop le');
  }
  return [...new Set(normalized)];
}

function normalizeMemberProfile(
  externalUserId: string,
  profile: { displayName: string; zaloName: string; avatar: string; globalId?: string },
): GroupParticipantProfile {
  const displayName = profile.displayName.trim() || profile.zaloName.trim() || externalUserId;
  const zaloName = profile.zaloName.trim();
  const avatarUrl = normalizeHttpUrl(profile.avatar);
  const globalId = normalizeExternalId(profile.globalId);
  return {
    externalUserId,
    ...(globalId ? { globalId } : {}),
    displayName,
    ...(zaloName ? { zaloName } : {}),
    ...(avatarUrl ? { avatarUrl } : {}),
  };
}

function normalizeHttpUrl(value: string): string | undefined {
  try {
    const url = new URL(value.trim());
    return url.protocol === 'https:' || url.protocol === 'http:' ? url.toString() : undefined;
  } catch {
    return undefined;
  }
}

function normalizeExternalId(value: unknown): string | undefined {
  if (typeof value !== 'string') return undefined;
  const normalized = value.trim();
  return normalized.length > 0 && normalized.length <= 128 ? normalized : undefined;
}

function errMsg(error: unknown): string {
  return error instanceof Error ? error.message : String(error);
}

/**
 * zca-js tra `{ message: { msgId: number } | null, attachment: [...] }`. `msgId` la so; ta luu
 * dang chuoi cho khop `TMessage.msgId` cua tin inbound (cung gia tri, khac kieu serialize).
 * Khong co id thi tra `{}` — recorder tu sinh id noi bo, khong duoc lam rot viec luu tin.
 */
function toReceipt(result: { message: { msgId: number } | null }): OutboundReceipt {
  const msgId = result?.message?.msgId;
  return typeof msgId === 'number' && Number.isFinite(msgId)
    ? { externalMessageId: String(msgId) }
    : {};
}

/**
 * `ZaloQuoteTarget` -> `SendMessageQuote` cua zca-js. Cung tam truong, chi khac cho `content` va
 * `propertyExt` duoc giu `unknown` phia ta (zca-js tra ve string voi tin chu, object voi anh).
 * Ep kieu o DUNG mot cho nay thay vi de `any` lan ra ca luong gui.
 */
function toSendQuote(target: ZaloQuoteTarget): SendMessageQuote {
  return {
    msgId: target.msgId,
    cliMsgId: target.cliMsgId,
    msgType: target.msgType,
    uidFrom: target.uidFrom,
    ts: target.ts,
    ttl: target.ttl,
    content: target.content,
    propertyExt: target.propertyExt,
  } as SendMessageQuote;
}
