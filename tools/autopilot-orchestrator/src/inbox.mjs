/**
 * DOC CA LUONG COMMENT CUA MOT PR — hai viec, ca hai sinh ra tu viec co BA TRIGGER.
 *
 * 1. TRA CUU. `pull_request` va `check_suite` khong mang thong diep nao trong payload. Chung chi
 *    noi "dieu kien vua doi". Thong diep — neu co — nam san trong luong comment cua PR.
 *
 * 2. CHONG DANG TRUNG. Ba trigger co the cung tro nen du dieu kien tren MOT HEAD: BUILD_READY den,
 *    roi CI xong, roi PR duoc mo lai. Neu moi lan deu dang thi mot HEAD lanh ba comment giong het.
 *    V0 read-only khong co so ledger ben ngoai, nen so ledger CHINH LA luong comment: mot y dinh
 *    da phat thi doc lai duoc, va khoa idempotency cua giao thuc la thu de so.
 *
 * MOT LUAT NGU NGHIA, va no la ly do tep nay khong goi `decide.mjs`:
 *
 *   Thong diep VUA DEN thi duoc PHAN XET — hong thi tu choi, va tu choi duoc dang ra.
 *   Thong diep TRA CUU DUOC thi chi duoc DUNG khi no buoc vao dung HEAD hien tai.
 *
 * Vi sao phai tach: neu duong tra cuu cung bat mot comment cu ra phan xet, thi moi lan push se
 * sinh ra mot `HEAD_MISMATCH` cho mot BUILD_READY ma KHONG AI vua phat. Do la tieng on do chinh
 * orchestrator tu tao ra, va no lam nguoi doc mat long tin vao cac tu choi that.
 *
 * Tep nay THUAN: nhan mang comment da tai ve, tra ket qua. Khong goi mang.
 */
import {
  MESSAGE_TYPES,
  idempotencyKeyFor,
  readMessage,
} from '@netviet/autopilot-protocol/validator/index.mjs';

import { ORCHESTRATOR_REASONS, fail, succeed } from './reasons.mjs';

/**
 * Doc mot comment thanh thong diep giao thuc, hoac `null`.
 *
 * KHONG bao loi khi hong. O duong tra cuu, mot comment hong la chuyen cua NGUOI DA PHAT no —
 * va duong `issue_comment` da tu choi no ngay luc no den roi.
 *
 * @param {unknown} comment
 * @returns {{ comment: Record<string, any>, message: Record<string, any>, key: string } | null}
 */
function readProtocolComment(comment) {
  const entry = /** @type {Record<string, any>} */ (comment ?? {});
  if (typeof entry.body !== 'string') return null;
  const parsed = readMessage(entry.body);
  if (!parsed.ok) return null;
  const message = /** @type {Record<string, any>} */ (parsed.message);
  try {
    return { comment: entry, message, key: idempotencyKeyFor(message) };
  } catch {
    // `idempotencyKeyFor` nem khi gap loai thong diep no khong biet. Mot thong diep khong co khoa
    // thi khong tham gia duoc vao viec chong trung — bo qua, khong lam do ca lan chay.
    return null;
  }
}

/**
 * @param {unknown} comments
 * @returns {{ ok: true, value: Array<Record<string, any>> } | { ok: false, reason: string, detail?: Record<string, unknown> }}
 */
function asCommentList(comments) {
  if (!Array.isArray(comments)) {
    return fail(ORCHESTRATOR_REASONS.PR_COMMENTS_UNAVAILABLE, {
      received: comments === null ? 'null' : typeof comments,
    });
  }
  return succeed(comments);
}

/**
 * `BUILD_READY` MOI NHAT buoc vao dung HEAD hien tai.
 *
 * "Moi nhat" tinh theo `id` cua comment — GitHub cap tang dan, va thu tu mang tra ve khong phai
 * thu duoc hop dong bao dam. Comment khong co `id` thi lay theo vi tri, de mot fixture viet tay
 * van dung duoc.
 *
 * Khong tim thay thi KHONG doan sang mot HEAD khac va KHONG lay cai gan nhat: khong co thong diep
 * buoc vao HEAD nay nghia la chua ai tuyen bo HEAD nay san sang.
 *
 * @param {unknown} comments Than tra ve cua `/issues/{n}/comments`.
 * @param {string} headSha HEAD doc doc lap tu `/pulls/{n}`.
 * @returns {{ ok: true, value: Record<string, any> } | { ok: false, reason: string, detail?: Record<string, unknown> }}
 */
export function selectBuildReadyAtHead(comments, headSha) {
  const list = asCommentList(comments);
  if (list.ok !== true) return list;

  /** @type {Record<string, any> | null} */
  let best = null;
  let bestRank = -1;
  let buildReadyAtOtherHeads = 0;

  list.value.forEach((comment, index) => {
    const read = readProtocolComment(comment);
    if (read === null || read.message.type !== MESSAGE_TYPES.BUILD_READY) return;
    if (read.message.head_sha !== headSha) {
      buildReadyAtOtherHeads += 1;
      return;
    }
    const rank = Number.isInteger(read.comment.id) ? Number(read.comment.id) : index;
    if (rank >= bestRank) {
      bestRank = rank;
      best = read.comment;
    }
  });

  if (best === null) {
    return fail(ORCHESTRATOR_REASONS.NO_BUILD_READY_AT_HEAD, {
      headSha,
      scanned: list.value.length,
      buildReadyAtOtherHeads,
    });
  }
  return succeed(best);
}

/**
 * Y dinh nay da duoc dang chua?
 *
 * So bang KHOA IDEMPOTENCY CUA GIAO THUC, khong bang van ban. Khoa la thu giao thuc dung de noi
 * "cung mot y dinh", nen dung chinh no thi orchestrator va giao thuc dong y voi nhau ve the nao
 * la trung — thay vi orchestrator tu nghi ra mot dinh nghia thu hai.
 *
 * Luu y `ci-fail:<pr>:<head_sha>:<ci_run>` CO ca `ci_run`: chay lai CI tren cung HEAD sinh ra khoa
 * khac, va dang lai la DUNG — do la bang chung moi, khong phai lap lai bang chung cu.
 *
 * @param {unknown} comments Than tra ve cua `/issues/{n}/comments`.
 * @param {string | null} idempotencyKey Khoa cua thong diep sap dang.
 * @returns {{ ok: true, value: { duplicate: boolean, matchedCommentId: number | null } } | { ok: false, reason: string, detail?: Record<string, unknown> }}
 */
export function findPostedClaim(comments, idempotencyKey) {
  const list = asCommentList(comments);
  if (list.ok !== true) return list;
  if (typeof idempotencyKey !== 'string' || idempotencyKey.length === 0) {
    return succeed({ duplicate: false, matchedCommentId: null });
  }
  for (const comment of list.value) {
    const read = readProtocolComment(comment);
    if (read === null || read.key !== idempotencyKey) continue;
    return succeed({
      duplicate: true,
      matchedCommentId: Number.isInteger(read.comment.id) ? Number(read.comment.id) : null,
    });
  }
  return succeed({ duplicate: false, matchedCommentId: null });
}
