import assert from 'node:assert/strict';
import { test } from 'node:test';

import { HIGH_RISK_AREAS, MARKERS } from '../validator/constants.mjs';
import { REASONS } from '../validator/reasons.mjs';
import { extractTaskContract, validateTaskContract } from '../validator/task-contract.mjs';
import { contract } from './helpers.mjs';

/**
 * Than Issue dung dang V0: marker la dong co noi dung DAU TIEN, khoi ```json ngay duoi no (chi
 * duoc cach bang dong trong), van xuoi cho nguoi nam SAU khoi.
 */
const body = (json, { marker = MARKERS.TASK_CONTRACT, fence = 'json' } = {}) =>
  [
    `<!-- ${marker} -->`,
    '',
    `\`\`\`${fence}`,
    json,
    '```',
    '',
    '# Task Contract — ban nguoi doc',
    '',
    '## Goal',
    'van xuoi, khong bi dong den',
  ].join('\n');

test('hop dong hop le: MEDIUM khong can nguoi, doi runtime proof o mot env', () => {
  const result = validateTaskContract(contract());
  assert.equal(result.ok, true);
  assert.equal(result.contract.task_id, 'T-SAMPLE');
});

test('HIGH ma human_gate=false => HIGH_RISK_REQUIRES_HUMAN_GATE (hop dong tu mo auto-merge cho minh)', () => {
  const result = validateTaskContract(contract({ risk: 'HIGH', human_gate: false }));
  assert.equal(result.reason, REASONS.HIGH_RISK_REQUIRES_HUMAN_GATE);
  assert.equal(validateTaskContract(contract({ risk: 'HIGH', human_gate: true })).ok, true);
});

test('cham vung HIGH (gia, auth, tenant, ...) ma khai LOW/MEDIUM => RISK_UNDERSTATED_FOR_AREAS', () => {
  for (const area of HIGH_RISK_AREAS) {
    const result = validateTaskContract(contract({ risk: 'MEDIUM', risk_areas: [area] }));
    assert.equal(result.reason, REASONS.RISK_UNDERSTATED_FOR_AREAS, area);
  }
  assert.equal(
    validateTaskContract(
      contract({ risk: 'HIGH', human_gate: true, risk_areas: ['PRICE_MONEY_FINANCE'] }),
    ).ok,
    true,
  );
  assert.equal(
    validateTaskContract(contract({ risk_areas: ['SOMETHING_ELSE'] })).reason,
    REASONS.SCHEMA_VIOLATION,
  );
});

test('runtime_proof.required=true ma khong co env => SCHEMA_VIOLATION; required=false thi env tuy chon', () => {
  assert.equal(
    validateTaskContract(contract({ runtime_proof: { required: true } })).reason,
    REASONS.SCHEMA_VIOLATION,
  );
  assert.equal(validateTaskContract(contract({ runtime_proof: { required: false } })).ok, true);
  assert.equal(
    validateTaskContract(
      contract({ runtime_proof: { required: true, env: 'gd1-test', checks: ['smoke'] } }),
    ).ok,
    true,
  );
  assert.equal(
    validateTaskContract(
      contract({ runtime_proof: { required: true, env: 'gd1-test', checks: [] } }),
    ).ok,
    false,
  );
});

test('dependencies: issue/pr theo so, external theo ref; dang khac bi tu choi', () => {
  const ok = [
    { kind: 'issue', number: 151 },
    { kind: 'pr', number: 151, note: 'PoC' },
    { kind: 'external', ref: 'ADR-7' },
  ];
  assert.equal(validateTaskContract(contract({ dependencies: ok })).ok, true);
  for (const bad of [
    [{ kind: 'issue' }],
    [{ kind: 'pr', number: 'x' }],
    [{ kind: 'external' }],
    ['#151'],
    [{ kind: 'branch', ref: 'main' }],
  ]) {
    assert.equal(
      validateTaskContract(contract({ dependencies: bad })).ok,
      false,
      JSON.stringify(bad),
    );
  }
});

test('scope/acceptance khong duoc rong; out_of_scope/dependencies duoc rong nhung phai co mat', () => {
  assert.equal(validateTaskContract(contract({ scope: [] })).ok, false);
  assert.equal(validateTaskContract(contract({ acceptance: [] })).ok, false);
  assert.equal(validateTaskContract(contract({ out_of_scope: [], dependencies: [] })).ok, true);
  assert.equal(validateTaskContract(contract({ goal: '' })).ok, false);
  assert.equal(validateTaskContract(contract({ unknown_field: 1 })).ok, false);
  assert.equal(validateTaskContract(contract({ task_id: 'lower-case' })).ok, false);
  assert.equal(validateTaskContract(contract({ protocol: 'V1' })).ok, false);
  assert.equal(validateTaskContract(null).ok, false);
});

test('trich hop dong tu than Issue: marker o dong dau + khoi json ngay duoi', () => {
  const result = extractTaskContract(body(JSON.stringify(contract({ issue: 153 }))));
  assert.equal(result.ok, true);
  assert.equal(result.contract.issue, 153);
  assert.equal(result.raw.task_id, 'T-SAMPLE');
});

test('dong trong dan dau va giua marker/khoi van hop le — trinh soan hay them dong trong', () => {
  const padded = [
    '',
    '',
    `<!-- ${MARKERS.TASK_CONTRACT} -->`,
    '',
    '',
    '```json',
    JSON.stringify(contract()),
    '```',
  ].join('\n');
  assert.equal(extractTaskContract(padded).ok, true);
});

test('khoi json thu hai sau khoi hop dong bi bo qua — chi khoi ngay duoi marker duoc tinh', () => {
  const two = [body(JSON.stringify(contract())), '```json', '{"garbage":true}', '```'].join('\n');
  assert.equal(extractTaskContract(two).ok, true);
});

// ---------------------------------------------------------------------------------------------
// Kich hoat hop dong phai CO CHU DINH — cung mot rang buoc da ap cho thong diep (§5.1)
// ---------------------------------------------------------------------------------------------

test('marker khong o dong noi dung dau tien => CONTRACT_MARKER_NOT_FIRST_LINE', () => {
  // Do duoc: mot Issue van xuoi dan vi du hop dong tung cho ra mot hop dong THAT.
  const quoted = ['Hop dong se trong nhu the nay:', '', body(JSON.stringify(contract()))].join(
    '\n',
  );
  const result = extractTaskContract(quoted);
  assert.equal(result.ok, false);
  assert.equal(result.reason, REASONS.CONTRACT_MARKER_NOT_FIRST_LINE);
  assert.deepEqual(result.detail, { markerLine: 3, firstContentLine: 1 });
  // Khoi ```json dat TRUOC marker cung khien marker khong con la dong dau tien.
  const before = ['```json', '{"protocol":"V0"}', '```', body(JSON.stringify(contract()))].join(
    '\n',
  );
  assert.equal(extractTaskContract(before).reason, REASONS.CONTRACT_MARKER_NOT_FIRST_LINE);
});

test('khoi json khong nam NGAY SAU marker => CONTRACT_BLOCK_NOT_ADJACENT', () => {
  const proseBetween = [
    `<!-- ${MARKERS.TASK_CONTRACT} -->`,
    '',
    '## Goal',
    'van xuoi chen vao giua',
    '',
    '```json',
    JSON.stringify(contract()),
    '```',
  ].join('\n');
  const result = extractTaskContract(proseBetween);
  assert.equal(result.ok, false);
  assert.equal(result.reason, REASONS.CONTRACT_BLOCK_NOT_ADJACENT);
  assert.deepEqual(result.detail, { markerLine: 1, nextContentLine: 3 });
});

test('thieu marker, thieu khoi, khoi khong dong, khong phai JSON, JSON sai hop dong', () => {
  assert.equal(extractTaskContract('# chi co van xuoi').reason, REASONS.CONTRACT_MARKER_MISSING);
  assert.equal(
    extractTaskContract(`<!-- ${MARKERS.TASK_CONTRACT} -->`).reason,
    REASONS.CONTRACT_BLOCK_MISSING,
  );
  assert.equal(
    extractTaskContract(`<!-- ${MARKERS.TASK_CONTRACT} -->\nvan xuoi`).reason,
    REASONS.CONTRACT_BLOCK_NOT_ADJACENT,
  );
  assert.equal(
    extractTaskContract(`<!-- ${MARKERS.TASK_CONTRACT} -->\n\`\`\`json\n{}`).reason,
    REASONS.CONTRACT_BLOCK_MISSING,
  );
  assert.equal(extractTaskContract(body('{not json')).reason, REASONS.CONTRACT_BLOCK_NOT_JSON);
  assert.equal(extractTaskContract(body('{"protocol":"V0"}')).reason, REASONS.SCHEMA_VIOLATION);
  assert.equal(
    extractTaskContract(body(JSON.stringify(contract({ risk: 'HIGH' })))).reason,
    REASONS.HIGH_RISK_REQUIRES_HUMAN_GATE,
  );
});

test('khoi ```yaml hay ``` khong nhan — chi ```json la dang may doc cua V0', () => {
  assert.equal(
    extractTaskContract(body(JSON.stringify(contract()), { fence: 'yaml' })).reason,
    REASONS.CONTRACT_BLOCK_NOT_ADJACENT,
  );
  assert.equal(
    extractTaskContract(body(JSON.stringify(contract()), { fence: '' })).reason,
    REASONS.CONTRACT_BLOCK_NOT_ADJACENT,
  );
});

test('marker cua hop dong la AUTOPILOT_TASK_V0 — dung marker dang dung o Issue #153', () => {
  assert.equal(MARKERS.TASK_CONTRACT, 'AUTOPILOT_TASK_V0');
  assert.equal(
    extractTaskContract(body(JSON.stringify(contract()), { marker: 'AUTOPILOT_TASK_V1' })).reason,
    REASONS.CONTRACT_MARKER_MISSING,
  );
});
