/**
 * MOI LOI GOI API CUA ORCHESTRATOR, VA QUYEN MA NO DOI HOI — mot bang, mot nguon.
 *
 * VI SAO LA MOT TEP RIENG
 *
 * Bang nay co HAI nguoi doc, va do la ca y do:
 *
 *   1. `preflight.mjs` GOI THAT tung duong de do quyen cua `GITHUB_TOKEN`;
 *   2. `tests/workflow-contract.test.mjs` doi chieu cot `grant` voi cac khoi `permissions:` cua
 *      `.github/workflows/autopilot-orchestrator.yml`.
 *
 * Nho vay them mot loi goi API moi ma quen them quyen se lam DO CI NGAY TRONG PR — thay vi do o
 * lan chay that dau tien sau khi merge. Do dung la cach blocker B1 cua PR #167 phat sinh:
 * `main.mjs` goi `/check-runs` va `/actions/runs` trong khi khoi `permissions:` khong ke
 * `checks: read` va `actions: read`, va khong cong nao keu.
 *
 * HAI HANG QUYEN, KHONG PHAI MOT (blocker B4 cua PR #167)
 *
 * Ban truoc gop lam mot danh sach: probe `pull` doi `pull-requests: write`, probe `issue-comments`
 * doi `issues: write`. Sai o cho GOP: nam probe deu la `GET`, chung KHONG can quyen ghi. Quyen ghi
 * chi can cho hai viec cuoi cung cua `main.mjs` — dang comment va doi nhan.
 *
 * Gop chung lai co mot hau qua that: `preflight` chay o trigger `pull_request`, tuc chay MA NGUON
 * CUA CHINH PR. Doi hoi no phai cam MOT QUYEN GHI la doi hoi ma nguon chua duyet cam quyen ghi vao
 * mat phang trang thai cua repo. Nen bang nay tach lam hai:
 *
 *   READ_GRANTS     — du cho ca nam `GET`. Job chay ma nguon PR chi duoc cam dung bay nhieu.
 *   MUTATION_GRANTS — chi cho job chay ma nguon nhanh mac dinh, noi thuc su co ghi.
 *
 * Tep nay THUAN. Viec goi mang nam o `github.mjs`, viec chay nam o `preflight.mjs`.
 */

/**
 * @typedef {object} Probe
 * @property {string} name Ten ngan, hien trong log.
 * @property {string} grant Dong PHAI CO trong khoi `permissions:` cua workflow, nguyen van.
 * @property {string} path Duong dan REST, giong het cai `main.mjs` goi.
 * @property {(body: any) => boolean} shapeOk
 * @property {string} shape Mo ta hinh dang mong doi, de thong bao loi doc duoc.
 */

/**
 * Nam loi goi DOC cua `main.mjs`, kem quyen ma moi cai doi hoi.
 *
 * `grant` duoc chep NGUYEN VAN dang `key: value` de bai kiem hop dong so thang voi YAML — mot
 * chuoi gan giong ("checks:read") se lam bai kiem do, va do la y muon.
 *
 * Moi dong o day la `: read`. Do khong phai su tinh luoc: ca nam deu la `GET`, va mot job chi doc
 * thi khong duoc xin quyen ghi "cho chac".
 *
 * @param {{ repo: string, pr: number, headSha: string }} at
 * @returns {ReadonlyArray<Probe>}
 */
export const probesFor = ({ repo, pr, headSha }) =>
  Object.freeze([
    {
      name: 'branch-rules',
      grant: 'contents: read',
      path: `/repos/${repo}/rules/branches/main`,
      shapeOk: (body) => Array.isArray(body),
      shape: 'mang rule',
    },
    {
      name: 'pull',
      grant: 'pull-requests: read',
      path: `/repos/${repo}/pulls/${pr}`,
      shapeOk: (body) => typeof body?.head?.sha === 'string',
      shape: 'object co head.sha',
    },
    {
      name: 'issue-comments',
      grant: 'issues: read',
      path: `/repos/${repo}/issues/${pr}/comments?per_page=1`,
      shapeOk: (body) => Array.isArray(body),
      shape: 'mang comment',
    },
    // ------------------------------------------------------------------------------------------
    // HAI PROBE DUOI DAY LA BLOCKER B1 CUA PR #167. Chung tung khong co quyen tuong ung.
    // ------------------------------------------------------------------------------------------
    {
      name: 'check-runs',
      grant: 'checks: read',
      path: `/repos/${repo}/commits/${headSha}/check-runs?per_page=1`,
      shapeOk: (body) => Array.isArray(body?.check_runs),
      shape: 'object co check_runs[]',
    },
    {
      name: 'actions-runs',
      grant: 'actions: read',
      path: `/repos/${repo}/actions/runs?head_sha=${headSha}&per_page=1`,
      shapeOk: (body) => Array.isArray(body?.workflow_runs),
      shape: 'object co workflow_runs[]',
    },
  ]);

/**
 * Quyen DOC ma moi job cua workflow phai co du. Dan xuat tu chinh bang tren, nen khong the lech:
 * mot probe moi la mot quyen moi.
 * @type {ReadonlyArray<string>}
 */
export const READ_GRANTS = Object.freeze([
  ...new Set(
    probesFor({ repo: 'o/r', pr: 1, headSha: '0'.repeat(40) }).map((probe) => probe.grant),
  ),
]);

/**
 * LOAI TAI NGUYEN MA MOT LOI GOI GHI NHAM VAO — khong phai hinh dang duong dan cua no.
 *
 * Day la cho blocker B7 cua PR #167 doc sai, va cho mot lan goi GitHub THAT da bac bo (Issue #188).
 *
 * B7 doc bang duoi day theo DUONG DAN: ca ba endpoint deu la `/issues/...`, tai lieu REST cua
 * GitHub ghi cho ca ba cung mot cau — token can "Issues" write HOAC "Pull requests" write — nen B7
 * ket luan `issues: write` la du, va GO `pull-requests: write` di. Suy luan chat che, tien de sai.
 *
 * BANG CHUNG BAC BO, do ngay 04/09/2026 tren PR #167:
 *
 *   run 33889198070 — token cua job co dung `Issues: write` + `PullRequests: read` (log runner xac
 *   nhan). Loi quyet dinh chay dung toi cuoi (`HEAD_MISMATCH`), roi
 *   `POST /repos/{o}/{r}/issues/167/comments` tra ve **403**. Lap lai hai lan.
 *
 * Nhung thu da LOAI TRU bang do, de khong ai di lai: PR khong `locked`, repo khong archived, khong
 * interaction limit, request khong hong, va `default_workflow_permissions` cua repo KHONG phai
 * nguyen nhan — thu ca `read` lan `write` deu 403 y het.
 *
 * Nen cach doc dung la theo LOAI TAI NGUYEN: `{n}` trong ca ba duong dan la mot SO PR, va GitHub
 * ap quyen theo doi tuong duoc dia chi hoa chu khong theo tien to duong dan. Mot PR la mot pull
 * request — `/issues/` trong URL chi la di san cua viec GitHub dung chung mot khong gian so.
 *
 * DAY VAN LA MOT GIA THUYET, VA NO DUOC GHI RA DUNG NHU THE.
 *
 * `issues: write` da bi bac bo bang mot lan goi that. `pull-requests: write` la gia thuyet manh
 * nhat con lai, nhung no CHUA duoc chung minh — chung minh no doi mot `201` that tu GitHub sau khi
 * ban nay len `main` (`issue_comment` chi chay ban workflow tren nhanh mac dinh). Cho den luc do,
 * muc NOT PROVEN cua README giu nguyen cau nay. Neu bo quyen moi VAN 403 thi dung lai voi bang
 * chung da lam sach — KHONG cam them quyen "cho chac".
 *
 * Va do la ly do bang nay khong con cho ai VIET TAY mot dong `grant`.
 */
export const WRITE_RESOURCES = Object.freeze({
  /** Doi tuong duoc dia chi hoa la mot PULL REQUEST, du duong dan REST co the la `/issues/{n}/...`. */
  PULL_REQUEST: 'pull-request',
  /** Doi tuong duoc dia chi hoa la mot ISSUE that. Chua loi goi ghi nao cua V0 nham vao day. */
  ISSUE: 'issue',
});

/**
 * LOAI TAI NGUYEN -> QUYEN GHI. Day la cho DUY NHAT trong repo anh xa hai thu do, va no la mot
 * bang DONG: mot loai tai nguyen khong co trong day thi khong khai duoc mot loi goi ghi nao.
 * @type {Readonly<Record<string, string>>}
 */
export const WRITE_GRANT_BY_RESOURCE = Object.freeze({
  [WRITE_RESOURCES.PULL_REQUEST]: 'pull-requests: write',
  [WRITE_RESOURCES.ISSUE]: 'issues: write',
});

/**
 * @typedef {object} WriteCall
 * @property {string} name Ten ngan, hien trong thong bao loi cua bai kiem hop dong.
 * @property {string} resource Loai tai nguyen — mot gia tri cua `WRITE_RESOURCES`.
 * @property {string} grant Dong PHAI CO trong khoi `permissions:` cua job ghi. DAN XUAT tu
 *   `resource`, khong viet tay: xem `writeCall()` ben duoi.
 * @property {'POST' | 'PUT' | 'PATCH' | 'DELETE'} verb Dung dong `method:` ma ma nguon truyen di.
 * @property {string} endpoint Duong dan REST, dang tai lieu.
 * @property {string} site Tep trong `src/` thuc su phat loi goi nay.
 */

/**
 * Mot dong cua bang, voi `grant` TINH RA tu `resource`.
 *
 * Vi sao khong cho khai `grant` truc tiep: dung cai do la cach B7 ghi mot tien de sai vao mot o ma
 * khong cong nao doi chieu duoc. Nay quyen di theo loai tai nguyen, va loai tai nguyen la thu mot
 * nguoi doc code KIEM duoc: `{n}` la so PR hay so Issue.
 *
 * Mot `resource` la nem NGAY LUC NAP MODULE — fail-closed, va no do trong PR chu khong o san xuat.
 *
 * @param {{ name: string, resource: string, verb: 'POST' | 'PUT' | 'PATCH' | 'DELETE', endpoint: string, site: string }} call
 * @returns {WriteCall}
 */
function writeCall(call) {
  const grant = WRITE_GRANT_BY_RESOURCE[call.resource];
  if (typeof grant !== 'string') {
    throw new Error(
      `loi goi ghi \`${call.name}\` khai loai tai nguyen khong biet: \`${call.resource}\``,
    );
  }
  return Object.freeze({ ...call, grant });
}

/**
 * MOI LOI GOI GHI CUA ORCHESTRATOR.
 *
 * Bang nay song song voi `probesFor` o tren, va vi cung mot le: quyen phai DAN XUAT tu loi goi co
 * that, khong phai nguoc lai. `MUTATION_GRANTS` duoc TINH ra tu day, nen khong con duong nao them
 * mot quyen ghi vao workflow ma khong co mot dong o day tro toi mot endpoint cu the.
 *
 * CA BA DEU NHAM VAO MOT PR. `{pr}` o ca ba dong duoi la so PR — `main.mjs` lay no tu
 * `eventTarget.pr`, va `labels.mjs` nhan lai chinh so do. Khong mot loi goi ghi nao cua V0 cham
 * vao mot Issue that; Issue chi duoc DOC (`GET /issues/{n}` lay than hop dong task), va viec doc do
 * la ly do `issues: read` van con trong bo quyen.
 *
 * @type {ReadonlyArray<WriteCall>}
 */
export const WRITE_CALLS = Object.freeze([
  writeCall({
    name: 'post-comment',
    resource: WRITE_RESOURCES.PULL_REQUEST,
    verb: 'POST',
    endpoint: '/issues/{pr}/comments',
    site: 'main.mjs',
  }),
  writeCall({
    name: 'add-labels',
    resource: WRITE_RESOURCES.PULL_REQUEST,
    verb: 'POST',
    endpoint: '/issues/{pr}/labels',
    site: 'labels.mjs',
  }),
  writeCall({
    name: 'remove-label',
    resource: WRITE_RESOURCES.PULL_REQUEST,
    verb: 'DELETE',
    endpoint: '/issues/{pr}/labels/{ten}',
    site: 'labels.mjs',
  }),
]);

/**
 * Quyen GHI — DAN XUAT tu bang tren, khong viet tay. Bo mot loi goi ghi la bo quyen tuong ung;
 * them mot quyen ma khong them loi goi la viec KHONG LAM DUOC tu day.
 *
 * Bo nay hien co DUNG MOT dong (`pull-requests: write`), va do la co y: ca ba loi goi ghi nham vao
 * cung mot loai tai nguyen. `issues: write` KHONG con trong bo — khong loi goi ghi nao cua V0 cham
 * vao mot Issue, va mot lan goi that da chung minh no khong thay the duoc quyen tren PR.
 *
 * CHI job chay ma nguon NHANH MAC DINH duoc cam bo nay (blocker B4). Job chay ma nguon cua PR thi
 * khong — ma nguon chua duyet khong duoc ghi vao mat phang trang thai ma chinh no dang xin duyet.
 * @type {ReadonlyArray<string>}
 */
export const MUTATION_GRANTS = Object.freeze([...new Set(WRITE_CALLS.map((call) => call.grant))]);

/**
 * Quyen orchestrator KHONG DUOC co o BAT KY job nao. Read-only la mot ranh gioi GitHub cuong che,
 * khong phai mot loi hua trong tai lieu — nen no phai duoc kiem nhu mot bat bien.
 * @type {ReadonlyArray<string>}
 */
export const FORBIDDEN_GRANTS = Object.freeze(['contents: write']);
