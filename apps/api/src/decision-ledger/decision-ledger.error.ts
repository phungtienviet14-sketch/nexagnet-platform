/**
 * Loi cua so cai quyet dinh. Mang `reason` CO KIEU chu khong chi mot cau tieng Viet — de bai test
 * khang dinh dung duong tu choi nao da dong, thay vi chi biet "co nem".
 *
 * Cung khuon voi `SourceRegistryError`; hai tang nen tang nay co y doc len giong nhau.
 */
export class DecisionLedgerError extends Error {
  constructor(
    readonly reason: DecisionLedgerDeniedReason,
    message: string,
  ) {
    super(message);
    this.name = 'DecisionLedgerError';
  }
}

/**
 * MOI duong tu choi cua so cai, moi duong mot ma.
 *
 * Gop lai thanh mot `LEDGER_REJECTED` se buoc nguoi truc mo source doc lai muoi dieu kien roi
 * doan — trong luc ho dang phai tra loi "vi sao quyet dinh nay khong ghi duoc". Cung ly do da
 * tach `evaluateAutoConfirm()` ra khoi mot ham `boolean`.
 */
export const DECISION_LEDGER_DENIED_REASONS = [
  /** `decisionPoint` khong thuoc bo tu vung duoc truyen vao. Loi lap trinh, khong phai loi du lieu. */
  'LEDGER_POINT_NOT_IN_VOCABULARY',
  /** Ma ly do khong thuoc bo tu vung cua diem do. */
  'LEDGER_REASON_NOT_IN_VOCABULARY',
  /** `subjectType`/`subjectId` rong — mot quyet dinh khong gan vao ca nao thi khong tra loi duoc gi. */
  'LEDGER_SUBJECT_MISSING',
  /** `subjectId` khong dung khuon dinh danh noi bo (co the la SDT/email). Xem `decision-evidence.ts`. */
  'LEDGER_SUBJECT_NOT_AN_IDENTIFIER',
  /** Khoa chong trung rong. BAT BUOC — xem `decision-idempotency.ts`. */
  'LEDGER_IDEMPOTENCY_KEY_MISSING',
  /**
   * Cung khoa chong trung, KHAC noi dung quyet dinh.
   *
   * Day la loi cua BEN GOI, khong phai mot lan chay lai — va tra ve hang cu se lam ben goi tin
   * rang quyet dinh MOI cua no da duoc ghi. Duong dung la nem.
   */
  'LEDGER_IDEMPOTENCY_KEY_CONFLICT',
  /**
   * `LLM_RECOMMENDATION` o mot quyet dinh muc `FINANCIAL_OR_AUTHORIZATION`.
   *
   * Muc 6 hop dong: LLM duoc phan loai/trich xuat/de xuat/soan thao, va KHONG BAO GIO la tham
   * quyen ben vung cho tien/tham quyen/trang thai nghiep vu/chinh sach quan trong.
   */
  'LEDGER_LLM_NOT_AUTHORITATIVE',
  /** Su that duoc gan khong ton tai TRONG PHAM VI khach dang cam. */
  'LEDGER_FACT_NOT_IN_SCOPE',
  /** Quyet dinh bi sua khong ton tai trong pham vi khach dang cam. */
  'LEDGER_TARGET_NOT_IN_SCOPE',
  /** Quyet dinh bi sua da bi mot quyet dinh khac sua truoc do. Mot hang chi bi sua MOT lan. */
  'LEDGER_TARGET_ALREADY_CORRECTED',
  /** Mot quyet dinh khong tu sua chinh no. */
  'LEDGER_SELF_CORRECTION',
  /** Sua mot quyet dinh o cong KHAC hoac o ca KHAC — do la mot quyet dinh moi, khong phai mot ban sua. */
  'LEDGER_CORRECTION_LINEAGE_MISMATCH',
  /** `detail` mang khoa/gia tri bi hop dong rieng tu chan. Chi tiet o `DecisionEvidenceRejected`. */
  'LEDGER_EVIDENCE_REJECTED',
] as const;
export type DecisionLedgerDeniedReason = (typeof DECISION_LEDGER_DENIED_REASONS)[number];
