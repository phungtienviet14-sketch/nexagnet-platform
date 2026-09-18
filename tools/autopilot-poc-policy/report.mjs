#!/usr/bin/env node
/** Prints the policy's answer for a few representative tasks, so a reader can see the
 *  shape of the decisions without reading the test file. */
import { readFileSync } from 'node:fs';
import { fileURLToPath } from 'node:url';
import { dirname, join } from 'node:path';
import { decide } from './policy.mjs';

const here = dirname(fileURLToPath(import.meta.url));
const policy = JSON.parse(readFileSync(join(here, 'policy.json'), 'utf8'));

const green = (over) => ({
  changedPaths: ['docs/poc/autopilot/note.md'],
  topics: [],
  ownershipOverlapWith: [],
  customerAuthority: 'present',
  businessSource: 'present',
  ciAttempts: 0,
  runtimeAttempts: 0,
  ci: 'green',
  review: 'ALLOW',
  ...over,
});

const cases = [
  ['docs only, all gates green', green()],
  ['ordinary app code, all gates green', green({ changedPaths: ['apps/web/app/page.tsx'] })],
  ['touches auth, all gates green', green({ changedPaths: ['apps/api/src/auth/token.ts'] })],
  ['declared topic: price', green({ topics: ['price'] })],
  ['another agent owns these files', green({ ownershipOverlapWith: ['#77'] })],
  ['no customer authority on file', green({ customerAuthority: 'missing' })],
  ['CI red, at the retry cap', green({ ci: 'red', ciAttempts: policy.maxAttempts.ci })],
  ['runtime proof failed twice', green({ runtimeAttempts: policy.maxAttempts.runtime })],
  ['nothing reported at all', {}],
];

for (const [label, task] of cases) {
  const d = decide(task, policy);
  console.log(`POLICY | ${d.risk.padEnd(6)} | ${d.outcome.padEnd(24)} | ${label}`);
}
