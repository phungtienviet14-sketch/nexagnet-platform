#!/usr/bin/env node
/**
 * POC-2 deterministic check.
 *
 * This file is the SPEC. `fixture.json` is the DATA. The autopilot fixer is scoped to
 * the data only — it must never be able to make a red check green by editing the check
 * itself, which is the failure mode that would make an auto-fixing pipeline worthless.
 *
 * No network, no database, no dependency on repository business code.
 */
import { readFileSync } from 'node:fs';
import { fileURLToPath } from 'node:url';
import { dirname, join } from 'node:path';

const here = dirname(fileURLToPath(import.meta.url));
const ID_PATTERN = /^poc-\d{3}$/;

export function checkFixture(fixture) {
  const failures = [];
  const rows = Array.isArray(fixture?.rows) ? fixture.rows : [];

  // INVARIANT 1 — declaredCount must equal the number of rows actually present.
  if (fixture?.declaredCount !== rows.length) {
    failures.push(
      `declaredCount is ${JSON.stringify(fixture?.declaredCount)} but rows.length is ${rows.length}`,
    );
  }

  // INVARIANT 2 — every row id must match /^poc-\d{3}$/.
  for (const [index, row] of rows.entries()) {
    if (!ID_PATTERN.test(String(row?.id ?? ''))) {
      failures.push(`rows[${index}].id ${JSON.stringify(row?.id)} does not match the required poc-NNN pattern (lowercase poc, hyphen, three digits)`);
    }
  }

  // INVARIANT 3 — row ids must be unique.
  const seen = new Set();
  for (const row of rows) {
    const id = String(row?.id ?? '');
    if (seen.has(id)) failures.push(`duplicate row id ${JSON.stringify(id)}`);
    seen.add(id);
  }

  return failures;
}

function main() {
  const fixture = JSON.parse(readFileSync(join(here, 'fixture.json'), 'utf8'));
  const failures = checkFixture(fixture);
  for (const f of failures) console.error(`AUTOPILOT_POC_CI_VIOLATION: ${f}`);
  if (failures.length > 0) {
    console.error(`AUTOPILOT_POC_CI_RESULT=FAIL violations=${failures.length}`);
    process.exit(1);
  }
  console.log('AUTOPILOT_POC_CI_RESULT=PASS violations=0');
}

if (process.argv[1] && fileURLToPath(import.meta.url) === process.argv[1]) main();
