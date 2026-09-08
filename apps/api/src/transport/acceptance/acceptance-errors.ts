/**
 * MA TU CHOI DAU VAO cua nghiem thu chung tu.
 *
 * Tach khoi `acceptance-decisions.ts` theo dung quy uoc da chay cua `claims/claim-errors.ts`: tep
 * kia tra loi "he thong QUYET DINH gi va vi sao" (cai nguoi doc trace can), tep nay tra loi "nguoi
 * goi da gui cai gi sai" (cai nguoi dung API can). Tron lai thi bang loc trace se day nhung dong
 * "thieu truong ghi chu" — khong phai quyet dinh nghiep vu nao ca.
 */
export const TRANSPORT_COMMERCIAL_ACCEPTANCE_ERROR_REASONS = [
  /** Khong tim thay ho so nghiem thu duoc tro toi bang id. */
  'ACCEPTANCE_NOT_FOUND',
  /**
   * Phap nhan ben A duoc khai nhung khong ton tai.
   *
   * `#268` I1 goi truong nay la *"A Counterparty/site reference when available"* — TUY CHON. Nhung
   * khai mot phap nhan KHONG co that thi khac han voi khong khai: no lam bao cao gom theo phap nhan
   * treo mot ho so vao mot ben khong ton tai.
   */
  'ACCEPTANCE_COUNTERPARTY_NOT_FOUND',
  /**
   * Hai nguoi cung ghi mot quyet dinh cho cung mot ho so trong cung mot khoanh khac.
   *
   * Tach khoi `ACCEPTANCE_SUPERSEDES_STALE` cua tang quyet dinh vi hai thu khac nhau ve NOI phat
   * hien: ma kia la mot cong NGHIEP VU dong sau khi doc trang thai; ma nay la DB tu choi ban ghi
   * thu hai o rang buoc duy nhat. Nguoi dung xu ly giong nhau (tai lai), nhung nguoi doc trace can
   * phan biet duoc "cong dong" voi "va cham luc ghi".
   */
  'ACCEPTANCE_DECISION_SEQUENCE_CONFLICT',
] as const;
export type TransportCommercialAcceptanceErrorReason =
  (typeof TRANSPORT_COMMERCIAL_ACCEPTANCE_ERROR_REASONS)[number];
