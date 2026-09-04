import assert from 'node:assert/strict';
import { readFileSync } from 'node:fs';
import { test } from 'node:test';

import { MARKERS, MESSAGE_TYPES } from '../validator/constants.mjs';
import { REASONS } from '../validator/reasons.mjs';
import {
  SCHEMA_PATHS,
  listMessageSchemaFiles,
  validateMessagePayload,
  validateTaskContractSchema,
} from '../validator/schemas.mjs';
import { SHA_A, contract, message } from './helpers.mjs';

const NINE = Object.values(MESSAGE_TYPES);

test('du 9 loai thong diep bat buoc, moi loai co dung mot tep schema, khong tep mo coi', () => {
  assert.equal(NINE.length, 9);
  const expected = NINE.map(
    (type) => `${type.toLowerCase().replace(/_/g, '-')}.schema.json`,
  ).sort();
  assert.deepEqual(listMessageSchemaFiles(), expected);
  for (const type of NINE)
    assert.ok(
      SCHEMA_PATHS.messages[type].endsWith(
        expected.find((f) => f.startsWith(type.toLowerCase().replace(/_/g, '-'))),
      ),
    );
});

test('moi schema la draft 2020-12, co $id rieng, va khoa marker + type bang const', () => {
  for (const type of NINE) {
    const schema = JSON.parse(readFileSync(SCHEMA_PATHS.messages[type], 'utf8'));
    assert.equal(schema.$schema, 'https://json-schema.org/draft/2020-12/schema', type);
    assert.match(schema.$id, /^urn:nexagnet:autopilot:v0:message:/, type);
    assert.equal(schema.properties.marker.const, MARKERS[type], type);
    assert.equal(schema.properties.type.const, type, type);
    assert.equal(schema.additionalProperties, false, `${type}: truong la phai bi tu choi`);
  }
});

test('thong diep mau hop le cua ca 9 loai qua schema', () => {
  for (const type of NINE)
    assert.deepEqual(validateMessagePayload(type, message(type)), { ok: true }, type);
});

test('thieu truong bat buoc => SCHEMA_VIOLATION, chi ro truong nao', () => {
  const required = {
    TASK_READY: ['issue', 'risk'],
    BUILD_STARTED: ['issue', 'branch', 'base_sha'],
    BUILD_READY: ['issue', 'pr', 'head_sha'],
    CI_FAIL: ['issue', 'pr', 'head_sha', 'ci_run'],
    REVIEW_REQUEST: ['issue', 'pr', 'head_sha', 'ci_run', 'risk'],
    REVIEW_PASS: ['issue', 'pr', 'head_sha'],
    REVIEW_BLOCK: ['issue', 'pr', 'head_sha', 'blockers'],
    RUNTIME_PROOF: ['issue', 'pr', 'release_sha', 'env', 'deploy_run', 'verdict'],
    TASK_DONE: ['issue', 'merge_sha', 'runtime_verified'],
  };
  for (const [type, fields] of Object.entries(required)) {
    for (const field of fields) {
      const { [field]: _dropped, ...partial } = message(type);
      const result = validateMessagePayload(type, partial);
      assert.equal(result.ok, false, `${type} thieu ${field}`);
      assert.equal(result.reason, REASONS.SCHEMA_VIOLATION);
      assert.ok(
        result.detail.errors.some((e) => e.params?.missingProperty === field),
        `${type}: bao thieu ${field}`,
      );
    }
  }
});

test('SHA rut gon, SHA chu hoa, SHA 39 ky tu deu bi tu choi — chi nhan 40 hex chu thuong', () => {
  for (const bad of ['abc123', SHA_A.toUpperCase(), SHA_A.slice(1), `${SHA_A}a`, 'g'.repeat(40)]) {
    const result = validateMessagePayload('REVIEW_PASS', message('REVIEW_PASS', { head_sha: bad }));
    assert.equal(result.ok, false, bad);
    assert.equal(result.detail.errors[0].path, '/head_sha');
  }
});

test('truong la, marker sai, type sai, enum sai, so am, boolean dang chuoi => tu choi', () => {
  const cases = [
    ['TASK_READY', { extra: 1 }],
    ['TASK_READY', { marker: 'AUTOPILOT_TASK_DONE_V0' }],
    ['TASK_READY', { type: 'TASK_DONE' }],
    ['TASK_READY', { risk: 'CRITICAL' }],
    ['TASK_READY', { issue: 0 }],
    ['TASK_READY', { issue: '200' }],
    ['TASK_DONE', { runtime_verified: 'true' }],
    ['RUNTIME_PROOF', { verdict: 'MAYBE' }],
    ['RUNTIME_PROOF', { env: 'GD1 TEST' }],
    ['REVIEW_BLOCK', { blockers: [] }],
    ['REVIEW_BLOCK', { blockers: [''] }],
    ['BUILD_STARTED', { protocol: 'V1' }],
  ];
  for (const [type, fields] of cases) {
    assert.equal(
      validateMessagePayload(type, message(type, fields)).ok,
      false,
      `${type} ${JSON.stringify(fields)}`,
    );
  }
});

test('loai thong diep khong biet => UNKNOWN_MESSAGE_TYPE', () => {
  assert.equal(validateMessagePayload('TASK_STARTED', {}).reason, REASONS.UNKNOWN_MESSAGE_TYPE);
});

test('schema hop dong: du 9 truong toi thieu cua #153 la bat buoc', () => {
  const schema = JSON.parse(readFileSync(SCHEMA_PATHS.taskContract, 'utf8'));
  for (const field of [
    'goal',
    'context',
    'scope',
    'out_of_scope',
    'acceptance',
    'risk',
    'human_gate',
    'dependencies',
    'runtime_proof',
  ]) {
    assert.ok(schema.required.includes(field), field);
    const { [field]: _dropped, ...partial } = contract();
    assert.equal(validateTaskContractSchema(partial).ok, false, `thieu ${field}`);
  }
  assert.deepEqual(validateTaskContractSchema(contract()), { ok: true });
});
