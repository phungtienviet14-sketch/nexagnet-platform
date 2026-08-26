import type {
  SourceContext,
  SourceLocation,
  TraceNode,
  TraceNodeOutcome,
  TraceView,
} from '@netviet/shared';
import { decisionReasonLabel } from './decision-vocabulary.js';
import type { TelemetryRecord } from './telemetry-record.js';
import type { StoredTrace } from './recent-traces.sink.js';
import { sourceForDecision, sourceForStep } from './source-manifest.js';

/**
 * Dung CAY NGHIEP VU tu cac ban ghi tho, roi LAM PHANG thanh danh sach co `depth`.
 *
 * Cung mot phep dung cay voi `tools/trace-view.mjs`, khac o dau ra: mot ben in ra terminal, mot
 * ben tra JSON cho console. Giu logic o TANG API de web khong phai biet gi ve spanId.
 */

function outcomeOf(record: TelemetryRecord): TraceNodeOutcome | undefined {
  if (record.type === 'step' || record.type === 'ai_call') return record.status;
  if (record.type === 'decision') return record.outcome;
  return undefined;
}

function labelOf(record: TelemetryRecord): string {
  switch (record.type) {
    case 'step':
      return record.name;
    case 'decision':
      return record.point;
    case 'state_change':
      return `${record.entity}: ${record.from ?? '(mới)'} → ${record.to}`;
    case 'data_change':
      return `${record.entity}.${record.field}`;
    case 'ai_call':
      return `AI ${record.operation}`;
  }
}

function detailOf(record: TelemetryRecord): string | undefined {
  switch (record.type) {
    case 'decision':
      return record.detail ? compactJson(record.detail) : undefined;
    case 'data_change':
      return `${compactJson(record.from)} → ${compactJson(record.to)}`;
    case 'ai_call': {
      const parts = [`${record.provider}/${record.model}`];
      if (record.inputTokens !== undefined) {
        parts.push(`${record.inputTokens}→${record.outputTokens ?? '?'} token`);
      }
      if (record.toolNames?.length) parts.push(`công cụ: ${record.toolNames.join(', ')}`);
      return parts.join(' · ');
    }
    case 'step':
      return record.error ? `${record.error.name}: ${record.error.message}` : undefined;
    case 'state_change':
      return undefined;
  }
}

function compactJson(value: unknown): string {
  const text = JSON.stringify(value);
  return text === undefined ? String(value) : text.replace(/^"|"$/g, '');
}

/**
 * Buoc nao la "ky thuat"?
 *
 * Quy uoc: buoc luu tru/ha tang (`*.persist`, `*.link`) la manh moi ky thuat — huu ich khi truy
 * loi nhung khong phai thu Sale can thay. Quyet dinh, chuyen trang thai va lan goi AI thi LUON
 * la nghiep vu, khong bao gio bi an.
 */
function isTechnical(record: TelemetryRecord): boolean {
  return record.type === 'step' && /\.(persist|link|save)$/.test(record.name);
}

/**
 * CHO TRONG MA NGUON da sinh ra ban ghi nay — tra tu bang duoc sinh o `source-manifest.ts`.
 *
 * CHI hai loai ban ghi co cho tra cuu, va do la mot gioi han THAT chu khong phai su luoi:
 *
 *   `step`     ten buoc duoc viet ra dung mot cho o ranh gioi nghiep vu;
 *   `decision` cap (diem, ly do) chi ve dung nhanh da chay.
 *
 * `state_change`/`data_change` thi khong: khoa cua chung la `entity`/`field` — nhung chuoi nhu
 * `Order` hay `quantity` xuat hien khap noi, nen mot phep tra cuu theo chung se tra ve mot cho
 * bat ky. `ai_call` cung vay: `parse`/`compose` khong phai ten co vi tri.
 *
 * Thieu thi tra `undefined`, va console noi ro la thieu (muc 11). Khong doan.
 */
function sourceOf(record: TelemetryRecord): SourceLocation | undefined {
  if (record.type === 'step') return sourceForStep(record.name) ?? undefined;
  if (record.type === 'decision')
    return sourceForDecision(record.point, record.reason) ?? undefined;
  return undefined;
}

export function buildTraceView(stored: StoredTrace, sourceContext?: SourceContext): TraceView {
  const { records } = stored;
  const first = records[0]!;
  const steps = new Map<string, TelemetryRecord>();
  for (const record of records) {
    if (record.type === 'step') steps.set(record.spanId, record);
  }

  const nodes: TraceNode[] = [];
  const emitted = new Set<TelemetryRecord>();

  const childrenOf = (spanId: string | undefined): TelemetryRecord[] =>
    records.filter((record) =>
      record.type === 'step' ? record.parentSpanId === spanId : record.parentSpanId === spanId,
    );

  const walk = (record: TelemetryRecord, depth: number): void => {
    if (emitted.has(record)) return;
    emitted.add(record);
    const reason = record.type === 'decision' ? record.reason : undefined;
    nodes.push({
      kind: kindOf(record),
      depth,
      label: labelOf(record),
      ...(outcomeOf(record) ? { outcome: outcomeOf(record)! } : {}),
      ...(reason ? { reason, reasonLabel: decisionReasonLabel(reason) } : {}),
      ...(record.type === 'state_change' && record.reason
        ? { reason: record.reason, reasonLabel: decisionReasonLabel(record.reason) }
        : {}),
      ...(record.type === 'step' || record.type === 'ai_call'
        ? { durationMs: record.durationMs }
        : {}),
      ...(detailOf(record) ? { detail: detailOf(record)! } : {}),
      ...(isTechnical(record) ? { technical: true } : {}),
      ...(sourceOf(record) ? { source: sourceOf(record)! } : {}),
    });
    if (record.type !== 'step') return;
    for (const child of childrenOf(record.spanId)) walk(child, depth + 1);
  };

  // Goc = ban ghi khong co cha, hoac co cha nhung cha khong nam trong luot (bi cat theo tran).
  for (const record of records) {
    if (!record.parentSpanId || !steps.has(record.parentSpanId)) walk(record, 0);
  }
  // Luoi an toan: ban ghi nao chua ra duoc van phai hien — mot dau vet bi nuot vi cay dung sai
  // con te hon mot cay xau.
  for (const record of records) walk(record, 0);

  const totalMs = records
    .filter(
      (record): record is Extract<TelemetryRecord, { type: 'step' }> => record.type === 'step',
    )
    .reduce((max, record) => Math.max(max, record.durationMs), 0);

  return {
    traceId: stored.traceId,
    tenant: first.tenant,
    environment: first.environment,
    ...(first.release ? { release: first.release } : {}),
    startedAt: stored.startedAt,
    anchors: first.anchors,
    nodes,
    ...(totalMs > 0 ? { totalMs } : {}),
    ...(sourceContext ? { sourceContext } : {}),
  };
}

function kindOf(record: TelemetryRecord): TraceNode['kind'] {
  switch (record.type) {
    case 'step':
      return 'step';
    case 'decision':
      return 'decision';
    case 'state_change':
      return 'state';
    case 'data_change':
      return 'data';
    case 'ai_call':
      return 'ai';
  }
}
