import { readFile } from 'node:fs/promises';

import { formatDeploymentPlan, validateGd1TestPreflight } from './gd1-test-preflight.mjs';

const inputPath = process.argv[2];
if (!inputPath) {
  console.error('Usage: node run-gd1-test-preflight.mjs <redacted-preflight-snapshot.json>');
  process.exitCode = 64;
} else {
  try {
    const input = JSON.parse(await readFile(inputPath, 'utf8'));
    const result = validateGd1TestPreflight(input);
    if (!result.ok) {
      console.error('Ultty GD1-test contract validation FAILED before build/deploy:');
      for (const error of result.errors) console.error(`- ${error}`);
      process.exitCode = 1;
    } else {
      console.log(
        'Ultty GD1-test contract validation PASSED for supplied redacted evidence. ' +
          'This validator does not collect live state or authorize deployment by itself.',
      );
      console.log('Deployment plan:');
      console.log(formatDeploymentPlan(result.plan));
    }
  } catch (error) {
    console.error(
      `Ultty GD1-test preflight input is invalid: ${error instanceof Error ? error.message : String(error)}`,
    );
    process.exitCode = 1;
  }
}
