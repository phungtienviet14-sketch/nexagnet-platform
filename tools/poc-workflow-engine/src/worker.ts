/**
 * Tien trinh worker — noi code nghiep vu thuc su chay.
 * Giet tien trinh nay giua chung la cach kiem "worker crash recovery" (§20).
 */
import { hatchet } from './hatchet-client.js';
import { automationProof, VERSION } from './workflow.js';

const slots = Number(process.env.POCWF_SLOTS ?? 5);

async function main() {
  const worker = await hatchet.worker('poc-worker-' + VERSION, {
    workflows: [automationProof],
    slots,
  });
  console.log('[worker] khoi dong version=' + VERSION + ' slots=' + slots + ' pid=' + process.pid);
  await worker.start();
}

main().catch((err) => {
  console.error('[worker] chet:', err);
  process.exit(1);
});
