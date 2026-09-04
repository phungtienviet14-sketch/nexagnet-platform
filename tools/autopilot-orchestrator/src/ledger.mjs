/**
 * DOC TRON VEN LUONG COMMENT CUA MOT PR — vi luong comment CHINH LA so ledger cua V0.
 *
 * BLOCKER B6 CUA PR #167
 *
 * Ban truoc doc dung mot loi goi: `/issues/{n}/comments?per_page=100`. Do la TRANG DAU, khong phai
 * ca luong. Voi mot PR duoi 100 comment thi hai thu do trung nhau, nen bug nam im. Qua 100 thi
 * chung tach ra, va cai gia phai tra la HAI hong hoc khac han nhau, cung mot goc:
 *
 *   1. `selectBuildReadyAtHead` khong thay mot `BUILD_READY` HOP LE nam o trang sau, va bao
 *      `NO_BUILD_READY_AT_HEAD` — mot cau tra loi SAI trong o dang tin.
 *   2. `findPostedClaim` khong thay comment DA DANG nam o trang sau, va cong chong trung mo ra —
 *      mot HEAD lanh hai comment giong het nhau.
 *
 * Mot so ledger doc thieu thi khong con la so ledger. Nen tep nay doc HET, va khi khong doc het
 * duoc thi FAIL-CLOSED bang mot ma ly do RIENG — khong lang le quyet dinh tren mot phan so.
 *
 * VI SAO PHAN TRANG BANG `page=` CHU KHONG BANG HEADER `Link`
 *
 * `Link` la cach GitHub chi duong, nhung doc no doi `github.mjs` phai tra ve header va doi
 * `api()` nhan URL tuyet doi — tuc mo rong be mat cua tep DUY NHAT goi mang. `page=` la hop dong
 * on dinh cua chinh endpoint nay, kiem duoc offline, va dieu kien dung ("trang ngan hon
 * `per_page`") la mot dieu kien dong, khong phai mot suy doan.
 *
 * Tep nay khong tu goi mang: no nhan mot ham `request` va tra ket qua. Viec goi mang van nam o
 * `github.mjs`.
 */
import { ORCHESTRATOR_REASONS, fail, succeed } from './reasons.mjs';

/** Toi da GitHub cho mot trang. Doc it hon chi lam tang so lan goi. */
export const COMMENTS_PER_PAGE = 100;

/**
 * Tran an toan: 20 trang = 2000 comment. Cham tran KHONG duoc coi la "doc xong" — xem
 * `PR_COMMENTS_TRUNCATED`. Mot tran im lang chinh la bug B6 duoc doi cho, tu 100 len 2000.
 */
export const MAX_COMMENT_PAGES = 20;

/**
 * @callback CommentPageRequest
 * @param {string} query Chuoi truy van bat dau bang `?`, vi du `?per_page=100&page=2`.
 * @returns {Promise<{ ok: boolean, status: number, body: any }>}
 */

/**
 * Toan bo comment cua mot PR, theo dung thu tu GitHub tra ve.
 *
 * Trung `id` bi loai: giua hai lan goi trang co the co comment moi chen vao, va khi do mot phan tu
 * xuat hien o ca hai trang. Loai theo `id` giu cho `findPostedClaim` khong dem mot comment hai lan.
 *
 * @param {CommentPageRequest} request
 * @returns {Promise<{ ok: true, value: Array<Record<string, any>> } | { ok: false, reason: string, detail?: Record<string, unknown> }>}
 */
export async function fetchAllComments(request) {
  /** @type {Array<Record<string, any>>} */
  const all = [];
  const seen = new Set();

  for (let page = 1; page <= MAX_COMMENT_PAGES; page += 1) {
    const response = await request(`?per_page=${COMMENTS_PER_PAGE}&page=${page}`);
    if (!response.ok || !Array.isArray(response.body)) {
      // Mot trang hong thi ca so ledger hong. Khong duoc tra ve phan da doc duoc: mot phan so
      // trong bao "chua ai dang" chinh la cau tra loi sai ma B6 chi ra.
      return fail(ORCHESTRATOR_REASONS.PR_COMMENTS_UNAVAILABLE, {
        page,
        status: response.status,
        scanned: all.length,
      });
    }

    for (const comment of response.body) {
      const id = /** @type {Record<string, any>} */ (comment ?? {}).id;
      if (Number.isInteger(id)) {
        if (seen.has(id)) continue;
        seen.add(id);
      }
      all.push(comment);
    }

    if (response.body.length < COMMENTS_PER_PAGE) return succeed(all);
  }

  return fail(ORCHESTRATOR_REASONS.PR_COMMENTS_TRUNCATED, {
    pages: MAX_COMMENT_PAGES,
    perPage: COMMENTS_PER_PAGE,
    scanned: all.length,
  });
}
