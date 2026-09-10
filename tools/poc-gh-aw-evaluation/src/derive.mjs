/**
 * DAN XUAT BANG CHUNG TU MOT BAN CLONE gh-aw TAI DUNG MOT SHA — khong doc README, khong doan.
 *
 * VI SAO CO TEP NAY
 *
 * Task #194 doi hoi moi khang dinh ve gh-aw phai co bang chung tu NGUON tai mot commit CO DINH.
 * Mot bao cao chep tay se troi ngay khi upstream doi — va gh-aw phat hanh ~17 ban trong 30 ngay.
 * Nen bang chung o day duoc SINH RA tu chinh cay nguon, va `fixtures/` chi la ban ghi lai ket qua:
 *
 *   che do `--write`  — doc clone, ghi de `fixtures/*.json`
 *   che do mac dinh   — doc clone, so voi `fixtures/*.json`, LECH thi bao loi
 *
 * Nho vay bai kiem trong CI chay duoc KHONG CAN clone (doc fixtures da cam), con nguoi thi chung
 * minh duoc fixtures van dung bang mot lenh — hai viec khac nhau, khong lan nhau.
 *
 * TEP NAY KHONG GOI MANG VA KHONG GHI GITHUB. No chi doc tep tren dia.
 */
import { readFileSync, readdirSync, existsSync } from 'node:fs';
import { createRequire } from 'node:module';
import { join } from 'node:path';

/** Cac tep .cjs cua gh-aw duoc thu nap DOC LAP — cau hoi trung tam cua §5.5 hop dong task. */
export const STANDALONE_PROBE_MODULES = Object.freeze([
  'safe_output_validator.cjs',
  'safe_output_type_validator.cjs',
  'safe_output_processor.cjs',
  'safe_output_handler_manager.cjs',
  'safe_outputs_config.cjs',
]);

/**
 * Khoi `permissions:` cua tung job trong mot workflow da SINH RA (`*.lock.yml`).
 *
 * Doc bang bat khuon dong thay vi mot thu vien YAML: tep sinh ra co cau truc thut le CO DINH do
 * chinh trinh bien dich cua gh-aw phat ra, va them mot phu thuoc YAML vao goi bang chung nay chi
 * lam be mat cung ung lon them ma khong doi duoc ket luan nao.
 *
 * @param {string} text Noi dung tep `.lock.yml`.
 * @returns {Record<string, string[]>} ten job -> danh sach dong `quyen: gia-tri`.
 */
export function jobPermissions(text) {
  /** @type {Record<string, string[]>} */
  const jobs = {};
  let current = null;
  let inside = false;

  for (const line of text.split('\n')) {
    const job = /^ {2}([A-Za-z0-9_-]+):\s*$/.exec(line);
    if (job) {
      current = job[1];
      jobs[current] = jobs[current] ?? [];
      inside = false;
      continue;
    }
    if (current === null) continue;
    if (/^ {4}permissions:\s*$/.test(line)) {
      inside = true;
      continue;
    }
    if (!inside) continue;
    const grant = /^ {6}([a-z-]+):\s*(\S+)/.exec(line);
    if (grant) {
      jobs[current].push(`${grant[1]}: ${grant[2]}`);
      continue;
    }
    if (/^ {4}\S/.test(line)) inside = false;
  }
  return jobs;
}

/**
 * Cac khoa `safe-outputs:` mot workflow KHAI BAO trong frontmatter cua tep `.md` nguon.
 *
 * Day la ve TRAI cua phep do parity quyen: khai bao cai gi thi trinh bien dich cap quyen gi.
 *
 * @param {string} text Noi dung tep `.md`.
 * @returns {string[] | null} `null` khi workflow khong khai `safe-outputs:`.
 */
export function declaredSafeOutputs(text) {
  const block = /^safe-outputs:\s*$([\s\S]*?)^(?=\S)/m.exec(text);
  if (!block) return null;
  const keys = new Set();
  for (const line of block[1].split('\n')) {
    const key = /^ {2}([a-z][a-z0-9-]*):/.exec(line);
    if (key) keys.add(key[1]);
  }
  return [...keys].sort();
}

const sortedKey = (list) => JSON.stringify([...list].sort());

/**
 * Doc ca kho workflow da sinh ra, tra ve bang chung da tong hop.
 *
 * @param {string} repoRoot Goc ban clone gh-aw tai SHA da ghim.
 */
export function deriveCorpus(repoRoot) {
  const dir = join(repoRoot, '.github', 'workflows');
  const locks = readdirSync(dir)
    .filter((name) => name.endsWith('.lock.yml'))
    .sort();

  /** @type {Record<string, Record<string, number>>} khai bao -> (bo quyen -> so lan) */
  const declaredToPermissions = {};
  /** @type {Record<string, number>} moi quyen GHI tung thay tren job `agent` */
  const agentWriteGrants = {};
  /** @type {Record<string, number>} */
  const safeOutputsPermissionSets = {};
  let withSafeOutputsJob = 0;

  for (const lock of locks) {
    const jobs = jobPermissions(readFileSync(join(dir, lock), 'utf8'));

    for (const grant of jobs.agent ?? []) {
      if (!grant.endsWith(': write')) continue;
      agentWriteGrants[grant] = (agentWriteGrants[grant] ?? 0) + 1;
    }

    const safeOutputs = jobs.safe_outputs;
    if (!Array.isArray(safeOutputs)) continue;
    withSafeOutputsJob += 1;

    const permissionSet = sortedKey(safeOutputs);
    safeOutputsPermissionSets[permissionSet] = (safeOutputsPermissionSets[permissionSet] ?? 0) + 1;

    const source = join(dir, lock.replace(/\.lock\.yml$/, '.md'));
    if (!existsSync(source)) continue;
    const declared = declaredSafeOutputs(readFileSync(source, 'utf8'));
    if (declared === null) continue;

    const key = sortedKey(declared);
    declaredToPermissions[key] = declaredToPermissions[key] ?? {};
    declaredToPermissions[key][permissionSet] =
      (declaredToPermissions[key][permissionSet] ?? 0) + 1;
  }

  return {
    lockFilesScanned: locks.length,
    withSafeOutputsJob,
    agentWriteGrants,
    safeOutputsPermissionSets,
    declaredToPermissions,
  };
}

/**
 * Cau hinh xac thuc toi thieu, dung KHUON ma gh-aw doi (khoa dung `_`, khong phai `-`).
 *
 * Chi khai `body` — du de thay bo loc truong hoat dong: mot truong KHONG khai bao phai bien mat
 * khoi item da chuan hoa.
 */
export const MINIMAL_VALIDATION_CONFIG = Object.freeze({
  add_comment: {
    defaultMax: 1,
    fields: { body: { required: true, type: 'string', sanitize: true, maxLength: 65000 } },
  },
});

/**
 * BA TRANG THAI CUA `GH_AW_VALIDATION_CONFIG` — phep thu quyet dinh cua PoC A.
 *
 * `safe_output_type_validator.cjs` khong tu mang luat xac thuc: no doc chung tu bien moi truong
 * `GH_AW_VALIDATION_CONFIG` (`:251`). Khong co bien do thi `loadValidationConfig()` tra `{}`, va
 * `validateItem()` di vao nhanh "Unknown type" (`:764-766`) — tra `isValid: true` VA chuyen tiep
 * nguyen ven moi truong do tac nhan dat vao.
 *
 * Ba trang thai duoi day do dung dieu do, va chung la ly do ket luan SAFE_OUTPUTS_STANDALONE
 * la `PARTIAL` chu khong phai `YES`.
 *
 * @param {string} repoRoot
 */
export function probeValidationConfigStates(repoRoot) {
  const modulePath = join(repoRoot, 'actions', 'setup', 'js', 'safe_output_type_validator.cjs');
  const require = createRequire(import.meta.url);

  /** Truong KHONG duoc khai bao trong cau hinh — no song sot nghia la bo loc khong chay. */
  const item = {
    type: 'add_comment',
    body: 'REVIEW_REQUEST PR=194',
    smuggled: 'ATTACKER_CONTROLLED',
  };

  const observe = (configValue) => {
    delete require.cache[require.resolve(modulePath)];
    const previous = process.env.GH_AW_VALIDATION_CONFIG;
    if (configValue === null) delete process.env.GH_AW_VALIDATION_CONFIG;
    else process.env.GH_AW_VALIDATION_CONFIG = configValue;
    try {
      const { validateItem } = require(modulePath);
      const result = validateItem({ ...item }, 'add_comment', 1, {});
      return {
        isValid: result.isValid === true,
        undeclaredFieldSurvived: Object.hasOwn(result.normalizedItem ?? {}, 'smuggled'),
      };
    } finally {
      if (previous === undefined) delete process.env.GH_AW_VALIDATION_CONFIG;
      else process.env.GH_AW_VALIDATION_CONFIG = previous;
      delete require.cache[require.resolve(modulePath)];
    }
  };

  return {
    noConfig: observe(null),
    corruptConfig: observe('{not json'),
    validConfig: observe(JSON.stringify(MINIMAL_VALIDATION_CONFIG)),
  };
}

/**
 * Thu NAP tung tep `.cjs` cua tang Safe Outputs trong mot tien trinh Node TRAN — khong trinh bien
 * dich Go, khong workflow, khong bi mat, khong mang.
 *
 * Day la phep thu quyet dinh cua tieu chi nghiem thu #8: neu chung nap va CHAY duoc o day thi tang
 * xac thuc cua Safe Outputs dung la tai su dung doc lap duoc.
 *
 * @param {string} repoRoot
 */
export function probeStandalone(repoRoot) {
  const dir = join(repoRoot, 'actions', 'setup', 'js');
  const require = createRequire(import.meta.url);
  /** @type {Record<string, { loaded: boolean, exports?: string[], error?: string }>} */
  const result = {};
  for (const name of STANDALONE_PROBE_MODULES) {
    try {
      const mod = require(join(dir, name));
      result[name] = { loaded: true, exports: Object.keys(mod).sort() };
    } catch (error) {
      result[name] = { loaded: false, error: String(error?.message ?? error).split('\n')[0] };
    }
  }
  return result;
}
