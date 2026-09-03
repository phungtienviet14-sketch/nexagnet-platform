import assert from 'node:assert/strict';
import { test } from 'node:test';

import { HIGH_RISK_AREAS, MARKERS } from '../validator/constants.mjs';
import { REASONS } from '../validator/reasons.mjs';
import { extractTaskContract, validateTaskContract } from '../validator/task-contract.mjs';
import { contract } from './helpers.mjs';

const body = (json, { marker = MARKERS.TASK_CONTRACT, fence = 'json' } = {}) =>
  [
    '# Task Contract — mau',
    '',
    `<!-- ${marker} -->`,
    '',
    'TASK_ID: T-SAMPLE',
    '',
    '## Goal',
    'van xuoi',
    '',
    `\`\`\`${fence}`,
    json,
    '```',
    '',
    '## Ghi chu',
    'them van xuoi',
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

test('trich hop dong tu than Issue: marker + khoi json dau tien SAU marker', () => {
  const result = extractTaskContract(body(JSON.stringify(contract({ issue: 153 }))));
  assert.equal(result.ok, true);
  assert.equal(result.contract.issue, 153);
  assert.equal(result.raw.task_id, 'T-SAMPLE');
});

test('khoi json TRUOC marker khong duoc tinh; khoi json thu hai sau marker bi bo qua', () => {
  const before = ['```json', '{"protocol":"V0"}', '```', body(JSON.stringify(contract()))].join(
    '\n',
  );
  assert.equal(extractTaskContract(before).ok, true);
  const two = [body(JSON.stringify(contract())), '```json', '{"garbage":true}', '```'].join('\n');
  assert.equal(extractTaskContract(two).ok, true);
});

test('thieu marker, thieu khoi, khoi khong dong, khong phai JSON, JSON sai hop dong', () => {
  assert.equal(extractTaskContract('# chi co van xuoi').reason, REASONS.CONTRACT_MARKER_MISSING);
  assert.equal(
    extractTaskContract(`<!-- ${MARKERS.TASK_CONTRACT} -->\nvan xuoi`).reason,
    REASONS.CONTRACT_BLOCK_MISSING,
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
    REASONS.CONTRACT_BLOCK_MISSING,
  );
  assert.equal(
    extractTaskContract(body(JSON.stringify(contract()), { fence: '' })).reason,
    REASONS.CONTRACT_BLOCK_MISSING,
  );
});

test('marker cua hop dong la AUTOPILOT_TASK_V0 — dung marker dang dung o Issue #153', () => {
  assert.equal(MARKERS.TASK_CONTRACT, 'AUTOPILOT_TASK_V0');
  assert.equal(
    extractTaskContract(body(JSON.stringify(contract()), { marker: 'AUTOPILOT_TASK_V1' })).reason,
    REASONS.CONTRACT_MARKER_MISSING,
  );
});
