/**
 * CO CHE ghi mot QUYET DINH NGHIEP VU — phan NEN TANG, trung tinh ve nghiep vu.
 *
 * OpenTelemetry biet "ham nay mat 25 ms". Khong framework nao biet duoc "khong gui vi
 * QUANTITY_ABOVE_THRESHOLD". Do la khoang trong ma tang nay lap.
 *
 * VI SAO TACH LAM HAI (24/08/2026): truoc ban nay, MOI ma ly do cua moi mien nam trong MOT tep
 * duy nhat o `observability/`. Nen tang vi the "biet" tu vung rieng cua mot mien nghiep vu cu
 * the — va mot capability moi trong tuong lai se phai chen thuat ngu cua no vao dung cai enum do,
 * noi ma moi khach deu nhin thay. Bo test `decision-vocabulary.spec.ts` khoa dieu nay lai: tep
 * nay khong duoc nhac ten mot mien nghiep vu nao.
 *
 * Ranh gioi moi:
 *   · NEN TANG so huu KHUON (tep nay): outcome, hinh dang mot bo tu vung, so dang ky nhan;
 *   · CAPABILITY so huu TU VUNG — moi capability giu mot tep `*-decisions.ts` trong thu muc cua
 *     chinh no: diem quyet dinh + ma ly do + nhan tieng Viet.
 *
 * KHONG danh doi an toan kieu de bo enum: `telemetry.decision()` nhan bo tu vung lam tham so va
 * rang buoc `point`/`reason` theo dung bo do — CHAT HON truoc (truoc day `reason` la `string`).
 */

/**
 * Ket qua mot quyet dinh. Co y chi ba gia tri:
 * - `allowed`  — cong mo, viec di tiep;
 * - `denied`   — cong dong CO CHU Y (mot lua chon dung, khong phai loi);
 * - `degraded` — di tiep nhung o duong du phong (vd LLM hong -> ban mau tat dinh).
 *
 * `degraded` tach khoi `allowed` vi no la thu duy nhat tra loi duoc cau
 * "he thong van chay, nhung no co dang chay dung khong?".
 */
export type DecisionOutcome = 'allowed' | 'denied' | 'degraded';

/**
 * Mot BO TU VUNG QUYET DINH thuoc ve mot mien.
 *
 * QUY UOC ma: moi ma la mot DANH TU chi TRANG THAI da khien quyet dinh ra nhu vay, KHONG phai
 * mot cau mo ta. `GROUP_NOT_MAPPED` chu khong phai `Khong tim thay nhom trong nguon su that`.
 * Nhan tieng Viet cho con nguoi doc nam o `labels`.
 */
export interface DecisionVocabulary<Point extends string = string, Reason extends string = string> {
  /** Mien so huu bo tu vung nay — de doc va de loc, khong dinh tuyen gi. */
  readonly owner: string;
  /** Cac diem quyet dinh CO THAT trong source cua mien do. */
  readonly points: readonly Point[];
  /**
   * Nhan tieng Viet cho nguoi doc (console Sale, runbook).
   *
   * CO Y de rieng khoi ma: ma la thu MAY loc, nhan la thu NGUOI doc. Gop hai thu lam mot se dan
   * toi doi nhan cung la doi khoa loc.
   */
  readonly labels: Readonly<Record<Reason, string>>;
}

export type DecisionPointOf<V> = V extends DecisionVocabulary<infer Point, string> ? Point : never;
export type DecisionReasonOf<V> =
  V extends DecisionVocabulary<string, infer Reason> ? Reason : never;

const LABELS = new Map<string, string>();

/**
 * Khai bao mot bo tu vung. Goi luc nap module cua capability, nen nhan cua mot mien chi co mat
 * khi mien do THUC SU duoc nap — dung y: khach khong ban hang khong bao gio phat ra ma cua don.
 */
export function defineDecisionVocabulary<const Point extends string, const Reason extends string>(
  input: DecisionVocabulary<Point, Reason>,
): DecisionVocabulary<Point, Reason> {
  for (const [reason, label] of Object.entries(input.labels)) {
    LABELS.set(reason, label as string);
  }
  return input;
}

/** Nhan cho ma bat ky; ma la khong biet thi tra chinh no thay vi nem loi (fail-open). */
export function decisionReasonLabel(reason: string): string {
  return LABELS.get(reason) ?? reason;
}
