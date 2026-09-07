import type { GeofenceVerdict } from '../geo/geofence.js';
import type { ProofRiskCode, ProofRiskSeverity } from './tracking.types.js';

/**
 * CHUNG CU VAN HANH — bat dau va giao hang.
 *
 * `#232 D-08` cho ho so B: bat dau BAT BUOC co vi tri hien tai; giao hang BAT BUOC co vi tri hien
 * tai VA anh. Hai cau do duoc cuong che o `OperationalProofService`, khong phai o giao dien.
 */

export type OperationalProofKind = 'START' | 'DELIVERY';

/**
 * CACH mot tam anh duoc lay — mot loi khai cua ung dung, khong phai mot su that may chu kiem duoc.
 *
 * Doc cho dung gioi han cua no: mot ung dung bi sua hoan toan co the khai `LIVE_CAMERA` cho mot
 * tep lay tu thu vien, va khong co gi o phia may chu bat duoc dieu do. Nen cot nay KHONG phai mot
 * bien phap an ninh.
 *
 * Cai no LAM duoc, va la ly do no ton tai: no ngan he thong LANG LE cham cung mot muc tin cay cho
 * hai duong khac nhau. Mot ung dung trung thuc khai `GALLERY` se sinh mot co `PHOTO_FROM_GALLERY`,
 * va nguoi xem lai biet ma hoi. Khong co cot nay thi ca hai duong bien thanh mot, va cau "uu tien
 * anh chup tai cho" chi con la mot loi hua trong tai lieu.
 */
export type ProofPhotoCaptureMode = 'LIVE_CAMERA' | 'GALLERY' | 'UNKNOWN';

export interface ProofPhoto {
  readonly id: string;
  readonly proofId: string;
  readonly locator: string;
  readonly captureMode: ProofPhotoCaptureMode;
  readonly contentType: string | null;
  readonly byteSize: number | null;
  readonly capturedAt: Date | null;
  readonly uploadedBy: string;
  readonly withdrawnAt: Date | null;
  /** Di THEO CAP voi `withdrawnAt` — rang buoc `TransportProofPhoto_withdrawal_shape`. */
  readonly withdrawnBy: string | null;
}

export interface OperationalProof {
  readonly id: string;
  readonly kind: OperationalProofKind;
  readonly tripId: string;
  readonly driverId: string;
  readonly observationId: string;
  readonly sessionId: string | null;
  readonly clientEventId: string;
  readonly capturedAt: Date;
  readonly receivedAt: Date;
  readonly businessDate: string;
  readonly note: string | null;
  readonly recordedBy: string;
  readonly withdrawnAt: Date | null;
  /** Di THEO CAP voi `withdrawnAt` — rang buoc `TransportOperationalProof_withdrawal_shape`. */
  readonly withdrawnBy: string | null;
  readonly photos: readonly ProofPhoto[];
}

/**
 * BIA MO mot chung cu — mot viec cua NGUOI DUYET, khong phai cua lai xe.
 *
 * `reason` la bat buoc va khong duoc de trong: mot lan rut khong ly do se buoc nguoi doc ho so sau
 * nay phai doan, va thu ho doan ra thuong nang hon su that.
 */
export interface WithdrawProofCommand {
  readonly proofId: string;
  readonly actorId: string;
  readonly reason: string;
}

export interface RecordProofCommand {
  readonly authUserId: string;
  readonly kind: OperationalProofKind;
  readonly tripId: string;
  /** Ban dinh vi DA GHI qua duong ingest. Khong nhan toa do tho o day — xem chu thich dich vu. */
  readonly observationId: string;
  readonly clientEventId: string;
  readonly note: string | null;
  readonly photos: readonly {
    readonly locator: string;
    readonly captureMode: ProofPhotoCaptureMode;
    readonly contentType: string | null;
    readonly byteSize: number | null;
  }[];
}

/**
 * KHUNG NHIN CHUNG CU cho van hanh — cung nguyen tac voi `TrackingSummaryView`: **khong co mot
 * truong nao co the chua mot toa do**.
 *
 * Nguoi duyet can biet "co chung cu khong", "trong hay ngoai hang rao", "anh chup tai cho hay lay
 * tu thu vien", "co co rui ro nao". Ho khong can toa do de tra loi bon cau do — va duong doc toa
 * do tho da co quyen rieng (`transport.location.history.read`).
 */
export interface OperationalProofView {
  readonly id: string;
  readonly kind: OperationalProofKind;
  readonly tripId: string;
  readonly driverId: string;
  readonly businessDate: string;
  readonly capturedAt: Date;
  readonly receivedAt: Date;
  readonly withdrawn: boolean;
  readonly photoCount: number;
  /** Dem theo tung cach lay — mot chung cu co ca hai loai van noi ra duoc dieu do. */
  readonly photosByCaptureMode: Readonly<Partial<Record<ProofPhotoCaptureMode, number>>>;
  readonly geofenceVerdict: GeofenceVerdict | 'NO_FENCE';
  readonly nearestGeofenceId: string | null;
  readonly nearestGeofenceDistanceMetres: number | null;
  readonly riskCodes: readonly ProofRiskCode[];
  readonly highestSeverity: ProofRiskSeverity | null;
}
