import { authFetch } from './auth';
import { publicApiBase } from './api-base';

const API_BASE = publicApiBase();

type UnknownRecord = Record<string, unknown>;
export type MasterDataResource = 'dealer' | 'deal' | 'group';
export type MasterDataPreviewAction = 'create' | 'update' | 'unchanged' | 'error';

export interface MasterDataDealer {
  id: string;
  code: string | null;
  name: string;
  aliases: string[];
  tier: 'dai_ly' | 'ctv';
  defaultPolicy: 'cong_no_30' | 'cong_no_45' | 'ky_gui' | 'thanh_toan_ngay' | 'cod';
  phone: string | null;
  status: 'active' | 'inactive';
  metadata: Readonly<Record<string, unknown>> | null;
}

export interface MasterDataDeal {
  id: string;
  dealerId: string;
  sku: string;
  price: number;
  /** Ngưỡng số lượng để deal có hiệu lực; `null` = áp mọi số lượng. */
  minQuantity: number | null;
  enabled: boolean;
  effectiveFrom: string | null;
  effectiveTo: string | null;
}

export interface MasterDataGroup {
  id: string;
  chatId: string;
  name: string | null;
  branch: string | null;
  dealerId: string | null;
  status: 'pending' | 'mapped' | 'ignored';
  source: string | null;
}

export interface MasterDataView {
  dealers: MasterDataDealer[];
  deals: MasterDataDeal[];
  groups: MasterDataGroup[];
  unmappedGroups: MasterDataGroup[];
}

export interface MasterDataImportPayload {
  format: 'xlsx' | 'csv' | 'json';
  encoding: 'base64' | 'utf8';
  content: string;
  filename?: string;
}

export interface MasterDataPreviewRow {
  resource: MasterDataResource;
  rowNumber: number;
  sheet?: string;
  key: string;
  action: MasterDataPreviewAction;
  before: unknown;
  after: unknown;
  errors: string[];
}

export interface MasterDataImportPreview {
  valid: boolean;
  previewToken: string;
  totals: Record<MasterDataPreviewAction, number>;
  rows: MasterDataPreviewRow[];
  applied?: number;
}

export function parseMasterDataView(value: unknown): MasterDataView {
  const record = isRecord(value) ? value : {};
  return {
    dealers: array(record.dealers).flatMap((item) => {
      const parsed = parseDealer(item);
      return parsed ? [parsed] : [];
    }),
    deals: array(record.deals).flatMap((item) => {
      const parsed = parseDeal(item);
      return parsed ? [parsed] : [];
    }),
    groups: array(record.groups).flatMap((item) => {
      const parsed = parseGroup(item);
      return parsed ? [parsed] : [];
    }),
    unmappedGroups: array(record.unmappedGroups).flatMap((item) => {
      const parsed = parseGroup(item);
      return parsed ? [parsed] : [];
    }),
  };
}

export function parseMasterDataPreview(value: unknown): MasterDataImportPreview {
  const record = isRecord(value) ? value : {};
  const totals = isRecord(record.totals) ? record.totals : {};
  return {
    valid: record.valid === true,
    previewToken: text(record.previewToken) ?? '',
    totals: {
      create: finite(totals.create),
      update: finite(totals.update),
      unchanged: finite(totals.unchanged),
      error: finite(totals.error),
    },
    rows: array(record.rows).flatMap((item) => {
      const parsed = parsePreviewRow(item);
      return parsed ? [parsed] : [];
    }),
    ...(typeof record.applied === 'number' ? { applied: finite(record.applied) } : {}),
  };
}

export const masterDataApi = {
  masterData: async (): Promise<MasterDataView> =>
    parseMasterDataView(await request('/settings/master-data', { cache: 'no-store' })),
  previewMasterDataImport: async (
    payload: MasterDataImportPayload,
  ): Promise<MasterDataImportPreview> =>
    parseMasterDataPreview(
      await request('/settings/master-data/import/preview', json('POST', payload)),
    ),
  applyMasterDataImport: async (
    payload: MasterDataImportPayload,
    previewToken: string,
  ): Promise<MasterDataImportPreview> =>
    parseMasterDataPreview(
      await request(
        '/settings/master-data/import/apply',
        json('POST', { ...payload, previewToken, confirmed: true }),
      ),
    ),
  saveDealer: (id: string, value: Omit<MasterDataDealer, 'id'>): Promise<unknown> =>
    request(`/settings/master-data/dealers/${encodeURIComponent(id)}`, json('PUT', value)),
  disableDealer: (id: string): Promise<unknown> =>
    request(`/settings/master-data/dealers/${encodeURIComponent(id)}`, { method: 'DELETE' }),
  saveDeal: (id: string, value: Omit<MasterDataDeal, 'id'>): Promise<unknown> =>
    request(`/settings/master-data/deals/${encodeURIComponent(id)}`, json('PUT', value)),
  disableDeal: (id: string): Promise<unknown> =>
    request(`/settings/master-data/deals/${encodeURIComponent(id)}`, { method: 'DELETE' }),
  mapMasterDataGroup: (
    chatId: string,
    value: { dealerId: string | null; name?: string; branch?: string | null },
  ): Promise<unknown> =>
    request(`/settings/master-data/groups/${encodeURIComponent(chatId)}`, json('PUT', value)),
  unmapMasterDataGroup: (chatId: string): Promise<unknown> =>
    request(`/settings/master-data/groups/${encodeURIComponent(chatId)}/mapping`, {
      method: 'DELETE',
    }),
};

async function request(path: string, init?: RequestInit): Promise<unknown> {
  const response = await authFetch(`${API_BASE}${path}`, init);
  const textBody = await response.text();
  let body: unknown = null;
  try {
    body = textBody ? (JSON.parse(textBody) as unknown) : null;
  } catch {
    body = textBody;
  }
  if (!response.ok) {
    const message = isRecord(body) ? text(body.message) : undefined;
    throw new Error(message ?? `Yêu cầu thất bại (${response.status})`);
  }
  return isRecord(body) && 'data' in body ? body.data : body;
}

function json(method: 'POST' | 'PUT', body: unknown): RequestInit {
  return {
    method,
    headers: { 'Content-Type': 'application/json' },
    body: JSON.stringify(body),
  };
}

function parseDealer(value: unknown): MasterDataDealer | undefined {
  if (!isRecord(value)) return undefined;
  const id = text(value.id);
  const name = text(value.name);
  if (!id || !name) return undefined;
  return {
    id,
    code: text(value.code) ?? null,
    name,
    aliases: array(value.aliases).filter((item): item is string => typeof item === 'string'),
    tier: value.tier === 'ctv' ? 'ctv' : 'dai_ly',
    defaultPolicy: policy(value.defaultPolicy),
    phone: text(value.phone) ?? null,
    status: value.status === 'active' ? 'active' : 'inactive',
    metadata: isRecord(value.metadata) ? value.metadata : null,
  };
}

function parseDeal(value: unknown): MasterDataDeal | undefined {
  if (!isRecord(value)) return undefined;
  const id = text(value.id);
  const dealerId = text(value.dealerId);
  const sku = text(value.sku);
  if (!id || !dealerId || !sku || typeof value.price !== 'number') return undefined;
  return {
    id,
    dealerId,
    sku,
    price: finite(value.price),
    // Thiếu/không phải số = không giới hạn số lượng, KHÔNG suy ra 0 (0 sẽ thành "deal luôn áp").
    minQuantity: typeof value.minQuantity === 'number' ? finite(value.minQuantity) : null,
    enabled: value.enabled === true,
    effectiveFrom: text(value.effectiveFrom) ?? null,
    effectiveTo: text(value.effectiveTo) ?? null,
  };
}

function parseGroup(value: unknown): MasterDataGroup | undefined {
  if (!isRecord(value)) return undefined;
  const id = text(value.id);
  const chatId = text(value.chatId);
  if (!id || !chatId) return undefined;
  const rawStatus = value.status;
  return {
    id,
    chatId,
    name: text(value.name) ?? null,
    branch: text(value.branch) ?? null,
    dealerId: text(value.dealerId) ?? null,
    status: rawStatus === 'mapped' || rawStatus === 'ignored' ? rawStatus : 'pending',
    source: text(value.source) ?? null,
  };
}

function parsePreviewRow(value: unknown): MasterDataPreviewRow | undefined {
  if (!isRecord(value)) return undefined;
  const resource = value.resource;
  const action = value.action;
  const key = text(value.key);
  if (
    !['dealer', 'deal', 'group'].includes(String(resource)) ||
    !['create', 'update', 'unchanged', 'error'].includes(String(action)) ||
    !key
  ) {
    return undefined;
  }
  return {
    resource: resource as MasterDataResource,
    rowNumber: finite(value.rowNumber),
    ...(text(value.sheet) ? { sheet: text(value.sheet) } : {}),
    key,
    action: action as MasterDataPreviewAction,
    before: value.before,
    after: value.after,
    errors: array(value.errors).filter((item): item is string => typeof item === 'string'),
  };
}

function policy(value: unknown): MasterDataDealer['defaultPolicy'] {
  const allowed: MasterDataDealer['defaultPolicy'][] = [
    'cong_no_30',
    'cong_no_45',
    'ky_gui',
    'thanh_toan_ngay',
    'cod',
  ];
  return allowed.includes(value as MasterDataDealer['defaultPolicy'])
    ? (value as MasterDataDealer['defaultPolicy'])
    : 'thanh_toan_ngay';
}

function isRecord(value: unknown): value is UnknownRecord {
  return typeof value === 'object' && value !== null && !Array.isArray(value);
}

function array(value: unknown): unknown[] {
  return Array.isArray(value) ? value : [];
}

function text(value: unknown): string | undefined {
  return typeof value === 'string' && value.trim() ? value.trim() : undefined;
}

function finite(value: unknown): number {
  return typeof value === 'number' && Number.isFinite(value) ? value : 0;
}
