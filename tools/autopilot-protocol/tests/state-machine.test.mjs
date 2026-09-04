import assert from 'node:assert/strict';
import { test } from 'node:test';

import { EVENTS, STATES, TERMINAL_STATES } from '../validator/constants.mjs';
import { REASONS } from '../validator/reasons.mjs';
import {
  NO_STATE,
  TRANSITIONS,
  isTerminal,
  legalEventsFrom,
  nextState,
} from '../validator/state-machine.mjs';

const { READY, RUNNING, CI, FIXING, REVIEWING, RUNTIME_PROOF, DONE, BLOCKED } = STATES;
const ACTIVE = [READY, RUNNING, CI, FIXING, REVIEWING, RUNTIME_PROOF];

const walk = (from, events) =>
  events.reduce((state, event) => {
    const step = nextState(state, event);
    assert.equal(step.ok, true, `${state} --${event}--> ? : ${JSON.stringify(step)}`);
    return step.to;
  }, from);

test('tam trang thai tho dung nhu #153; MERGED la su kien, khong phai trang thai', () => {
  assert.deepEqual(Object.values(STATES), [
    'READY',
    'RUNNING',
    'CI',
    'FIXING',
    'REVIEWING',
    'RUNTIME_PROOF',
    'DONE',
    'BLOCKED',
  ]);
  assert.ok(!Object.values(STATES).includes('MERGED'));
  assert.equal(EVENTS.MERGED, 'MERGED');
  assert.deepEqual([...TERMINAL_STATES], [DONE, BLOCKED]);
});

test('vong doi chinh: READY -> RUNNING -> CI -> REVIEWING -(MERGED)-> RUNTIME_PROOF -> DONE', () => {
  const end = walk(NO_STATE, [
    'TASK_READY',
    'BUILD_STARTED',
    'BUILD_READY',
    'REVIEW_REQUEST',
    'REVIEW_PASS',
    'MERGED',
    'RUNTIME_PROOF',
    'TASK_DONE',
  ]);
  assert.equal(end, DONE);
});

test('vong sua cho phep: CI -> FIXING -> CI va REVIEWING -> FIXING -> CI', () => {
  assert.equal(walk(CI, ['CI_FAIL', 'BUILD_READY']), CI);
  assert.equal(walk(REVIEWING, ['REVIEW_BLOCK', 'BUILD_READY']), CI);
  assert.equal(walk(REVIEWING, ['BUILD_READY']), CI, 'commit moi luc dang review => quay ve CI');
});

test('nhay trang thai bat hop phap => ILLEGAL_TRANSITION (fail closed)', () => {
  const illegal = [
    [READY, 'REVIEW_REQUEST'],
    [READY, 'BUILD_READY'],
    [READY, 'TASK_DONE'],
    [RUNNING, 'REVIEW_REQUEST'],
    [RUNNING, 'MERGED'],
    [RUNNING, 'RUNTIME_PROOF'],
    [CI, 'REVIEW_PASS'],
    [CI, 'MERGED'],
    [CI, 'TASK_DONE'],
    [FIXING, 'REVIEW_REQUEST'],
    [FIXING, 'REVIEW_PASS'],
    [FIXING, 'MERGED'],
    [REVIEWING, 'CI_FAIL'],
    [REVIEWING, 'TASK_DONE'],
    [REVIEWING, 'RUNTIME_PROOF'],
    [RUNTIME_PROOF, 'BUILD_READY'],
    [RUNTIME_PROOF, 'REVIEW_PASS'],
    [RUNTIME_PROOF, 'MERGED'],
    [NO_STATE, 'BUILD_STARTED'],
    [NO_STATE, 'TASK_DONE'],
    [READY, 'TASK_READY'],
    [CI, 'BUILD_STARTED'],
  ];
  for (const [from, event] of illegal) {
    const step = nextState(from, event);
    assert.equal(step.ok, false, `${from} --${event}`);
    assert.equal(step.reason, REASONS.ILLEGAL_TRANSITION, `${from} --${event}`);
  }
});

test('DONE va BLOCKED la cuoi: moi su kien, ke ca EXCEPTION, deu TERMINAL_STATE', () => {
  for (const terminal of [DONE, BLOCKED]) {
    for (const event of Object.values(EVENTS)) {
      assert.equal(
        nextState(terminal, event).reason,
        REASONS.TERMINAL_STATE,
        `${terminal} --${event}`,
      );
    }
    assert.equal(isTerminal(terminal), true);
    assert.deepEqual(legalEventsFrom(terminal), []);
  }
});

test('EXCEPTION vao BLOCKED tu MOI trang thai song, va chi tu do', () => {
  for (const from of ACTIVE) assert.equal(nextState(from, 'EXCEPTION').to, BLOCKED, from);
  assert.equal(
    nextState(NO_STATE, 'EXCEPTION').reason,
    REASONS.ILLEGAL_TRANSITION,
    'chua co task thi khong co gi de chan',
  );
});

test('trang thai/su kien khong biet => UNKNOWN_*, khong lot qua thanh ILLEGAL', () => {
  assert.equal(nextState('MERGED', 'TASK_DONE').reason, REASONS.UNKNOWN_STATE);
  assert.equal(nextState('ready', 'BUILD_STARTED').reason, REASONS.UNKNOWN_STATE);
  assert.equal(nextState(CI, 'CI_PASS').reason, REASONS.UNKNOWN_EVENT);
  assert.equal(nextState(CI, '').reason, REASONS.UNKNOWN_EVENT);
});

test('bang chuyen kin: moi canh chi tro toi trang thai/su kien da khai; moi trang thai song co loi ra', () => {
  const states = new Set(Object.values(STATES));
  const events = new Set(Object.values(EVENTS));
  for (const t of TRANSITIONS) {
    assert.ok(t.from === NO_STATE || states.has(t.from), `from ${t.from}`);
    assert.ok(states.has(t.to), `to ${t.to}`);
    assert.ok(events.has(t.event), `event ${t.event}`);
    assert.ok(!TERMINAL_STATES.includes(t.from), `khong co canh ra khoi ${t.from}`);
  }
  for (const from of ACTIVE)
    assert.ok(
      legalEventsFrom(from).length >= 2,
      `${from} phai co it nhat mot loi ra ngoai EXCEPTION`,
    );
  const seen = new Set(TRANSITIONS.map((t) => `${t.from}|${t.event}`));
  assert.equal(
    seen.size,
    TRANSITIONS.length,
    'khong co cap (from,event) nao lap — may trang thai tat dinh',
  );
});
