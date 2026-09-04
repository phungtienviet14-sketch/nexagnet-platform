/**
 * Autopilot Protocol V0 — hang so canonical.
 *
 * Tai lieu nguoi doc: docs/phat-trien/van-hanh/autopilot-protocol-v0.md
 * Schema may doc:     tools/autopilot-protocol/schemas/
 *
 * Moi ten o day la MOT phan cua giao thuc. Doi mot ten la doi giao thuc, va phai len phien ban.
 */

export const PROTOCOL_VERSION = 'V0';

/** Trang thai tho (coarse) cua mot task. MERGED la SU KIEN, khong phai trang thai. */
export const STATES = Object.freeze({
  READY: 'READY',
  RUNNING: 'RUNNING',
  CI: 'CI',
  FIXING: 'FIXING',
  REVIEWING: 'REVIEWING',
  RUNTIME_PROOF: 'RUNTIME_PROOF',
  DONE: 'DONE',
  BLOCKED: 'BLOCKED',
});

/** Tu day khong co su kien tu dong nao di tiep. Ra khoi BLOCKED la viec cua NGUOI, ngoai V0. */
export const TERMINAL_STATES = /** @type {ReadonlyArray<string>} */ (
  Object.freeze([STATES.DONE, STATES.BLOCKED])
);

/** Nhan GitHub = trang thai tho. Mot task chi mang DUNG MOT nhan trong nhom nay. */
export const STATE_LABEL_PREFIX = 'autopilot:';
export const STATE_LABELS = Object.freeze(
  Object.fromEntries(
    Object.values(STATES).map((state) => [state, `${STATE_LABEL_PREFIX}${state.toLowerCase()}`]),
  ),
);

/** 9 loai thong diep bat buoc cua V0. */
export const MESSAGE_TYPES = Object.freeze({
  TASK_READY: 'TASK_READY',
  BUILD_STARTED: 'BUILD_STARTED',
  BUILD_READY: 'BUILD_READY',
  CI_FAIL: 'CI_FAIL',
  REVIEW_REQUEST: 'REVIEW_REQUEST',
  REVIEW_PASS: 'REVIEW_PASS',
  REVIEW_BLOCK: 'REVIEW_BLOCK',
  RUNTIME_PROOF: 'RUNTIME_PROOF',
  TASK_DONE: 'TASK_DONE',
});

/**
 * Marker may doc — dong dau tien cua moi thong diep, dang `<!-- MARKER -->`.
 * Van ban tu do KHONG BAO GIO kich hoat agent: khong marker = khong phai thong diep.
 * Hai phan xet review dung chung marker CHATGPT_REVIEW_V0 (dung nhu hop dong #153).
 * @type {Readonly<Record<string, string>>}
 */
export const MARKERS = Object.freeze({
  TASK_CONTRACT: 'AUTOPILOT_TASK_V0',
  [MESSAGE_TYPES.TASK_READY]: 'AUTOPILOT_TASK_READY_V0',
  [MESSAGE_TYPES.BUILD_STARTED]: 'AUTOPILOT_BUILD_STARTED_V0',
  [MESSAGE_TYPES.BUILD_READY]: 'AUTOPILOT_BUILD_READY_V0',
  [MESSAGE_TYPES.CI_FAIL]: 'AUTOPILOT_CI_FAIL_V0',
  [MESSAGE_TYPES.REVIEW_REQUEST]: 'AUTOPILOT_REVIEW_REQUEST_V0',
  [MESSAGE_TYPES.REVIEW_PASS]: 'CHATGPT_REVIEW_V0',
  [MESSAGE_TYPES.REVIEW_BLOCK]: 'CHATGPT_REVIEW_V0',
  [MESSAGE_TYPES.RUNTIME_PROOF]: 'AUTOPILOT_RUNTIME_PROOF_V0',
  [MESSAGE_TYPES.TASK_DONE]: 'AUTOPILOT_TASK_DONE_V0',
});

/**
 * VAI LOGIC cua giao thuc — KHONG PHAI danh tinh GitHub.
 *
 * Khong mot gia tri nao o day la mot `comment.user.login` hay mot app slug, va khong bao gio duoc
 * so sanh truc tiep voi chung. GitHub xac thuc `nexagent-autopilot` / ten dang nhap; giao thuc noi
 * `CLAUDE_BUILDER` / `CHATGPT_REVIEWER`. Cau noi giua hai the gioi la `PrincipalRegistry`
 * (`validator/principal.mjs`) — so do cua tung ban cai dat, do orchestrator dua vao qua `context`.
 *
 * Mot principal co the giu NHIEU vai (App: builder + fixer + orchestrator), va mot vai co the do
 * nhieu principal giu. Nen day la quan he nhieu-nhieu, khong phai mot phep doi ten.
 */
export const ACTORS = Object.freeze({
  ARCHITECT: 'CHATGPT_ARCHITECT',
  BUILDER: 'CLAUDE_BUILDER',
  FIXER: 'CLAUDE_FIXER',
  ORCHESTRATOR: 'GITHUB_ACTIONS',
  REVIEWER: 'CHATGPT_REVIEWER',
  RUNTIME_VERIFIER: 'RUNTIME_VERIFIER',
  HUMAN: 'HUMAN',
});

/** Hai dang danh tinh ma GitHub xac thuc duoc: mot GitHub App (slug), hoac mot tai khoan (login). */
export const PRINCIPAL_KINDS = Object.freeze({ APP: 'APP', USER: 'USER' });

/**
 * PHAN LAP NHIEM VU — mot principal khong duoc giu dong thoi cac vai nay. Bat bien cua GIAO THUC,
 * khong phai cau hinh: neu ai lam cung la nguoi duyet thi `REVIEW_PASS` khong chung minh gi, va ca
 * thiet ke hai cong doc lap (§9) sup. So do vi pham bi tu choi ngay luc dinh nghia.
 *
 * `RUNTIME_VERIFIER` KHONG nam trong xung dot: bang chung runtime la cua CI/deploy that, va App
 * (giu ORCHESTRATOR) chinh la thu chay no. `ARCHITECT` + `REVIEWER` cung duoc phep chung — soan
 * hop dong roi review code khong phai tu duyet cong viec cua chinh minh.
 * @type {Readonly<Record<string, ReadonlyArray<string>>>}
 */
export const ROLE_CONFLICTS = Object.freeze({
  [ACTORS.REVIEWER]: Object.freeze([ACTORS.BUILDER, ACTORS.FIXER, ACTORS.ORCHESTRATOR]),
  [ACTORS.BUILDER]: Object.freeze([ACTORS.REVIEWER]),
  [ACTORS.FIXER]: Object.freeze([ACTORS.REVIEWER]),
  [ACTORS.ORCHESTRATOR]: Object.freeze([ACTORS.REVIEWER]),
});

/** @type {Readonly<Record<string, ReadonlyArray<string>>>} */
export const MESSAGE_PRODUCERS = Object.freeze({
  [MESSAGE_TYPES.TASK_READY]: [ACTORS.ARCHITECT],
  [MESSAGE_TYPES.BUILD_STARTED]: [ACTORS.BUILDER],
  [MESSAGE_TYPES.BUILD_READY]: [ACTORS.BUILDER, ACTORS.FIXER],
  [MESSAGE_TYPES.CI_FAIL]: [ACTORS.ORCHESTRATOR],
  [MESSAGE_TYPES.REVIEW_REQUEST]: [ACTORS.ORCHESTRATOR],
  [MESSAGE_TYPES.REVIEW_PASS]: [ACTORS.REVIEWER],
  [MESSAGE_TYPES.REVIEW_BLOCK]: [ACTORS.REVIEWER],
  [MESSAGE_TYPES.RUNTIME_PROOF]: [ACTORS.RUNTIME_VERIFIER],
  [MESSAGE_TYPES.TASK_DONE]: [ACTORS.ORCHESTRATOR],
});

/** Su kien cua may trang thai = 9 thong diep + 2 su kien khong phai thong diep. */
export const EVENTS = Object.freeze({
  ...MESSAGE_TYPES,
  /** PR da merge vao main. Su kien cua GitHub, khong phai comment. */
  MERGED: 'MERGED',
  /** Ngoai le bat ky (tran retry, proof FAIL, hop dong hong, ...) — vao BLOCKED tu moi trang thai song. */
  EXCEPTION: 'EXCEPTION',
});

export const RISK_LEVELS = Object.freeze({ LOW: 'LOW', MEDIUM: 'MEDIUM', HIGH: 'HIGH' });

/** Cham vao bat ky vung nao => HIGH toi thieu (hop dong #153 §Risk rule). */
export const HIGH_RISK_AREAS = Object.freeze([
  'PRICE_MONEY_FINANCE',
  'AUTH_AUTHORIZATION',
  'SECURITY',
  'TENANT_ISOLATION',
  'DESTRUCTIVE_MIGRATION',
  'SECRETS_PRODUCTION_INFRA',
  'CUSTOMER_SOURCE_AUTHORITY',
]);

/**
 * Tran vong sua. Can tran => BLOCKED, khong bao gio lap vo han.
 *
 * `MAX_HEAD_REVISIONS` khong nam trong hop dong #153, nhung KHONG co no thi cau "never infinite
 * loop" cua hop dong khong dung: hai tran kia chi dem duong CI_FAIL va REVIEW_BLOCK, trong khi
 * MOI chu trinh cua may trang thai deu di qua BUILD_READY — va mot BUILD_READY voi HEAD moi thi
 * luon co khoa idempotency moi. Do duoc 03/09/2026: 40 vong BUILD_READY -> REVIEW_REQUEST deu
 * duoc nhan, ca hai bo dem van bang 0. Chan o BUILD_READY la chan duoc ca ho chu trinh.
 *
 * Vi sao 10: duong dai nhat can 1 HEAD dau + 3 lan sua CI + 3 lan sua review = 7. 10 de cho ba
 * lan du phong ma van huu han.
 */
export const RETRY_CEILINGS = Object.freeze({
  MAX_CI_FIX_ATTEMPTS: 3,
  MAX_REVIEW_FIX_ATTEMPTS: 3,
  MAX_HEAD_REVISIONS: 10,
});

/**
 * Kieu cua tung truong KEY=VALUE trong thong diep dang van ban. Parser ep kieu THEO BANG NAY,
 * khong doan tu gia tri (mot SHA toan chu so ma doan thi thanh so — sai).
 * @type {Readonly<Record<string, 'integer' | 'boolean' | 'string' | 'list'>>}
 */
export const FIELD_TYPES = Object.freeze({
  ISSUE: 'integer',
  PR: 'integer',
  CI_RUN: 'integer',
  DEPLOY_RUN: 'integer',
  HEAD_SHA: 'string',
  BASE_SHA: 'string',
  MERGE_SHA: 'string',
  RELEASE_SHA: 'string',
  BRANCH: 'string',
  ENV: 'string',
  RISK: 'string',
  VERDICT: 'string',
  TASK_ID: 'string',
  HUMAN_GATE: 'boolean',
  RUNTIME_VERIFIED: 'boolean',
  BLOCKERS: 'list',
  FAILED_CHECKS: 'list',
});
