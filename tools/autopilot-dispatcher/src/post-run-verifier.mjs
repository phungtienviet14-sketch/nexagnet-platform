/**
 * SU THAT SAU KHI CHAY — GITHUB noi, khong phai stdout cua Claude.
 *
 * `exit 0` chi chung minh mot dieu: tien trinh da ket thuc binh thuong. No khong chung minh co
 * code, co PR, co CI, hay co ban giao. Va mot dong chu "BUILD_READY" trong stdout cang khong
 * chung minh gi — do la van ban do chinh tien trinh vua chay tu viet ra ve chinh no.
 *
 * Nen o day chi co ba nguon bang chung, tat ca deu doc lai tu GitHub sau khi tien trinh da thoat:
 *   1. nhanh co thuc su ton tai tren remote khong;
 *   2. co PR nao co head la nhanh do khong;
 *   3. trong comment cua Issue/PR co mot thong diep GIAO THUC hop le, DUOC PHAT BOI MOT PRINCIPAL
 *      CO QUYEN, va rang buoc dung vao repo + Issue + PR + HEAD dang song khong.
 *
 * Buoc 3 dung `readMessage` cua giao thuc — cung bo luat ma orchestrator dung. Mot comment "coi
 * nhu la BUILD_READY" khong qua duoc: marker phai la dong dau tien, va payload phai qua schema.
 *
 * NHUNG HINH DANG DUNG CHUA BAO GIO LA QUYEN. Tren mot repo PUBLIC, bat ky ai cung dan duoc mot
 * `BUILD_READY` dung schema tro dung so PR that. Neu hinh dang la du, thi "da ban giao" la thu ai
 * cung bia ra duoc bang mot comment, va hau kiem khong con la hau kiem. Nen o day co HAI cong doc
 * lap, va phai qua CA HAI:
 *
 *   AI PHAT    — provenance THAT cua GitHub tren chinh doi tuong comment (`user.login` /
 *                `performed_via_github_app.slug`), chay qua `principalFromGithubEvent` roi
 *                `authorizeProducer` voi mot `PrincipalRegistry` CUC BO. Khong mot truong nao
 *                trong THAN thong diep duoc tin de suy ra vai — than la thu nguoi phat tu viet.
 *   TRO VAO GI — thong diep phai rang buoc DONG THOI vao bon thu, khong phai mot: repo da cau
 *                hinh, dung so Issue nay, dung so PR dang song, va dung HEAD SHA dang song.
 *
 * Rang buoc HEAD la thu lam cho bang chung HET HAN duoc: mot `BUILD_READY` that cua HEAD A khong
 * duoc phep noi thay cho HEAD B. Neu thieu no, mot lan chay day them commit moi van "da ban giao"
 * theo mot thong diep da cu.
 *
 * QUYEN KICH HOAT va QUYEN PHAT THONG DIEP la HAI THU KHAC NHAU. `trustedTriggerPrincipals` tra
 * loi cau "ai duoc bam nut chay"; so do o day tra loi cau "ai duoc noi rang viec da xong". Gop
 * chung lam mot la cho nguoi gan nhan tu chung nhan ket qua cua chinh lan chay ma minh mo.
 *
 * Ket qua co the la `PROCESS_EXITED_0` + `HANDOFF_MISSING`. Do la mot ket qua HOP LE, va no phai
 * nhin thay duoc la CHUA XONG.
 *
 * Fail closed o moi buoc, va MOI duong tu choi co ma rieng: thieu so do phan quyen la mot loi CAU
 * HINH (`ok:false`), khong duoc doc thanh "khong co ban giao" — hai ket luan rat khac nhau.
 */
import {
  MESSAGE_TYPES,
  REASONS as PROTOCOL_REASONS,
  authorizeProducer,
  principalFromGithubEvent,
  readMessage,
} from '@netviet/autopilot-protocol/validator/index.mjs';
import { DISPATCH_STATES, REASONS, deny } from './errors.mjs';
import { findPullRequestByHead, readIssueComments, readRemoteBranch } from './github-source.mjs';

/** Cac loai thong diep duoc tinh la "da ban giao" cho mot lan chay Builder. */
export const HANDOFF_MESSAGE_TYPES = /** @type {ReadonlyArray<string>} */ (
  Object.freeze([MESSAGE_TYPES.BUILD_READY, MESSAGE_TYPES.REVIEW_REQUEST])
);

/** `.../repos/<owner>/<name>/issues/<n>` — dang API, thu GitHub tra ve tren moi comment. */
const API_CARRIER = /\/repos\/([^/\s]+\/[^/\s]+)\/issues\/([0-9]+)(?:$|[/?#])/;
/** `https://<host>/<owner>/<name>/(issues|pull)/<n>` — dang HTML, du phong. */
const HTML_CARRIER =
  /^https?:\/\/[^/\s]+\/([^/\s]+\/[^/\s]+)\/(?:issues|pull)\/([0-9]+)(?:$|[/?#])/;

const SHA40 = /^[0-9a-f]{40}$/i;

/** @param {unknown} value @returns {value is string} */
const isText = (value) => typeof value === 'string' && value.trim().length > 0;

/**
 * NOI comment nay THUC SU nam, theo chinh cau tra loi cua GitHub — khong theo duong dan ma
 * dispatcher da hoi.
 *
 * Vi sao can: `repo` den tu cau hinh cuc bo, nhung "comment nay thuoc repo do" la mot khang dinh
 * ve DU LIEU TRA VE. Doi chieu nguoc lai la cach duy nhat bat duoc mot cau tra loi bi thay the
 * hoac mot lop trung gian tra nham — cung ky thuat `readIssue` dung voi `repository_url`.
 *
 * @param {Record<string, any>} comment
 * @returns {{ repo: string, number: number } | null}
 */
export function carrierOf(comment) {
  for (const [field, pattern] of /** @type {const} */ ([
    ['issue_url', API_CARRIER],
    ['url', API_CARRIER],
    ['html_url', HTML_CARRIER],
  ])) {
    const value = comment?.[field];
    if (!isText(value)) continue;
    const match = String(value).match(pattern);
    if (match) return { repo: match[1], number: Number(match[2]) };
  }
  return null;
}

/**
 * Danh tinh DA DUOC GITHUB XAC THUC cua nguoi phat comment.
 *
 * Luat dan xuat la cua GIAO THUC (`principalFromGithubEvent`) — khong viet lai o day. Thu duy
 * nhat them vao la mot cong MO HO: neu comment mang DONG THOI mot app slug va mot login khong
 * quy ve cung principal, thi GitHub dang noi "app X hanh dong thay nguoi Y". Do la HAI danh tinh
 * trong mot vat mang, va mot cong phan quyen khong duoc tu chon lay mot. Truong hop nay xay ra
 * that voi token user-to-server cua GitHub App — nen no phai duoc TU CHOI ro rang, khong phai
 * duoc giai quyet im lang bang thu tu uu tien.
 *
 * @param {Record<string, any>} comment
 * @returns {{ ok: true, principal: { kind: string, id: string } } | import('./errors.mjs').Denied}
 */
export function carrierPrincipal(comment) {
  const app = comment?.performed_via_github_app;
  const viaApp = isText(app?.slug)
    ? principalFromGithubEvent({ performed_via_github_app: app })
    : null;
  const viaLogin = isText(comment?.user?.login)
    ? principalFromGithubEvent({ user: comment.user })
    : null;
  if (viaApp && viaLogin) {
    const same =
      viaApp.kind === viaLogin.kind && viaApp.id.toLowerCase() === viaLogin.id.toLowerCase();
    if (!same) {
      return deny(REASONS.HANDOFF_PROVENANCE_AMBIGUOUS, {
        app: `${viaApp.kind}:${viaApp.id}`,
        account: `${viaLogin.kind}:${viaLogin.id}`,
      });
    }
  }
  const principal = viaApp ?? viaLogin;
  if (principal === null) return deny(PROTOCOL_REASONS.PRINCIPAL_UNKNOWN);
  return { ok: /** @type {const} */ (true), principal };
}

/**
 * Loc ra thong diep ban giao duoc PHAT BOI NGUOI CO QUYEN va TRO DUNG lan chay nay. Ham thuan
 * tuy — kiem duoc khong can mang.
 *
 * Thu tu cac cong la co y: AI PHAT truoc, TRO VAO GI sau. Mot comment gia mao hoan hao ve hinh
 * dang van dung lai o `PRODUCER_UNKNOWN`, va nguoi van hanh doc log ra ngay van de la DANH TINH
 * chu khong phai so hieu.
 *
 * @param {ReadonlyArray<Record<string, any>>} comments
 * @param {{ repo: string, issue: number, pr: number | null, headSha: string | null, registry: unknown }} bound
 */
export function findHandoffMessages(comments, bound) {
  /** @type {Array<{ message: Record<string, unknown>, principal: { kind: string, id: string }, roles: ReadonlyArray<string> }>} */
  const accepted = [];
  /** @type {Array<{ reason: string, detail?: Record<string, unknown> }>} */
  const rejected = [];
  /** @param {import('./errors.mjs').Denied} denied */
  const reject = (denied) => {
    rejected.push(
      denied.detail ? { reason: denied.reason, detail: denied.detail } : { reason: denied.reason },
    );
  };

  for (const comment of Array.isArray(comments) ? comments : []) {
    const parsed = readMessage(String(comment?.body ?? ''));
    if (!parsed.ok) continue;
    const message = parsed.message;
    const type = String(message.type);
    // Mot `REVIEW_PASS` hay mot `TASK_DONE` di ngang qua khong phai mot ban giao BI TU CHOI — no
    // chi khong phai viec cua cong nay. Ghi no vao danh sach tu choi la lam nhieu chinh cai log
    // ma nguoi van hanh phai doc.
    if (!HANDOFF_MESSAGE_TYPES.includes(type)) continue;

    // --- vat mang: comment nay o dau ---------------------------------------------------------
    const carrier = carrierOf(comment);
    if (carrier === null || carrier.repo.toLowerCase() !== String(bound.repo).toLowerCase()) {
      reject(
        deny(REASONS.HANDOFF_CARRIER_UNBOUND, { want: bound.repo, got: carrier?.repo ?? null }),
      );
      continue;
    }
    // Vat mang hop le chi co hai: chinh Issue nay, hoac chinh PR dang song. Khong co cho thu ba.
    const carrierAllowed =
      carrier.number === Number(bound.issue) ||
      (bound.pr !== null && carrier.number === Number(bound.pr));
    if (!carrierAllowed) {
      reject(deny(REASONS.HANDOFF_CARRIER_UNBOUND, { carrier: carrier.number }));
      continue;
    }

    // --- AI PHAT: provenance that + so do phan quyen cuc bo -----------------------------------
    const who = carrierPrincipal(comment);
    if (!who.ok) {
      reject(who);
      continue;
    }
    // KHONG truyen `assertedRole`: vai chi duoc suy tu SO DO va tu `MESSAGE_PRODUCERS`, khong bao
    // gio tu mot dong chu trong than thong diep. Nho vay "BUILD_READY chi cua BUILDER/FIXER" va
    // "REVIEW_REQUEST chi cua ORCHESTRATOR" la mot phep giao CUA GIAO THUC, khong phai mot danh
    // sach thu hai duoc chep lai o day.
    const authorized = authorizeProducer({
      principal: who.principal,
      registry: /** @type {any} */ (bound.registry ?? null),
      type,
    });
    if (!authorized.ok) {
      reject(authorized);
      continue;
    }

    // --- TRO VAO GI: bon rang buoc, dong thoi -------------------------------------------------
    if (Number(message.issue) !== Number(bound.issue)) {
      reject(
        deny(PROTOCOL_REASONS.ISSUE_MISMATCH, {
          want: Number(bound.issue),
          got: Number(message.issue),
        }),
      );
      continue;
    }
    if (bound.pr === null) {
      // Khong co PR nao => KHONG co gi de rang buoc vao. Ban truoc viet `bound.pr !== null && ...`,
      // nen dung luc khong co PR thi menh de tat nguong va MOI comment BUILD_READY hop le hinh
      // dang deu duoc nhan.
      reject(deny(PROTOCOL_REASONS.NO_PR_BOUND, { got: Number(message.pr) }));
      continue;
    }
    if (Number(message.pr) !== Number(bound.pr)) {
      reject(
        deny(PROTOCOL_REASONS.PR_MISMATCH, { want: Number(bound.pr), got: Number(message.pr) }),
      );
      continue;
    }
    const claimedHead = String(message.head_sha ?? '');
    if (
      !isText(bound.headSha) ||
      claimedHead.toLowerCase() !== String(bound.headSha).toLowerCase()
    ) {
      // Bang chung HET HAN. Mot BUILD_READY that cho HEAD A khong duoc phep noi thay cho HEAD B.
      reject(deny(PROTOCOL_REASONS.HEAD_MISMATCH, { want: bound.headSha ?? null }));
      continue;
    }

    accepted.push({ message, principal: authorized.principal, roles: authorized.roles });
  }
  return { accepted, rejected };
}

/**
 * @param {import('./gh.mjs').GhClient} gh
 * @param {{ repo: string, issue: number, branch: string, registry: unknown }} input
 */
export async function verifyHandoff(gh, { repo, issue, branch, registry }) {
  // Khong co so do phan quyen thi khong the KET LUAN gi ve ban giao — ke ca ket luan phu dinh.
  // Tra ve `HANDOFF_MISSING` o day la bao "Claude chua ban giao" cho mot cau hinh thieu, va do la
  // mot ket luan SAI ma khong ai kiem lai. Nen day la `ok:false`: mot loi cau hinh, thay duoc.
  const byKey = /** @type {any} */ (registry)?.byKey;
  if (!byKey || typeof byKey.get !== 'function' || byKey.size === 0) {
    return deny(PROTOCOL_REASONS.PRINCIPAL_REGISTRY_MISSING, { repo, issue: Number(issue) });
  }

  const branchState = await readRemoteBranch(gh, { repo, branch });

  const pullResult = await findPullRequestByHead(gh, { repo, branch });
  if (!pullResult.ok) return pullResult;
  const pull = pullResult.pull;

  /** @type {string | null} */
  let headSha = null;
  if (pull) {
    const raw = String(pull.head?.sha ?? '');
    // Co PR nhung khong doc duoc HEAD cua no => khong rang buoc duoc bang chung vao mot HEAD nao.
    // Do la mot cau tra loi HONG, khong phai mot lan chay chua ban giao.
    if (!SHA40.test(raw)) return deny(REASONS.GITHUB_BAD_RESPONSE, { field: 'pull.head.sha' });
    headSha = raw;
  }

  const bound = {
    repo,
    issue: Number(issue),
    pr: pull ? Number(pull.number) : null,
    headSha,
    registry,
  };
  const issueComments = await readIssueComments(gh, { repo, number: Number(issue) });
  if (!issueComments.ok) return issueComments;

  /** @type {Array<Record<string, any>>} */
  let comments = [...issueComments.comments];
  if (pull) {
    const prComments = await readIssueComments(gh, { repo, number: Number(pull.number) });
    if (!prComments.ok) return prComments;
    comments = [...comments, ...prComments.comments];
  }

  const { accepted, rejected } = findHandoffMessages(comments, bound);
  const state =
    accepted.length > 0 ? DISPATCH_STATES.HANDOFF_PRESENT : DISPATCH_STATES.HANDOFF_MISSING;
  return {
    ok: /** @type {const} */ (true),
    state,
    reason: state === DISPATCH_STATES.HANDOFF_MISSING ? REASONS.HANDOFF_MISSING : null,
    branchExists: branchState.exists,
    pr: bound.pr,
    headSha: bound.headSha,
    handoffTypes: accepted.map((entry) => String(entry.message.type)),
    handoffPrincipals: accepted.map((entry) => `${entry.principal.kind}:${entry.principal.id}`),
    // Ma cua tung comment BI TU CHOI. Mot ban giao "trong nhu dung" ma khong duoc tinh la truong
    // hop nguoi van hanh phai doc duoc ngay — neu khong, `HANDOFF_MISSING` va "co ke gia mao" la
    // cung mot dong log.
    rejected,
  };
}

/**
 * Bat bien duoc phat bieu thang thanh code de mot dot refactor khong lang le lam mat no: KHONG co
 * duong nao tu stdout den `HANDOFF_PRESENT`.
 * @param {{ stdoutBytes: number }} _processOutcome
 */
export function stdoutIsNeverEvidence(_processOutcome) {
  return false;
}
