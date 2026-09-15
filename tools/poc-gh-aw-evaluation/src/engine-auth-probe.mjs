/**
 * PoC D — gh-aw CO giao duoc `CLAUDE_CODE_OAUTH_TOKEN` cho tac nhan hay khong?
 *
 * VI SAO TEP NAY TON TAI
 *
 * Ban danh gia dau tien lap luan rang gh-aw khong ho tro Claude Max OAuth vi chuoi
 * `CLAUDE_CODE_OAUTH_TOKEN` xuat hien 0 lan trong ma nguon. Lap luan do SAI VE PHUONG PHAP: no do
 * su co mat cua mot chuoi, trong khi cai can do la KHA NANG CUA KHUNG. gh-aw con mot duong thu hai
 * — `behavior-defined engine` — nhan mot TEN BI MAT BAT KY qua `auth[].secret`, nen khong the ket
 * luan gi ve khung tu viec dem chuoi.
 *
 * Nen phep do o day KHONG doc ma nguon. No BIEN DICH THAT bang chinh trinh bien dich gh-aw tai SHA
 * da ghim, roi doc tep `.lock.yml` sinh ra. Hai duong deu duoc do, vi mot cau tra loi "khong" chi
 * dang tin khi da thu ca hai:
 *
 *   behaviorDefinedEngine    — engine tu dinh nghia, `auth: [{ role: api-key, secret: CLAUDE_CODE_OAUTH_TOKEN }]`
 *   builtinEngineEnvOverride — engine `claude` dung san, tiem bi mat qua `engine.env`
 *
 * KHONG BI MAT, KHONG MANG LUC CHAY, KHONG GHI GITHUB. Phep do chi can mot thu muc tam va mot
 * nhi phan trinh bien dich da dung san. Ten bi mat la mot CHUOI trong tep YAML sinh ra — khong co
 * gia tri bi mat nao ton tai o bat ky dau trong phep do nay.
 */
import { spawnSync } from 'node:child_process';
import { copyFileSync, existsSync, mkdirSync, mkdtempSync, readFileSync, rmSync } from 'node:fs';
import { tmpdir } from 'node:os';
import { dirname, join } from 'node:path';
import { fileURLToPath } from 'node:url';

const here = dirname(fileURLToPath(import.meta.url));
const probeDir = join(here, '..', 'probe');

/**
 * Lat cat `jobs:` cua mot tep `.lock.yml`, kem vi tri dong cua tung job.
 *
 * Can no vi mot bien moi truong chi co y nghia khi biet no nam trong JOB NAO: `CLAUDE_CODE_OAUTH_TOKEN`
 * o job `agent` la "tac nhan cam duoc bi mat", con o job `safe_outputs` lai la mot phat hien an ninh
 * hoan toan khac. Doc bang bat khuon dong thay vi them mot thu vien YAML — dung ly do da ghi trong
 * `derive.mjs`.
 *
 * @param {string} text Noi dung tep `.lock.yml`.
 * @returns {{ name: string, start: number, end: number }[]} theo thu tu xuat hien, dong 1-based.
 */
export function jobSpans(text) {
  const lines = text.split('\n');
  const jobsAt = lines.findIndex((line) => /^jobs:\s*$/.test(line));
  if (jobsAt === -1) return [];

  /** @type {{ name: string, start: number, end: number }[]} */
  const spans = [];
  for (let i = jobsAt + 1; i < lines.length; i += 1) {
    const job = /^ {2}([A-Za-z0-9_-]+):\s*$/.exec(lines[i]);
    if (!job) continue;
    if (spans.length > 0) spans[spans.length - 1].end = i;
    spans.push({ name: job[1], start: i + 1, end: lines.length });
  }
  return spans;
}

/** Job chua dong `line` (1-based), hoac `null` khi dong nam ngoai khoi `jobs:`. */
const jobAtLine = (spans, line) =>
  spans.find((span) => line >= span.start && line <= span.end)?.name ?? null;

/**
 * Moi lan mot ten bi mat xuat hien trong tep sinh ra, kem job va vai tro cua dong do.
 *
 * @param {string} text
 * @param {string} secretName
 */
function secretSightings(text, secretName) {
  const spans = jobSpans(text);
  const envBinding = new RegExp(`^${secretName}: \\$\\{\\{ secrets\\.${secretName} \\}\\}$`);
  /** @type {{ job: string | null, kind: string }[]} */
  const sightings = [];

  text.split('\n').forEach((line, index) => {
    if (!line.includes(secretName)) return;
    // Dong dau tep la mot manifest JSON mot dong liet ke moi bi mat — do la SO SACH, khong phai mot
    // lan cap phat, nen no khong duoc lan vao cac lan tiem that.
    if (line.startsWith('# gh-aw-manifest:')) return;
    const trimmed = line.trim();
    let kind = 'other';
    if (trimmed.startsWith('#')) kind = 'comment';
    else if (envBinding.test(trimmed)) kind = 'env-binding';
    else if (trimmed.startsWith(`SECRET_${secretName}:`)) kind = 'firewall-redaction-copy';
    else if (trimmed.includes('GH_AW_SECRET_NAMES')) kind = 'firewall-redaction-list';
    sightings.push({ job: jobAtLine(spans, index + 1), kind });
  });

  return sightings;
}

/** Khoi `permissions:` cua tung job, doc trong pham vi `jobs:`. */
function permissionsBySpan(text) {
  const lines = text.split('\n');
  /** @type {Record<string, string[]>} */
  const result = {};
  for (const span of jobSpans(text)) {
    /** @type {string[]} */
    const grants = [];
    for (let i = span.start; i < span.end; i += 1) {
      const inline = /^ {4}permissions:\s*(\S.*)$/.exec(lines[i]);
      if (inline) {
        grants.push(inline[1].trim());
        continue;
      }
      if (!/^ {4}permissions:\s*$/.test(lines[i])) continue;
      for (let j = i + 1; j < span.end; j += 1) {
        const grant = /^ {6}([a-z-]+):\s*(\S+)/.exec(lines[j]);
        if (grant) {
          grants.push(`${grant[1]}: ${grant[2]}`);
          continue;
        }
        if (/^ {4}\S/.test(lines[j])) break;
      }
    }
    result[span.name] = grants;
  }
  return result;
}

/** Danh sach `needs:` cua mot job — chap nhan ca dang mot gia tri lan dang danh sach. */
function needsOf(text, jobName) {
  const lines = text.split('\n');
  const span = jobSpans(text).find((entry) => entry.name === jobName);
  if (!span) return null;
  for (let i = span.start; i < span.end; i += 1) {
    const inline = /^ {4}needs:\s*(\S.*)$/.exec(lines[i]);
    if (inline) return [inline[1].trim()];
    if (!/^ {4}needs:\s*$/.test(lines[i])) continue;
    /** @type {string[]} */
    const list = [];
    for (let j = i + 1; j < span.end; j += 1) {
      const item = /^ {6}- (\S+)\s*$/.exec(lines[j]);
      if (!item) break;
      list.push(item[1]);
    }
    return list;
  }
  return null;
}

/** Ten cac cong cu `safeoutputs` ma manifest o dong dau tep khai bao. */
function safeOutputToolsFromManifest(text) {
  const marker = '# gh-aw-manifest: ';
  const line = text.split('\n').find((entry) => entry.startsWith(marker));
  if (!line) return null;
  try {
    const manifest = JSON.parse(line.slice(marker.length));
    const server = (manifest.mcp_servers ?? []).find((entry) => entry?.name === 'safeoutputs');
    return server?.tools ?? null;
  } catch {
    return null;
  }
}

/**
 * Bien dich MOT phep do trong mot kho git tam, roi tra ve su that doc duoc tu tep sinh ra.
 *
 * @param {string} compilerBin Duong dan nhi phan `gh-aw` da dung tai SHA da ghim.
 * @param {{ workflow: string, engine?: string, lockName: string }} probe
 */
function compileProbe(compilerBin, probe) {
  const root = mkdtempSync(join(tmpdir(), 'gh-aw-probe-'));
  try {
    const workflows = join(root, '.github', 'workflows');
    mkdirSync(join(workflows, 'shared'), { recursive: true });
    copyFileSync(join(probeDir, probe.workflow), join(workflows, `${probe.lockName}.md`));
    if (probe.engine) {
      copyFileSync(join(probeDir, probe.engine), join(workflows, 'shared', 'claude-code-oauth.md'));
    }
    // `gh aw compile` khong doi so thi doi mot kho git. Kho nay rong, khong remote, khong commit.
    spawnSync('git', ['init', '--quiet'], { cwd: root, stdio: 'ignore' });

    // `spawnSync` chu khong phai `execFileSync`: gh-aw phat canh bao an ninh ra STDERR va van thoat
    // 0, ma `execFileSync` chi tra stdout khi lenh thanh cong. Doc thieu stderr thi phep do se ghi
    // "khong co canh bao" trong khi thuc te co — mot bang chung sai theo huong co loi cho ket luan.
    const run = spawnSync(compilerBin, ['compile'], { cwd: root, encoding: 'utf8' });
    const exitCode = run.status ?? 1;
    const output = `${run.stdout ?? ''}${run.stderr ?? ''}`;

    const lockPath = join(workflows, `${probe.lockName}.lock.yml`);
    return { exitCode, output, lock: existsSync(lockPath) ? readFileSync(lockPath, 'utf8') : null };
  } finally {
    rmSync(root, { recursive: true, force: true });
  }
}

const OAUTH_SECRET = 'CLAUDE_CODE_OAUTH_TOKEN';

/**
 * BANG CHUNG CUA PoC D — hai duong toi Claude Max OAuth, do bang trinh bien dich that.
 *
 * Ket qua duoc rut gon ve SU THAT ON DINH (co/khong, so dem, ten job, bo quyen) chu khong phai
 * toan van tep sinh ra: tep do ~110 KB va phan lon la ha tang khong lien quan den cau hoi.
 *
 * @param {string} compilerBin Duong dan nhi phan `gh-aw` dung tai SHA da ghim.
 */
export function probeEngineAuthPaths(compilerBin) {
  const behavior = compileProbe(compilerBin, {
    workflow: 'workflow-behavior-defined.md',
    engine: 'engine-claude-code-oauth.md',
    lockName: 'oauth-probe',
  });

  const builtin = compileProbe(compilerBin, {
    workflow: 'workflow-builtin-env-override.md',
    lockName: 'builtin-claude-oauth',
  });

  const lock = behavior.lock ?? '';
  const sightings = behavior.lock === null ? [] : secretSightings(lock, OAUTH_SECRET);

  return {
    behaviorDefinedEngine: {
      compiled: behavior.exitCode === 0 && behavior.lock !== null,
      // Trinh bien dich VAN doi soat mot bi mat moi — ghi lai vi day la mot cong an ninh that,
      // khong phai mot dong log.
      warnsNewRestrictedSecret: behavior.output.includes('New restricted secret'),
      oauthSecretSightings: sightings.map((entry) => `${entry.job ?? '(header)'}:${entry.kind}`),
      anthropicApiKeyOccurrences: (lock.match(/ANTHROPIC_API_KEY/g) ?? []).length,
      jobPermissions: behavior.lock === null ? null : permissionsBySpan(lock),
      safeOutputsNeeds: behavior.lock === null ? null : needsOf(lock, 'safe_outputs'),
      safeOutputTools: behavior.lock === null ? null : safeOutputToolsFromManifest(lock),
    },
    builtinEngineEnvOverride: {
      compiled: builtin.exitCode === 0 && builtin.lock !== null,
      // Cau bao loi la KET QUA, khong phai tieng on: no noi ro duong nay bi chan co chu dich.
      rejectsSecretInEngineEnv: builtin.output.includes(
        "secrets detected in 'engine.env' section are excluded from the agent sandbox",
      ),
    },
  };
}
