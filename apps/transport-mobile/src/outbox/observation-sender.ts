import type { OutboxItem, SendOutcome } from '@netviet/driver-outbox';
import { ApiError } from '../api/errors';
import type { HttpClient } from '../api/http';
import type { DeviceBinding, FrozenFix } from './field-actions';
import { outcomeOf } from './field-actions';

/**
 * GUI BAN DINH VI NEN THEO LO — mot lo cho moi vong chay, toi da 200 (tran cua may chu).
 *
 * Hop dong may chu (do tren ma, `tracking.service.ts`): lo duoc ghi TUNG PHAN TU, khong giao dich.
 * Phan tu hong dau tien (vd `COORDINATE_REJECTED`) lam ca yeu cau tra loi, du cac phan tu truoc no
 * DA duoc ghi — va may chu chi tra MOT loi, khong noi phan tu nao. Nen khi lo bi tu choi vi mot ly
 * do nghiep vu, ta gui lai TUNG PHAN TU mot: phan tu da ghi tra ban cu (idempotent theo
 * `clientEventId`), phan tu hong lo ra dung ten, va phan con lai khong bi chon cung no.
 *
 * `SESSION_SUBJECT_ENDED` / `RUN_NOT_ACTIVE`: vong chay da ket thuc — cac diem con xep hang KHONG
 * BAO GIO duoc nhan nua. Chan chung (co ly do ro), khong thu lai vo han.
 */
export interface ObservationPayload {
  readonly runId: string;
  readonly fix: FrozenFix;
}

const SUBJECT_ENDED = new Set([
  'SESSION_SUBJECT_ENDED',
  'RUN_NOT_ACTIVE',
  'RUN_NOT_FOUND',
  'DRIVER_NOT_ASSIGNED_TO_RUN',
]);

function bodyOf(item: OutboxItem): Record<string, unknown> {
  const { fix } = item.payload as unknown as ObservationPayload;
  return {
    clientEventId: item.clientEventId,
    latitude: fix.latitude,
    longitude: fix.longitude,
    accuracyMetres: fix.accuracyMetres,
    ...(fix.speedMetresPerSecond !== null
      ? { speedMetresPerSecond: fix.speedMetresPerSecond }
      : {}),
    ...(fix.bearingDegrees !== null ? { bearingDegrees: fix.bearingDegrees } : {}),
    source: fix.source,
    capturedAt: fix.capturedAt,
    mockLocationReported: fix.mockLocationReported,
  };
}

async function openSession(
  http: HttpClient,
  runId: string,
  device: DeviceBinding | null,
): Promise<string> {
  const session = await http.post<{ id: string }>('/transport/me/tracking/sessions', {
    runId,
    ...(device ? { device } : {}),
  });
  return session.id;
}

async function sendGroup(
  http: HttpClient,
  sessionId: string,
  items: readonly OutboxItem[],
): Promise<SendOutcome[]> {
  const path = `/transport/me/tracking/sessions/${encodeURIComponent(sessionId)}/observations`;
  try {
    await http.post(path, { observations: items.map(bodyOf) });
    return items.map(() => ({ kind: 'ACCEPTED' }));
  } catch (error) {
    const outcome = outcomeOf(error);
    if (outcome.kind === 'RETRY' || items.length === 1) return items.map(() => outcome);
    if (error instanceof ApiError && error.reason && SUBJECT_ENDED.has(error.reason)) {
      return items.map(() => outcome);
    }
    // Co mot phan tu hong: tach tung cai de khong chon ca lo theo no.
    const outcomes: SendOutcome[] = [];
    for (const item of items) outcomes.push(...(await sendGroup(http, sessionId, [item])));
    return outcomes;
  }
}

export async function sendObservationBatch(
  items: readonly OutboxItem[],
  http: HttpClient,
  device: DeviceBinding | null,
): Promise<readonly SendOutcome[]> {
  const byRun = new Map<string, number[]>();
  items.forEach((item, index) => {
    const runId = (item.payload as unknown as ObservationPayload).runId;
    byRun.set(runId, [...(byRun.get(runId) ?? []), index]);
  });
  const outcomes: SendOutcome[] = items.map(() => ({ kind: 'RETRY', reason: 'NOT_ATTEMPTED' }));
  for (const [runId, indexes] of byRun) {
    const group = indexes.map((index) => items[index]!);
    let groupOutcomes: SendOutcome[];
    try {
      const sessionId = await openSession(http, runId, device);
      groupOutcomes = await sendGroup(http, sessionId, group);
    } catch (error) {
      const outcome = outcomeOf(error);
      groupOutcomes = group.map(() => outcome);
    }
    indexes.forEach((index, position) => {
      outcomes[index] = groupOutcomes[position]!;
    });
  }
  return outcomes;
}
