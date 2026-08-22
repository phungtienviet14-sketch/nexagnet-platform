/** Doc lai mot run qua SDK — de kiem chung "operator nhin thay gi" bang du lieu, khong doan. */
import { hatchet } from './hatchet-client.js';

const id = process.argv[2];
if (!id) throw new Error('usage: tsx src/inspect.ts <runId>');

const details = (await hatchet.runs.get(id)) as unknown as {
  run: Record<string, unknown>;
  tasks?: Array<Record<string, unknown>>;
};

console.log('--- RUN ---');
console.log(
  JSON.stringify(
    {
      status: details.run.status,
      duration: details.run.duration,
      workflowVersionId: details.run.workflowVersionId,
      additionalMetadata: details.run.additionalMetadata,
      output: details.run.output,
    },
    null,
    2,
  ),
);

console.log('--- TASKS ---');
for (const t of details.tasks ?? []) {
  console.log(
    JSON.stringify({
      taskName: t.taskName ?? t.displayName,
      status: t.status,
      attempt: t.attempt ?? t.retryCount,
      errorMessage: t.errorMessage,
      output: t.output,
    }),
  );
}
