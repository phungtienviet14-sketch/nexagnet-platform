/**
 * Ma ly do cua TANG ORCHESTRATOR — khong phai cua giao thuc.
 *
 * Giao thuc co bo ma rieng (`validator/reasons.mjs`, 59 ma) noi ve THONG DIEP va CONG. Bo nay noi
 * ve viec LAY BANG CHUNG TU GITHUB: goi API hong, hinh dang tra ve khac hop dong, thieu quyen.
 * Hai bo tach nhau co chu dich — mot ma o day khong bao gio duoc dung de tu choi mot thong diep,
 * va nguoc lai. Co test khoa dieu do.
 */
export const ORCHESTRATOR_REASONS = Object.freeze({
  /** Payload su kien khong co hinh dang cua mot webhook GitHub da biet. */
  EVENT_SHAPE_UNKNOWN: 'EVENT_SHAPE_UNKNOWN',
  /** Su kien co hinh dang dung nhung khong phai loai orchestrator nay xu ly. */
  EVENT_NOT_HANDLED: 'EVENT_NOT_HANDLED',
  /** Comment khong mang mot thong diep giao thuc nao — khong phai loi, chi la khong lien quan. */
  NOT_A_PROTOCOL_MESSAGE: 'NOT_A_PROTOCOL_MESSAGE',
  /** Goi API ruleset khong tra ve mang rule. Khong duoc doan danh sach check bat buoc. */
  BRANCH_RULES_UNAVAILABLE: 'BRANCH_RULES_UNAVAILABLE',
  /** API tra ve mang rule nhung khong rule nao khai required_status_checks. */
  BRANCH_RULES_NO_REQUIRED_CHECKS: 'BRANCH_RULES_NO_REQUIRED_CHECKS',
  /** Goi API check-runs khong tra ve mang. */
  CHECK_RUNS_UNAVAILABLE: 'CHECK_RUNS_UNAVAILABLE',
  /** Mot check-run tu API thieu `head_sha` — bang chung khong buoc duoc vao HEAD. */
  CHECK_RUN_UNBOUND: 'CHECK_RUN_UNBOUND',
  /** Khong doc duoc HEAD hien tai cua PR. */
  PR_HEAD_UNAVAILABLE: 'PR_HEAD_UNAVAILABLE',
  /** So do principal chua duoc cau hinh cho repo nay. */
  REGISTRY_NOT_CONFIGURED: 'REGISTRY_NOT_CONFIGURED',

  // ---------------------------------------------------------------------------------------------
  // THIEU QUYEN != THIEU DU LIEU.
  //
  // Ca hai deu lam job do, nhung chung doi hai hanh dong khac han: mot cai sua o khoi
  // `permissions:` cua workflow, cai kia thi cho CI chay xong. Gop chung lai mot ma la bat nguoi
  // truc phai doan — va do dung la cho blocker B1 cua PR #167 chi ra.
  // ---------------------------------------------------------------------------------------------

  /** `GET /actions/runs` khong tra ve `workflow_runs`. Nghi truoc tien: thieu `actions: read`. */
  ACTIONS_RUNS_UNAVAILABLE: 'ACTIONS_RUNS_UNAVAILABLE',
  /** `GET /actions/runs` TRA VE binh thuong, nhung khong co lan chay `ci` nao o HEAD do. */
  CI_RUN_NOT_FOUND: 'CI_RUN_NOT_FOUND',
  /** Khong doc duoc Issue mang hop dong task. */
  TASK_ISSUE_UNAVAILABLE: 'TASK_ISSUE_UNAVAILABLE',
  /** Issue co that nhung than no khong mang mot hop dong task hop le. */
  TASK_CONTRACT_INVALID: 'TASK_CONTRACT_INVALID',
  /** Khong doc duoc danh sach comment cua PR — duong tra cuu thong diep khong duoc fail-open. */
  PR_COMMENTS_UNAVAILABLE: 'PR_COMMENTS_UNAVAILABLE',
  /**
   * Doc het tran trang ma van con comment — so ledger DAI HON thu doc duoc (blocker B6).
   *
   * Tach khoi `PR_COMMENTS_UNAVAILABLE` vi hai cai doi hai hanh dong khac han: cai kia la goi API
   * hong (thu lai, hoac xem quyen); cai nay la GIA DINH VE KICH THUOC da sai, va phai nang tran
   * hoac doi cach doc. Quyet dinh tren mot phan so la dieu duy nhat khong duoc phep.
   */
  PR_COMMENTS_TRUNCATED: 'PR_COMMENTS_TRUNCATED',
  /** Dang comment ket qua that bai. */
  COMMENT_POST_FAILED: 'COMMENT_POST_FAILED',
  /**
   * Mot loi goi doi nhan that bai (blocker B5). Ban truoc NUOT ket qua cua cac loi goi nay, nen
   * mot lan hong de lai nhan sai vinh vien ma khong dong log nao noi ra.
   */
  LABEL_WRITE_FAILED: 'LABEL_WRITE_FAILED',

  // ---------------------------------------------------------------------------------------------
  // BA TRIGGER (hop dong #165). `issue_comment` mang thong diep TRONG payload; `pull_request` va
  // `check_suite` thi khong — chung chi noi "dieu kien vua doi", con thong diep phai TRA CUU.
  // ---------------------------------------------------------------------------------------------

  /** Su kien khong chi ra duoc mot PR de lam viec tren do. */
  EVENT_TARGET_UNRESOLVED: 'EVENT_TARGET_UNRESOLVED',
  /** Tra cuu xong: khong co `BUILD_READY` nao buoc vao HEAD hien tai. Khong doan, khong ghi gi. */
  NO_BUILD_READY_AT_HEAD: 'NO_BUILD_READY_AT_HEAD',
  /** `check_suite` noi ve mot HEAD khong con la HEAD cua PR — bang chung da cu. */
  CHECK_SUITE_HEAD_STALE: 'CHECK_SUITE_HEAD_STALE',
  /** HEAD den tu mot fork. Khong chay giao thuc tren cay ma repo nay khong so huu. */
  FORK_HEAD_NOT_TRUSTED: 'FORK_HEAD_NOT_TRUSTED',
  /** Da co san mot comment cung loai buoc vao dung HEAD nay — ba trigger khong duoc dang ba lan. */
  ALREADY_POSTED_AT_HEAD: 'ALREADY_POSTED_AT_HEAD',
});

/** @typedef {{ ok: false, reason: string, detail?: Record<string, unknown> }} Failed */

/**
 * @template T
 * @param {T} value
 * @returns {{ ok: true, value: T }}
 */
export const succeed = (value) => ({ ok: true, value });

/**
 * @param {string} reason
 * @param {Record<string, unknown>} [detail]
 * @returns {Failed}
 */
export const fail = (reason, detail) =>
  detail ? { ok: false, reason, detail } : { ok: false, reason };
