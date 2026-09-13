import type { RunCheckpointType } from '../checkpoint/checkpoint.types.js';
import type { RunLegPhase } from '../checkpoint/run-timeline.js';
import type { OperationalDocumentType } from '../document/document.types.js';
import type { ReceiptHandoverState } from '../document/handover.types.js';
import type { RunLegKind } from '../movement/movement.types.js';

/**
 * VIEC HIEN TRUONG cua mot lai xe — `#279` O9.
 *
 * ============================================================================================
 * MOT MAN HINH PHAI NOI "VIEC KE TIEP", KHONG PHAI "TRANG THAI NOI BO"
 * ============================================================================================
 *
 * `#279` O9 viet ro: *"Driver Home/Trip should present the next useful action, not internal
 * state-machine jargon."*
 *
 * Nen kieu quan trong nhat cua tep nay khong phai `DriverFieldLeg` ma la `DriverFieldAction`: mot
 * cai nut, mot cau tieng Viet, va du du lieu de bam duoc no. Man hinh KHONG phai suy ra tu mot
 * enum trang thai — no ve ra danh sach nut ma may chu da tinh.
 *
 * Dat phep suy do o MAY CHU chu khong o may khach la mot lua chon co y: quy tac thu tu moc
 * (`checkpoint-lifecycle.ts`), chinh sach chung cu vi tri, va chinh sach chung tu deu song o may
 * chu. Lam lai chung o may khach se cho ra HAI ban luat, va ban tren dien thoai se cu roi lai sau
 * moi lan luat doi.
 *
 * ============================================================================================
 * KHONG MOT TRUONG TIEN NAO
 * ============================================================================================
 *
 * `#279` O9: *"driver payload still excludes freight/revenue"*, va `INV-09` da dat quy tac do tu
 * truoc. Khong mot kieu nao trong tep nay co truong tien — `driver-field-payload.spec.ts` quet
 * chinh payload that de chung minh dieu do, thay vi chi tin vao kieu.
 */

/** MOT VIEC LAI XE BAM DUOC NGAY BAY GIO. */
export const DRIVER_FIELD_ACTION_KINDS = [
  /** Ghi mot moc van hanh. */
  'CHECKPOINT',
  /** Mo mot phien cho nguoi nhan. */
  'WAITING_START',
  /** Chup/ghi mot chung tu. */
  'DOCUMENT',
  /** Ghi rang to bien nhan giay dang trong tay minh. */
  'RECEIPT_HANDOVER',
] as const;
export type DriverFieldActionKind = (typeof DRIVER_FIELD_ACTION_KINDS)[number];

/**
 * MOT NUT tren man hinh lai xe.
 *
 * `label` la tieng Viet co dau, va do la ngoai le duy nhat cua quy uoc khong-dau trong mien nay:
 * chuoi nay di THANG len man hinh cua mot con nguoi. Moi ma khac (`checkpointType`,
 * `documentType`) van la ma de may loc.
 *
 * `required` phan biet viec BAT BUOC theo chinh sach voi viec lam-neu-can. `#279` O3 cam ep moi
 * loai chung tu cho moi khach, nen phan lon nut chung tu la `required: false` — chung hien de lai
 * xe bam khi co giay, khong de chan ho lai khi khong co.
 */
export interface DriverFieldAction {
  readonly kind: DriverFieldActionKind;
  readonly label: string;
  readonly checkpointType?: RunCheckpointType;
  readonly documentType?: OperationalDocumentType;
  /** Bam nut nay can mot ban dinh vi hop le. */
  readonly requiresLocation: boolean;
  readonly required: boolean;
}

/** CHUNG TU da ghi tren mot chang — du de man hinh danh dau da chup gi, KHONG hon. */
export interface DriverFieldDocument {
  readonly id: string;
  readonly type: OperationalDocumentType;
  readonly basis: 'DIGITAL_FILE' | 'EXTERNAL_PHYSICAL';
  readonly status: 'ACTIVE' | 'WITHDRAWN';
  readonly receivedAt: string;
}

/** PHIEN CHO dang mo tren mot chang — thoi luong da tinh o MAY CHU. */
export interface DriverFieldWaiting {
  readonly sessionId: string;
  readonly reason: string;
  readonly startedAt: string;
  readonly elapsedSeconds: number;
}

export interface DriverFieldLeg {
  readonly legId: string;
  readonly sequence: number;
  readonly kind: RunLegKind;
  readonly originLabel: string;
  readonly destinationLabel: string;
  /** Ma don doc duoc. `null` o chang RONG — mot chang rong khong mang don. */
  readonly orderCode: string | null;
  readonly orderId: string | null;
  readonly phase: RunLegPhase;
  readonly recordedTypes: readonly RunCheckpointType[];
  /** Moc `DELIVERY_ARRIVAL` da ghi — NEO ma nut `Bat dau cho` can. */
  readonly arrivalCheckpointId: string | null;
  readonly waiting: DriverFieldWaiting | null;
  readonly documents: readonly DriverFieldDocument[];
  /** Loai chung tu BAT BUOC theo chinh sach ma chang nay con thieu. CANH BAO, khong chan gi. */
  readonly missingDocumentTypes: readonly OperationalDocumentType[];
  readonly receiptHandover: ReceiptHandoverState | null;
  readonly nextActions: readonly DriverFieldAction[];
}

export interface DriverFieldRun {
  readonly runId: string;
  readonly runCode: string;
  readonly legs: readonly DriverFieldLeg[];
}

/**
 * TOAN BO viec hien truong cua mot lai xe.
 *
 * `serverNow` di kem de man hinh dem tiep giay ma khong doc dong ho cua chinh no — cung ly le voi
 * `WaitingSessionView.serverNow`.
 */
export interface DriverFieldWork {
  readonly serverNow: string;
  readonly runs: readonly DriverFieldRun[];
}
