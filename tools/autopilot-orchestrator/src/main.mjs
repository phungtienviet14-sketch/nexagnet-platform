/**
 * Entrypoint chay trong GitHub Actions. Day la tep DUY NHAT trong package co ghi.
 *
 * Read-only nghia la: chi `POST /issues/{n}/comments` va them/bo nhan. Khong merge, khong ghi ma
 * nguon, khong dispatch agent nao. Workflow cung khong xin `contents: write`, nen ngay ca khi tep
 * nay co loi thi quyen cua no van khong du de sua repo.
 *
 * HAI LAN CHAY, MOT TEP (blocker B4 cua PR #167)
 *
 * Tep nay chay o HAI job khac nhau, va chung khac nhau o dung mot dieu: co duoc ghi hay khong.
 *
 *   `orchestrate-readonly` — chay tren `pull_request`, tuc chay MA NGUON CUA PR chua duyet. Quyen
 *                            toan doc. Di het duong quyet dinh roi dung o `orchestrator: no-write`.
 *   `orchestrate`          — chay tren `issue_comment`/`check_suite`, hai trigger GitHub bat buoc
 *                            chay ban workflow tren nhanh mac dinh. Day la noi duy nhat co quyen ghi.
 *
 * Ranh gioi that nam o khoi `permissions:` cua tung job, khong o tep nay: `mutationRole` chi de lan
 * chay read-only DUNG LAI dung cho thay vi dam vao buc tuong quyen.
 *
 * BA TRIGGER, MOT LOI QUYET DINH (hop dong #165)
 *
 * `issue_comment`, `pull_request`, `check_suite` khong phai ba nhanh xu ly — chung la BA CACH mot
 * bo dieu kien tro nen day du. Chung gap nhau tai dung mot cho: `decideOnComment`. Khac biet duy
 * nhat nam o cach TIM RA thong diep (`events.mjs` + `inbox.mjs`), va o mot luat ngu nghia:
 *
 *   thong diep VUA DEN      -> PHAN XET (hong thi tu choi, va tu choi duoc dang ra)
 *   thong diep TRA CUU DUOC -> chi DUNG khi no buoc vao dung HEAD hien tai
 *
 * Vi ba trigger co the cung du dieu kien tren MOT HEAD, moi lan dang deu phai qua cong chong
 * trung (`findPostedClaim`) — neu khong thi mot HEAD lanh ba comment giong het nhau.
 */
import { readFileSync } from 'node:fs';

import {
  extractTaskContract,
  validateTaskContract,
} from '@netviet/autopilot-protocol/validator/index.mjs';

import { ACTIONS, decideOnComment } from './decide.mjs';
import { RESOLUTIONS, resolveEventTarget } from './events.mjs';
import {
  checkRunsFromApi,
  headRepoIsSelf,
  headShaFromPull,
  requiredChecksFromBranchRules,
} from './evidence.mjs';
import { api } from './github.mjs';
import { findPostedClaim, selectBuildReadyAtHead } from './inbox.mjs';
import { reconcileLabels } from './labels.mjs';
import { fetchAllComments } from './ledger.mjs';
import { MUTATION_ROLES, mutationRoleFromEnv } from './mutations.mjs';
import { ORCHESTRATOR_REASONS } from './reasons.mjs';
import { buildPrincipalRegistry, registryInputFromEnv } from './registry.mjs';

const ISSUE_LINE = /^ISSUE=(\d+)$/m;

/** @param {Record<string, unknown>} entry */
const log = (entry) => console.log(JSON.stringify(entry));

/**
 * Ket thuc som nhung KHONG lam do job: bo qua khong phai loi.
 * @param {string} reason
 * @param {Record<string, unknown>} [detail]
 */
function stop(reason, detail) {
  log({ orchestrator: 'stop', reason, ...(detail ?? {}) });
}

/**
 * Ket thuc VA lam do job: orchestrator khong lam duoc viec cua no.
 * @param {string} reason
 * @param {Record<string, unknown>} [detail]
 */
function abort(reason, detail) {
  log({ orchestrator: 'abort', reason, ...(detail ?? {}) });
  process.exitCode = 1;
}

async function run() {
  const env = process.env;
  const token = env.GITHUB_TOKEN;
  const repoFull = env.GITHUB_REPOSITORY;
  const eventPath = env.GITHUB_EVENT_PATH;
  const dryRun = env.AUTOPILOT_DRY_RUN === 'true';

  // HAI LY DO KHAC NHAU DE KHONG GHI, va chung khong thay the nhau.
  //
  //   `dryRun`       — CONG TAC VAN HANH. "He thong chay dung roi, nhung dung dang gi ca."
  //   `mutationRole` — RANH GIOI TIN CAY (blocker B4). "Lan chay NAY dang thuc thi ma nguon cua mot
  //                    PR chua duyet, nen no khong duoc cham vao mat phang trang thai."
  //
  // Ranh gioi that nam o `permissions:` cua workflow — job read-only KHONG duoc cap MOT QUYEN GHI
  // nao nen no khong ghi duoc du ma nguon co bao no ghi. Bien nay chi de no DUNG LAI dung cho, thay vi
  // dam vao buc tuong quyen va lam do CI tren moi PR ngay khi `AUTOPILOT_DRY_RUN` duoc tat.
  const mutationRole = mutationRoleFromEnv(env);
  const writesEnabled = mutationRole === MUTATION_ROLES.ALLOWED && !dryRun;

  if (!token || !repoFull || !eventPath) {
    return abort(ORCHESTRATOR_REASONS.EVENT_SHAPE_UNKNOWN, {
      missing: ['GITHUB_TOKEN', 'GITHUB_REPOSITORY', 'GITHUB_EVENT_PATH'].filter((k) => !env[k]),
    });
  }

  // So do principal duoc dung TRUOC MOI LOI GOI MANG. Thieu cau hinh thi job do ma khong cham vao
  // GitHub — mot so do "mac dinh" la mot so do khong ai kiem, va no cap quyen im lang.
  const registryInput = registryInputFromEnv(env);
  if (!registryInput.ok) {
    return abort(ORCHESTRATOR_REASONS.REGISTRY_NOT_CONFIGURED, { missing: registryInput.missing });
  }
  const built = /** @type {{ ok?: boolean, reason?: string, registry?: unknown }} */ (
    buildPrincipalRegistry(registryInput.value)
  );
  if (built.ok === false) {
    return abort(ORCHESTRATOR_REASONS.REGISTRY_NOT_CONFIGURED, { reason: built.reason });
  }
  const registry = built.registry ?? built;

  const payload = JSON.parse(readFileSync(eventPath, 'utf8'));
  const resolved = resolveEventTarget({ eventName: env.GITHUB_EVENT_NAME, payload });
  if (resolved.resolution === RESOLUTIONS.ABORT) {
    return abort(/** @type {string} */ (resolved.reason), resolved.detail);
  }
  if (resolved.resolution === RESOLUTIONS.STOP || resolved.target === null) {
    return stop(/** @type {string} */ (resolved.reason), resolved.detail);
  }
  const eventTarget = resolved.target;
  const prNumber = eventTarget.pr;
  log({
    orchestrator: 'event',
    trigger: eventTarget.trigger,
    pr: prNumber,
    inband: eventTarget.inbandComment !== null,
    claimedHeadSha: eventTarget.claimedHeadSha,
  });

  // CONG RE, DAT TRUOC MOI LOI GOI MANG.
  //
  // `issue_comment: created` ban tren MOI comment cua MOI PR — phan lon la nguoi that noi chuyen
  // voi nhau. Mot comment nhu vay khong duoc ton mot lan goi API nao. Chi duong co thong diep DI
  // KEM moi kiem duoc o day; duong tra cuu thi dinh nghia la phai doc luong comment truoc da.
  if (
    eventTarget.inbandComment !== null &&
    !ISSUE_LINE.test(String(eventTarget.inbandComment.body ?? ''))
  ) {
    return stop(ORCHESTRATOR_REASONS.NOT_A_PROTOCOL_MESSAGE, { pr: prNumber });
  }

  const pull = await api(token, `/repos/${repoFull}/pulls/${prNumber}`);
  if (!pull.ok) {
    return abort(ORCHESTRATOR_REASONS.PR_HEAD_UNAVAILABLE, {
      status: pull.status,
      error: pull.error,
      pr: prNumber,
    });
  }
  // Fork: kiem MOT cho cho ca ba trigger, tren doi tuong PR lay tu API.
  const owned = headRepoIsSelf(pull.body, repoFull);
  if (!owned.ok) return stop(owned.reason, owned.detail);
  const head = headShaFromPull(pull.body);
  if (!head.ok) return abort(head.reason, head.detail);

  // Su kien den muon: `check_suite`/`pull_request` noi ve mot HEAD ma PR da di qua. Bang chung cua
  // no khong con mo ta cay hien tai, nen khong duoc dung.
  if (eventTarget.claimedHeadSha !== null && eventTarget.claimedHeadSha !== head.value) {
    return stop(ORCHESTRATOR_REASONS.CHECK_SUITE_HEAD_STALE, {
      trigger: eventTarget.trigger,
      claimed: eventTarget.claimedHeadSha,
      actual: head.value,
    });
  }

  // Luong comment cua PR: vua la NOI TRA CUU thong diep cho hai trigger khong mang thong diep, vua
  // la SO LEDGER de khong dang trung. Doc mot lan, dung cho ca hai viec — nhung doc TRON VEN.
  //
  // "Tron ven" la yeu cau, khong phai su xa xi (blocker B6): ban truoc doc dung `?per_page=100`,
  // tuc TRANG DAU. Qua 100 comment thi mot `BUILD_READY` hop le hoac mot comment DA DANG co the
  // nam ngoai trang do — va hai hong hoc khac han nhau cung xuat hien: `NO_BUILD_READY_AT_HEAD`
  // sai, va dang trung. Chi tiet o `ledger.mjs`.
  const ledger = await fetchAllComments((query) =>
    api(token, `/repos/${repoFull}/issues/${prNumber}/comments${query}`),
  );
  if (!ledger.ok) return abort(ledger.reason, ledger.detail);
  const comments = ledger.value;

  let comment = eventTarget.inbandComment;
  if (comment === null) {
    const found = selectBuildReadyAtHead(comments, head.value);
    // Khong co thong diep nao buoc vao HEAD nay => KHONG ghi gi. Day la truong hop THUONG cua
    // `pull_request: synchronize`: HEAD vua doi, nen chua ai kip tuyen bo no san sang.
    if (!found.ok) return stop(found.reason, found.detail);
    comment = found.value;
  }

  const claimedIssue = Number(ISSUE_LINE.exec(String(comment.body ?? ''))?.[1] ?? NaN);
  if (!Number.isInteger(claimedIssue)) {
    return stop(ORCHESTRATOR_REASONS.NOT_A_PROTOCOL_MESSAGE, { pr: prNumber });
  }

  // RUI RO lay tu HOP DONG TASK trong than Issue — khong phai tu thong diep, va khong phai do
  // orchestrator dat. Issue khong mang hop dong hop le => dung, khong doan mot muc rui ro.
  const issueResponse = await api(token, `/repos/${repoFull}/issues/${claimedIssue}`);
  if (!issueResponse.ok) {
    return abort(ORCHESTRATOR_REASONS.TASK_ISSUE_UNAVAILABLE, {
      issue: claimedIssue,
      status: issueResponse.status,
      error: issueResponse.error,
    });
  }
  const extracted = extractTaskContract(String(issueResponse.body?.body ?? ''));
  if (!extracted.ok) {
    return abort(ORCHESTRATOR_REASONS.TASK_CONTRACT_INVALID, {
      issue: claimedIssue,
      reason: extracted.reason,
    });
  }
  const checked = validateTaskContract(extracted.contract);
  if (!checked.ok) {
    return abort(ORCHESTRATOR_REASONS.TASK_CONTRACT_INVALID, {
      issue: claimedIssue,
      reason: checked.reason,
    });
  }
  const risk = String(extracted.contract.risk);

  const rulesResponse = await api(token, `/repos/${repoFull}/rules/branches/main`);
  const required = requiredChecksFromBranchRules(rulesResponse.ok ? rulesResponse.body : null);
  if (!required.ok) {
    return abort(required.reason, {
      ...required.detail,
      status: rulesResponse.status,
      error: rulesResponse.error,
    });
  }

  // `checks: read`. Khong co quyen nay thi API tra 403 va bang chung CI khong bao gio hinh thanh.
  const checksResponse = await api(
    token,
    `/repos/${repoFull}/commits/${head.value}/check-runs?per_page=100`,
  );
  const checkRuns = checkRunsFromApi(checksResponse.ok ? checksResponse.body : null);
  if (!checkRuns.ok) {
    return abort(checkRuns.reason, {
      ...checkRuns.detail,
      status: checksResponse.status,
      error: checksResponse.error,
    });
  }

  // `actions: read`. THIEU QUYEN va KHONG CO LAN CHAY NAO la hai chuyen khac han, va chung doi hai
  // hanh dong khac han — nen chung mang hai ma ly do khac nhau, khong gop lam mot.
  const runsResponse = await api(
    token,
    `/repos/${repoFull}/actions/runs?head_sha=${head.value}&per_page=50`,
  );
  if (!runsResponse.ok || !Array.isArray(runsResponse.body?.workflow_runs)) {
    return abort(ORCHESTRATOR_REASONS.ACTIONS_RUNS_UNAVAILABLE, {
      status: runsResponse.status,
      error: runsResponse.error,
      headSha: head.value,
      grant: 'actions: read',
    });
  }
  const workflowRuns = runsResponse.body.workflow_runs;
  const ciRunId = Number(
    workflowRuns.find((/** @type {{ name?: string }} */ entry) => entry?.name === 'ci')?.id ?? NaN,
  );
  if (!Number.isInteger(ciRunId)) {
    return abort(ORCHESTRATOR_REASONS.CI_RUN_NOT_FOUND, {
      headSha: head.value,
      seen: workflowRuns.length,
    });
  }

  const decision = decideOnComment(
    /** @type {never} */ ({
      comment,
      evidence: {
        headSha: head.value,
        checkRuns: checkRuns.value,
        requiredChecks: required.value,
        ciRunId,
      },
      registry,
      issue: claimedIssue,
      pr: prNumber,
      risk,
    }),
  );

  log({
    orchestrator: 'decision',
    trigger: eventTarget.trigger,
    action: decision.action,
    reason: decision.reason,
    detail: decision.detail,
    headSha: head.value,
    ciRunId,
    idempotencyKey: decision.idempotencyKey,
    dryRun,
    mutationRole,
  });

  if (decision.action === ACTIONS.IGNORE || decision.body === null) return;

  // CONG CHONG TRUNG. So bang KHOA IDEMPOTENCY CUA GIAO THUC tren chinh luong comment: V0
  // read-only khong co so ledger ben ngoai, nen luong comment CHINH LA so ledger.
  //
  // CONG NAY CHAN DANG TRUNG COMMENT — VA CHI THE (blocker B5). Ban truoc dung han lan chay ngay
  // tai day, nen mot lan hong GIUA "da dang comment" va "da doi xong nhan" de lai nhan sai VINH
  // VIEN: lan chay ke tiep thay comment cu roi dung, khong bao gio ve toi phan nhan, va chinh cong
  // chong trung tro thanh cai chan duong sua. Sua bang cach tach hai viec: comment dang MOT LAN,
  // nhan hoa giai MOI LAN.
  const claimed = findPostedClaim(comments, decision.idempotencyKey);
  if (!claimed.ok) return abort(claimed.reason, claimed.detail);
  const alreadyPosted = claimed.value.duplicate;

  if (!writesEnabled) {
    log({
      orchestrator: 'no-write',
      reason: dryRun ? 'DRY_RUN' : 'MUTATIONS_FORBIDDEN',
      mutationRole,
      alreadyPosted,
      labels: decision.labels,
      body: decision.body,
    });
    return;
  }

  if (!alreadyPosted) {
    const created = await api(token, `/repos/${repoFull}/issues/${prNumber}/comments`, {
      method: 'POST',
      body: JSON.stringify({ body: decision.body }),
    });
    if (!created.ok) {
      // STATUS + CAU CUA GITHUB, khong chi status (Issue #188). Lan chay that 33889198070 dung o
      // dong nay voi `status=403` va khong mot chu giai thich — nen viec phan biet "thieu quyen"
      // voi "PR bi khoa" phai lam bang cac phep do rieng ben ngoai. `error` da duoc lam sach o
      // `api-error.mjs`: log cua Actions la cong khai tren mot repo public.
      return abort(ORCHESTRATOR_REASONS.COMMENT_POST_FAILED, {
        status: created.status,
        error: created.error,
      });
    }
    log({
      orchestrator: 'posted',
      commentId: created.body?.id ?? null,
      idempotencyKey: decision.idempotencyKey,
    });
  }

  // HOA GIAI NHAN, KE CA KHI COMMENT DA CO SAN. Day la duong SUA CHUA cua B5: mot lan chay truoc
  // dang duoc comment roi hong o phan nhan van con duoc lan chay sau don dep. Moi loi goi nhan
  // idempotent theo huong KET QUA (go mot nhan von khong co = `404` = ket qua da dat), nen chay
  // lai khong sinh them tac dong nao — va lan nay ket qua cua chung DUOC DOC, khong bi nuot.
  const reconciled = await reconcileLabels(
    (path, init) => api(token, `/repos/${repoFull}/issues/${prNumber}${path}`, init),
    decision.labels,
  );
  if (!reconciled.ok) return abort(reconciled.reason, reconciled.detail);
  log({ orchestrator: 'labels', applied: reconciled.value });

  if (alreadyPosted) {
    return stop(ORCHESTRATOR_REASONS.ALREADY_POSTED_AT_HEAD, {
      trigger: eventTarget.trigger,
      idempotencyKey: decision.idempotencyKey,
      commentId: claimed.value.matchedCommentId,
      labelsReconciled: reconciled.value.length,
    });
  }
}

await run();
