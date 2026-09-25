import type { OutboxAttachment, OutboxItem, SendOutcome } from '@netviet/driver-outbox';
import { ApiError } from '../api/errors';
import type { HttpClient } from '../api/http';

/**
 * VIEC HIEN TRUONG XEP HANG — moi viec la MOT CHUOI buoc, moi buoc idempotent PHIA MAY CHU.
 *
 * ============================================================================================
 * VI SAO THU LAI CA CHUOI LA AN TOAN (do tren ma, #394 map:driver-api)
 * ============================================================================================
 *
 *   mo phien bam vi tri   cung chu the (runId) -> tra phien dang mo, khong tao phien moi
 *   gui ban dinh vi       (sessionId, clientEventId) UNIQUE; cung noi dung -> tra ban cu
 *   ghi moc               (runId, type, clientEventId) UNIQUE; kiem lap TRUOC moi kiem khac
 *   ghi chung tu          (runId, type, clientEventId) UNIQUE
 *   bat dau cho           (legId, startClientEventId) UNIQUE
 *   giao bien nhan        (orderId, clientEventId) UNIQUE
 *   phieu dau             correlationKey UNIQUE; lap lai phai CUNG danh tinh (ke ca businessDate)
 *
 * HAI CHO KHONG idempotent, va cach ung dung tu bao ve:
 *   · `POST /files` — moi lan tai la mot tep moi. Luu `fileId` ngay khi co, lan sau bo qua buoc
 *     tai. Mat phan hoi giua chung thi thua MOT tep mo coi phia may chu; khong co ban ghi nghiep vu
 *     nao bi nhan doi vi chung tu mang `clientEventId`.
 *   · anh phieu dau (`.../evidence/upload`) — gan THANG vao phieu, khong khoa. Truoc lan tai dau
 *     luu `evidenceCount` hien tai; neu lan truoc khong ro ket cuc thi DOC LAI phieu: so anh da tang
 *     -> coi nhu da gan, khong tai lai.
 *
 * Moi phu thuoc nen tang (doc tep vao FormData, sinh ma) di vao qua tham so — module nay test
 * tren Node.
 */

export type ReceiptSource = 'DEVICE_GNSS' | 'DEVICE_FUSED' | 'DEVICE_NETWORK';

export interface FrozenFix {
  readonly latitude: number;
  readonly longitude: number;
  readonly accuracyMetres: number | null;
  readonly speedMetresPerSecond: number | null;
  readonly bearingDegrees: number | null;
  readonly source: ReceiptSource;
  /** Dong ho may LUC LAY vi tri — dong bang, gui lai y het. */
  readonly capturedAt: string;
  /** Android `mocked`; iOS khong co khai niem nay -> null (khac false). */
  readonly mockLocationReported: boolean | null;
}

export interface CheckpointAction {
  readonly type: 'CHECKPOINT';
  readonly label: string;
  readonly runId: string;
  readonly legId: string | null;
  readonly checkpointType: string;
  readonly note: string | null;
  /** Co khi moc can bang chung vi tri. `observationClientEventId` sinh MOT lan cung luc bam. */
  readonly location: { readonly fix: FrozenFix; readonly observationClientEventId: string } | null;
}

export interface WaitingStartAction {
  readonly type: 'WAITING_START';
  readonly label: string;
  readonly runId: string;
  readonly legId: string;
  readonly arrivalCheckpointId: string;
  readonly reason: string;
  readonly note: string | null;
}

export interface DocumentAction {
  readonly type: 'DOCUMENT';
  readonly label: string;
  readonly runId: string;
  readonly legId: string | null;
  readonly checkpointId: string | null;
  readonly documentType: string;
  readonly documentLabel: string | null;
  readonly captureMode: 'LIVE_CAMERA' | 'GALLERY' | 'UNKNOWN';
}

export interface ReceiptHandoverAction {
  readonly type: 'RECEIPT_HANDOVER';
  readonly label: string;
  readonly orderId: string;
  readonly legId: string | null;
  readonly externalNote: string | null;
}

export interface FuelSlipAction {
  readonly type: 'FUEL_SLIP';
  readonly label: string;
  /** Than `POST /transport/me/fuel/slips` DA DONG BANG (co `correlationKey` + `businessDate`). */
  readonly body: Readonly<Record<string, unknown>>;
}

export type FieldAction =
  CheckpointAction | WaitingStartAction | DocumentAction | ReceiptHandoverAction | FuelSlipAction;

export interface ProgressStore {
  readProgress(itemId: string, step: string): Promise<string | null>;
  writeProgress(itemId: string, step: string, value: string): Promise<void>;
}

export interface DeviceBinding {
  readonly installationId: string;
  readonly platform: 'ANDROID' | 'IOS' | 'WEB';
  readonly appVersion: string;
}

export interface FieldActionDeps {
  readonly http: HttpClient;
  readonly progress: ProgressStore;
  readonly device: DeviceBinding | null;
  /**
   * Dung FormData co tep — tren may la `{ uri, name, type }` cua React Native (dong bo); tren PWA
   * doc byte tu IndexedDB (bat dong bo).
   */
  readonly formWithFile: (
    attachment: OutboxAttachment,
    fields: Readonly<Record<string, string>>,
  ) => FormData | Promise<FormData>;
}

/** Cac `reason` nghia la "viec nay DA co tren he thong" — hien nhe nhang, khong nhu mot loi. */
export const ALREADY_DONE_REASONS = new Set([
  'CHECKPOINT_ALREADY_RECORDED',
  'WAITING_ALREADY_OPEN',
  'WAITING_DELIVERY_ALREADY_ACCEPTED',
]);

/** Phan hoi 401 phai DUNG ca hang doi (xem outbox-runner) — ma nay la tin hieu do. */
export const PAUSE_UNAUTHENTICATED = 'UNAUTHENTICATED';

/**
 * 403 `PASSWORD_CHANGE_REQUIRED` (#395): tai khoan do Giam doc tao/dat lai phai doi mat khau truoc;
 * moi route khac tra 403 voi ma nay. Do KHONG phai phan quyet ve viec da bam — mot moc bi "tu choi"
 * vi ly do nay se nam BLOCKED oan. Hang doi TAM DUNG nhu 401 va chay lai khi phien dung duoc.
 */
export const PAUSE_PASSWORD_CHANGE = 'PASSWORD_CHANGE_REQUIRED';

/** Ly do lam DUNG ca hang doi (khong goi may chu them cho toi khi phien dung duoc). */
export function isPauseReason(reason: string | undefined): boolean {
  return reason === PAUSE_UNAUTHENTICATED || reason === PAUSE_PASSWORD_CHANGE;
}

export function outcomeOf(error: unknown): SendOutcome {
  if (!(error instanceof ApiError)) {
    return { kind: 'RETRY', reason: error instanceof Error ? error.message : 'NETWORK_ERROR' };
  }
  if (error.kind === 'UNAUTHENTICATED') return { kind: 'RETRY', reason: PAUSE_UNAUTHENTICATED };
  if (error.reason === PAUSE_PASSWORD_CHANGE)
    return { kind: 'RETRY', reason: PAUSE_PASSWORD_CHANGE };
  if (error.isRetryable) return { kind: 'RETRY', reason: error.message };
  // Tep chua qua buoc quet -> chua dung duoc, KHONG phai bi tu choi.
  if (error.reason === 'DOCUMENT_FILE_NOT_ACTIVE') return { kind: 'RETRY', reason: error.message };
  return { kind: 'REJECTED', reason: error.reason ?? error.message };
}

export function parseAction(item: OutboxItem): FieldAction {
  const action = item.payload as unknown as FieldAction;
  if (!action || typeof action !== 'object' || typeof action.type !== 'string') {
    throw new ApiError('DOMAIN', 'Việc trong hàng đợi hỏng dạng', null, 'OUTBOX_PAYLOAD_INVALID');
  }
  return action;
}

async function openTrackingSession(deps: FieldActionDeps, runId: string): Promise<string> {
  const body = { runId, ...(deps.device ? { device: deps.device } : {}) };
  try {
    const session = await deps.http.post<{ id: string }>('/transport/me/tracking/sessions', body);
    return session.id;
  } catch (error) {
    // Moi lai xe chi mot phien DANG MO. Phien cua viec khac con treo (web khong bao gio dong
    // phien) thi dong no — nguoi o hien truong chi o MOT noi — roi mo lai dung MOT lan.
    if (!(error instanceof ApiError) || error.reason !== 'DRIVER_HAS_ANOTHER_OPEN_SESSION')
      throw error;
    const sessions = await deps.http.get<
      Array<{ sessionId: string; status: string; runId: string | null; tripId: string | null }>
    >('/transport/me/tracking/sessions');
    for (const other of sessions) {
      if (other.status === 'ACTIVE' && other.runId !== runId) {
        await deps.http.post(
          `/transport/me/tracking/sessions/${encodeURIComponent(other.sessionId)}/close`,
          {
            reason: 'DRIVER_SWITCHED_RUN',
          },
        );
      }
    }
    const session = await deps.http.post<{ id: string }>('/transport/me/tracking/sessions', body);
    return session.id;
  }
}

async function ensureObservation(
  deps: FieldActionDeps,
  item: OutboxItem,
  runId: string,
  location: NonNullable<CheckpointAction['location']>,
): Promise<string> {
  const saved = await deps.progress.readProgress(item.id, 'observationId');
  if (saved) return saved;
  const sessionId = await openTrackingSession(deps, runId);
  const { fix } = location;
  const accepted = await deps.http.post<Array<{ id: string }>>(
    `/transport/me/tracking/sessions/${encodeURIComponent(sessionId)}/observations`,
    {
      observations: [
        {
          clientEventId: location.observationClientEventId,
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
        },
      ],
    },
  );
  const observationId = accepted[0]?.id;
  if (!observationId) {
    throw new ApiError(
      'SERVER',
      'Hệ thống không trả về bản định vị vừa gửi — chưa ghi được mốc.',
      null,
    );
  }
  await deps.progress.writeProgress(item.id, 'observationId', observationId);
  return observationId;
}

async function sendCheckpoint(deps: FieldActionDeps, item: OutboxItem, action: CheckpointAction) {
  const observationId = action.location
    ? await ensureObservation(deps, item, action.runId, action.location)
    : undefined;
  await deps.http.post('/transport/me/checkpoints', {
    type: action.checkpointType,
    runId: action.runId,
    ...(action.legId ? { legId: action.legId } : {}),
    ...(observationId ? { observationId } : {}),
    clientEventId: item.clientEventId,
    ...(action.note ? { note: action.note } : {}),
  });
}

async function sendDocument(deps: FieldActionDeps, item: OutboxItem, action: DocumentAction) {
  let fileId = await deps.progress.readProgress(item.id, 'fileId');
  if (!fileId) {
    const attachment = item.attachments[0];
    if (!attachment)
      throw new ApiError('DOMAIN', 'Chứng từ không kèm tệp', null, 'OUTBOX_ATTACHMENT_MISSING');
    const uploaded = await deps.http.upload<{ id: string }>(
      '/files',
      await deps.formWithFile(attachment, { purpose: 'OPERATIONAL_DOCUMENT' }),
    );
    fileId = uploaded.id;
    await deps.progress.writeProgress(item.id, 'fileId', fileId);
  }
  await deps.http.post('/transport/me/documents', {
    type: action.documentType,
    runId: action.runId,
    ...(action.legId ? { legId: action.legId } : {}),
    ...(action.checkpointId ? { checkpointId: action.checkpointId } : {}),
    basis: 'DIGITAL_FILE',
    fileId,
    captureMode: action.captureMode,
    ...(action.documentLabel ? { label: action.documentLabel } : {}),
    clientEventId: item.clientEventId,
  });
}

interface SlipView {
  readonly id: string;
  readonly evidenceCount: number;
}

async function sendFuelSlip(deps: FieldActionDeps, item: OutboxItem, action: FuelSlipAction) {
  let slipId = await deps.progress.readProgress(item.id, 'slipId');
  let evidenceCount: number | null = null;
  if (!slipId) {
    const slip = await deps.http.post<SlipView>('/transport/me/fuel/slips', action.body);
    slipId = slip.id;
    evidenceCount = slip.evidenceCount;
    await deps.progress.writeProgress(item.id, 'slipId', slipId);
  }
  const attachment = item.attachments[0];
  if (!attachment || (await deps.progress.readProgress(item.id, 'evidenceDone'))) return;

  const path = `/transport/me/fuel/slips/${encodeURIComponent(slipId)}`;
  const baselineRaw = await deps.progress.readProgress(item.id, 'evidenceBaseline');
  if (baselineRaw !== null) {
    // Lan tai truoc KHONG RO ket cuc. Doc lai phieu: anh da tang thi da gan roi — khong tai lai.
    const current = await deps.http.get<SlipView>(path);
    if (current.evidenceCount > Number(baselineRaw)) {
      await deps.progress.writeProgress(item.id, 'evidenceDone', '1');
      return;
    }
  } else {
    const baseline = evidenceCount ?? (await deps.http.get<SlipView>(path)).evidenceCount;
    await deps.progress.writeProgress(item.id, 'evidenceBaseline', String(baseline));
  }
  await deps.http.upload(`${path}/evidence/upload`, await deps.formWithFile(attachment, {}));
  await deps.progress.writeProgress(item.id, 'evidenceDone', '1');
}

export async function executeFieldAction(
  item: OutboxItem,
  deps: FieldActionDeps,
): Promise<SendOutcome> {
  try {
    const action = parseAction(item);
    switch (action.type) {
      case 'CHECKPOINT':
        await sendCheckpoint(deps, item, action);
        break;
      case 'WAITING_START':
        await deps.http.post('/transport/me/waiting-sessions', {
          runId: action.runId,
          legId: action.legId,
          arrivalCheckpointId: action.arrivalCheckpointId,
          reason: action.reason,
          clientEventId: item.clientEventId,
          ...(action.note ? { note: action.note } : {}),
        });
        break;
      case 'DOCUMENT':
        await sendDocument(deps, item, action);
        break;
      case 'RECEIPT_HANDOVER':
        await deps.http.post('/transport/me/receipt-handovers', {
          orderId: action.orderId,
          ...(action.legId ? { legId: action.legId } : {}),
          ...(action.externalNote ? { externalNote: action.externalNote } : {}),
          clientEventId: item.clientEventId,
        });
        break;
      case 'FUEL_SLIP':
        await sendFuelSlip(deps, item, action);
        break;
      default: {
        const unknown: never = action;
        throw new ApiError(
          'DOMAIN',
          `Loại việc không hỗ trợ: ${String(unknown)}`,
          null,
          'OUTBOX_TYPE_UNKNOWN',
        );
      }
    }
    return { kind: 'ACCEPTED' };
  } catch (error) {
    return outcomeOf(error);
  }
}
