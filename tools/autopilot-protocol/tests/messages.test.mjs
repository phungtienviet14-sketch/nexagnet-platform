import assert from 'node:assert/strict';
import { test } from 'node:test';

import { MESSAGE_TYPES } from '../validator/constants.mjs';
import { formatMessage, parseMessage, readMessage } from '../validator/messages.mjs';
import { REASONS } from '../validator/reasons.mjs';
import { SHA_A, message } from './helpers.mjs';

const lines = (...rows) => rows.join('\n');

test('roundtrip: JSON canonical -> van ban -> JSON canonical, ca 9 loai', () => {
  for (const type of Object.values(MESSAGE_TYPES)) {
    const original = message(type);
    const text = formatMessage(original);
    assert.ok(text.startsWith(`<!-- ${original.marker} -->\n${type}\n`), type);
    const back = readMessage(text);
    assert.equal(back.ok, true, `${type}: ${JSON.stringify(back)}`);
    assert.deepEqual(back.message, original, type);
  }
});

test('vi du REVIEW_REQUEST cua #153 (voi SHA 40 hex) doc ra dung kieu tung truong', () => {
  const text = lines(
    '<!-- AUTOPILOT_REVIEW_REQUEST_V0 -->',
    'REVIEW_REQUEST',
    'ISSUE=200',
    'PR=201',
    `HEAD_SHA=${SHA_A}`,
    'CI_RUN=888',
    'RISK=MEDIUM',
  );
  const result = readMessage(text);
  assert.equal(result.ok, true);
  assert.deepEqual(result.message, {
    protocol: 'V0',
    marker: 'AUTOPILOT_REVIEW_REQUEST_V0',
    type: 'REVIEW_REQUEST',
    issue: 200,
    pr: 201,
    head_sha: SHA_A,
    ci_run: 888,
    risk: 'MEDIUM',
  });
});

test('REVIEW_BLOCK mang danh sach BLOCKERS: nhieu dong "- "', () => {
  const text = lines(
    '<!-- CHATGPT_REVIEW_V0 -->',
    'REVIEW_BLOCK',
    'ISSUE=200',
    'PR=201',
    `HEAD_SHA=${SHA_A}`,
    'BLOCKERS:',
    '- thieu test cho cong CI',
    '- ten bien sai quy uoc',
  );
  const result = readMessage(text);
  assert.equal(result.ok, true);
  assert.deepEqual(result.message.blockers, ['thieu test cho cong CI', 'ten bien sai quy uoc']);
});

test('van ban tu do khong co marker => NO_MARKER — khong bao gio la thong diep', () => {
  assert.equal(readMessage('REVIEW_PASS\nISSUE=200').reason, REASONS.NO_MARKER);
  assert.equal(readMessage('').reason, REASONS.NO_MARKER);
  assert.equal(readMessage('Toi nghi PR nay REVIEW_PASS roi').reason, REASONS.NO_MARKER);
});

test('marker trong trich dan (> ) hay giua dong khong khop => khong kich hoat', () => {
  assert.equal(
    parseMessage('> <!-- CHATGPT_REVIEW_V0 -->\n> REVIEW_PASS').reason,
    REASONS.NO_MARKER,
  );
  assert.equal(parseMessage('xem <!-- CHATGPT_REVIEW_V0 --> o tren').reason, REASONS.NO_MARKER);
});

test('hai marker trong mot comment => MULTIPLE_MARKERS (mo ho thi tu choi)', () => {
  const text = lines(
    '<!-- CHATGPT_REVIEW_V0 -->',
    'REVIEW_PASS',
    'ISSUE=1',
    '',
    '<!-- AUTOPILOT_TASK_DONE_V0 -->',
    'TASK_DONE',
  );
  assert.equal(parseMessage(text).reason, REASONS.MULTIPLE_MARKERS);
});

test('marker khong biet, thieu dong type, type la, marker/type khong khop', () => {
  assert.equal(
    parseMessage('<!-- AUTOPILOT_FOO_V0 -->\nTASK_READY').reason,
    REASONS.UNKNOWN_MARKER,
  );
  assert.equal(parseMessage('<!-- AUTOPILOT_TASK_READY_V0 -->').reason, REASONS.MISSING_TYPE_LINE);
  assert.equal(
    parseMessage('<!-- AUTOPILOT_TASK_READY_V0 -->\nISSUE=1').reason,
    REASONS.MISSING_TYPE_LINE,
    'dong sau marker khong phai TYPE',
  );
  assert.equal(
    parseMessage('<!-- AUTOPILOT_TASK_READY_V0 -->\nTASK_STARTED').reason,
    REASONS.UNKNOWN_MESSAGE_TYPE,
  );
  assert.equal(
    parseMessage('<!-- CHATGPT_REVIEW_V0 -->\nTASK_DONE').reason,
    REASONS.MARKER_TYPE_MISMATCH,
  );
  assert.equal(
    parseMessage('<!-- AUTOPILOT_TASK_READY_V0 -->\nREVIEW_PASS').reason,
    REASONS.MARKER_TYPE_MISMATCH,
  );
});

test('dong sai dang trong khoi payload => MALFORMED_LINE, khong bo qua', () => {
  const text = lines(
    '<!-- AUTOPILOT_TASK_READY_V0 -->',
    'TASK_READY',
    'ISSUE=200',
    'day la mot dong van xuoi',
    'RISK=MEDIUM',
  );
  const result = parseMessage(text);
  assert.equal(result.reason, REASONS.MALFORMED_LINE);
  assert.equal(result.detail.line, 4);
});

test('khoa lap, truong la, gia tri sai kieu, danh sach rong', () => {
  const head = ['<!-- AUTOPILOT_TASK_READY_V0 -->', 'TASK_READY'];
  assert.equal(parseMessage(lines(...head, 'ISSUE=1', 'ISSUE=2')).reason, REASONS.DUPLICATE_KEY);
  assert.equal(parseMessage(lines(...head, 'ISSUE=1', 'COLOR=red')).reason, REASONS.UNKNOWN_FIELD);
  assert.equal(parseMessage(lines(...head, 'ISSUE=abc')).reason, REASONS.BAD_FIELD_VALUE);
  assert.equal(parseMessage(lines(...head, 'ISSUE=0')).reason, REASONS.BAD_FIELD_VALUE);
  assert.equal(
    parseMessage(lines(...head, 'ISSUE=1', 'HUMAN_GATE=yes')).reason,
    REASONS.BAD_FIELD_VALUE,
  );
  assert.equal(parseMessage(lines(...head, 'ISSUE=1', 'RISK=')).reason, REASONS.BAD_FIELD_VALUE);
  assert.equal(
    parseMessage(lines('<!-- CHATGPT_REVIEW_V0 -->', 'REVIEW_BLOCK', 'ISSUE=1', 'BLOCKERS:'))
      .reason,
    REASONS.EMPTY_LIST,
  );
  assert.equal(parseMessage(lines(...head, 'ISSUE:', '- 1')).reason, REASONS.MALFORMED_LINE);
});

test('SHA toan chu so van la chuoi — kieu theo bang FIELD_TYPES, khong doan tu gia tri', () => {
  const digits = '1'.repeat(40);
  const result = readMessage(
    lines('<!-- CHATGPT_REVIEW_V0 -->', 'REVIEW_PASS', 'ISSUE=200', 'PR=201', `HEAD_SHA=${digits}`),
  );
  assert.equal(result.ok, true);
  assert.equal(result.message.head_sha, digits);
  assert.equal(typeof result.message.head_sha, 'string');
});

test('dong trong ket thuc payload; loi nguoi phia sau va CRLF khong anh huong', () => {
  const text = [
    '<!-- CHATGPT_REVIEW_V0 -->',
    'REVIEW_PASS',
    'ISSUE=200',
    'PR=201',
    `HEAD_SHA=${SHA_A}`,
    '',
    'Ghi chu: da doc ky, day la dong van xuoi voi = va : ben trong.',
  ].join('\r\n');
  const result = readMessage(text);
  assert.equal(result.ok, true);
  assert.deepEqual(Object.keys(result.message), [
    'protocol',
    'marker',
    'type',
    'issue',
    'pr',
    'head_sha',
  ]);
});

test('formatMessage tu choi protocol khac V0', () => {
  assert.throws(() => formatMessage({ ...message('TASK_READY'), protocol: 'V1' }), /V0/);
});
