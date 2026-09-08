import type { BusinessDate } from '../business-date.js';
import type { VehicleRunStatus } from '../movement/movement.types.js';
import type { LocationUnusableReason, SiteCandidateConfidence } from './site-candidate.js';

/**
 * MUC DO TIN cua vi tri da de nghi ra mot lan nhan viec — `#267` H2/H7.
 *
 * `SERVER_BOUND` la ban dinh vi cua Lane B: da qua mot phien co chu, qua kiem bien, qua tang cham
 * rui ro, va no khong sua duoc. `DRIVER_REPORTED` la cap so ma dien thoai vua doc len, hoac khong
 * co gi ca — lai xe tu noi minh dang o dau.
 *
 * CA HAI deu tao duoc mot lan nhan viec, va do khong phai mot lo hong: thu cho phep tao la CHAM
 * CUA CON NGUOI, khong phai toa do. Cai nhan nay ton tai de nguoi doi soat sau nay doc duoc rang
 * lan do co hay khong co mot ban dinh vi lam chung.
 */
export const SITE_INTAKE_LOCATION_TRUSTS = ['SERVER_BOUND', 'DRIVER_REPORTED'] as const;
export type SiteIntakeLocationTrust = (typeof SITE_INTAKE_LOCATION_TRUSTS)[number];

/**
 * NHAN "CHUA XAC DINH" cua diem den, va tai sao no ton tai.
 *
 * `TransportRunLeg.destinationLabel` la `NOT NULL` — mot quyet dinh cua Lane A ma `#267` khong cho
 * phep dao nguoc: `destinationLabel` xuat hien o 55 tep, gom ca bao cao quyet toan va bang dieu
 * hanh cua lane khac. Noi long no thanh `NULL` la mot lan sua tren mo hinh cua lane khac, dung
 * dieu ma `#267` §Ownership cam.
 *
 * Con luc lai xe dung o cong nha may thi diem den THUC SU chua biet. Nen o day khong noi doi theo
 * ca hai chieu: cot mang mot chuoi noi ro la chua biet, VA khung nhin doc phoi ra
 * `destinationPending` de khong tang nao phai so chuoi.
 *
 * Lai xe biet diem den thi go vao — `confirm` nhan `destinationLabel` tuy chon, va luc do khong co
 * nhan nao ca.
 */
export const PENDING_DESTINATION_LABEL = 'Chưa xác định';

export interface SiteCandidateView {
  readonly siteId: string;
  readonly siteName: string;
  readonly address: string | null;
  readonly counterpartyId: string;
  readonly counterpartyName: string;
  /** Khoang cach toi tam hang rao gan nhat cua chinh dia diem do, met, lam tron. */
  readonly distanceMetres: number;
  readonly confidence: SiteCandidateConfidence;
}

/** Mot vong chay chua ket thuc ma lai xe DANG cam. */
export interface OpenRunView {
  readonly runId: string;
  readonly code: string;
  readonly status: VehicleRunStatus;
}

/**
 * DE NGHI, khong phai quyet dinh — `#267` H2.
 *
 * `canCreate` la truong ma man hinh doc de biet hien `Tao chuyen` hay `Ghi nhan da den`. No la
 * `false` khi lai xe dang cam mot vong chay chua ket thuc (`#267` H3), va khi khong co ung vien
 * nao de xac nhan.
 */
export interface SiteIntakeProposal {
  readonly outcome: 'UNIQUE' | 'AMBIGUOUS' | 'NO_MATCH' | 'LOCATION_UNUSABLE';
  /** Chi khac `null` khi `outcome === 'LOCATION_UNUSABLE'`. */
  readonly locationUnusable: LocationUnusableReason | null;
  readonly candidates: readonly SiteCandidateView[];
  /** `true` khi con ung vien hop le bi cat khoi danh sach vi cham tran chinh sach. */
  readonly truncated: boolean;
  readonly locationTrust: SiteIntakeLocationTrust;
  readonly openRuns: readonly OpenRunView[];
  readonly canCreate: boolean;
}

/** KET QUA cua mot lan xac nhan. */
export interface SiteIntakeResult {
  readonly intakeId: string;
  readonly runId: string;
  readonly runCode: string;
  readonly legId: string;
  readonly siteId: string;
  readonly siteName: string;
  readonly counterpartyName: string;
  readonly locationTrust: SiteIntakeLocationTrust;
  readonly distanceMetres: number | null;
  /** `true` khi chang vua tao con mang nhan `PENDING_DESTINATION_LABEL`. */
  readonly destinationPending: boolean;
  readonly businessDate: BusinessDate;
  /** `true` khi day la mot lan GUI LAI — khong vong chay nao duoc tao them. */
  readonly replayed: boolean;
}

/** HANG da ghi cua mot lan xac nhan. Ghi them, khong ghi de. */
export interface RunSiteIntake {
  readonly id: string;
  readonly runId: string;
  readonly legId: string;
  readonly siteId: string;
  readonly driverId: string;
  readonly confirmedBy: string;
  readonly locationTrust: SiteIntakeLocationTrust;
  readonly observationId: string | null;
  readonly distanceMetres: number | null;
  readonly clientEventId: string;
  readonly confirmedAt: Date;
  readonly businessDate: BusinessDate;
}

/** LENH doc de nghi. Danh tinh den tu PHIEN, khong tu than yeu cau. */
export interface ProposeSiteIntakeCommand {
  readonly authUserId: string;
  readonly latitude?: number;
  readonly longitude?: number;
  readonly accuracyMetres?: number | null;
  readonly observationId?: string;
}

/** LENH xac nhan. `siteId` la thu DUY NHAT lai xe chon, va no phai la mot dia diem CO THAT. */
export interface ConfirmSiteIntakeCommand extends ProposeSiteIntakeCommand {
  readonly siteId: string;
  readonly clientEventId: string;
  readonly destinationLabel?: string;
}
