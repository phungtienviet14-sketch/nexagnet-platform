import { readFile, writeFile } from 'node:fs/promises';

import {
  collectGd1TestPreflight,
  formatDeploymentPlan,
  validateGd1TestPreflight,
} from './gd1-test-preflight.mjs';

const inputPath = process.argv[2];

try {
  const result = inputPath
    ? validateGd1TestPreflight(JSON.parse(await readFile(inputPath, 'utf8')))
    : await collectGd1TestPreflight();
  if (!result.ok) {
    console.error('Ultty GD1-test no-mock preflight FAILED before build/deploy:');
    for (const error of result.errors) console.error(`- ${error}`);
    process.exitCode = 1;
  } else {
    console.log(
      inputPath
        ? 'Ultty GD1-test contract validation PASSED for supplied redacted evidence.'
        : 'Ultty GD1-test live no-mock preflight PASSED.',
    );
    console.log('Deployment plan:');
    console.log(formatDeploymentPlan(result.plan));
    if (!inputPath && process.env.GD1_TEST_PREFLIGHT_OUTPUT) {
      const machineProof = {
        plan: result.plan,
        rollback: result.input?.deployment?.rollback,
        // Lan deploy dau khong co anh cu de quay ve. Phia shell phai biet dieu do tu day, neu
        // khong no se doi hai digest va chan dung lan deploy dau tien — lan duy nhat chac chan
        // khong the co digest nao.
        firstRelease: result.plan?.firstRelease === true,
      };
      await writeFile(
        process.env.GD1_TEST_PREFLIGHT_OUTPUT,
        `${JSON.stringify(machineProof)}\n`,
        { encoding: 'utf8', mode: 0o600 },
      );
    }
  }
} catch (error) {
  console.error(
    `Ultty GD1-test preflight input is invalid: ${error instanceof Error ? error.message : String(error)}`,
  );
  process.exitCode = 1;
}
