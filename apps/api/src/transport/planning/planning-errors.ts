/**
 * MA TU CHOI DAU VAO cua lop lap ke hoach vong chay (#276, Lane L).
 *
 * Tach khoi `planning-decisions.ts` theo dung quy uoc da co cua mien: tep kia tra loi "he thong
 * QUYET DINH gi va vi sao" (nguoi doc trace), tep nay tra loi "nguoi goi da gui cai gi sai"
 * (nguoi goi API). Tron lai thi bang loc trace se day nhung dong "khong tim thay" — khong phai
 * mot quyet dinh nghiep vu nao ca.
 *
 * Tep nay CO Y khong import gi.
 */
export const TRANSPORT_PLANNING_ERROR_REASONS = [
  'PLAN_NOT_FOUND',
  /**
   * Bo lap ke hoach khong sinh ra chang co hang nao.
   *
   * KHONG THE xay ra voi `planOrderAssignment()` hom nay — no luon sinh dung mot chang `LOADED`.
   * Ma nay ton tai de mot thay doi tuong lai o bo lap ke hoach LAM DO mot cach on ao, thay vi de
   * lai mot vong chay khong mang don nao va mot ke hoach tro vao hu khong.
   */
  'PLAN_LOADED_LEG_MISSING',
] as const;
export type TransportPlanningErrorReason = (typeof TRANSPORT_PLANNING_ERROR_REASONS)[number];
