/**
 * PHONG CLAUDE CODE — argv co dinh, stdin mang prompt, cwd la worktree vua tao.
 *
 * Ba luat cua tep nay:
 *
 * 1. ARGV LA CO DINH. `buildClaudeArgv` chi nhan CHINH SACH (model, effort, quyen) — no khong
 *    nhan hop dong task, khong nhan Issue, khong nhan mot chuoi nao cua GitHub. Nen khong ton tai
 *    duong nao de mot truong trong Issue tro thanh mot doi so dong lenh. Prompt di duong RIENG,
 *    qua stdin, va o do no la du lieu.
 *
 * 2. KHONG TU HA CHINH SACH. Khong co `--fallback-model`, khong co nhanh "neu Opus ban thi dung
 *    Sonnet", khong co "neu bi hoi quyen thi bat co bo qua quyen". Thieu dieu kien thi DUNG, va
 *    tra ve mot ma.
 *
 * 3. STDOUT CUA CLAUDE KHONG PHAI BANG CHUNG. Ham nay tra ve dem BYTE va vai truong CO CAU TRUC
 *    cua `--output-format json`; no khong tra ve van ban, va khong bao gio ket luan "thanh cong"
 *    tu chu trong stdout. Ai la nguoi ket luan: `post-run-verifier.mjs`, bang GitHub.
 */
import { DISPATCH_STATES, REASONS, deny } from './errors.mjs';

/** Co bi cam tuyet doi trong argv mac dinh. Co mot bai test doi chieu argv voi danh sach nay. */
export const FORBIDDEN_ARGV_FLAGS = Object.freeze([
  '--dangerously-skip-permissions',
  '--allow-dangerously-skip-permissions',
  '--fallback-model',
]);

/**
 * @param {{ model: string, effort: string, permissionPrompts: string, permissionMode: string | null, binPrefixArgs?: ReadonlyArray<string> }} policy
 * @returns {string[]}
 */
export function buildClaudeArgv(policy) {
  return [
    ...(policy.binPrefixArgs ?? []),
    '--print',
    '--model',
    policy.model,
    '--effort',
    policy.effort,
    '--output-format',
    'json',
    '--permission-prompts',
    policy.permissionPrompts,
    ...(policy.permissionMode ? ['--permission-mode', policy.permissionMode] : []),
  ];
}

/**
 * Chi doc cac truong CO CAU TRUC. Vang mat mot truong nghia la KHONG KET LUAN DUOC, khong bao gio
 * nghia la "khong sao" — nen ham chi bao duoc mot dieu: co bi chan quyen hay khong ro.
 * @param {string} stdout
 */
export function classifyResultJson(stdout) {
  /** @type {any} */
  let parsed;
  try {
    parsed = JSON.parse(stdout);
  } catch {
    return { parsed: false, isError: null, subtype: null, permissionDenials: null };
  }
  const node = Array.isArray(parsed) ? parsed[parsed.length - 1] : parsed;
  if (node === null || typeof node !== 'object') {
    return { parsed: false, isError: null, subtype: null, permissionDenials: null };
  }
  return {
    parsed: true,
    isError: typeof node.is_error === 'boolean' ? node.is_error : null,
    subtype: typeof node.subtype === 'string' ? node.subtype : null,
    permissionDenials: Array.isArray(node.permission_denials)
      ? node.permission_denials.length
      : null,
  };
}

/**
 * @param {number} limit
 */
function boundedSink(limit) {
  /** @type {Buffer[]} */
  const chunks = [];
  let kept = 0;
  let total = 0;
  return {
    /** @param {Buffer} chunk */
    push(chunk) {
      total += chunk.length;
      if (kept >= limit) return;
      const slice = chunk.subarray(0, limit - kept);
      chunks.push(slice);
      kept += slice.length;
    },
    get bytes() {
      return total;
    },
    text() {
      return Buffer.concat(chunks).toString('utf8');
    },
  };
}

/**
 * @typedef {object} LaunchOutcome
 * @property {string} state mot gia tri cua `DISPATCH_STATES`
 * @property {number | null} exitCode
 * @property {string | null} signal
 * @property {boolean} timedOut
 * @property {number} durationMs
 * @property {number} stdoutBytes
 * @property {number} stderrBytes
 * @property {ReturnType<typeof classifyResultJson>} result
 */

/**
 * @param {object} input
 * @param {import('./exec.mjs').SpawnFn} input.spawn
 * @param {string} input.bin
 * @param {ReadonlyArray<string>} input.argv
 * @param {string} input.cwd worktree vua tao — KHONG BAO GIO la repo goc
 * @param {string} input.prompt
 * @param {number} input.timeoutMs
 * @param {number} input.killGraceMs
 * @param {number} input.maxCaptureBytes
 * @param {() => number} [input.now]
 * @returns {Promise<{ ok: true, outcome: LaunchOutcome } | import('./errors.mjs').Denied>}
 */
export function launchClaude(input) {
  const now = input.now ?? (() => Date.now());
  const startedAt = now();
  return new Promise((resolve) => {
    /** @type {import('node:child_process').ChildProcessByStdio<any, any, any>} */
    let child;
    try {
      child = /** @type {any} */ (input.spawn(input.bin, input.argv, { cwd: input.cwd }));
    } catch (error) {
      resolve(
        deny(REASONS.PROCESS_SPAWN_FAILED, { code: /** @type {any} */ (error)?.code ?? 'UNKNOWN' }),
      );
      return;
    }

    const stdout = boundedSink(input.maxCaptureBytes);
    const stderr = boundedSink(input.maxCaptureBytes);
    let timedOut = false;
    let settled = false;
    /** @type {NodeJS.Timeout | null} */
    let hardKillTimer = null;

    const softKillTimer = setTimeout(() => {
      timedOut = true;
      child.kill('SIGTERM');
      // Chet dut khoat sau thoi gian an han. Khong co "cho them mot chut" — mot tien trinh khong
      // chiu di sau SIGTERM la mot tien trinh dang treo, va V0 khong nuoi tien trinh treo.
      hardKillTimer = setTimeout(() => child.kill('SIGKILL'), input.killGraceMs);
      hardKillTimer.unref?.();
    }, input.timeoutMs);
    softKillTimer.unref?.();

    child.stdout?.on('data', (/** @type {Buffer} */ chunk) => stdout.push(Buffer.from(chunk)));
    child.stderr?.on('data', (/** @type {Buffer} */ chunk) => stderr.push(Buffer.from(chunk)));

    /** @param {import('./errors.mjs').Denied | { ok: true, outcome: LaunchOutcome }} value */
    const settle = (value) => {
      if (settled) return;
      settled = true;
      clearTimeout(softKillTimer);
      if (hardKillTimer) clearTimeout(hardKillTimer);
      resolve(value);
    };

    child.on('error', (error) => {
      const code = /** @type {any} */ (error)?.code;
      settle(
        deny(code === 'ENOENT' ? REASONS.CLAUDE_BIN_MISSING : REASONS.PROCESS_SPAWN_FAILED, {
          code: code ?? 'UNKNOWN',
        }),
      );
    });

    child.on('close', (code, signal) => {
      const result = classifyResultJson(stdout.text());
      // `null` = KHONG KET LUAN DUOC (stdout bi cat vi `maxCaptureBytes`, hoac khong phai JSON),
      // khac han `0` = do duoc va khong co lan chan nao. Chi `> 0` moi la bang chung bi chan;
      // truong hop khong ket luan duoc roi ve phan loai theo ma thoat, chu khong duoc bao la sach.
      const blockedByPermission = result.permissionDenials !== null && result.permissionDenials > 0;
      const state = timedOut
        ? DISPATCH_STATES.TIMED_OUT
        : blockedByPermission
          ? DISPATCH_STATES.BLOCKED_LOCAL_PERMISSION
          : code === 0
            ? DISPATCH_STATES.CLAUDE_EXITED_0
            : DISPATCH_STATES.CLAUDE_EXITED_NONZERO;
      settle({
        ok: /** @type {const} */ (true),
        outcome: {
          state,
          exitCode: code,
          signal: signal ?? null,
          timedOut,
          durationMs: now() - startedAt,
          stdoutBytes: stdout.bytes,
          stderrBytes: stderr.bytes,
          result,
        },
      });
    });

    // Prompt di qua stdin, khong qua argv. Ngoai ly do an toan, day con la ly do thuc dung: mot
    // hop dong task dai vai chuc KB se vuot gioi han dong lenh cua Windows neu nhet vao argv.
    child.stdin?.on('error', () => {});
    child.stdin?.end(input.prompt, 'utf8');
  });
}
