/**
 * VONG DOI CUA `TX-04` — ham THUAN, khong biet Nest, khong biet Prisma.
 *
 * Cung ly le voi `trip-lifecycle.ts` va `fund-period.ts`: neu repository tu gan trang thai thi may
 * trang thai chi con la mot loi khuyen trong tai lieu, va mot phieu nhay tu `DECLARED` thang sang
 * `SETTLED` se khong bi chan o dau — no chi lo ra khi ai do doi chieu bang ke voi so sach.
 *
 * ---------------------------------------------------------------------------
 * HAI TRUC DOC LAP (T1 §7.4, `DERIVED_DESIGN`) — day la quyet dinh mo hinh lon nhat cua T4.
 *
 * Nguon (VT-045) cho MOT truc ba gia tri: *Chua doi chieu / Da khop / Lech*. T1 tach lam hai vi
 * chung tra loi HAI CAU HOI, dong o HAI THOI DIEM:
 *
 *   · "Ke toan da tin so lieu tren phieu nay chua?"  -> tra loi NGAY khi anh ve (VT-042);
 *   · "Phieu nay co tren bang ke cay xang chua?"     -> chi tra loi duoc CUOI KY (VT-043).
 *
 * Gop chung buoc phai cho toi cuoi thang moi duyet duoc mot phieu — mat dung gia tri "doi chieu noi
 * bo theo thoi gian thuc" ma VT-042 doi. Truc ba gia tri cua nguon anh xa nguyen ven vao truc thu
 * hai; truc thu nhat la cai T1 them vao, va no duoc ghi ten la `DERIVED_DESIGN` chu khong gia vo
 * la loi khach.
 */

/* ------------------------------------------------------------------ *
 * TRUC 1 — ke toan da tin phieu nay chua
 * ------------------------------------------------------------------ */

export const FUEL_VERIFICATION_STATUSES = ['DECLARED', 'VERIFIED', 'REJECTED'] as const;
export type FuelVerificationStatus = (typeof FUEL_VERIFICATION_STATUSES)[number];

export const INITIAL_FUEL_VERIFICATION_STATUS: FuelVerificationStatus = 'DECLARED';

/**
 * `VERIFIED` KHONG co canh di ra, va do la `GD-10` duoc viet thanh kieu du lieu.
 *
 * "Truoc khi duoc tin thi sua la binh thuong; sau khi duoc tin thi sua la viet lai lich su." Mot
 * phieu da duyet da day chi phi vao gia thanh chuyen qua `TX-03`; doi so tren no se lam hai con so
 * o hai capability lech nhau ma khong co gi bao. Duong dung la DAO khoan chi roi ghi phieu moi.
 *
 * `REJECTED -> DECLARED` thi CO: mot phieu bi tra lai vi mo anh, lai xe chup lai roi nop lai — do
 * la duong chay thuong ngay, khong phai mot ngoai le. Va no chua tung day chi phi di dau ca.
 */
const VERIFICATION_EDGES: Readonly<
  Record<FuelVerificationStatus, readonly FuelVerificationStatus[]>
> = {
  DECLARED: ['VERIFIED', 'REJECTED'],
  VERIFIED: [],
  REJECTED: ['DECLARED'],
};

/* ------------------------------------------------------------------ *
 * TRUC 2 — phieu/dong bang ke da doi chieu duoc chua
 * ------------------------------------------------------------------ */

export const FUEL_RECONCILIATION_STATUSES = [
  'UNMATCHED',
  'MATCHED',
  'MISMATCHED',
  /** Da nam trong mot ky doi soat DA DONG. KHOA — `GD-11`. */
  'SETTLED',
  /** Co nguoi quyet bo qua, kem ly do. Khong bao gio la mac dinh. */
  'IGNORED',
] as const;
export type FuelReconciliationStatus = (typeof FUEL_RECONCILIATION_STATUSES)[number];

export const INITIAL_FUEL_RECONCILIATION_STATUS: FuelReconciliationStatus = 'UNMATCHED';

/**
 * Chay lai so khop duoc phep KEO MOT PHIEU VE `UNMATCHED`.
 *
 * Nghe nhu mot buoc lui, nhung no la dieu kien de so khop TAT DINH: neu mot cap da khop khong go ra
 * duoc, thi ket qua cua lan chay thu hai se phu thuoc vao lan chay thu nhat — tuc cung mot bang ke
 * va cung mot bo phieu se cho hai ket qua khac nhau tuy thu tu nguoi dung bam nut.
 *
 * `SETTLED` la ngoai le: no chi go ra bang duong MO LAI ky (quyen rieng + dau vet, `GD-11`).
 */
const RECONCILIATION_EDGES: Readonly<
  Record<FuelReconciliationStatus, readonly FuelReconciliationStatus[]>
> = {
  UNMATCHED: ['MATCHED', 'MISMATCHED', 'IGNORED'],
  MATCHED: ['UNMATCHED', 'MISMATCHED', 'SETTLED'],
  MISMATCHED: ['UNMATCHED', 'MATCHED', 'IGNORED', 'SETTLED'],
  IGNORED: ['UNMATCHED', 'SETTLED'],
  SETTLED: ['MATCHED', 'MISMATCHED', 'IGNORED'],
};

/**
 * Trang thai KHOA — phieu khong sua duoc, khong so khop lai duoc.
 *
 * `MATCHED` nam trong nhom nay chu khong chi `SETTLED`: `GD-10` khoa chung tu tu luc no duoc TIN,
 * va mot cap da khop la mot khang dinh rang phieu nay ung voi dung dong bang ke kia. Doi so tren
 * phieu sau do lam cap khop noi doi ma khong ai doc lai duoc.
 */
export const LOCKED_FUEL_RECONCILIATION_STATUSES: readonly FuelReconciliationStatus[] = [
  'MATCHED',
  'SETTLED',
];

export const isLockedFuelReconciliationStatus = (status: FuelReconciliationStatus): boolean =>
  LOCKED_FUEL_RECONCILIATION_STATUSES.includes(status);

/**
 * Trang thai DONG BANG BANG CHUNG cua mot phieu — hep hon nhom khoa o tren, va co chu dich.
 *
 * Mot phieu DA KHOP van nhan them duoc mot tam anh: `GD-10` khoa nhung CON SO, con mot tam anh
 * khong doi con so nao. Mot phieu da nam trong ky DA DONG thi khong — sau khi ky duoc bao cao ra
 * ngoai, bo chung tu cua no la mot su that da cong bo (`GD-11`).
 */
export const EVIDENCE_FROZEN_FUEL_RECONCILIATION_STATUSES: readonly FuelReconciliationStatus[] = [
  'SETTLED',
];

/* ------------------------------------------------------------------ *
 * VI SAO MOT PHIEU CAN NGUOI KIEM
 * ------------------------------------------------------------------ */

export const FUEL_REVIEW_REASONS = [
  /** `INV-06` — odo hien tai <= odo lan truoc. KHONG chia, khong bia ra mot con so. */
  'ODOMETER_NOT_ADVANCED',
  /** Xe chua co lan do dau nao truoc do — khong co mau so, khong phai mot loi. */
  'NO_PREVIOUS_ODOMETER',
  /** VT-046 — tieu hao vuot dinh muc hang xe cong dung sai cua goi khach. */
  'CONSUMPTION_ABOVE_NORM',
] as const;
export type FuelReviewReason = (typeof FUEL_REVIEW_REASONS)[number];

/* ------------------------------------------------------------------ *
 * MAY TRANG THAI CUA MOT KY DOI SOAT — T1 §7.5
 * ------------------------------------------------------------------ */

export const FUEL_RECONCILIATION_STATES = [
  'DRAFT',
  'MATCHING',
  'RESOLVED',
  'CLOSED',
  /** Da mo lai boi nguoi co quyen rieng. KHONG quay ve `DRAFT`: ky nay DA TUNG duoc bao cao. */
  'REOPENED',
] as const;
export type FuelReconciliationState = (typeof FUEL_RECONCILIATION_STATES)[number];

export const INITIAL_FUEL_RECONCILIATION_STATE: FuelReconciliationState = 'DRAFT';

/**
 * `RESOLVED -> MATCHING` va `REOPENED -> MATCHING` deu ton tai, va deu can thiet.
 *
 * Nguoi doi soat quyet xong mot chenh lech "phieu sai, sua roi chay lai"
 * (`ENTRY_CORRECTION_REQUIRED`) thi phai chay lai so khop tren du lieu moi. Neu khong co canh do,
 * cach duy nhat de chay lai la xoa ky roi nhap lai bang ke — tuc mat het cac quyet dinh da co
 * nguoi ky.
 */
const STATE_EDGES: Readonly<Record<FuelReconciliationState, readonly FuelReconciliationState[]>> = {
  DRAFT: ['MATCHING'],
  MATCHING: ['RESOLVED'],
  RESOLVED: ['MATCHING', 'CLOSED'],
  CLOSED: ['REOPENED'],
  REOPENED: ['MATCHING', 'RESOLVED'],
};

/** `CLOSED` DONG BANG ca ky: khong nhan so khop moi, khong nhan quyet dinh moi (`GD-11`). */
export const isFrozenFuelReconciliation = (state: FuelReconciliationState): boolean =>
  state === 'CLOSED';

/* ------------------------------------------------------------------ *
 * MOT KHUNG QUYET DINH DUNG CHUNG cho ca ba may trang thai
 * ------------------------------------------------------------------ */

export const FUEL_TRANSITION_DENIED_REASONS = [
  'ALREADY_IN_STATE',
  'TRANSITION_NOT_PERMITTED',
] as const;
export type FuelTransitionDeniedReason = (typeof FUEL_TRANSITION_DENIED_REASONS)[number];

export type FuelTransitionDecision =
  | { readonly allowed: true }
  | { readonly allowed: false; readonly reason: FuelTransitionDeniedReason };

/**
 * Mot ham dung chung thay vi ba ban sao.
 *
 * Ba may trang thai o tep nay co cung hinh dang (mot bang canh + hai ly do tu choi), nen ba ban sao
 * se troi khoi nhau ngay lan dau ai do sua mot cai. Bang canh thi VAN la ba bang rieng — do la noi
 * dung nghiep vu, khong phai co che.
 */
function evaluate<S extends string>(
  edges: Readonly<Record<S, readonly S[]>>,
  from: S,
  to: S,
): FuelTransitionDecision {
  if (from === to) return { allowed: false, reason: 'ALREADY_IN_STATE' };
  if (!edges[from].includes(to)) return { allowed: false, reason: 'TRANSITION_NOT_PERMITTED' };
  return { allowed: true };
}

export const evaluateFuelVerificationTransition = (
  from: FuelVerificationStatus,
  to: FuelVerificationStatus,
): FuelTransitionDecision => evaluate(VERIFICATION_EDGES, from, to);

export const evaluateFuelReconciliationStatusTransition = (
  from: FuelReconciliationStatus,
  to: FuelReconciliationStatus,
): FuelTransitionDecision => evaluate(RECONCILIATION_EDGES, from, to);

export const evaluateFuelReconciliationStateTransition = (
  from: FuelReconciliationState,
  to: FuelReconciliationState,
): FuelTransitionDecision => evaluate(STATE_EDGES, from, to);

/* ------------------------------------------------------------------ *
 * SUA MOT PHIEU — `GD-10` thanh mot cau tra loi CO MA
 * ------------------------------------------------------------------ */

export const FUEL_AMEND_DENIED_REASONS = [
  /** Da duyet — duong dung la dao phieu, khong phai sua so tren no. */
  'ENTRY_ALREADY_TRUSTED',
  /** Da khop hoac da nam trong ky doi soat DA DONG. */
  'ENTRY_RECONCILIATION_LOCKED',
] as const;
export type FuelAmendDeniedReason = (typeof FUEL_AMEND_DENIED_REASONS)[number];

export type FuelAmendDecision =
  { readonly allowed: true } | { readonly allowed: false; readonly reason: FuelAmendDeniedReason };

/**
 * `GD-10` — "chung tu sua duoc khi con `DECLARED`/`UNMATCHED`; sau `VERIFIED` hoac `MATCHED`: chi
 * reversal".
 *
 * HAI TRUC DEU PHAI MO. Kiem mot truc thoi la mot khe ho that: mot phieu con `DECLARED` nhung DA
 * duoc khop voi mot dong bang ke van sua duoc so tien — va cap khop do lap tuc noi doi, vi no da
 * duoc ghi voi mot chenh lech do tren con so cu.
 *
 * Hai ma tu choi rieng chu khong mot `false`: nguoi dung o hai tinh huong nay phai lam hai viec
 * KHAC NHAU (mot ben dao phieu, mot ben go cap khop / mo lai ky), va mot ma chung se buoc ho doan.
 */
export function evaluateFuelEntryAmendment(
  verification: FuelVerificationStatus,
  reconciliation: FuelReconciliationStatus,
): FuelAmendDecision {
  if (verification !== 'DECLARED') return { allowed: false, reason: 'ENTRY_ALREADY_TRUSTED' };
  if (isLockedFuelReconciliationStatus(reconciliation)) {
    return { allowed: false, reason: 'ENTRY_RECONCILIATION_LOCKED' };
  }
  return { allowed: true };
}

/* ------------------------------------------------------------------ *
 * DUONG DI TU DONG giua hai trang thai ky doi soat — T4R §1
 * ------------------------------------------------------------------ */

/**
 * Cac trang thai duoc phep NAM GIUA tren mot duong di tu dong.
 *
 * `CLOSED` va `REOPENED` CO Y khong nam o day. Dong mot ky la mot khang dinh ra ngoai (mot ban giao
 * cong no cho T5) va mo lai la mot thao tac co quyen rieng kem dau vet (`GD-11`) — ca hai deu phai
 * do NGUOI bam, khong bao gio duoc la mot buoc trung gian ma may di qua de toi mot dich khac.
 */
const AUTOMATIC_INTERMEDIATE_STATES: readonly FuelReconciliationState[] = ['MATCHING', 'RESOLVED'];

/**
 * CHUOI BUOC CHUYEN hop le tu `from` toi `to`, hoac `null` khi khong co duong nao.
 *
 * ---------------------------------------------------------------------------
 * VI SAO HAM NAY TON TAI (T4R §1).
 *
 * Truoc T4R, mot lan chay so khop ghi ket qua o MOT giao dich roi doi trang thai ky o mot giao dich
 * KHAC. Giua hai lan ghi do co mot khe: mot lenh dong ky chen vao giua se lam ky thanh `CLOSED`
 * trong khi cap khop cua no vua bi viet lai — tuc mot ban giao cong no da phat cho mot bo ket qua
 * khong con ton tai.
 *
 * Cach vay duy nhat la ghi CA HAI trong mot giao dich, va giao dich do chi biet trang thai THAT cua
 * hang sau khi da khoa no. Nhung tang kho KHONG duoc quyen tu nghi ra buoc chuyen — do la dieu khoi
 * chu thich dau tep nay cam. Nen tang mien tinh san duong di o day, va tang kho chi AP no.
 *
 * Toi da HAI BUOC, va buoc giua phai nam trong `AUTOMATIC_INTERMEDIATE_STATES`. Mot phep tim duong
 * tong quat se tim ra `RESOLVED -> CLOSED -> REOPENED` va lang le dong mot ky de di toi dich —
 * gioi han hai buoc cong danh sach trang thai trung gian la thu chan dieu do bang cau truc.
 *
 * `[]` (mang rong) nghia la DA O DICH: khong phai loi, khong phai mot buoc chuyen.
 */
export function planFuelReconciliationPath(
  from: FuelReconciliationState,
  to: FuelReconciliationState,
): readonly FuelReconciliationState[] | null {
  if (from === to) return [];
  if (STATE_EDGES[from].includes(to)) return [to];

  for (const middle of AUTOMATIC_INTERMEDIATE_STATES) {
    if (middle === from || middle === to) continue;
    if (STATE_EDGES[from].includes(middle) && STATE_EDGES[middle].includes(to)) {
      return [middle, to];
    }
  }
  return null;
}
