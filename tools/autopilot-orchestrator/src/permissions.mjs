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
 * CUA CHINH PR. Doi hoi no phai cam `issues: write` la doi hoi ma nguon chua duyet cam quyen ghi
 * vao mat phang trang thai cua repo. Nen bang nay tach lam hai:
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
 * MOI LOI GOI GHI CUA ORCHESTRATOR, VA QUYEN MA GITHUB DOI HOI CHO DUNG LOI GOI DO.
 *
 * Bang nay song song voi `probesFor` o tren, va vi cung mot le: quyen phai DAN XUAT tu loi goi co
 * that, khong phai nguoc lai. `MUTATION_GRANTS` duoc TINH ra tu day, nen khong con duong nao them
 * mot quyen ghi vao workflow ma khong co mot dong o day tro toi mot endpoint cu the.
 *
 * BA LOI GOI, VA CA BA DEU LA `/issues/...` (blocker B7 cua PR #167)
 *
 * Tai lieu REST cua GitHub ghi cho ca ba endpoint duoi day cung mot cau: token can "Issues" write
 * HOAC "Pull requests" write — MOT trong hai, khong phai ca hai. Ban truoc cam ca hai, va ly do
 * ghi ngay tai cho nay la "giu dung bo ma lan chay that da do". Do la mot ly do VAN HANH, khong
 * phai mot doi hoi cua API — va no khong du de cam mot quyen ghi.
 *
 * Cai gia cua no la that: `pull-requests: write` uy quyen cho MOI thao tac ghi khac tren mot PR —
 * doi base, doi title, dong PR, day review — trong dung mot job cam quyen ghi cua ca mat phang
 * dieu khien. Khong mot dong nao trong package nay goi den chung. Mot quyen khong loi goi nao can
 * la mot quyen chi con tac dung khi co ai do dung sai no.
 *
 * Nen bo cua Orchestrator V0 la `issues: write` + `pull-requests: read`. `pull-requests` van CAN,
 * nhung chi de DOC: `GET /pulls/{n}` lay HEAD that (probe `pull` o bang tren).
 *
 * @typedef {object} WriteCall
 * @property {string} name Ten ngan, hien trong thong bao loi cua bai kiem hop dong.
 * @property {string} grant Dong PHAI CO trong khoi `permissions:` cua job ghi, nguyen van.
 * @property {'POST' | 'PUT' | 'PATCH' | 'DELETE'} verb Dung dong `method:` ma ma nguon truyen di.
 * @property {string} endpoint Duong dan REST, dang tai lieu.
 * @property {string} site Tep trong `src/` thuc su phat loi goi nay.
 */

/** @type {ReadonlyArray<WriteCall>} */
export const WRITE_CALLS = Object.freeze([
  {
    name: 'post-comment',
    grant: 'issues: write',
    verb: 'POST',
    endpoint: '/issues/{n}/comments',
    site: 'main.mjs',
  },
  {
    name: 'add-labels',
    grant: 'issues: write',
    verb: 'POST',
    endpoint: '/issues/{n}/labels',
    site: 'labels.mjs',
  },
  {
    name: 'remove-label',
    grant: 'issues: write',
    verb: 'DELETE',
    endpoint: '/issues/{n}/labels/{ten}',
    site: 'labels.mjs',
  },
]);

/**
 * Quyen GHI — DAN XUAT tu bang tren, khong viet tay. Bo mot loi goi ghi la bo quyen tuong ung;
 * them mot quyen ma khong them loi goi la viec KHONG LAM DUOC tu day.
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
