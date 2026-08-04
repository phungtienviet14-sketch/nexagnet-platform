const API_BASE = process.env.NEXT_PUBLIC_API_URL ?? 'http://localhost:3001';

export type ChannelMode = 'mock' | 'bot' | 'zca' | 'hybrid';
export type Availability = 'available' | 'fallback' | 'unavailable';
export type CustomerRank = 'dai_ly' | 'ctv' | 'khach_le' | 'unknown';
export type OperationalRole =
  'khach_hang' | 'sale' | 'ke_toan' | 'quan_ly' | 'ksnb' | 'bpvh' | 'ky_thuat' | 'unknown';
export type HandlingMode = 'inherit_group' | 'process' | 'ignore' | 'manual_review';
/** `message_stream` = hoc tu chinh luong tin, vi Zalo khong tra danh sach thanh vien (04/08/2026). */
export type ParticipantSource = 'zca_sync' | 'manual' | 'message_stream';
export type RuleStatus = 'draft' | 'preview' | 'active' | 'archived';
export type SourceTruthResource =
  'dealers' | 'groups' | 'products' | 'prices' | 'overrides' | 'glossary';

type JsonPrimitive = string | number | boolean | null;
export type JsonObject = {
  readonly [key: string]: JsonPrimitive | JsonObject | readonly JsonValue[];
};
type JsonValue = JsonPrimitive | JsonObject | readonly JsonValue[];
type UnknownRecord = Record<string, unknown>;

export interface BotIdentitySummary {
  state: 'disabled' | 'unknown' | 'ready' | 'error';
  id?: string;
  name?: string;
}

/** `pending` = he thong da thay nhom nhung chua ai chon dai ly -> tin duoc luu, chua qua parser. */
export type GroupMappingStatus = 'pending' | 'mapped' | 'ignored';

export interface SettingsGroupSummary {
  id: string;
  zcaChatId: string;
  name: string;
  status: GroupMappingStatus;
  allowed: boolean;
  memberCount: number;
  activeParticipants: number;
  inactiveParticipants: number;
  dealerId?: string;
  dealerName?: string;
  lastSyncedAt?: string;
  lastSyncError?: string;
}

export interface SettingsSummary {
  availability: Availability;
  channelMode: ChannelMode;
  /** `off` => /admin tra 404; UI phai an moi loi dan sang AdminJS. */
  adminUi: 'on' | 'off';
  zcaState: string;
  zcaDisplayName?: string;
  botIdentity: BotIdentitySummary;
  autoSend: boolean;
  sourceTruth: {
    status: Availability;
    productCount: number;
    dealerCount: number;
    lastUpdatedAt?: string;
  };
  rules: {
    status: Availability;
    activeVersion?: string;
    provisionalKeys: string[];
  };
  groups: SettingsGroupSummary[];
  warnings: string[];
}

export interface GroupParticipant {
  id: string;
  groupId: string;
  externalUserId: string;
  displayName: string;
  zaloName?: string;
  avatarUrl?: string;
  customerRank: CustomerRank;
  operationalRole: OperationalRole;
  handlingMode: HandlingMode;
  active: boolean;
  source: ParticipantSource;
  lastSeenAt?: string;
  syncedAt?: string;
  createdAt?: string;
  updatedAt?: string;
}

export interface ParticipantFilters {
  search: string;
  customerRank: CustomerRank | 'all';
  operationalRole: OperationalRole | 'all';
  handlingMode: HandlingMode | 'all';
  active?: boolean;
}

export interface ParticipantList {
  participants: GroupParticipant[];
  total: number;
}

export type ParticipantPatch = Partial<
  Pick<GroupParticipant, 'customerRank' | 'operationalRole' | 'handlingMode'>
>;

export interface ParticipantBulkRequest {
  participantIds: readonly string[];
  patch: ParticipantPatch;
}

export interface ParticipantBulkPreview {
  affectedCount: number;
  warnings: string[];
}

export interface MemberSyncResult {
  groupId: string;
  complete: boolean;
  expectedCount: number;
  fetchedCount: number;
  failedCount: number;
  upsertedCount: number;
  deactivatedCount: number;
  syncedAt?: string;
}

export interface SourceTruthRow {
  id: string;
  label: string;
  code?: string;
  fields: Readonly<Record<string, JsonPrimitive>>;
}

export interface SourceTruthSection {
  resource: SourceTruthResource;
  rows: SourceTruthRow[];
  error?: string;
}

export interface RuleConfigVersion {
  id: string;
  version: string;
  status: RuleStatus;
  payload: JsonObject;
  createdBy?: string;
  activatedBy?: string;
  createdAt?: string;
  activatedAt?: string;
  provisionalKeys: string[];
  provisionalVerified: boolean;
}

export interface RulePreview {
  totals?: JsonObject;
  warnings: string[];
  trace: string[];
}

export interface AuditEntry {
  id: string;
  actor: string;
  action: string;
  entityType: string;
  entityId?: string;
  before?: JsonObject;
  after?: JsonObject;
  requestId?: string;
  createdAt: string;
}

export interface AuditFilters {
  actor?: string;
  action?: string;
  entityType?: string;
  page?: number;
  limit?: number;
}

export interface AuditPage {
  entries: AuditEntry[];
  total: number;
  page: number;
  limit: number;
}

export type SourceTruthFormValue = string | number | boolean | null;
export type SourceTruthChangesResult =
  | { success: true; data: Readonly<Record<string, JsonPrimitive>> }
  | { success: false; error: string };

class SettingsApiError extends Error {
  constructor(
    message: string,
    readonly status: number,
  ) {
    super(message);
    this.name = 'SettingsApiError';
  }
}

function isRecord(value: unknown): value is UnknownRecord {
  return typeof value === 'object' && value !== null && !Array.isArray(value);
}

function stringValue(value: unknown): string | undefined {
  return typeof value === 'string' && value.trim() ? value : undefined;
}

function numberValue(value: unknown, fallback = 0): number {
  return typeof value === 'number' && Number.isFinite(value) ? value : fallback;
}

function booleanValue(value: unknown, fallback = false): boolean {
  if (typeof value === 'boolean') return value;
  if (value === 'on') return true;
  if (value === 'off') return false;
  return fallback;
}

function arrayValue(value: unknown): unknown[] {
  return Array.isArray(value) ? value : [];
}

function unwrapEnvelope(value: unknown): unknown {
  if (!isRecord(value)) return value;
  return 'data' in value ? value.data : value;
}

function getNestedRecord(record: UnknownRecord, key: string): UnknownRecord {
  const value = record[key];
  return isRecord(value) ? value : {};
}

function enumValue<T extends string>(value: unknown, allowed: readonly T[], fallback: T): T {
  return typeof value === 'string' && allowed.includes(value as T) ? (value as T) : fallback;
}

const CHANNEL_MODES: readonly ChannelMode[] = ['mock', 'bot', 'zca', 'hybrid'];
const CUSTOMER_RANKS: readonly CustomerRank[] = ['dai_ly', 'ctv', 'khach_le', 'unknown'];
const OPERATIONAL_ROLES: readonly OperationalRole[] = [
  'khach_hang',
  'sale',
  'ke_toan',
  'quan_ly',
  'ksnb',
  'bpvh',
  'ky_thuat',
  'unknown',
];
const HANDLING_MODES: readonly HandlingMode[] = [
  'inherit_group',
  'process',
  'ignore',
  'manual_review',
];

function parseBotIdentity(value: unknown): BotIdentitySummary {
  const record = isRecord(value) ? value : {};
  return {
    state: enumValue(record.state, ['disabled', 'unknown', 'ready', 'error'], 'unknown'),
    ...(stringValue(record.id) ? { id: stringValue(record.id) } : {}),
    ...(stringValue(record.name) ? { name: stringValue(record.name) } : {}),
  };
}

function parseGroupSummary(value: unknown): SettingsGroupSummary | undefined {
  if (!isRecord(value)) return undefined;
  const id = stringValue(value.zcaChatId) ?? stringValue(value.chatId) ?? stringValue(value.id);
  if (!id) return undefined;
  return {
    id: stringValue(value.groupId) ?? id,
    zcaChatId: id,
    name: stringValue(value.name) ?? stringValue(value.groupName) ?? `Nhóm ${id}`,
    // Mac dinh 'pending': khong biet chac thi coi nhu CHUA map, de UI khong hua hen sai.
    status: enumValue(value.status, ['pending', 'mapped', 'ignored'] as const, 'pending'),
    allowed: booleanValue(value.allowed, false),
    memberCount: numberValue(value.memberCount),
    activeParticipants: numberValue(value.activeParticipants ?? value.activeCount),
    inactiveParticipants: numberValue(value.inactiveParticipants ?? value.inactiveCount),
    ...(stringValue(value.dealerId) ? { dealerId: stringValue(value.dealerId) } : {}),
    ...(stringValue(value.dealerName) ? { dealerName: stringValue(value.dealerName) } : {}),
    ...(stringValue(value.lastSyncedAt ?? value.syncedAt)
      ? { lastSyncedAt: stringValue(value.lastSyncedAt ?? value.syncedAt) }
      : {}),
    ...(stringValue(value.lastSyncError)
      ? { lastSyncError: stringValue(value.lastSyncError) }
      : {}),
  };
}

export function parseSettingsSummary(value: unknown): SettingsSummary {
  const unwrapped = unwrapEnvelope(value);
  const record = isRecord(unwrapped) ? unwrapped : {};
  const sourceTruth = getNestedRecord(record, 'sourceTruth');
  const rules = getNestedRecord(record, 'rules');
  const zca = getNestedRecord(record, 'zca');
  const autoSendRecord = getNestedRecord(record, 'autoSend');
  const rawGroups = arrayValue(record.groups ?? zca.groups);
  const groups = rawGroups.map(parseGroupSummary).filter((group) => group !== undefined);
  const hasData = Object.keys(record).length > 0;
  const autoSend = booleanValue(
    isRecord(record.autoSend)
      ? (autoSendRecord.enabled ?? autoSendRecord.autoSend)
      : record.autoSend,
    false,
  );

  return {
    availability: hasData ? 'available' : 'unavailable',
    channelMode: enumValue(record.channelMode ?? zca.channelMode, CHANNEL_MODES, 'mock'),
    // Mac dinh 'off': tha an nut con hon hien nut dan toi /admin dang tra 404.
    adminUi: enumValue(record.adminUi, ['on', 'off'] as const, 'off'),
    zcaState: stringValue(zca.state ?? record.zcaState ?? record.state) ?? 'unknown',
    ...(stringValue(zca.displayName ?? record.zcaDisplayName ?? record.displayName)
      ? {
          zcaDisplayName: stringValue(
            zca.displayName ?? record.zcaDisplayName ?? record.displayName,
          ),
        }
      : {}),
    botIdentity: parseBotIdentity(record.botIdentity),
    autoSend,
    sourceTruth: {
      status: Object.keys(sourceTruth).length ? 'available' : 'unavailable',
      productCount: numberValue(sourceTruth.productCount),
      dealerCount: numberValue(sourceTruth.dealerCount),
      ...(stringValue(sourceTruth.lastUpdatedAt)
        ? { lastUpdatedAt: stringValue(sourceTruth.lastUpdatedAt) }
        : {}),
    },
    rules: {
      status: Object.keys(rules).length ? 'available' : 'unavailable',
      ...(stringValue(rules.activeVersion)
        ? { activeVersion: stringValue(rules.activeVersion) }
        : {}),
      provisionalKeys: arrayValue(rules.provisionalKeys).filter(
        (item): item is string => typeof item === 'string',
      ),
    },
    groups,
    warnings: arrayValue(record.warnings).filter(
      (item): item is string => typeof item === 'string',
    ),
  };
}

function parseParticipant(value: unknown): GroupParticipant | undefined {
  if (!isRecord(value)) return undefined;
  const id = stringValue(value.id);
  const groupId = stringValue(value.groupId);
  const externalUserId = stringValue(value.externalUserId);
  if (!id || !groupId || !externalUserId) return undefined;
  return {
    id,
    groupId,
    externalUserId,
    displayName: stringValue(value.displayName) ?? stringValue(value.zaloName) ?? 'Chưa có tên',
    ...(stringValue(value.zaloName) ? { zaloName: stringValue(value.zaloName) } : {}),
    ...(stringValue(value.avatarUrl) ? { avatarUrl: stringValue(value.avatarUrl) } : {}),
    customerRank: enumValue(value.customerRank, CUSTOMER_RANKS, 'unknown'),
    operationalRole: enumValue(value.operationalRole, OPERATIONAL_ROLES, 'unknown'),
    handlingMode: enumValue(value.handlingMode, HANDLING_MODES, 'inherit_group'),
    active: booleanValue(value.active, false),
    source: enumValue(value.source, ['zca_sync', 'manual', 'message_stream'], 'manual'),
    ...(stringValue(value.lastSeenAt) ? { lastSeenAt: stringValue(value.lastSeenAt) } : {}),
    ...(stringValue(value.syncedAt) ? { syncedAt: stringValue(value.syncedAt) } : {}),
    ...(stringValue(value.createdAt) ? { createdAt: stringValue(value.createdAt) } : {}),
    ...(stringValue(value.updatedAt) ? { updatedAt: stringValue(value.updatedAt) } : {}),
  };
}

function parseParticipantList(value: unknown): ParticipantList {
  const unwrapped = unwrapEnvelope(value);
  const record = isRecord(unwrapped) ? unwrapped : {};
  const rawParticipants = Array.isArray(unwrapped) ? unwrapped : arrayValue(record.participants);
  const participants = rawParticipants
    .map(parseParticipant)
    .filter((participant) => participant !== undefined);
  return { participants, total: numberValue(record.total, participants.length) };
}

export function buildParticipantQuery(filters: ParticipantFilters): string {
  const params = new URLSearchParams();
  const search = filters.search.trim();
  if (search) params.set('search', search);
  if (filters.customerRank !== 'all') params.set('customerRank', filters.customerRank);
  if (filters.operationalRole !== 'all') params.set('operationalRole', filters.operationalRole);
  if (filters.handlingMode !== 'all') params.set('handlingMode', filters.handlingMode);
  if (filters.active !== undefined) params.set('active', String(filters.active));
  const query = params.toString();
  return query ? `?${query}` : '';
}

function normalizeSearch(value: string): string {
  return value
    .toLocaleLowerCase('vi')
    .normalize('NFD')
    .replace(/[\u0300-\u036f]/g, '')
    .replace(/đ/g, 'd');
}

export function filterParticipants(
  participants: readonly GroupParticipant[],
  filters: ParticipantFilters,
): GroupParticipant[] {
  const search = normalizeSearch(filters.search.trim());
  return participants.filter((participant) => {
    const matchesSearch =
      !search ||
      normalizeSearch(`${participant.displayName} ${participant.zaloName ?? ''}`).includes(search);
    const matchesRank =
      filters.customerRank === 'all' || participant.customerRank === filters.customerRank;
    const matchesRole =
      filters.operationalRole === 'all' || participant.operationalRole === filters.operationalRole;
    const matchesHandling =
      filters.handlingMode === 'all' || participant.handlingMode === filters.handlingMode;
    const matchesActive = filters.active === undefined || participant.active === filters.active;
    return matchesSearch && matchesRank && matchesRole && matchesHandling && matchesActive;
  });
}

export function normalizeSourceTruthChanges(
  values: Readonly<Record<string, SourceTruthFormValue>>,
  requiredKeys: readonly string[],
  numericKeys: readonly string[],
  nullableKeys: readonly string[] = [],
): SourceTruthChangesResult {
  const missingKey = requiredKeys.find((key) => {
    const value = values[key];
    return (
      value === null || value === undefined || (typeof value === 'string' && value.trim() === '')
    );
  });
  if (missingKey) return { success: false, error: `Cần nhập ${missingKey}.` };

  const normalized = Object.fromEntries(
    Object.entries(values).map(([key, value]) => {
      if (nullableKeys.includes(key) && (value === null || value === '')) return [key, null];
      const trimmedValue = typeof value === 'string' ? value.trim() : value;
      return [
        key,
        numericKeys.includes(key) && trimmedValue !== '' && trimmedValue !== null
          ? Number(trimmedValue)
          : trimmedValue,
      ];
    }),
  ) as Record<string, JsonPrimitive>;
  const invalidNumericKey = numericKeys.find((key) => {
    const value = normalized[key];
    return value !== null && (typeof value !== 'number' || !Number.isFinite(value));
  });
  if (invalidNumericKey)
    return { success: false, error: `${invalidNumericKey} phải là một số hợp lệ.` };
  const negativeKey = numericKeys.find((key) => Number(normalized[key]) < 0);
  if (negativeKey) return { success: false, error: `${negativeKey} không được là số âm.` };
  return { success: true, data: normalized };
}

function safeJsonObject(value: unknown): JsonObject {
  if (!isRecord(value)) return {};
  return Object.fromEntries(
    Object.entries(value).flatMap(([key, item]) => {
      if (item === null || ['string', 'number', 'boolean'].includes(typeof item))
        return [[key, item]];
      if (Array.isArray(item)) return [[key, item.filter(isJsonValue)]];
      if (isRecord(item)) return [[key, safeJsonObject(item)]];
      return [];
    }),
  ) as JsonObject;
}

function isJsonValue(value: unknown): value is JsonValue {
  if (value === null || ['string', 'number', 'boolean'].includes(typeof value)) return true;
  if (Array.isArray(value)) return value.every(isJsonValue);
  return isRecord(value) && Object.values(value).every(isJsonValue);
}

async function requestJson(path: string, init?: RequestInit): Promise<unknown> {
  const response = await fetch(`${API_BASE}${path}`, init);
  const text = await response.text();
  let parsed: unknown = null;
  if (text) {
    try {
      parsed = JSON.parse(text) as unknown;
    } catch {
      parsed = text;
    }
  }
  if (!response.ok) {
    const record = isRecord(parsed) ? parsed : {};
    const messageValue = record.message;
    const message = Array.isArray(messageValue)
      ? messageValue.filter((item): item is string => typeof item === 'string').join(', ')
      : (stringValue(messageValue) ??
        stringValue(parsed) ??
        `Yêu cầu thất bại (${response.status})`);
    throw new SettingsApiError(message.slice(0, 240), response.status);
  }
  return parsed;
}

function jsonInit(method: 'POST' | 'PUT' | 'PATCH', body: unknown): RequestInit {
  return {
    method,
    headers: { 'Content-Type': 'application/json' },
    body: JSON.stringify(body),
  };
}

async function fetchFallbackSummary(): Promise<SettingsSummary> {
  const [statusResult, groupsResult, configResult] = await Promise.allSettled([
    requestJson('/zalo/status', { cache: 'no-store' }),
    requestJson('/zalo/groups', { cache: 'no-store' }),
    requestJson('/demo/config', { cache: 'no-store' }),
  ] as const);
  const status =
    statusResult.status === 'fulfilled' && isRecord(statusResult.value) ? statusResult.value : {};
  const groups = groupsResult.status === 'fulfilled' ? unwrapEnvelope(groupsResult.value) : [];
  const config =
    configResult.status === 'fulfilled' && isRecord(configResult.value) ? configResult.value : {};
  const fulfilledCount =
    Number(statusResult.status === 'fulfilled') +
    Number(groupsResult.status === 'fulfilled') +
    Number(configResult.status === 'fulfilled');
  const summary = parseSettingsSummary({
    ...status,
    channelMode: config.channelMode ?? status.channelMode,
    autoSend: config.autoSend,
    groups,
  });
  return {
    ...summary,
    availability: fulfilledCount ? 'fallback' : 'unavailable',
    warnings: [
      ...summary.warnings,
      fulfilledCount
        ? 'API tổng quan chưa sẵn sàng; đang hiển thị dữ liệu tương thích từ hệ thống hiện tại.'
        : 'Chưa kết nối được API cấu hình. Bạn vẫn có thể xem cấu trúc và thử tải lại.',
    ],
  };
}

async function getSummary(): Promise<SettingsSummary> {
  try {
    return parseSettingsSummary(await requestJson('/settings/summary', { cache: 'no-store' }));
  } catch {
    return fetchFallbackSummary();
  }
}

function parseSyncResult(value: unknown): MemberSyncResult {
  const unwrapped = unwrapEnvelope(value);
  const record = isRecord(unwrapped) ? unwrapped : {};
  return {
    groupId: stringValue(record.groupId) ?? '',
    complete: booleanValue(record.complete, true),
    expectedCount: numberValue(record.expectedCount ?? record.active),
    fetchedCount: numberValue(record.fetchedCount ?? record.active),
    failedCount: numberValue(record.failedCount),
    upsertedCount: numberValue(record.upsertedCount ?? record.active),
    deactivatedCount: numberValue(record.deactivatedCount ?? record.inactive),
    ...(stringValue(record.syncedAt) ? { syncedAt: stringValue(record.syncedAt) } : {}),
  };
}

export function resolveSourceTruthRowId(
  resource: SourceTruthResource,
  item: Readonly<Record<string, unknown>>,
  index: number,
): string {
  const directId = stringValue(item.id);
  if (directId) return directId;
  if (resource === 'overrides') {
    const dealerId = stringValue(item.dealerId);
    const sku = stringValue(item.sku);
    if (dealerId && sku) return `${dealerId}:${sku}`;
  }
  const resourceId =
    resource === 'groups'
      ? stringValue(item.chatId)
      : resource === 'products' || resource === 'prices'
        ? stringValue(item.sku)
        : resource === 'glossary'
          ? stringValue(item.term)
          : undefined;
  return resourceId ?? String(index);
}

function parseSourceTruthRows(resource: SourceTruthResource, value: unknown): SourceTruthRow[] {
  const unwrapped = unwrapEnvelope(value);
  const record = isRecord(unwrapped) ? unwrapped : {};
  const rawRows = Array.isArray(unwrapped) ? unwrapped : arrayValue(record.items ?? record.rows);
  return rawRows.flatMap((item, index) => {
    if (!isRecord(item)) return [];
    const id = resolveSourceTruthRowId(resource, item, index);
    const label =
      stringValue(item.name) ??
      stringValue(item.displayName) ??
      stringValue(item.sku) ??
      stringValue(item.term) ??
      id;
    const fields = Object.fromEntries(
      Object.entries(item).filter(([, field]) =>
        field === null ? true : ['string', 'number', 'boolean'].includes(typeof field),
      ),
    ) as Record<string, JsonPrimitive>;
    return [
      {
        id,
        label,
        ...(stringValue(item.sku ?? item.code) ? { code: stringValue(item.sku ?? item.code) } : {}),
        fields,
      },
    ];
  });
}

async function getSourceTruth(): Promise<SourceTruthSection[]> {
  const resources: SourceTruthResource[] = [
    'dealers',
    'groups',
    'products',
    'prices',
    'overrides',
    'glossary',
  ];
  const results = await Promise.allSettled(
    resources.map((resource) => requestJson(`/settings/source-truth/${resource}`)),
  );
  return resources.map((resource, index) => {
    const result = results[index];
    if (!result) return { resource, rows: [], error: 'Không tải được' };
    if (result.status === 'fulfilled')
      return { resource, rows: parseSourceTruthRows(resource, result.value) };
    return {
      resource,
      rows: [],
      error: result.reason instanceof Error ? result.reason.message : 'Không tải được',
    };
  });
}

function parseRuleVersion(value: unknown): RuleConfigVersion | undefined {
  if (!isRecord(value)) return undefined;
  const id = stringValue(value.id);
  if (!id) return undefined;
  const hasProvisionalKeys = Array.isArray(value.provisionalKeys);
  const provisionalKeys = arrayValue(value.provisionalKeys).filter(
    (item): item is string => typeof item === 'string',
  );
  return {
    id,
    version: String(value.version ?? id),
    status: enumValue(value.status, ['draft', 'preview', 'active', 'archived'], 'draft'),
    payload: safeJsonObject(value.payload),
    ...(stringValue(value.createdBy) ? { createdBy: stringValue(value.createdBy) } : {}),
    ...(stringValue(value.activatedBy) ? { activatedBy: stringValue(value.activatedBy) } : {}),
    ...(stringValue(value.createdAt) ? { createdAt: stringValue(value.createdAt) } : {}),
    ...(stringValue(value.activatedAt) ? { activatedAt: stringValue(value.activatedAt) } : {}),
    provisionalKeys,
    provisionalVerified: hasProvisionalKeys && provisionalKeys.length === 0,
  };
}

function parseRules(value: unknown): RuleConfigVersion[] {
  const unwrapped = unwrapEnvelope(value);
  const record = isRecord(unwrapped) ? unwrapped : {};
  const rows = Array.isArray(unwrapped) ? unwrapped : arrayValue(record.versions ?? record.rules);
  return rows.map(parseRuleVersion).filter((rule) => rule !== undefined);
}

function parseRulePreview(value: unknown): RulePreview {
  const unwrapped = unwrapEnvelope(value);
  const record = isRecord(unwrapped) ? unwrapped : {};
  return {
    ...(isRecord(record.totals) ? { totals: safeJsonObject(record.totals) } : {}),
    warnings: arrayValue(record.warnings).filter(
      (item): item is string => typeof item === 'string',
    ),
    trace: arrayValue(record.trace).filter((item): item is string => typeof item === 'string'),
  };
}

function parseAuditEntry(value: unknown): AuditEntry | undefined {
  if (!isRecord(value)) return undefined;
  const id = stringValue(value.id);
  const createdAt = stringValue(value.createdAt);
  if (!id || !createdAt) return undefined;
  return {
    id,
    actor: stringValue(value.actor) ?? 'Hệ thống',
    action: stringValue(value.action) ?? 'unknown',
    entityType: stringValue(value.entityType) ?? 'unknown',
    ...(stringValue(value.entityId) ? { entityId: stringValue(value.entityId) } : {}),
    ...(isRecord(value.before) ? { before: redactAuditObject(safeJsonObject(value.before)) } : {}),
    ...(isRecord(value.after) ? { after: redactAuditObject(safeJsonObject(value.after)) } : {}),
    ...(stringValue(value.requestId) ? { requestId: stringValue(value.requestId) } : {}),
    createdAt,
  };
}

const SENSITIVE_AUDIT_KEY =
  /(phone|address|token|cookie|credential|password|secret|raw(message|text)|avatar|externaluserid)/i;

function redactAuditObject(value: JsonObject): JsonObject {
  return Object.fromEntries(
    Object.entries(value).map(([key, item]) => {
      if (SENSITIVE_AUDIT_KEY.test(key)) return [key, '[đã ẩn]'];
      if (Array.isArray(item)) {
        return [
          key,
          item.map((entry) => (isRecord(entry) ? redactAuditObject(safeJsonObject(entry)) : entry)),
        ];
      }
      if (isRecord(item)) return [key, redactAuditObject(safeJsonObject(item))];
      return [key, item];
    }),
  ) as JsonObject;
}

function buildAuditQuery(filters: AuditFilters): string {
  const params = new URLSearchParams();
  if (filters.actor?.trim()) params.set('actor', filters.actor.trim());
  if (filters.action) params.set('action', filters.action);
  if (filters.entityType) params.set('entityType', filters.entityType);
  if (filters.page) params.set('page', String(filters.page));
  if (filters.limit) params.set('limit', String(filters.limit));
  const query = params.toString();
  return query ? `?${query}` : '';
}

function parseAuditPage(value: unknown, filters: AuditFilters): AuditPage {
  const unwrapped = unwrapEnvelope(value);
  const record = isRecord(unwrapped) ? unwrapped : {};
  const rawEntries = Array.isArray(unwrapped)
    ? unwrapped
    : arrayValue(record.entries ?? record.items);
  const entries = rawEntries.map(parseAuditEntry).filter((entry) => entry !== undefined);
  return {
    entries,
    total: numberValue(record.total, entries.length),
    page: numberValue(record.page, filters.page ?? 1),
    limit: numberValue(record.limit, filters.limit ?? 25),
  };
}

export const settingsApi = {
  summary: getSummary,
  listParticipants: async (
    groupId: string,
    filters: ParticipantFilters,
  ): Promise<ParticipantList> =>
    parseParticipantList(
      await requestJson(
        `/groups/${encodeURIComponent(groupId)}/participants${buildParticipantQuery(filters)}`,
      ),
    ),
  syncMembers: async (zcaChatId: string): Promise<MemberSyncResult> =>
    parseSyncResult(
      await requestJson(
        `/zalo/groups/${encodeURIComponent(zcaChatId)}/members/sync`,
        jsonInit('POST', {}),
      ),
    ),
  updateParticipant: async (
    groupId: string,
    participantId: string,
    patch: ParticipantPatch,
  ): Promise<GroupParticipant> => {
    const result = parseParticipant(
      unwrapEnvelope(
        await requestJson(
          `/groups/${encodeURIComponent(groupId)}/participants/${encodeURIComponent(participantId)}`,
          jsonInit('PATCH', patch),
        ),
      ),
    );
    if (!result) throw new Error('API trả về thành viên không hợp lệ');
    return result;
  },
  previewParticipantBulk: async (
    groupId: string,
    request: ParticipantBulkRequest,
  ): Promise<ParticipantBulkPreview> => {
    const value = unwrapEnvelope(
      await requestJson(
        `/groups/${encodeURIComponent(groupId)}/participants`,
        jsonInit('PATCH', {
          participantIds: request.participantIds,
          changes: request.patch,
          preview: true,
        }),
      ),
    );
    const record = isRecord(value) ? value : {};
    return {
      affectedCount: numberValue(record.affectedCount, request.participantIds.length),
      warnings: arrayValue(record.warnings).filter(
        (item): item is string => typeof item === 'string',
      ),
    };
  },
  bulkUpdateParticipants: async (
    groupId: string,
    request: ParticipantBulkRequest,
  ): Promise<ParticipantList> =>
    parseParticipantList(
      await requestJson(
        `/groups/${encodeURIComponent(groupId)}/participants`,
        jsonInit('PATCH', {
          participantIds: request.participantIds,
          changes: request.patch,
          preview: false,
          confirmed: true,
        }),
      ),
    ),
  sourceTruth: getSourceTruth,
  saveSourceTruth: async (
    resource: SourceTruthResource,
    id: string | undefined,
    changes: Readonly<Record<string, JsonPrimitive>>,
  ): Promise<SourceTruthRow[]> => {
    const suffix = id ? `/${encodeURIComponent(id)}` : '';
    const immutableKey =
      resource === 'dealers'
        ? 'id'
        : resource === 'products' || resource === 'prices'
          ? 'sku'
          : resource === 'glossary'
            ? 'term'
            : undefined;
    const body =
      id && immutableKey
        ? Object.fromEntries(Object.entries(changes).filter(([key]) => key !== immutableKey))
        : changes;
    return parseSourceTruthRows(
      resource,
      await requestJson(`/settings/source-truth/${resource}${suffix}`, jsonInit('PUT', body)),
    );
  },
  /**
   * Map nhom -> dai ly bang chatId ma UI dang hien. `name` gui kem de hang DB co ten that
   * (tin nhan khong mang ten nhom, nen neu khong gui thi DB chi co ID tro trui).
   */
  setGroupMapping: async (
    zcaChatId: string,
    input: { dealerId: string | null; name?: string },
  ): Promise<{ chatId: string; dealerId: string | null; status: GroupMappingStatus }> => {
    const raw = unwrapEnvelope(
      await requestJson(
        `/settings/groups/${encodeURIComponent(zcaChatId)}/mapping`,
        jsonInit('PUT', input),
      ),
    );
    const record = isRecord(raw) ? raw : {};
    return {
      chatId: stringValue(record.chatId) ?? zcaChatId,
      dealerId: stringValue(record.dealerId) ?? null,
      status: enumValue(record.status, ['pending', 'mapped', 'ignored'] as const, 'pending'),
    };
  },
  /**
   * Gỡ nhóm khỏi danh sách làm việc, hoặc đưa trở lại. KHÔNG xóa hàng: tin nhắn và đơn đã nhận
   * vẫn trỏ tới nhóm này, nên hàng phải còn — xem `GroupMappingService.setHidden` phía API.
   */
  setGroupHidden: async (
    zcaChatId: string,
    hidden: boolean,
  ): Promise<{ chatId: string; status: GroupMappingStatus }> => {
    const raw = unwrapEnvelope(
      await requestJson(
        `/settings/groups/${encodeURIComponent(zcaChatId)}/hidden`,
        jsonInit('PUT', { hidden }),
      ),
    );
    const record = isRecord(raw) ? raw : {};
    return {
      chatId: stringValue(record.chatId) ?? zcaChatId,
      status: enumValue(record.status, ['pending', 'mapped', 'ignored'] as const, 'pending'),
    };
  },
  rules: async (): Promise<RuleConfigVersion[]> => parseRules(await requestJson('/settings/rules')),
  createRuleDraft: async (payload: JsonObject): Promise<RuleConfigVersion> => {
    const rule = parseRuleVersion(
      unwrapEnvelope(await requestJson('/settings/rules', jsonInit('POST', { payload }))),
    );
    if (!rule) throw new Error('API trả về bản rules không hợp lệ');
    return rule;
  },
  previewRule: async (id: string, sampleOrder: JsonObject): Promise<RulePreview> =>
    parseRulePreview(
      await requestJson(
        `/settings/rules/${encodeURIComponent(id)}/preview`,
        jsonInit('POST', { sampleOrder }),
      ),
    ),
  activateRule: async (id: string): Promise<RuleConfigVersion> => {
    const rule = parseRuleVersion(
      unwrapEnvelope(
        await requestJson(
          `/settings/rules/${encodeURIComponent(id)}/activate`,
          jsonInit('POST', { confirmed: true }),
        ),
      ),
    );
    if (!rule) throw new Error('API trả về bản rules không hợp lệ');
    return rule;
  },
  setAutoSend: async (enabled: boolean): Promise<{ autoSend: boolean }> => {
    const value = unwrapEnvelope(
      await requestJson(
        '/settings/automation/auto-send',
        jsonInit('PUT', enabled ? { enabled: true, acknowledged: true } : { enabled: false }),
      ),
    );
    const record = isRecord(value) ? value : {};
    return {
      autoSend: booleanValue(
        isRecord(record.autoSend) ? record.autoSend.enabled : (record.autoSend ?? record.enabled),
      ),
    };
  },
  audit: async (filters: AuditFilters): Promise<AuditPage> =>
    parseAuditPage(await requestJson(`/settings/audit${buildAuditQuery(filters)}`), filters),
  zaloStatus: async (): Promise<unknown> => requestJson('/zalo/status', { cache: 'no-store' }),
  zaloGroups: async (): Promise<unknown> => requestJson('/zalo/groups', { cache: 'no-store' }),
  logoutZalo: async (): Promise<unknown> =>
    requestJson('/zalo/logout', jsonInit('POST', { confirmed: true })),
};
