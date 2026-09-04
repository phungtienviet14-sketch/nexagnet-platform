import { readFile, writeFile } from 'node:fs/promises';

import {
  collectGd1TestPreflight,
  formatDeploymentPlan,
  validateGd1TestPreflight,
} from './gd1-test-preflight.mjs';

const inputPath = process.argv[2];
// HO SO CHON CONG. Mac dinh (bien vang mat) la `ultty-gd1-test` — ho so NHIEU DOI HOI NHAT — nen
// mot bien bi mat tren duong truyen khong bao gio lam nhe cong nao; no chi lam mot ho so khac bi
// tu choi vi khong dat duoc cac phep kiem cua Ultty. Xem `gateSpecFor` trong gd1-test-preflight.mjs.
const profileId = process.env.DEPLOYMENT_PROFILE || undefined;
const gateLabel = profileId ?? 'ultty-gd1-test';

try {
  const result = inputPath
    ? validateGd1TestPreflight(JSON.parse(await readFile(inputPath, 'utf8')), { profileId })
    : await collectGd1TestPreflight({ profileId });
  if (!result.ok) {
    console.error(`GD1-test no-mock preflight FAILED before build/deploy (${gateLabel}):`);
    for (const error of result.errors) console.error(`- ${error}`);
    process.exitCode = 1;
  } else {
    console.log(
      inputPath
        ? `GD1-test contract validation PASSED for supplied redacted evidence (${gateLabel}).`
        : `GD1-test live no-mock preflight PASSED (${gateLabel}).`,
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
      await writeFile(process.env.GD1_TEST_PREFLIGHT_OUTPUT, `${JSON.stringify(machineProof)}\n`, {
        encoding: 'utf8',
        mode: 0o600,
      });
    }
  }
} catch (error) {
  console.error(
    `GD1-test preflight input is invalid: ${error instanceof Error ? error.message : String(error)}`,
  );
  process.exitCode = 1;
}
