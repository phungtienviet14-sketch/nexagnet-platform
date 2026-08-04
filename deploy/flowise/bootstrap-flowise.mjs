import { chmod, mkdir, readFile, writeFile } from 'node:fs/promises';
import { dirname, resolve } from 'node:path';
import process from 'node:process';
import { fileURLToPath } from 'node:url';

const scriptDir = dirname(fileURLToPath(import.meta.url));
const artifactPath = resolve(scriptDir, 'zalo-order-parser-v1.json');
const baseUrl = requiredEnv('FLOWISE_BASE_URL').replace(/\/+$/, '');
const adminEmail = requiredEnv('FLOWISE_ADMIN_EMAIL');
const adminPassword = requiredEnv('FLOWISE_ADMIN_PASSWORD');
const deepSeekApiKey = requiredEnv('DEEPSEEK_API_KEY');
const runtimeEnvPath = resolve(process.env.FLOWISE_RUNTIME_ENV_PATH ?? '.runtime/flowise.env');

const artifact = validateArtifact(JSON.parse(await readFile(artifactPath, 'utf8')));
const cookie = await ensureLogin();
const credential = await ensureDeepSeekCredential(cookie);
const predictionKey = await ensurePredictionApiKey(cookie);
const flow = await ensureFlow(cookie, credential.id, predictionKey.id);

await mkdir(dirname(runtimeEnvPath), { recursive: true });
await writeFile(
  runtimeEnvPath,
  [`FLOWISE_FLOW_ID=${flow.id}`, `FLOWISE_API_KEY=${predictionKey.apiKey}`, ''].join('\n'),
  { encoding: 'utf8', mode: 0o600 },
);
await chmod(runtimeEnvPath, 0o600);

process.stdout.write(`Flowise bootstrap OK: ${artifact.name} (${flow.id}); runtime env da ghi an toan.\n`);

async function ensureLogin() {
  let login = await loginRequest();
  if (login.ok) return login.cookie;

  const registerResponse = await fetch(`${baseUrl}/api/v1/account/register`, {
    method: 'POST',
    headers: { 'Content-Type': 'application/json' },
    body: JSON.stringify({
      user: {
        name: 'NetViet Operator',
        email: adminEmail,
        credential: adminPassword,
      },
      organization: {},
      organizationUser: {},
      workspace: {},
      workspaceUser: {},
      role: {},
    }),
  });
  if (!registerResponse.ok) {
    throw await httpError('Dang ky Flowise admin', registerResponse);
  }

  login = await loginRequest();
  if (!login.ok) throw new Error('Khong dang nhap duoc Flowise sau khi bootstrap tai khoan admin.');
  return login.cookie;
}

async function loginRequest() {
  const response = await fetch(`${baseUrl}/api/v1/auth/login`, {
    method: 'POST',
    headers: { 'Content-Type': 'application/json' },
    body: JSON.stringify({ email: adminEmail, password: adminPassword }),
  });
  if (!response.ok) return { ok: false, cookie: '' };

  const setCookies =
    typeof response.headers.getSetCookie === 'function'
      ? response.headers.getSetCookie()
      : [response.headers.get('set-cookie') ?? ''];
  const cookie = setCookies
    .map((value) => value.split(';', 1)[0])
    .filter(Boolean)
    .join('; ');
  if (!cookie) throw new Error('Flowise login thanh cong nhung khong tra auth cookie.');
  return { ok: true, cookie };
}

async function ensureDeepSeekCredential(cookie) {
  const credentials = await apiJson(
    `/api/v1/credentials?credentialName=deepseekApi`,
    { method: 'GET' },
    cookie,
  );
  const existing = asArray(credentials).find((item) => item.name === 'zalo-deepseek');
  const body = {
    name: 'zalo-deepseek',
    credentialName: 'deepseekApi',
    plainDataObj: { deepseekApiKey: deepSeekApiKey },
  };
  if (existing) {
    return apiJson(
      `/api/v1/credentials/${encodeURIComponent(existing.id)}`,
      { method: 'PUT', body: JSON.stringify(body) },
      cookie,
    );
  }
  return apiJson('/api/v1/credentials', { method: 'POST', body: JSON.stringify(body) }, cookie);
}

async function ensurePredictionApiKey(cookie) {
  let keys = asArray(await apiJson('/api/v1/apikey', { method: 'GET' }, cookie));
  let key = keys.find((item) => item.keyName === 'zalo-order-parser-prediction');
  if (!key) {
    keys = asArray(
      await apiJson(
        '/api/v1/apikey',
        {
          method: 'POST',
          body: JSON.stringify({
            keyName: 'zalo-order-parser-prediction',
            permissions: ['agentflows:view'],
          }),
        },
        cookie,
      ),
    );
    key = keys.find((item) => item.keyName === 'zalo-order-parser-prediction');
  }
  if (!key?.id || !key?.apiKey) throw new Error('Flowise khong tra API key vua tao.');
  return key;
}

async function ensureFlow(cookie, credentialId, apiKeyId) {
  const flowData = structuredClone(artifact.flow);
  const llmNode = flowData.nodes.find((node) => node.id === 'llmAgentflow_0');
  if (!llmNode) throw new Error('Artifact thieu llmAgentflow_0.');
  llmNode.data.inputs.llmModelConfig.FLOWISE_CREDENTIAL_ID = credentialId;

  const flows = asArray(await apiJson('/api/v1/chatflows', { method: 'GET' }, cookie));
  const existing = flows.find((item) => item.name === artifact.name);
  const body = {
    name: artifact.name,
    description: artifact.description,
    type: 'AGENTFLOW',
    flowData: JSON.stringify(flowData),
    deployed: true,
    isPublic: false,
    apikeyid: apiKeyId,
  };
  if (existing) {
    return apiJson(
      `/api/v1/chatflows/${encodeURIComponent(existing.id)}`,
      { method: 'PUT', body: JSON.stringify(body) },
      cookie,
    );
  }
  return apiJson('/api/v1/chatflows', { method: 'POST', body: JSON.stringify(body) }, cookie);
}

async function apiJson(path, init, cookie) {
  const response = await fetch(`${baseUrl}${path}`, {
    ...init,
    headers: {
      'Content-Type': 'application/json',
      Cookie: cookie,
      'x-request-from': 'internal',
      ...(init.headers ?? {}),
    },
  });
  if (!response.ok) throw await httpError(`${init.method ?? 'GET'} ${path}`, response);
  return response.json();
}

async function httpError(action, response) {
  const detail = (await response.text()).slice(0, 500);
  return new Error(`${action} that bai (HTTP ${response.status})${detail ? `: ${detail}` : ''}`);
}

function validateArtifact(value) {
  if (!isRecord(value) || typeof value.name !== 'string' || !isRecord(value.flow)) {
    throw new Error('Flowise artifact khong hop le.');
  }
  if (!Array.isArray(value.flow.nodes) || !Array.isArray(value.flow.edges)) {
    throw new Error('Flowise artifact thieu nodes/edges.');
  }
  if (
    value.name !== 'zalo-order-parser-v1' ||
    value.flowiseVersion !== '3.1.4' ||
    value.credentialPlaceholder !== '__FLOWISE_DEEPSEEK_CREDENTIAL_ID__'
  ) {
    throw new Error('Flowise artifact sai ten/version/credential placeholder da duyet.');
  }
  if (value.flow.nodes.length !== 2 || value.flow.edges.length !== 1) {
    throw new Error('Flowise artifact chi duoc co Start -> mot LLM.');
  }

  const start = value.flow.nodes.find((node) => node?.data?.name === 'startAgentflow');
  const llm = value.flow.nodes.find((node) => node?.data?.name === 'llmAgentflow');
  if (!start || !llm) throw new Error('Flowise artifact thieu Start hoac LLM node.');
  const formNames = start.data.inputs?.formInputTypes?.map((field) => field.name);
  const expectedFormNames = [
    'text',
    'imageUrl',
    'productsJson',
    'glossaryJson',
    'dealerNameRaw',
    'botName',
  ];
  if (
    start.data.inputs?.startInputType !== 'formInput' ||
    JSON.stringify(formNames) !== JSON.stringify(expectedFormNames)
  ) {
    throw new Error('Flowise artifact co form input khong dung contract.');
  }

  const config = llm.data.inputs?.llmModelConfig;
  if (
    llm.data.inputs?.llmModel !== 'chatDeepseek' ||
    llm.data.inputs?.llmEnableMemory !== false ||
    config?.FLOWISE_CREDENTIAL_ID !== value.credentialPlaceholder ||
    config?.modelName !== 'deepseek-v4-flash' ||
    config?.temperature !== 0 ||
    config?.maxTokens !== 800 ||
    config?.thinking !== false ||
    config?.streaming !== false
  ) {
    throw new Error('Flowise artifact sai model/memory/structured-call config da duyet.');
  }

  const forbiddenNodeNames = new Set([
    'agentAgentflow',
    'customFunctionAgentflow',
    'httpAgentflow',
    'mcpAgentflow',
    'toolAgentflow',
    'executeFlowAgentflow',
  ]);
  if (value.flow.nodes.some((node) => forbiddenNodeNames.has(node?.data?.name))) {
    throw new Error('Flowise artifact chua node tool/code/http/MCP/flow bi cam.');
  }
  return value;
}

function requiredEnv(name) {
  const value = process.env[name]?.trim();
  if (!value) throw new Error(`Thieu bien bat buoc ${name}.`);
  return value;
}

function asArray(value) {
  if (Array.isArray(value)) return value;
  if (isRecord(value) && Array.isArray(value.data)) return value.data;
  throw new Error('Flowise API response khong phai danh sach.');
}

function isRecord(value) {
  return typeof value === 'object' && value !== null && !Array.isArray(value);
}
