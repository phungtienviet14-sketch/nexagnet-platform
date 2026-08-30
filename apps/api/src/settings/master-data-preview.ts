import { createHash } from 'node:crypto';
import type {
  ImportedDealer,
  ParsedMasterDataImport,
  ParsedMasterDataRow,
  MasterDataImportResource,
} from './master-data-import.js';

export interface MasterDataDealerRecord extends ImportedDealer {
  id: string;
}

export interface MasterDataDealRecord {
  id: string;
  dealerId: string;
  sku: string;
  price: number;
  /**
   * ASM-03 (Issue #77) — LUON co mat, khong bao gio NULL tren duong import.
   *
   * Truong nay tung vang mat khoi ban ghi, nen `applyImport` upsert mot deal KHONG kem nguong:
   * ban ghi moi vao Postgres voi `minQuantity = NULL`, va mot ban cap nhat khong bao gio ghi de
   * duoc nguong cu. Ca hai deu la sai gia im lang.
   */
  minQuantity: number;
  enabled: boolean;
  effectiveFrom: string | null;
  effectiveTo: string | null;
}

export interface MasterDataGroupRecord {
  id: string;
  chatId: string;
  name: string | null;
  branch: string | null;
  dealerId: string | null;
  status: 'pending' | 'mapped' | 'ignored';
  source: string | null;
}

export interface MasterDataSnapshot {
  dealers: MasterDataDealerRecord[];
  deals: MasterDataDealRecord[];
  groups: MasterDataGroupRecord[];
  productSkus: string[];
}

export type MasterDataPreviewAction = 'create' | 'update' | 'unchanged' | 'error';

export interface MasterDataPreviewRow {
  resource: MasterDataImportResource;
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
}

interface ResolutionContext {
  snapshot: MasterDataSnapshot;
  dealersByReference: ReadonlyMap<string, MasterDataDealerRecord>;
  groupsByName: ReadonlyMap<string, readonly MasterDataGroupRecord[]>;
  productSkus: ReadonlySet<string>;
}

export function buildMasterDataImportPreview(
  parsed: ParsedMasterDataImport,
  snapshot: MasterDataSnapshot,
  _now = new Date(),
): MasterDataImportPreview {
  const importedDealers = resolveImportedDealers(parsed.rows, snapshot.dealers);
  const allDealers = mergeDealers(snapshot.dealers, importedDealers);
  const context: ResolutionContext = {
    snapshot,
    dealersByReference: dealerReferenceIndex(allDealers),
    groupsByName: groupNameIndex(snapshot.groups),
    productSkus: new Set(snapshot.productSkus),
  };
  const planned = parsed.rows.map((row) => planRow(row, context, importedDealers));
  const parseErrors: MasterDataPreviewRow[] = parsed.errors.map((error) => ({
    resource: error.resource ?? 'dealer',
    rowNumber: error.rowNumber,
    ...(error.sheet ? { sheet: error.sheet } : {}),
    key: `parse:${error.sheet ?? parsed.format}:${error.rowNumber}`,
    action: 'error',
    before: null,
    after: null,
    errors: [error.message],
  }));
  const rows = markDuplicateKeys([...planned, ...parseErrors]);
  const totals = {
    create: rows.filter((row) => row.action === 'create').length,
    update: rows.filter((row) => row.action === 'update').length,
    unchanged: rows.filter((row) => row.action === 'unchanged').length,
    error: rows.filter((row) => row.action === 'error').length,
  };
  const tokenPayload = rows.map(({ resource, key, action, before, after, errors }) => ({
    resource,
    key,
    action,
    before,
    after,
    errors,
  }));
  return {
    valid: totals.error === 0,
    previewToken: createHash('sha256').update(stableStringify(tokenPayload)).digest('hex'),
    totals,
    rows,
  };
}

function resolveImportedDealers(
  rows: readonly ParsedMasterDataRow[],
  existing: readonly MasterDataDealerRecord[],
): ReadonlyMap<ParsedMasterDataRow, MasterDataDealerRecord> {
  const existingIndex = dealerReferenceIndex(existing);
  return new Map(
    rows.flatMap((row) => {
      if (row.resource !== 'dealer') return [];
      const input = row.value;
      const match =
        (input.id ? existingIndex.get(normalize(input.id)) : undefined) ??
        (input.code ? existingIndex.get(normalize(input.code)) : undefined) ??
        existingIndex.get(normalize(input.name));
      const id = input.id ?? match?.id ?? importedDealerId(input);
      return [[row, { ...input, id }] as const];
    }),
  );
}

function mergeDealers(
  existing: readonly MasterDataDealerRecord[],
  imported: ReadonlyMap<ParsedMasterDataRow, MasterDataDealerRecord>,
): MasterDataDealerRecord[] {
  const byId = new Map(existing.map((dealer) => [dealer.id, dealer]));
  for (const dealer of imported.values()) byId.set(dealer.id, dealer);
  return [...byId.values()];
}

function planRow(
  row: ParsedMasterDataRow,
  context: ResolutionContext,
  importedDealers: ReadonlyMap<ParsedMasterDataRow, MasterDataDealerRecord>,
): MasterDataPreviewRow {
  if (row.resource === 'dealer') {
    const after = importedDealers.get(row);
    if (!after) return invalidRow(row, 'Không thể xác định đại lý');
    const before = context.snapshot.dealers.find((dealer) => dealer.id === after.id) ?? null;
    return comparedRow(row, after.id, before, after);
  }
  if (row.resource === 'deal') return planDeal(row, context);
  return planGroup(row, context);
}

function planDeal(
  row: Extract<ParsedMasterDataRow, { resource: 'deal' }>,
  context: ResolutionContext,
): MasterDataPreviewRow {
  const dealer = context.dealersByReference.get(normalize(row.value.dealerId));
  const errors: string[] = [];
  if (!context.productSkus.has(row.value.sku)) {
    errors.push(`SKU không tồn tại: ${row.value.sku}`);
  }
  if (!dealer) errors.push(`Không tìm thấy đại lý: ${row.value.dealerId}`);
  // Issue #77 §5 doi `effectiveTo > effectiveFrom`: BANG NHAU cung phai bi tu choi. Mot cua so
  // dai 0 giay khong phai mot deal — no la mot deal khong bao gio ap duoc, va nhan no vao im
  // lang thi Sale se ngoi doi mot muc gia khong bao gio toi.
  if (
    row.value.effectiveFrom &&
    row.value.effectiveTo &&
    new Date(row.value.effectiveFrom).getTime() >= new Date(row.value.effectiveTo).getTime()
  ) {
    errors.push('effectiveTo phải sau effectiveFrom');
  }
  const dealerId = dealer?.id ?? row.value.dealerId;
  const key = `${dealerId}:${row.value.sku}`;
  const before = context.snapshot.deals.find(
    (deal) => deal.dealerId === dealerId && deal.sku === row.value.sku,
  );
  const after: MasterDataDealRecord = {
    id: row.value.id ?? before?.id ?? importedRecordId('deal', key),
    dealerId,
    sku: row.value.sku,
    price: row.value.price,
    minQuantity: row.value.minQuantity,
    enabled: row.value.enabled,
    effectiveFrom: row.value.effectiveFrom,
    effectiveTo: row.value.effectiveTo,
  };
  return errors.length > 0
    ? { ...rowIdentity(row, key), action: 'error', before: before ?? null, after, errors }
    : comparedRow(row, key, before ?? null, after);
}

function planGroup(
  row: Extract<ParsedMasterDataRow, { resource: 'group' }>,
  context: ResolutionContext,
): MasterDataPreviewRow {
  const errors: string[] = [];
  const dealerReference = row.value.dealerId ?? row.value.dealerReference;
  const dealer = dealerReference
    ? context.dealersByReference.get(normalize(dealerReference))
    : undefined;
  if (!dealer) errors.push(`Không tìm thấy đại lý: ${dealerReference ?? '(trống)'}`);

  let chatId = row.value.chatId;
  if (!chatId) {
    const matches = context.groupsByName.get(normalize(row.value.name)) ?? [];
    if (matches.length === 1) chatId = matches[0]!.chatId;
    if (matches.length === 0) {
      errors.push('Nhóm chưa có Chat ID và chưa xuất hiện duy nhất trong hộp thư nhóm chưa map');
    }
    if (matches.length > 1) errors.push('Tên nhóm không duy nhất: có nhiều nhóm chưa map cùng tên');
  }
  const key = chatId ?? `unresolved:${normalize(row.value.name)}`;
  const before = chatId
    ? context.snapshot.groups.find((group) => group.chatId === chatId) ?? null
    : null;
  const status = row.value.enabled ? (dealer ? 'mapped' : 'pending') : 'ignored';
  const after = {
    id: before?.id ?? importedRecordId('group', key),
    chatId,
    name: row.value.name,
    branch: row.value.branch,
    dealerId: dealer?.id ?? null,
    status,
    source: 'import',
  };
  return errors.length > 0
    ? { ...rowIdentity(row, key), action: 'error', before, after, errors }
    : comparedRow(row, key, before, after);
}

function comparedRow(
  row: ParsedMasterDataRow,
  key: string,
  before: unknown,
  after: unknown,
): MasterDataPreviewRow {
  return {
    ...rowIdentity(row, key),
    action: before === null ? 'create' : sameRecord(before, after) ? 'unchanged' : 'update',
    before,
    after,
    errors: [],
  };
}

function invalidRow(row: ParsedMasterDataRow, message: string): MasterDataPreviewRow {
  return {
    ...rowIdentity(row, `invalid:${row.resource}:${row.rowNumber}`),
    action: 'error',
    before: null,
    after: row.value,
    errors: [message],
  };
}

function rowIdentity(
  row: ParsedMasterDataRow,
  key: string,
): Pick<MasterDataPreviewRow, 'resource' | 'rowNumber' | 'sheet' | 'key'> {
  return {
    resource: row.resource,
    rowNumber: row.rowNumber,
    ...(row.sheet ? { sheet: row.sheet } : {}),
    key,
  };
}

function markDuplicateKeys(rows: readonly MasterDataPreviewRow[]): MasterDataPreviewRow[] {
  const counts = new Map<string, number>();
  for (const row of rows) {
    if (row.action === 'error') continue;
    const key = `${row.resource}:${row.key}`;
    counts.set(key, (counts.get(key) ?? 0) + 1);
  }
  return rows.map((row) => {
    if (row.action === 'error' || (counts.get(`${row.resource}:${row.key}`) ?? 0) < 2) return row;
    return { ...row, action: 'error', errors: [`Khóa ${row.key} bị trùng trong file import`] };
  });
}

function dealerReferenceIndex(
  dealers: readonly MasterDataDealerRecord[],
): ReadonlyMap<string, MasterDataDealerRecord> {
  return new Map(
    dealers.flatMap((dealer) =>
      [dealer.id, dealer.code, dealer.name, ...dealer.aliases]
        .filter((value): value is string => Boolean(value))
        .map((value) => [normalize(value), dealer] as const),
    ),
  );
}

function groupNameIndex(
  groups: readonly MasterDataGroupRecord[],
): ReadonlyMap<string, readonly MasterDataGroupRecord[]> {
  const index = new Map<string, MasterDataGroupRecord[]>();
  for (const group of groups) {
    if (!group.name) continue;
    const key = normalize(group.name);
    index.set(key, [...(index.get(key) ?? []), group]);
  }
  return index;
}

function importedDealerId(dealer: ImportedDealer): string {
  return importedRecordId('dealer', dealer.code ?? normalize(dealer.name));
}

function importedRecordId(resource: string, key: string): string {
  const digest = createHash('sha256').update(`${resource}:${normalize(key)}`).digest('hex').slice(0, 20);
  return `import-${digest}`;
}

function normalize(value: string): string {
  return value
    .trim()
    .toLocaleLowerCase('vi')
    .normalize('NFD')
    .replace(/[\u0300-\u036f]/g, '')
    .replace(/đ/g, 'd')
    .replace(/\s+/g, ' ');
}

function sameRecord(left: unknown, right: unknown): boolean {
  return stableStringify(left) === stableStringify(right);
}

function stableStringify(value: unknown): string {
  if (Array.isArray(value)) return `[${value.map(stableStringify).join(',')}]`;
  if (typeof value === 'object' && value !== null) {
    const entries = Object.entries(value as Record<string, unknown>).sort(([left], [right]) =>
      left.localeCompare(right),
    );
    return `{${entries.map(([key, item]) => `${JSON.stringify(key)}:${stableStringify(item)}`).join(',')}}`;
  }
  return JSON.stringify(value);
}
