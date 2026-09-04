/**
 * MOI LOI GOI API CUA ORCHESTRATOR, VA QUYEN MA NO DOI HOI — mot bang, mot nguon.
 *
 * VI SAO LA MOT TEP RIENG
 *
 * Bang nay co HAI nguoi doc, va do la ca y do:
 *
 *   1. `preflight.mjs` GOI THAT tung duong de do quyen cua `GITHUB_TOKEN`;
 *   2. `tests/workflow-contract.test.mjs` doi chieu cot `grant` voi khoi `permissions:` cua
 *      `.github/workflows/autopilot-orchestrator.yml`.
 *
 * Nho vay them mot loi goi API moi ma quen them quyen se lam DO CI NGAY TRONG PR — thay vi do o
 * lan chay that dau tien sau khi merge. Do dung la cach blocker B1 cua PR #167 phat sinh:
 * `main.mjs` goi `/check-runs` va `/actions/runs` trong khi khoi `permissions:` khong ke
 * `checks: read` va `actions: read`, va khong cong nao keu.
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
 * Nam loi goi cua `main.mjs`, kem quyen ma moi cai doi hoi.
 *
 * `grant` duoc chep NGUYEN VAN dang `key: value` de bai kiem hop dong so thang voi YAML — mot
 * chuoi gan giong ("checks:read") se lam bai kiem do, va do la y muon.
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
      grant: 'pull-requests: write',
      path: `/repos/${repo}/pulls/${pr}`,
      shapeOk: (body) => typeof body?.head?.sha === 'string',
      shape: 'object co head.sha',
    },
    {
      name: 'issue-comments',
      grant: 'issues: write',
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
 * Cac dong `permissions:` ma workflow BAT BUOC phai khai. Dan xuat tu chinh bang tren, nen khong
 * the lech: mot probe moi la mot quyen moi.
 * @type {ReadonlyArray<string>}
 */
export const REQUIRED_GRANTS = Object.freeze([
  ...new Set(
    probesFor({ repo: 'o/r', pr: 1, headSha: '0'.repeat(40) }).map((probe) => probe.grant),
  ),
]);

/**
 * Quyen orchestrator KHONG DUOC co. Read-only la mot ranh gioi GitHub cuong che, khong phai mot
 * loi hua trong tai lieu — nen no phai duoc kiem nhu mot bat bien.
 * @type {ReadonlyArray<string>}
 */
export const FORBIDDEN_GRANTS = Object.freeze(['contents: write']);
