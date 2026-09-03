/**
 * Nap va bien dich JSON Schema (draft 2020-12) cua giao thuc bang ajv.
 *
 * Schema la NGUON SU THAT cua hinh dang thong diep. Module nay khong them rang buoc hinh dang
 * nao ngoai schema; rang buoc NGU NGHIA (SHA phai khop HEAD, CI phai xanh, ...) nam o gates.mjs.
 */
import { readFileSync, readdirSync } from 'node:fs';
import { dirname, join } from 'node:path';
import { fileURLToPath } from 'node:url';
import Ajv2020Module from 'ajv/dist/2020.js';

import { MESSAGE_TYPES } from './constants.mjs';
import { REASONS, deny } from './reasons.mjs';

// ajv la CommonJS: `module.exports` la class va cung co `.default`. Node ESM dua `module.exports`
// vao default import; TypeScript (NodeNext) lai dua ca module. Lay class o ca hai duong.
/** @type {typeof import('ajv/dist/2020.js').default} */
const Ajv2020 = /** @type {any} */ (Ajv2020Module).default ?? Ajv2020Module;

const SCHEMA_DIR = join(dirname(fileURLToPath(import.meta.url)), '..', 'schemas');
const MESSAGE_SCHEMA_DIR = join(SCHEMA_DIR, 'messages');

/** Ten tep schema cua tung loai thong diep — co dinh, khong suy tu ten. */
const MESSAGE_SCHEMA_FILES = Object.freeze({
  [MESSAGE_TYPES.TASK_READY]: 'task-ready.schema.json',
  [MESSAGE_TYPES.BUILD_STARTED]: 'build-started.schema.json',
  [MESSAGE_TYPES.BUILD_READY]: 'build-ready.schema.json',
  [MESSAGE_TYPES.CI_FAIL]: 'ci-fail.schema.json',
  [MESSAGE_TYPES.REVIEW_REQUEST]: 'review-request.schema.json',
  [MESSAGE_TYPES.REVIEW_PASS]: 'review-pass.schema.json',
  [MESSAGE_TYPES.REVIEW_BLOCK]: 'review-block.schema.json',
  [MESSAGE_TYPES.RUNTIME_PROOF]: 'runtime-proof.schema.json',
  [MESSAGE_TYPES.TASK_DONE]: 'task-done.schema.json',
});

/** @param {string} path */
const readJson = (path) => JSON.parse(readFileSync(path, 'utf8'));

export const SCHEMA_PATHS = Object.freeze({
  common: join(SCHEMA_DIR, 'common.schema.json'),
  taskContract: join(SCHEMA_DIR, 'task-contract.schema.json'),
  messages: Object.freeze(
    Object.fromEntries(
      Object.entries(MESSAGE_SCHEMA_FILES).map(([type, file]) => [
        type,
        join(MESSAGE_SCHEMA_DIR, file),
      ]),
    ),
  ),
});

/** Danh sach tep schema thong diep tren dia — de test khang dinh khong co tep mo coi. */
export const listMessageSchemaFiles = () =>
  readdirSync(MESSAGE_SCHEMA_DIR)
    .filter((name) => name.endsWith('.schema.json'))
    .sort();

function buildAjv() {
  // strict: mot tu khoa go sai trong schema la LOI bien dich, khong phai bi bo qua trong im lang.
  const ajv = new Ajv2020({ strict: true, allErrors: true });
  ajv.addSchema(readJson(SCHEMA_PATHS.common));
  return ajv;
}

const ajv = buildAjv();

/** @type {Record<string, import('ajv').ValidateFunction>} */
const messageValidators = Object.fromEntries(
  Object.entries(SCHEMA_PATHS.messages).map(([type, path]) => [type, ajv.compile(readJson(path))]),
);

const taskContractValidator = ajv.compile(readJson(SCHEMA_PATHS.taskContract));

/**
 * Chuyen loi ajv thanh danh sach on dinh, doc duoc, khong phu thuoc phien ban ajv.
 * @param {import('ajv').ErrorObject[] | null | undefined} errors
 */
export function formatSchemaErrors(errors) {
  return (errors ?? []).map((error) => ({
    path: error.instancePath || '/',
    keyword: error.keyword,
    message: error.message ?? '',
    params: error.params,
  }));
}

/**
 * Kiem mot payload thong diep (dang JSON canonical) theo schema cua loai `type`.
 * @param {string} type
 * @param {unknown} payload
 * @returns {import('./reasons.mjs').Ok | import('./reasons.mjs').Denied}
 */
export function validateMessagePayload(type, payload) {
  const validate = messageValidators[type];
  if (!validate) return deny(REASONS.UNKNOWN_MESSAGE_TYPE, { type });
  if (validate(payload)) return { ok: true };
  return deny(REASONS.SCHEMA_VIOLATION, { type, errors: formatSchemaErrors(validate.errors) });
}

/**
 * Kiem mot payload hop dong task theo schema (chua kiem ngu nghia — xem task-contract.mjs).
 * @param {unknown} payload
 * @returns {import('./reasons.mjs').Ok | import('./reasons.mjs').Denied}
 */
export function validateTaskContractSchema(payload) {
  if (taskContractValidator(payload)) return { ok: true };
  return deny(REASONS.SCHEMA_VIOLATION, {
    type: 'TASK_CONTRACT',
    errors: formatSchemaErrors(taskContractValidator.errors),
  });
}
