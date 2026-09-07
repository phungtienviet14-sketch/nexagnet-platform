/**
 * DO KHA NANG CUA CLAUDE CLI DANG CAI — khong tin cu phap nho tu mot cuoc hoi thoai cu.
 *
 * Co `--effort` va gia tri `max` la thu CLI TU KHAI trong `--help`. Doc no ra roi doi chieu voi
 * chinh sach la cach duy nhat de mot ban CLI cu (hoac mot ban tuong lai bo co) KHONG lang le bien
 * "Opus/max" thanh "mac dinh cua may nay". Ha model hay ha effort ma khong ai biet la kieu hong
 * te nhat: moi thu van xanh, chi chat luong tut.
 *
 * Nen o day khong co duong du phong nao. Khong chung minh duoc Opus/max => TU CHOI KHOI DONG.
 */
import { REASONS, deny } from './errors.mjs';

/** Mot dong mo ta tuy chon trong `--help`: hai dau cach roi mot dau gach. */
const OPTION_LINE = /^\s{2}(-{1,2}[A-Za-z0-9][^\s]*)/;

/**
 * Cat khoi mo ta cua mot tuy chon: tu dong khai bao no den ngay truoc dong khai bao ke tiep.
 * @param {string} help
 * @param {string} flag vi du `--effort`
 * @returns {string | null}
 */
export function optionBlock(help, flag) {
  const lines = String(help ?? '').split(/\r?\n/);
  const start = lines.findIndex((line) => {
    const match = line.match(OPTION_LINE);
    if (!match) return false;
    // Mot dong khai bao co the gom nhieu bi danh: `--allowedTools, --allowed-tools <tools...>`.
    return line
      .slice(2)
      .split(/\s{2,}/)[0]
      .split(/[,\s]+/)
      .includes(flag);
  });
  if (start < 0) return null;
  const rest = lines.slice(start + 1);
  const endOffset = rest.findIndex((line) => OPTION_LINE.test(line));
  const block = endOffset < 0 ? rest : rest.slice(0, endOffset);
  return [lines[start], ...block].join('\n');
}

/**
 * @typedef {object} ClaudeCapabilities
 * @property {string} version
 * @property {boolean} supportsPrint
 * @property {boolean} supportsModel
 * @property {boolean} supportsEffort
 * @property {ReadonlyArray<string>} effortLevels
 * @property {boolean} mentionsOpusAlias
 */

/**
 * @param {{ version: string, help: string }} measured
 * @returns {ClaudeCapabilities}
 */
export function parseCapabilities({ version, help }) {
  const effortBlock = optionBlock(help, '--effort');
  const levels = effortBlock
    ? [...effortBlock.matchAll(/\b(low|medium|high|xhigh|max)\b/g)].map((m) => m[1])
    : [];
  const modelBlock = optionBlock(help, '--model');
  return Object.freeze({
    version: String(version ?? '').trim(),
    supportsPrint: optionBlock(help, '--print') !== null || optionBlock(help, '-p') !== null,
    supportsModel: modelBlock !== null,
    supportsEffort: effortBlock !== null,
    effortLevels: Object.freeze([...new Set(levels)]),
    mentionsOpusAlias: modelBlock !== null && /\bopus\b/i.test(modelBlock),
  });
}

/**
 * @param {{ exec: import('./exec.mjs').ExecFn }} deps
 * @param {{ bin: string, binPrefixArgs: ReadonlyArray<string> }} policy
 * @returns {Promise<{ ok: true, capabilities: ClaudeCapabilities } | import('./errors.mjs').Denied>}
 */
export async function probeClaude(deps, policy) {
  const version = await deps.exec(policy.bin, [...policy.binPrefixArgs, '--version'], {
    timeoutMs: 60_000,
  });
  if (version.errorCode === 'ENOENT') return deny(REASONS.CLAUDE_BIN_MISSING);
  if (!version.ok) {
    return deny(REASONS.CLAUDE_PROBE_FAILED, { step: 'version', exitCode: version.code });
  }
  const help = await deps.exec(policy.bin, [...policy.binPrefixArgs, '--help'], {
    timeoutMs: 60_000,
  });
  if (!help.ok) return deny(REASONS.CLAUDE_PROBE_FAILED, { step: 'help', exitCode: help.code });
  return {
    ok: /** @type {const} */ (true),
    capabilities: parseCapabilities({ version: version.stdout, help: help.stdout }),
  };
}

/**
 * Doi chieu kha nang DO DUOC voi chinh sach. Moi thieu sot mot ma rieng — nguoi van hanh phai doc
 * ra ngay la CLI thieu co gi, chu khong phai mot "khong tuong thich" chung chung.
 * @param {ClaudeCapabilities} capabilities
 * @param {{ model: string, effort: string }} policy
 */
export function assertPolicySupported(capabilities, policy) {
  if (!capabilities.supportsPrint) return deny(REASONS.CLAUDE_NONINTERACTIVE_UNSUPPORTED);
  if (!capabilities.supportsModel) return deny(REASONS.CLAUDE_MODEL_FLAG_UNSUPPORTED);
  if (!capabilities.supportsEffort) return deny(REASONS.CLAUDE_EFFORT_FLAG_UNSUPPORTED);
  if (!capabilities.effortLevels.includes(policy.effort)) {
    return deny(REASONS.CLAUDE_EFFORT_MAX_UNSUPPORTED, {
      want: policy.effort,
      levels: capabilities.effortLevels.join(','),
    });
  }
  // Alias `opus` chi duoc dung khi CHINH CLI tai lieu hoa no. Mot ten model day du (ho
  // `claude-opus-*`) thi khong can bang chung nay — no la mot dinh danh, khong phai mot alias ma
  // CLI phai biet cach mo ra.
  if (policy.model === 'opus' && !capabilities.mentionsOpusAlias) {
    return deny(REASONS.CLAUDE_MODEL_OPUS_UNSUPPORTED, { model: policy.model });
  }
  return { ok: /** @type {const} */ (true) };
}
