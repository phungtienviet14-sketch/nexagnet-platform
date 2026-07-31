import { readFile, writeFile } from 'node:fs/promises';

await patchExactly(
  '/usr/local/lib/node_modules/flowise/node_modules/flowise-components/dist/nodes/chatmodels/Deepseek/Deepseek.js',
  `        if (thinking) {
            obj.modelKwargs = {
                ...obj.modelKwargs,
                thinking: { type: 'enabled' }
            };
        }`,
  `        if (typeof thinking === 'boolean') {
            obj.modelKwargs = {
                ...obj.modelKwargs,
                thinking: { type: thinking ? 'enabled' : 'disabled' }
            };
        }`,
  'DeepSeek thinking toggle',
);

await patchExactly(
  '/usr/local/lib/node_modules/flowise/dist/utils/buildAgentflow.js',
  `    result.executionId = newExecution.id;
    result.agentFlowExecutedData = agentFlowExecutedData;`,
  `    result.executionId = newExecution.id;
    if (Array.isArray(lastNodeOutput?.result)) {
        result.json = { result: lastNodeOutput.result };
    }
    result.agentFlowExecutedData = agentFlowExecutedData;`,
  'Agentflow structured response.json',
);

async function patchExactly(target, before, after, label) {
  const source = await readFile(target, 'utf8');
  const matches = source.split(before).length - 1;
  if (matches !== 1) {
    throw new Error(`Tu choi patch ${label}: mong 1 doan nguon, nhan ${matches}.`);
  }
  await writeFile(target, source.replace(before, after), 'utf8');
}
