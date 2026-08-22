/**
 * Tien trinh worker cua SPIKE — dang ky DUNG MOT workflow: phien ban cua chinh no.
 *
 * "Dung mot" la co y va la trong tam cua ca phep do. Neu mot tien trinh dang ky ca `:v1` lan
 * `:v2` thi khong con phan biet duoc "engine dinh tuyen theo ten" hay "worker tinh co co code".
 * Mot ban trien khai that cung se nhu vay: mot container = mot phien ban code.
 */
import { hatchet } from './hatchet-client.js';
import { spikeWorkflow, VERSION, STRATEGY, WORKFLOW_NAME, WORKER_NAME } from './spike-workflow.js';

async function main(): Promise<void> {
  const worker = await hatchet.worker(WORKER_NAME, {
    workflows: [spikeWorkflow],
    slots: Number(process.env.POCWF_SLOTS ?? 5),
  });
  // Dong nay la giao ke giua worker va orchestrator: `version-spike.ts` cho no truoc khi trigger.
  console.log(
    `[spike-worker] READY strategy=${STRATEGY} version=${VERSION} workflow=${WORKFLOW_NAME} pid=${process.pid}`,
  );
  await worker.start();
}

main().catch((error) => {
  console.error('[spike-worker] chet:', error);
  process.exit(1);
});
