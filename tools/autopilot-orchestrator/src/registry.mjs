/**
 * SO DO CAI DAT principal -> vai, cho DUNG repo nay.
 *
 * Protocol V0 co y KHONG ghi cung principal nao (§2.1): ai la builder, ai la reviewer la viec cua
 * trien khai, khong phai cua giao thuc. Tep nay la cho dau tien tra loi cau do — va vi the no la
 * phan RUI RO CAO nhat cua Orchestrator V0. Sai o day thi `REVIEW_PASS` mat het y nghia.
 *
 * Ba principal duoc DO tu comment that tren PR #155, khong phai suy doan:
 *
 *   BUILD_READY  -> user.login = <chu repo>, performed_via_github_app = null
 *   REVIEW_PASS  -> user.login = <chu repo>, performed_via_github_app.slug = <app cua ChatGPT>
 *
 * Diem mau chot: `principalFromGithubEvent` uu tien app slug hon login, nen HAI comment cua CUNG
 * MOT tai khoan GitHub cho ra HAI principal khac nhau. Nho do mot repo mot chu van thoa duoc bat
 * bien phan lap nhiem vu — dieu ma neu chi nhin `user.login` thi khong the.
 */
import {
  ACTORS,
  PRINCIPAL_KINDS,
  definePrincipalRegistry,
} from '@netviet/autopilot-protocol/validator/index.mjs';

/**
 * Vai cua tai khoan chu repo. No dan hop dong (ARCHITECT), no chay Claude va dan ket qua
 * (BUILDER/FIXER), va no la nguoi duyet bang tay (HUMAN). No KHONG giu REVIEWER — verdict cua
 * ChatGPT den qua app, va phan lap nhiem vu cam mot principal vua lam vua duyet.
 */
const REPO_OWNER_ROLES = Object.freeze([
  ACTORS.ARCHITECT,
  ACTORS.BUILDER,
  ACTORS.FIXER,
  ACTORS.HUMAN,
]);

/** @typedef {{ kind: 'APP' | 'USER', id: string }} Principal */

/**
 * @typedef {object} RegistryInput
 * @property {string} repoOwnerLogin Tai khoan chu repo (login GitHub).
 * @property {string} reviewerAppSlug App mang verdict cua ChatGPT vao repo.
 * @property {string} [actionsAppSlug] App cua GitHub Actions. Mac dinh `github-actions`.
 */

/**
 * Dung so do tu cau hinh. KHONG ghi cung login nao trong ma nguon: mot repo khac, hay mot lan doi
 * app, chi duoc phep la doi bien moi truong — khong phai sua ma roi merge lai.
 *
 * @param {RegistryInput} input
 */
export function buildPrincipalRegistry({ repoOwnerLogin, reviewerAppSlug, actionsAppSlug }) {
  return definePrincipalRegistry([
    {
      principal: { kind: PRINCIPAL_KINDS.USER, id: repoOwnerLogin },
      roles: REPO_OWNER_ROLES,
    },
    {
      principal: { kind: PRINCIPAL_KINDS.APP, id: reviewerAppSlug },
      roles: [ACTORS.REVIEWER],
    },
    {
      principal: { kind: PRINCIPAL_KINDS.APP, id: actionsAppSlug ?? 'github-actions' },
      roles: [ACTORS.ORCHESTRATOR, ACTORS.RUNTIME_VERIFIER],
    },
  ]);
}

/**
 * Doc cau hinh so do tu bien moi truong cua workflow. Thieu bien nao thi FAIL-CLOSED — mot so do
 * "mac dinh" la mot so do khong ai kiem, va no cap quyen im lang.
 *
 * KHONG CO MAC DINH CHO `AUTOPILOT_REVIEWER_APP_SLUG`, va do la mot quyet dinh, khong phai mot cho
 * chua lam. Blocker B3 cua PR #167: workflow tung viet
 * `${{ vars.AUTOPILOT_REVIEWER_APP_SLUG || 'chatgpt-codex-connector' }}`, nen mot bien repo bi xoa
 * — hay chua bao gio duoc dat — se LANG LE trao vai `CHATGPT_REVIEWER` cho mot app ghi cung trong
 * ma nguon. Vai do quyet dinh `REVIEW_PASS` CUA AI duoc tinh. Cap no bang mot gia tri mac dinh la
 * cap quyen ma khong ai ky.
 *
 * `AUTOPILOT_ACTIONS_APP_SLUG` thi KHAC va van co mac dinh (`github-actions`): slug do do GitHub
 * so huu chu khong do repo nay chon, va no khong cap vai duyet cho ai.
 *
 * Chuoi chi chua khoang trang duoc tinh la THIEU: mot bien repo dat nham thanh `" "` khong duoc
 * bien thanh mot principal ten `" "`.
 *
 * @param {Record<string, string | undefined>} env
 * @returns {{ ok: true, value: RegistryInput } | { ok: false, missing: string[] }}
 */
export function registryInputFromEnv(env) {
  /** @param {string | undefined} value */
  const configured = (value) => (typeof value === 'string' ? value.trim() : '');

  const repoOwnerLogin = configured(env.AUTOPILOT_REPO_OWNER_LOGIN);
  const reviewerAppSlug = configured(env.AUTOPILOT_REVIEWER_APP_SLUG);
  const actionsAppSlug = configured(env.AUTOPILOT_ACTIONS_APP_SLUG);

  /** @type {string[]} */
  const missing = [];
  if (repoOwnerLogin.length === 0) missing.push('AUTOPILOT_REPO_OWNER_LOGIN');
  if (reviewerAppSlug.length === 0) missing.push('AUTOPILOT_REVIEWER_APP_SLUG');
  if (missing.length > 0) return { ok: false, missing };
  return {
    ok: true,
    value: {
      repoOwnerLogin,
      reviewerAppSlug,
      ...(actionsAppSlug.length > 0 ? { actionsAppSlug } : {}),
    },
  };
}
