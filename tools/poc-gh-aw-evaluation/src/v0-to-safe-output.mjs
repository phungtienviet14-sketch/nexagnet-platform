/**
 * BO CHUYEN DOI THU: mot quyet dinh Protocol V0 -> danh sach item Safe Output cua gh-aw.
 *
 * DAY LA MOT PHEP DO, KHONG PHAI MOT LOP TICH HOP.
 *
 * Cau hoi cua §10 PoC A khong phai "viet duoc adapter khong" — gan nhu cai gi cung viet duoc
 * adapter. Cau hoi la: chuyen doi xong thi MAT gi. Nen tep nay tra ve HAI thu song song:
 *
 *   items — phan chuyen doi duoc, dung khuon gh-aw doi (khoa `_`, khong phai `-`)
 *   gaps  — phan KHONG co cho de dat trong khuon do
 *
 * Danh sach `gaps` moi la ket qua. No la thu tra loi duoc "hybrid thi con phai tu giu cai gi".
 *
 * KHONG goi mang, KHONG doc bi mat, KHONG dung GitHub. Ham thuan.
 */

/** Loai item Safe Output cua gh-aw ma bo chuyen doi nay dung. Khoa dung `_` theo cau hinh gh-aw. */
export const GH_AW_TYPES = Object.freeze({
  ADD_COMMENT: 'add_comment',
  ADD_LABELS: 'add_labels',
  REMOVE_LABELS: 'remove_labels',
});

/**
 * MA CUA TUNG THU BI MAT KHI DI QUA KHUON gh-aw.
 *
 * Chung la MA chu khong phai cau van, vi cung mot ly do bang `ORCHESTRATOR_REASONS` cua
 * orchestrator la ma: hai nguoi doc phai goi cung mot khoang trong bang cung mot ten.
 */
export const ADAPTER_GAPS = Object.freeze({
  /**
   * Khoa idempotency cua giao thuc khong co truong nao mang di.
   *
   * Do la khoang trong QUAN TRONG NHAT. `main.mjs` doi chieu khoa nay voi ca luong comment TRUOC
   * khi dang (`findPostedClaim`), nen cung mot y dinh phat hai lan chi dang MOT lan. Khuon item
   * cua gh-aw khong co cho cho khoa, va tang chay cua no cung khong tra cuu gi truoc khi
   * `issues.createComment` (`add_comment.cjs:1021`).
   */
  IDEMPOTENCY_KEY_HAS_NO_CARRIER: 'IDEMPOTENCY_KEY_HAS_NO_CARRIER',

  /**
   * `decide.mjs` go HET nhan trang thai roi gan lai dung mot cai, va thu tu ay la mot phan cua
   * ket qua. Hai item roi roi (`remove_labels` roi `add_labels`) khong mang rang buoc thu tu do:
   * tang chay cua gh-aw duyet danh sach theo thu tu xuat hien, khong theo mot hop dong nao noi
   * rang go phai xong truoc khi gan.
   */
  LABEL_RECONCILE_ORDER_NOT_EXPRESSIBLE: 'LABEL_RECONCILE_ORDER_NOT_EXPRESSIBLE',

  /**
   * `reconcileLabels` coi `404` khi go mot nhan von khong co la THANH CONG (`ALREADY_ABSENT`) —
   * ket qua mong muon da dat. Khuon item khong noi duoc "vang mat cung la dat".
   */
  ABSENT_LABEL_IS_SUCCESS_NOT_EXPRESSIBLE: 'ABSENT_LABEL_IS_SUCCESS_NOT_EXPRESSIBLE',
});

/**
 * @typedef {object} V0Decision Hinh dang tra ve cua `decideOnComment()` trong orchestrator.
 * @property {string} action
 * @property {string | null} body
 * @property {{ add: string[], remove: string[] }} labels
 * @property {string | null} idempotencyKey
 */

/**
 * @param {V0Decision} decision
 * @returns {{ items: Array<Record<string, unknown>>, gaps: string[] }}
 */
export function toSafeOutputItems(decision) {
  /** @type {Array<Record<string, unknown>>} */
  const items = [];
  /** @type {Set<string>} */
  const gaps = new Set();

  if (typeof decision?.body === 'string' && decision.body.length > 0) {
    items.push({ type: GH_AW_TYPES.ADD_COMMENT, body: decision.body });
    // Khoa co that ma khong co cho dat => mat. Ghi nhan NGAY tai cho no bi mat.
    if (typeof decision.idempotencyKey === 'string' && decision.idempotencyKey.length > 0) {
      gaps.add(ADAPTER_GAPS.IDEMPOTENCY_KEY_HAS_NO_CARRIER);
    }
  }

  const remove = decision?.labels?.remove ?? [];
  const add = decision?.labels?.add ?? [];

  // Go truoc, gan sau — giu dung trinh tu cua `reconcileLabels`, va bo cac nhan vua go vua gan
  // giong het no, de hai ben so sanh duoc voi nhau.
  const actuallyRemoved = remove.filter((label) => !add.includes(label));
  if (actuallyRemoved.length > 0) {
    items.push({ type: GH_AW_TYPES.REMOVE_LABELS, labels: actuallyRemoved });
    gaps.add(ADAPTER_GAPS.ABSENT_LABEL_IS_SUCCESS_NOT_EXPRESSIBLE);
  }
  if (add.length > 0) {
    items.push({ type: GH_AW_TYPES.ADD_LABELS, labels: add });
  }
  if (actuallyRemoved.length > 0 && add.length > 0) {
    gaps.add(ADAPTER_GAPS.LABEL_RECONCILE_ORDER_NOT_EXPRESSIBLE);
  }

  return { items, gaps: [...gaps].sort() };
}
