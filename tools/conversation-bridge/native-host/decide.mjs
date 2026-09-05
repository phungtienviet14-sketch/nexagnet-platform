/**
 * LOI QUYET DINH — THUAN. Khong doc tep, khong goi mang, khong xem dong ho.
 *
 * Tach lam HAI CHANG vi giua chung co dung mot lan cham vao mang, va §5 doi hoi lan cham do phai
 * la THAT chu khong duoc lay tu bo nho dem:
 *
 *   chang 1  screenCarrier   van ban + metadata  -> carrier da xac thuc nguoi phat   (thuan)
 *   ~~~~~~~  getPullRequest  trang thai PR SONG                                      (mang)
 *   chang 2  confirmLive     carrier + trang thai song + so -> khung WAKE            (thuan)
 *
 * Cach chia nay lam mot dieu quan trong: khong ton tai duong nao dung tu chang 1 sang khung WAKE.
 * Muon co khung WAKE thi bat buoc phai di qua mot gia tri `livePr` — va gia tri do chi den tu
 * `github.mjs`. Mot ban sua "toi uu" bo qua lan doc song se khong bien dich duoc ve mat kieu, chu
 * khong phai chi la sai.
 */
import { readReviewRequestCarrier } from '../protocol/carrier.mjs';
import { authorizeCarrierProducer } from '../protocol/provenance.mjs';
import { deliveryKeyFor } from '../protocol/delivery-key.mjs';
import { BRIDGE_REASONS, rejected } from '../extension/shared/states.js';
import { hasKey } from './ledger.mjs';

/**
 * @typedef {{ body?: unknown, issue_url?: unknown, user?: unknown, performed_via_github_app?: unknown }} GithubComment
 */

/**
 * Chang 1 — van ban khong tin cay + metadata da xac thuc.
 *
 * Doc carrier TRUOC roi moi xet nguoi phat, vi thu tu do khong noi long gi ca (mot carrier gia tu
 * nguoi la van bi chang nay chan) nhung no loc bo gan nhu moi comment binh thuong truoc khi cham
 * toi so principal — nen log khong bi ngap ma tu choi provenance vo nghia.
 *
 * @param {{ comment: GithubComment, repo: string, registry: unknown }} input
 * @returns {{ ok: true, carrier: import('../protocol/carrier.mjs').ReviewRequestCarrier, principal: { kind: string, id: string } } | import('../extension/shared/states.js').Rejection}
 */
export function screenCarrier({ comment, repo, registry }) {
  const read = readReviewRequestCarrier(typeof comment?.body === 'string' ? comment.body : '');
  if (!read.ok) return read;

  // Comment PHAI thuoc dung kho da cau hinh. Endpoint da gioi han pham vi roi, nhung mot cau noi
  // theo doi nhieu kho (hoac mot ban ghi fixture bi tron) khong duoc phep di qua cho nay.
  const issueUrl = comment?.issue_url;
  if (
    typeof issueUrl !== 'string' ||
    !issueUrl.startsWith(`https://api.github.com/repos/${repo}/issues/`)
  ) {
    return rejected(BRIDGE_REASONS.REPOSITORY_MISMATCH);
  }

  const authorized = authorizeCarrierProducer({
    commentMetadata: comment,
    registry: /** @type {any} */ (registry),
  });
  if (!authorized.ok) return authorized;

  return { ok: true, carrier: read.carrier, principal: authorized.principal };
}

/**
 * Chang 2 — doi chieu voi trang thai SONG, roi voi so.
 *
 * @param {{
 *   carrier: import('../protocol/carrier.mjs').ReviewRequestCarrier,
 *   repo: string,
 *   live: { ok: true, pr: { state: string, merged: boolean, headSha: string } } | { ok: false, status: number },
 *   ledger: import('./ledger.mjs').Ledger,
 * }} input
 * @returns {{ ok: true, key: string, wake: { repo: string, pr: number, headSha: string } } | import('../extension/shared/states.js').Rejection}
 */
export function confirmLive({ carrier, repo, live, ledger }) {
  if (!live.ok) {
    return live.status === 404
      ? rejected(BRIDGE_REASONS.PR_NOT_FOUND, { github_status: live.status })
      : rejected(BRIDGE_REASONS.LIVE_STATE_UNAVAILABLE, { github_status: live.status });
  }
  if (live.pr.state !== 'open' || live.pr.merged) {
    return rejected(BRIDGE_REASONS.PR_NOT_OPEN, { prState: live.pr.state });
  }
  if (live.pr.headSha !== carrier.headSha) {
    return rejected(BRIDGE_REASONS.HEAD_MISMATCH);
  }
  // Lay HEAD tu cau tra loi SONG chu khong tu carrier. Hai gia tri bang nhau tai dong nay, nhung
  // ghi ro nguon la thu giu cho dung khi ai do doi thu tu cac cong o tren.
  const headSha = live.pr.headSha;
  const key = deliveryKeyFor({ repo, pr: carrier.pr, headSha });
  if (hasKey(ledger, key)) return rejected(BRIDGE_REASONS.ALREADY_DELIVERED, { key });
  return { ok: true, key, wake: { repo, pr: carrier.pr, headSha } };
}
