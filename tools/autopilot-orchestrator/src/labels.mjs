/**
 * DOI NHAN SAO CHO CHAY LAI DUOC — blocker B5 cua PR #167.
 *
 * HONG HOC CU
 *
 * `main.mjs` dang comment truoc, roi doi nhan, va BO QUA moi ket qua cua loi goi nhan. Cong voi
 * cong chong trung (`findPostedClaim`) — thu dung ngay sau do o lan chay ke tiep — hai thu ay hop
 * lai thanh mot trang thai KHONG SUA DUOC:
 *
 *   lan 1: POST comment -> 201.  POST labels -> 500 (hoac job het gio, hoac runner chet).
 *   lan 2: findPostedClaim thay comment cua lan 1 -> ALREADY_POSTED_AT_HEAD -> dung.
 *   ket qua: nhan dung o trang thai CU, vinh vien, va chinh cong chong trung chan duong sua.
 *
 * Mot side effect chi "idempotent" khi chay lai nhieu lan cho ra cung mot ket qua. Doi nhan o day
 * TUNG idempotent theo nghia hep do, nhung khong RECOVERABLE: khong co lan chay nao ve toi no nua.
 *
 * HAI THAY DOI, VA CHUNG DI VOI NHAU
 *
 *   1. (o day) Doc ket qua tung loi goi nhan. Hong thi bao, khong nuot.
 *   2. (o `main.mjs`) Hoa giai nhan o MOI lan chay — ke ca lan thay comment da dang roi. Cong
 *      chong trung chan DANG TRUNG COMMENT; no khong duoc chan viec SUA NHAN cho dung.
 *
 * MOT TRUONG HOP DUY NHAT DUOC COI LA THANH CONG DU KHONG PHAI 2xx
 *
 * `DELETE /issues/{n}/labels/{ten}` tra `404` khi nhan do von khong co tren PR. Ket qua mong muon —
 * "nhan nay khong con o day" — DA DAT. Do la mot truong hop idempotent TUONG MINH, khong phai mot
 * loi duoc bo qua cho tien. Moi status khac ngoai 2xx deu la hong.
 *
 * Tep nay khong tu goi mang: no nhan mot ham `request`. Viec goi mang van nam o `github.mjs`.
 */
import { ORCHESTRATOR_REASONS, fail, succeed } from './reasons.mjs';

/** Ket cuc cua mot thao tac nhan — di thang vao log, nen no la MA chu khong phai cau van. */
export const LABEL_OUTCOMES = Object.freeze({
  /** Nhan co tren PR va da duoc go. */
  REMOVED: 'REMOVED',
  /** Nhan von khong co tren PR (`404`). Ket qua mong muon da dat. */
  ALREADY_ABSENT: 'ALREADY_ABSENT',
  /** Da gan bo nhan can co. GitHub coi viec gan mot nhan da co la khong-lam-gi. */
  ADDED: 'ADDED',
});

/**
 * @callback LabelRequest
 * @param {string} path Duong dan TUONG DOI so voi `/repos/{repo}/issues/{pr}`, vi du `/labels`.
 * @param {RequestInit} [init]
 * @returns {Promise<{ ok: boolean, status: number, body: any }>}
 */

/**
 * Dua bo nhan cua PR ve dung trang thai `decision.labels` mo ta.
 *
 * Go truoc, gan sau — de mot nhan vua nam trong `remove` vua nam trong `add` (truong hop THUONG:
 * `decide.mjs` go HET nhan trang thai roi gan lai dung mot cai) khong bi go mat o buoc cuoi.
 *
 * @param {LabelRequest} request
 * @param {{ add: string[], remove: string[] }} labels
 * @returns {Promise<{ ok: true, value: Array<{ label: string, outcome: string }> } | { ok: false, reason: string, detail?: Record<string, unknown> }>}
 */
export async function reconcileLabels(request, labels) {
  /** @type {Array<{ label: string, outcome: string }>} */
  const applied = [];

  for (const label of labels.remove) {
    if (labels.add.includes(label)) continue;
    const response = await request(`/labels/${encodeURIComponent(label)}`, { method: 'DELETE' });
    if (response.ok) {
      applied.push({ label, outcome: LABEL_OUTCOMES.REMOVED });
      continue;
    }
    if (response.status === 404) {
      applied.push({ label, outcome: LABEL_OUTCOMES.ALREADY_ABSENT });
      continue;
    }
    return fail(ORCHESTRATOR_REASONS.LABEL_WRITE_FAILED, {
      op: 'remove',
      label,
      status: response.status,
      applied,
    });
  }

  if (labels.add.length > 0) {
    const response = await request('/labels', {
      method: 'POST',
      body: JSON.stringify({ labels: labels.add }),
    });
    if (!response.ok) {
      return fail(ORCHESTRATOR_REASONS.LABEL_WRITE_FAILED, {
        op: 'add',
        labels: labels.add,
        status: response.status,
        applied,
      });
    }
    for (const label of labels.add) applied.push({ label, outcome: LABEL_OUTCOMES.ADDED });
  }

  return succeed(applied);
}
