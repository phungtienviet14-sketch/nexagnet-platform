import assert from 'node:assert/strict';
import { test } from 'node:test';

import { ACTORS, MESSAGE_PRODUCERS, PRINCIPAL_KINDS } from '../validator/constants.mjs';
import {
  authorizeProducer,
  definePrincipalRegistry,
  isPrincipal,
  principalFromGithubEvent,
  rolesOf,
} from '../validator/principal.mjs';
import { applyMessage } from '../validator/protocol.mjs';
import { REASONS } from '../validator/reasons.mjs';
import {
  APP_PRINCIPAL,
  HUMAN_PRINCIPAL,
  REGISTRY,
  REVIEWER_PRINCIPAL,
  SHA_A,
  apply,
  drive,
  message,
  taskInReviewing,
} from './helpers.mjs';

/**
 * (B5) PRINCIPAL DA XAC THUC != VAI GIAO THUC.
 *
 * Do duoc 04/09/2026 qua review doc lap cua ChatGPT tren PR #155: `applyMessage` so sanh
 * `context.actor` THANG voi `MESSAGE_PRODUCERS`, tuc coi mot danh tinh GitHub la mot vai giao thuc.
 * GitHub chi xac thuc duoc `comment.user.login` / `app.slug` — `nexagent-autopilot[bot]`, ten dang
 * nhap cua nguoi — nhung gia tri KHONG BAO GIO bang `CLAUDE_BUILDER` hay `CHATGPT_REVIEWER`.
 *
 * Nen orchestrator (task ke tiep, §17) chi con hai duong, ca hai deu hong:
 *   1. dua principal that vao  -> moi thong diep HOP LE bi tu choi (principal != ten vai);
 *   2. suy vai tu LOAI thong diep -> "BUILD_READY do BUILDER phat vi no la BUILD_READY". Vong tron,
 *      va cong phan quyen thanh mot cai gat luon luon mo.
 *
 * Duong thu ba — va la duong duy nhat chung minh duoc gi do — la mot SO DO CAI DAT:
 *     principal (GitHub xac thuc) -> vai duoc phep -> loai thong diep
 * Bo test nay khoa ca ba tang, cong bat bien phan lap nhiem vu giu cho hai cong review doc lap.
 */

// ---------------------------------------------------------------------------------------------
// 1. Hai khai niem KHONG duoc bang nhau — o ca hai chieu
// ---------------------------------------------------------------------------------------------

test('mot chuoi vai (`ACTORS.*`) tu no khong phai principal va khong phan quyen duoc gi', () => {
  // Chieu 1: ten vai KHONG phai danh tinh. Go `CLAUDE_BUILDER` vao cho principal khong tao ra quyen.
  for (const role of Object.values(ACTORS)) {
    assert.equal(isPrincipal(role), false, role);
    assert.equal(
      authorizeProducer({ principal: role, registry: REGISTRY, type: 'BUILD_READY' }).ok,
      false,
      role,
    );
  }
  // Va ke ca khi boc no thanh hinh dang principal, no van chi la mot `id` chua dang ky.
  const disguised = { kind: PRINCIPAL_KINDS.USER, id: ACTORS.BUILDER };
  assert.equal(
    authorizeProducer({ principal: disguised, registry: REGISTRY, type: 'BUILD_READY' }).reason,
    REASONS.PRODUCER_UNKNOWN,
  );
});

test('mot principal that (login / app slug) khong bao gio bi doi chieu truc tiep voi ten vai', () => {
  // Chieu 2: day chinh la "duong hong so 1" — principal that bi tu choi vi no != ten vai.
  // Voi so do, cung principal do duoc phat BUILD_READY.
  assert.equal(MESSAGE_PRODUCERS.BUILD_READY.includes(APP_PRINCIPAL.id), false);
  const authorized = authorizeProducer({
    principal: APP_PRINCIPAL,
    registry: REGISTRY,
    type: 'BUILD_READY',
  });
  assert.equal(authorized.ok, true);
  assert.deepEqual(authorized.principal, APP_PRINCIPAL);
});

test('hinh dang cu `{ actor: "<VAI>" }` fail closed voi ma RIENG, khong im lang duoc chap nhan', () => {
  // Mot orchestrator viet theo ban truoc se gui dung hinh dang nay. No phai TU CHOI (neu khong,
  // "duong hong so 2" — suy vai tu loai thong diep — thanh hop le), va phai noi ro thieu gi.
  const task = taskInReviewing();
  const legacy = applyMessage(task, message('REVIEW_PASS'), { actor: ACTORS.REVIEWER });
  assert.equal(legacy.ok, false);
  assert.equal(legacy.reason, REASONS.ACTOR_WITHOUT_PRINCIPAL);
  assert.deepEqual(legacy.detail, { role: ACTORS.REVIEWER, type: 'REVIEW_PASS' });
});

// ---------------------------------------------------------------------------------------------
// 2. Phan quyen KHONG duoc suy tu loai thong diep (chong tautology)
// ---------------------------------------------------------------------------------------------

test('cung mot thong diep, hai principal khac nhau => hai ket qua khac nhau', () => {
  // Neu vai duoc suy tu LOAI thong diep thi hai lan goi nay phai giong het nhau. Chung khac nhau,
  // nen thu quyet dinh la SO DO, khong phai kieu thong diep.
  const task = taskInReviewing();
  const msg = message('REVIEW_PASS');
  assert.equal(
    applyMessage(task, msg, { principal: REVIEWER_PRINCIPAL, principalRegistry: REGISTRY }).ok,
    true,
  );
  assert.equal(
    applyMessage(task, msg, { principal: APP_PRINCIPAL, principalRegistry: REGISTRY }).reason,
    REASONS.WRONG_PRODUCER,
  );
});

test('moi loai thong diep deu co it nhat mot principal KHONG phat duoc no', () => {
  // Quet ca 9 loai: neu mot loai duoc moi principal phat, cong cua loai do khong loc gi.
  for (const type of Object.keys(MESSAGE_PRODUCERS)) {
    const outcomes = REGISTRY.entries.map(
      (entry) => authorizeProducer({ principal: entry.principal, registry: REGISTRY, type }).ok,
    );
    assert.ok(outcomes.includes(true), `${type}: khong principal nao phat duoc — so do mau hong`);
    assert.ok(outcomes.includes(false), `${type}: MOI principal deu phat duoc — cong khong loc gi`);
  }
});

// ---------------------------------------------------------------------------------------------
// 3. Dan xuat principal tu su kien GitHub that (nua "derivation" cua hop dong)
// ---------------------------------------------------------------------------------------------

test('dan xuat principal: app slug, login `[bot]`, va tai khoan nguoi', () => {
  assert.deepEqual(
    principalFromGithubEvent({
      user: { login: 'nexagent-autopilot[bot]' },
      performed_via_github_app: { slug: 'nexagent-autopilot' },
    }),
    { kind: PRINCIPAL_KINDS.APP, id: 'nexagent-autopilot' },
  );
  assert.deepEqual(principalFromGithubEvent({ user: { login: 'nguoi-that' } }), {
    kind: PRINCIPAL_KINDS.USER,
    id: 'nguoi-that',
  });
});

test('login `[bot]` va app slug phai ve CUNG mot principal — neu khong, so do dung van truot', () => {
  // GitHub goi cung mot App bang hai ten tuy cho: `nexagent-autopilot` (slug) va
  // `nexagent-autopilot[bot]` (login). Neu khong cat hau to thi day la hai principal, va mot so do
  // dang ky theo slug se im lang tu choi moi comment den duoi dang login.
  const viaApp = principalFromGithubEvent({
    performed_via_github_app: { slug: 'nexagent-autopilot' },
  });
  const viaLogin = principalFromGithubEvent({ user: { login: 'nexagent-autopilot[bot]' } });
  assert.deepEqual(viaLogin, viaApp);
  assert.deepEqual(rolesOf(REGISTRY, viaLogin), rolesOf(REGISTRY, viaApp));
  assert.ok(rolesOf(REGISTRY, viaLogin).includes(ACTORS.BUILDER));
});

test('login/slug khong phan biet hoa thuong — GitHub cung vay', () => {
  const shouty = { kind: PRINCIPAL_KINDS.APP, id: 'NexAgent-AutoPilot' };
  assert.deepEqual(rolesOf(REGISTRY, shouty), rolesOf(REGISTRY, APP_PRINCIPAL));
  assert.equal(
    authorizeProducer({ principal: shouty, registry: REGISTRY, type: 'BUILD_READY' }).ok,
    true,
  );
});

test('su kien khong mang danh tinh nao => null => cong dong, khong doan bua', () => {
  for (const payload of [null, undefined, {}, 'x', { user: {} }, { user: { login: '   ' } }]) {
    assert.equal(principalFromGithubEvent(payload), null, JSON.stringify(payload ?? null));
  }
  // `[bot]` tran trui khong con slug nao ben trong cung khong dan xuat duoc.
  assert.equal(principalFromGithubEvent({ user: { login: '[bot]' } }), null);
});

// ---------------------------------------------------------------------------------------------
// 4. So do cai dat: fail closed o moi duong
// ---------------------------------------------------------------------------------------------

test('thieu so do KHONG duoc hieu la "ai cung duoc" — do la duong fail-open kinh dien', () => {
  const task = taskInReviewing();
  for (const registry of [undefined, null, { byKey: new Map() }]) {
    const result = applyMessage(task, message('REVIEW_PASS'), {
      principal: REVIEWER_PRINCIPAL,
      principalRegistry: registry,
    });
    assert.equal(result.ok, false, JSON.stringify(registry ?? null));
    assert.equal(result.reason, REASONS.PRINCIPAL_REGISTRY_MISSING);
  }
});

test('principal da xac thuc nhung khong co trong so do => PRODUCER_UNKNOWN (biet AI, khong biet VAI)', () => {
  const stranger = { kind: PRINCIPAL_KINDS.USER, id: 'nguoi-la-mat' };
  const result = applyMessage(taskInReviewing(), message('REVIEW_PASS'), {
    principal: stranger,
    principalRegistry: REGISTRY,
  });
  assert.equal(result.reason, REASONS.PRODUCER_UNKNOWN);
  assert.equal(result.detail.principal, 'USER:nguoi-la-mat');
  assert.deepEqual(rolesOf(REGISTRY, stranger), []);
});

test('so do hong ve hinh dang bi tu choi LUC DINH NGHIA, khong doi den luc co thong diep that', () => {
  const cases = [
    [[], 'EMPTY'],
    [[{ roles: [ACTORS.BUILDER] }], 'BAD_PRINCIPAL'],
    [[{ kind: 'ROBOT', id: 'x', roles: [ACTORS.BUILDER] }], 'BAD_PRINCIPAL'],
    [[{ kind: PRINCIPAL_KINDS.APP, id: '', roles: [ACTORS.BUILDER] }], 'BAD_PRINCIPAL'],
    [[{ kind: PRINCIPAL_KINDS.APP, id: 'a', roles: [] }], 'NO_ROLES'],
    [[{ kind: PRINCIPAL_KINDS.APP, id: 'a' }], 'NO_ROLES'],
    [[{ kind: PRINCIPAL_KINDS.APP, id: 'a', roles: ['SUPER_ADMIN'] }], 'UNKNOWN_ROLE'],
  ];
  for (const [entries, problem] of cases) {
    const result = definePrincipalRegistry(entries);
    assert.equal(result.ok, false, JSON.stringify(entries));
    assert.equal(result.reason, REASONS.PRINCIPAL_REGISTRY_INVALID, JSON.stringify(entries));
    assert.equal(result.detail.problem, problem, JSON.stringify(entries));
  }
});

test('mot principal khai hai lan => DUPLICATE_PRINCIPAL, khong am tham gop quyen', () => {
  const result = definePrincipalRegistry([
    { principal: APP_PRINCIPAL, roles: [ACTORS.BUILDER] },
    { principal: { kind: PRINCIPAL_KINDS.APP, id: 'NEXAGENT-AUTOPILOT' }, roles: [ACTORS.FIXER] },
  ]);
  assert.equal(result.reason, REASONS.PRINCIPAL_REGISTRY_INVALID);
  assert.equal(result.detail.problem, 'DUPLICATE_PRINCIPAL');
});

// ---------------------------------------------------------------------------------------------
// 5. Phan lap nhiem vu — bat bien cua GIAO THUC, khong phai cau hinh
// ---------------------------------------------------------------------------------------------

test('mot principal khong duoc vua LAM vua DUYET — so do vi pham bi tu choi', () => {
  for (const roles of [
    [ACTORS.BUILDER, ACTORS.REVIEWER],
    [ACTORS.FIXER, ACTORS.REVIEWER],
    [ACTORS.ORCHESTRATOR, ACTORS.REVIEWER],
    [ACTORS.REVIEWER, ACTORS.BUILDER, ACTORS.ARCHITECT],
  ]) {
    const result = definePrincipalRegistry([{ principal: APP_PRINCIPAL, roles }]);
    assert.equal(result.ok, false, roles.join('+'));
    assert.equal(result.reason, REASONS.PRINCIPAL_ROLE_CONFLICT, roles.join('+'));
  }
});

test('cac to hop DU KIEN van hop le: App lam builder+fixer+orchestrator, nguoi lam architect+reviewer', () => {
  assert.equal(
    definePrincipalRegistry([
      {
        principal: APP_PRINCIPAL,
        roles: [ACTORS.BUILDER, ACTORS.FIXER, ACTORS.ORCHESTRATOR, ACTORS.RUNTIME_VERIFIER],
      },
      { principal: REVIEWER_PRINCIPAL, roles: [ACTORS.ARCHITECT, ACTORS.REVIEWER, ACTORS.HUMAN] },
    ]).ok,
    true,
  );
});

test('bat bien co hieu luc that: principal xay ra HEAD khong tu dong duoc cong review cua no', () => {
  // Ket qua cuoi cung ma phan lap nhiem vu bao ve. App day HEAD, App mo REVIEW_REQUEST — nhung
  // REVIEW_PASS thi no khong phat duoc, nen no khong the tu dua task cua minh toi cho merge.
  const task = taskInReviewing();
  const selfApproval = applyMessage(task, message('REVIEW_PASS'), {
    principal: APP_PRINCIPAL,
    principalRegistry: REGISTRY,
  });
  assert.equal(selfApproval.reason, REASONS.WRONG_PRODUCER);
  assert.deepEqual(selfApproval.detail.allowed, [ACTORS.REVIEWER]);
  assert.equal(task.verdicts.length, 0, 'khong phan xet nao duoc ghi');
});

// ---------------------------------------------------------------------------------------------
// 6. Quan he NHIEU-NHIEU, va `assertedRole` chi THU HEP
// ---------------------------------------------------------------------------------------------

test('mot principal giu nhieu vai; mot vai do nhieu principal giu', () => {
  assert.deepEqual(rolesOf(REGISTRY, APP_PRINCIPAL), [
    ACTORS.BUILDER,
    ACTORS.FIXER,
    ACTORS.ORCHESTRATOR,
    ACTORS.RUNTIME_VERIFIER,
  ]);
  // Cung principal App phat duoc ca BUILD_READY (builder/fixer) lan CI_FAIL (orchestrator).
  for (const type of ['BUILD_STARTED', 'BUILD_READY', 'CI_FAIL', 'TASK_DONE', 'RUNTIME_PROOF']) {
    assert.equal(
      authorizeProducer({ principal: APP_PRINCIPAL, registry: REGISTRY, type }).ok,
      true,
      type,
    );
  }
  // Mot vai co the do nhieu principal giu — so do la quan he nhieu-nhieu, khong phai doi ten.
  const shared = definePrincipalRegistry([
    { principal: REVIEWER_PRINCIPAL, roles: [ACTORS.REVIEWER] },
    { principal: HUMAN_PRINCIPAL, roles: [ACTORS.REVIEWER] },
  ]).registry;
  for (const principal of [REVIEWER_PRINCIPAL, HUMAN_PRINCIPAL]) {
    assert.equal(
      authorizeProducer({ principal, registry: shared, type: 'REVIEW_PASS' }).ok,
      true,
      principal.id,
    );
  }
});

test('`assertedRole` thu hep duoc, nhung khong bao gio mo rong quyen', () => {
  // Khang dinh mot vai KHONG duoc cap => tu choi, du principal co that va co vai khac.
  assert.equal(
    authorizeProducer({
      principal: APP_PRINCIPAL,
      registry: REGISTRY,
      type: 'REVIEW_PASS',
      assertedRole: ACTORS.REVIEWER,
    }).reason,
    REASONS.ROLE_NOT_AUTHORIZED_FOR_PRINCIPAL,
  );
  // Khang dinh mot vai duoc cap nhung khong phat duoc loai nay => WRONG_PRODUCER.
  assert.equal(
    authorizeProducer({
      principal: APP_PRINCIPAL,
      registry: REGISTRY,
      type: 'BUILD_READY',
      assertedRole: ACTORS.ORCHESTRATOR,
    }).reason,
    REASONS.WRONG_PRODUCER,
  );
  // Vai khong ton tai trong giao thuc => UNKNOWN_ROLE (khac han hai duong tren).
  assert.equal(
    authorizeProducer({
      principal: APP_PRINCIPAL,
      registry: REGISTRY,
      type: 'BUILD_READY',
      assertedRole: 'CLAUDE_SUPERUSER',
    }).reason,
    REASONS.UNKNOWN_ROLE,
  );
  // Khang dinh dung => qua, va vai hieu luc duoc chot lai chinh xac.
  const narrowed = authorizeProducer({
    principal: APP_PRINCIPAL,
    registry: REGISTRY,
    type: 'BUILD_READY',
    assertedRole: ACTORS.FIXER,
  });
  assert.equal(narrowed.role, ACTORS.FIXER);
});

test('khong khang dinh thi vai hieu luc la GIAO cua (vai cua principal) va (nguoi phat hop le)', () => {
  // BUILD_READY: App giu 4 vai, hai trong so do phat duoc loai nay => khong chot ve mot vai.
  const many = authorizeProducer({
    principal: APP_PRINCIPAL,
    registry: REGISTRY,
    type: 'BUILD_READY',
  });
  assert.deepEqual(many.roles, [ACTORS.BUILDER, ACTORS.FIXER]);
  assert.equal(many.role, null, 'khong bia ra mot vai khi giao con nhieu hon mot');
  // CI_FAIL: chi ORCHESTRATOR phat duoc => giao con dung mot, chot duoc.
  const one = authorizeProducer({ principal: APP_PRINCIPAL, registry: REGISTRY, type: 'CI_FAIL' });
  assert.equal(one.role, ACTORS.ORCHESTRATOR);
});

// ---------------------------------------------------------------------------------------------
// 7. Provenance duoc GHI LAI, khong chi duoc kiem roi vut di
// ---------------------------------------------------------------------------------------------

test('lich su ghi principal + vai cua tung buoc — mot task DONE tra loi duoc "ai da dong no"', () => {
  const task = drive(taskInReviewing(), [[message('REVIEW_PASS')]]);
  const steps = task.history;
  assert.ok(steps.every((step) => step.by?.principal?.id));
  const pass = steps.at(-1);
  assert.deepEqual(pass.by, { principal: REVIEWER_PRINCIPAL, role: ACTORS.REVIEWER });
  const build = steps.find((step) => step.event === 'BUILD_READY');
  assert.deepEqual(build.by.principal, APP_PRINCIPAL);
  assert.equal(build.by.role, null, 'App giu ca BUILDER lan FIXER — khong quy ve mot vai');
});

test('thong diep bi TU CHOI khong de lai dau vet provenance nao', () => {
  const task = taskInReviewing();
  const rejected = apply(task, message('REVIEW_PASS'), { principal: APP_PRINCIPAL });
  assert.equal(rejected.ok, false);
  assert.equal(rejected.task, task, 'task cu khong bi sua');
  assert.equal(task.history.at(-1).event, 'REVIEW_REQUEST');
});

// ---------------------------------------------------------------------------------------------
// 8. Cong phan quyen dung TRUOC may trang thai va truoc idempotency
// ---------------------------------------------------------------------------------------------

test('principal sai khong ghi khoa idempotency — nguoi dung vai van phat lai duoc', () => {
  // Neu cong phan quyen chay SAU idempotency thi mot ke sai vai chi can phat truoc la khoa mat,
  // va thong diep that cua nguoi dung vai sau do bi tu choi DUPLICATE. Do la mot duong tu choi
  // dich vu ngay trong giao thuc.
  const task = taskInReviewing();
  const usurper = applyMessage(task, message('REVIEW_PASS'), {
    principal: APP_PRINCIPAL,
    principalRegistry: REGISTRY,
  });
  assert.equal(usurper.ok, false);
  const genuine = applyMessage(task, message('REVIEW_PASS'), {
    principal: REVIEWER_PRINCIPAL,
    principalRegistry: REGISTRY,
  });
  assert.equal(genuine.ok, true);
  assert.equal(genuine.task.verdicts.at(-1).head_sha, SHA_A);
});

test('loai thong diep khong biet => UNKNOWN_MESSAGE_TYPE, khong lot qua cong phan quyen', () => {
  assert.equal(
    authorizeProducer({ principal: APP_PRINCIPAL, registry: REGISTRY, type: 'MERGE_IT_NOW' })
      .reason,
    REASONS.UNKNOWN_MESSAGE_TYPE,
  );
});
