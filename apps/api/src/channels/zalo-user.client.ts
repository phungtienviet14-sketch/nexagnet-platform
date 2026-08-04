import { Injectable, Logger, type OnModuleDestroy, type OnModuleInit } from '@nestjs/common';
import { mkdir, readFile, rename, unlink, writeFile } from 'node:fs/promises';
import { dirname, join } from 'node:path';
import { loadEnv } from '@ultty/shared';
import type { GroupParticipantProfile, GroupParticipantSyncSnapshot } from '@ultty/shared';
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
  private connectionGeneration = 0;

  async onModuleInit(): Promise<void> {
    await this.loadAllowedGroups();
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
    if (this.channelMode !== 'zca' && this.channelMode !== 'hybrid') {
      throw new Error('CHANNEL_MODE khong bat zca');
    }
    if (this.api || this.connectionTask) return;
    void this.connect(true);
  }

  async setAllowedGroupIds(groupIds: readonly string[]): Promise<void> {
    const normalized = normalizeAllowedGroupIds(groupIds);
    await this.writePrivateJson(this.allowedGroupsPath, normalized);
    this.allowedGroupIds = new Set(normalized);
  }

  /** Ngat listener, xoa credential cuc bo va xoa allowlist de tai khoan sau khong ke thua pham vi cu. */
  async logout(): Promise<void> {
    this.connectionGeneration += 1;
    this.stopListener();
    this.api = null;
    this.connectionState = 'logged_out';
    this.displayName = undefined;
    this.lastError = undefined;
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
          name: group.name,
          memberCount: group.totalMember,
          allowed: this.allowedGroupIds.has(group.groupId),
        });
      }
    }
    return groups.sort((a, b) => a.name.localeCompare(b.name, 'vi'));
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

    const groupResponse = await api.getGroupInfo(groupId);
    const group =
      groupResponse.gridInfoMap[groupId] ??
      Object.values(groupResponse.gridInfoMap).find((candidate) => candidate.groupId === groupId);
    if (!group) throw new Error('Khong tim thay nhom Zalo da cho phep');

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

    const memberIds = normalizeMemberIds([
      ...(group.memberIds ?? []),
      ...embeddedProfiles.keys(),
    ]).filter((memberId) => !excluded.has(memberId));
    const members: GroupParticipantProfile[] = memberIds
      .map((memberId) => embeddedProfiles.get(memberId))
      .filter((profile): profile is GroupParticipantProfile => profile !== undefined);
    const failedMemberIds: string[] = [];
    const missingProfileIds = memberIds.filter((memberId) => !embeddedProfiles.has(memberId));
    for (let offset = 0; offset < missingProfileIds.length; offset += MEMBER_PROFILE_BATCH_SIZE) {
      const batch = missingProfileIds.slice(offset, offset + MEMBER_PROFILE_BATCH_SIZE);
      try {
        const response = await api.getGroupMembersInfo(batch);
        for (const memberId of batch) {
          const profile = response.profiles[memberId];
          if (!profile) {
            failedMemberIds.push(memberId);
            continue;
          }
          members.push(normalizeMemberProfile(memberId, profile));
        }
      } catch {
        failedMemberIds.push(...batch);
        this.logger.warn(
          `Dong bo profile Zalo bi partial: group=${groupId}, batchSize=${batch.length}, failed=${batch.length}`,
        );
      }
    }

    // Zalo co luc tra group co `totalMember` > 0 nhung KHONG kem danh sach thanh vien (ca
    // `memberIds` lan `currentMems` deu rong). Neu coi do la "dong bo day du" thi tang persistence
    // se danh INACTIVE toan bo thanh vien da luu -> mat sach phan loai chi vi mot cu API hut.
    // Phai coi la KHONG day du, va noi ro trong log de con lan ra nguyen nhan.
    const totalMember = typeof group.totalMember === 'number' ? group.totalMember : 0;
    const memberListMissing = memberIds.length === 0 && totalMember > excluded.size;
    if (memberListMissing) {
      this.logger.warn(
        `Zalo khong tra danh sach thanh vien: group=${groupId} totalMember=${totalMember} ` +
          `memberIds=${(group.memberIds ?? []).length} currentMems=${(group.currentMems ?? []).length} ` +
          `hasMoreMember=${String(group.hasMoreMember)} fields=${Object.keys(group).join(',')}`,
      );
    }

    return {
      groupId,
      complete: failedMemberIds.length === 0 && !memberListMissing,
      // Bao dung con so Zalo noi la co, de UI hien "0/4" thay vi "da dong bo 0 thanh vien".
      expectedCount: memberListMissing ? totalMember : memberIds.length,
      members,
      failedMemberIds,
    };
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
    const generation = this.connectionGeneration;
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
      if (this.destroyed || generation !== this.connectionGeneration) {
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
      if (this.destroyed || generation !== this.connectionGeneration) return;
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
  if (groupIds.length > MAX_ALLOWED_GROUPS) throw new Error(`Chi duoc cho phep toi da ${MAX_ALLOWED_GROUPS} nhom`);
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

function normalizeMemberIds(memberIds: readonly string[]): string[] {
  const normalized = memberIds.map((memberId) => memberId.trim());
  if (normalized.some((memberId) => memberId.length === 0 || memberId.length > 128)) {
    throw new Error('Danh sach UID thanh vien Zalo khong hop le');
  }
  return [...new Set(normalized)];
}

function normalizeMemberProfile(
  externalUserId: string,
  profile: { displayName: string; zaloName: string; avatar: string },
): GroupParticipantProfile {
  const displayName = profile.displayName.trim() || profile.zaloName.trim() || externalUserId;
  const zaloName = profile.zaloName.trim();
  const avatarUrl = normalizeHttpUrl(profile.avatar);
  return {
    externalUserId,
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

function errMsg(error: unknown): string {
  return error instanceof Error ? error.message : String(error);
}
