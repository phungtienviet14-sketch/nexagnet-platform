import test from 'node:test';
import assert from 'node:assert/strict';
import { BLOCKED, DISPATCH_MARKER, STATE, parseDependencies, resolve } from './resolver.mjs';

const issue = (number, over = {}) => ({
  number,
  state: 'open',
  labels: [],
  body: '',
  comments: [],
  ...over,
});
const dependsOn = (n) => `Some prose a human wrote.\n\nAUTOPILOT_DEPENDS_ON=#${n}\n`;
const dispatched = [{ body: `${DISPATCH_MARKER} run=123` }];
const by = (results, n) => results.find((r) => r.number === n);

test('dependencies are read from a machine-readable line, not from prose', () => {
  assert.deepEqual(parseDependencies('blocked by #9 probably'), []);
  assert.deepEqual(parseDependencies(dependsOn(9)), [9]);
  assert.deepEqual(parseDependencies(`${dependsOn(9)}${dependsOn(9)}`), [9]);
  assert.deepEqual(parseDependencies(`${dependsOn(9)}${dependsOn(10)}`), [9, 10]);
});

test('B is not dispatched while A is still open', () => {
  const results = resolve([issue(1), issue(2, { body: dependsOn(1) })]);
  assert.equal(by(results, 2).action, 'HOLD');
  assert.equal(by(results, 2).reason, 'DEPENDENCY_NOT_COMPLETE');
  assert.deepEqual(by(results, 2).detail.unmet, [1]);
});

test('closing A makes B dispatchable', () => {
  const results = resolve([issue(1, { state: 'closed' }), issue(2, { body: dependsOn(1) })]);
  assert.equal(by(results, 2).action, 'DISPATCH');
  assert.equal(by(results, 2).detail.addLabel, STATE.READY);
});

test('labelling A done counts the same as closing it', () => {
  const results = resolve([issue(1, { labels: [STATE.DONE] }), issue(2, { body: dependsOn(1) })]);
  assert.equal(by(results, 2).action, 'DISPATCH');
});

// THE ONE THAT MATTERS. Events get delivered twice; starting a task twice is worse than
// never starting it.
test('a second run over the same state dispatches nothing', () => {
  const state = [issue(1, { state: 'closed' }), issue(2, { body: dependsOn(1) })];
  assert.equal(by(resolve(state), 2).action, 'DISPATCH');

  // The dispatch left its record on the issue, which is the only memory the resolver has.
  const after = [state[0], { ...state[1], comments: dispatched }];
  assert.equal(by(resolve(after), 2).action, 'HOLD');
  assert.equal(by(resolve(after), 2).reason, 'ALREADY_DISPATCHED');
  assert.equal(by(resolve(after), 2).action, 'HOLD', 'and a third run too');
});

test('the resolver is a pure function of what it can see', () => {
  const state = [issue(1, { state: 'closed' }), issue(2, { body: dependsOn(1) })];
  assert.deepEqual(resolve(state), resolve(structuredClone(state)));
});

test('a blocked issue is held whatever its dependencies say', () => {
  for (const label of Object.values(BLOCKED)) {
    const results = resolve([issue(1, { state: 'closed' }), issue(2, { body: dependsOn(1), labels: [label] })]);
    assert.equal(by(results, 2).action, 'HOLD', label);
    assert.equal(by(results, 2).reason, 'ISSUE_IS_BLOCKED', label);
    assert.deepEqual(by(results, 2).detail.blockers, [label]);
  }
});

test('a dependency the resolver cannot see is not assumed satisfied', () => {
  const results = resolve([issue(2, { body: dependsOn(404) })]);
  assert.equal(by(results, 2).action, 'HOLD');
  assert.equal(by(results, 2).reason, 'DEPENDENCY_NOT_VISIBLE');
});

test('an issue depending on itself is held, not dispatched forever', () => {
  const results = resolve([issue(2, { body: dependsOn(2) })]);
  assert.equal(by(results, 2).reason, 'DEPENDS_ON_ITSELF');
});

test('a mutual dependency deadlocks rather than dispatching both', () => {
  const results = resolve([issue(1, { body: dependsOn(2) }), issue(2, { body: dependsOn(1) })]);
  assert.equal(by(results, 1).action, 'HOLD');
  assert.equal(by(results, 2).action, 'HOLD');
});

test('a chain releases one link at a time', () => {
  const chain = [issue(1), issue(2, { body: dependsOn(1) }), issue(3, { body: dependsOn(2) })];
  let r = resolve(chain);
  assert.deepEqual([by(r, 1).action, by(r, 2).action, by(r, 3).action], ['DISPATCH', 'HOLD', 'HOLD']);

  chain[0] = { ...chain[0], state: 'closed' };
  r = resolve(chain);
  assert.deepEqual([by(r, 2).action, by(r, 3).action], ['DISPATCH', 'HOLD']);

  chain[1] = { ...chain[1], state: 'closed' };
  r = resolve(chain);
  assert.equal(by(r, 3).action, 'DISPATCH');
});

test('an already complete issue is never re-dispatched', () => {
  const results = resolve([issue(1, { state: 'closed' })]);
  assert.equal(by(results, 1).reason, 'ALREADY_COMPLETE');
});

test('labels may arrive as objects or as strings', () => {
  const results = resolve([issue(1, { labels: [{ name: STATE.DONE }] }), issue(2, { body: dependsOn(1) })]);
  assert.equal(by(results, 2).action, 'DISPATCH');
});
