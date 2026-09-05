/**
 * CONG CU CAI/GO — MAC DINH LA CHAY KHO (dry-run), va viec that can HAI cong tac.
 *
 * Hop dong #204 §10 noi ro: giai doan hien thuc ket thuc TRUOC lan cai that. Nen o day khong co
 * "quen truyen --dry-run": muon ghi that phai co CA `--apply` LAN `--i-understand-this-writes-to-my-registry`.
 * Mot co thi de go nham; hai co, trong do mot co doc len thanh mot cau, thi khong.
 *
 * Dau ra cua che do chay kho la TAT DINH — cung dau vao cho ra cung tung dong. Do la mot yeu cau
 * kiem duoc (§12 muc 23), va no cung la thu bien "hay xem no se lam gi" thanh mot viec that lam
 * duoc chu khong phai mot loi khuyen.
 */
import { execFile } from 'node:child_process';
import { mkdirSync, rmSync, writeFileSync } from 'node:fs';
import { dirname, resolve } from 'node:path';
import { fileURLToPath } from 'node:url';
import { buildInstallPlan, buildUninstallPlan } from './windows-registry.mjs';

const HERE = dirname(fileURLToPath(import.meta.url));
export const PACKAGE_DIR = resolve(HERE, '..');

export const ACKNOWLEDGEMENT_FLAG = '--i-understand-this-writes-to-my-registry';

/**
 * @param {ReadonlyArray<string>} argv
 * @returns {{ mode: 'install' | 'uninstall', apply: boolean, extensionId: string | null, nodePath: string | undefined, packageDir: string }}
 */
export function parseArgs(argv) {
  /** @param {string} flag */
  const has = (flag) => argv.includes(flag);
  /** @param {string} name @returns {string | null} */
  const valueOf = (name) => {
    const prefix = `${name}=`;
    const inline = argv.find((arg) => arg.startsWith(prefix));
    if (inline !== undefined) return inline.slice(prefix.length);
    const index = argv.indexOf(name);
    return index >= 0 && index + 1 < argv.length ? argv[index + 1] : null;
  };
  return {
    mode: has('--uninstall') ? 'uninstall' : 'install',
    // Chay kho la mac dinh. `--dry-run` duoc chap nhan de viet cho ro y, nhung khong bat buoc.
    apply: has('--apply') && has(ACKNOWLEDGEMENT_FLAG),
    extensionId: valueOf('--extension-id'),
    nodePath: valueOf('--node-path') ?? undefined,
    packageDir: valueOf('--package-dir') ?? PACKAGE_DIR,
  };
}

/**
 * Ke hoach -> van ban tat dinh. Khong dong ho, khong duong dan ngau nhien, khong thu tu Set/Map.
 * @param {{ mode: string, plan: Record<string, any> }} input
 * @returns {string}
 */
export function renderPlan({ mode, plan }) {
  const lines = [`# conversation-bridge ${mode} plan (dry-run)`, ''];
  if (typeof plan.registryKey === 'string') lines.push(`registryKey   ${plan.registryKey}`);
  if (typeof plan.registryValue === 'string') lines.push(`registryValue ${plan.registryValue}`);
  lines.push('', 'actions:');
  for (const action of plan.actions) {
    lines.push(
      action.kind === 'REGISTRY_ADD' || action.kind === 'REGISTRY_DELETE'
        ? `  ${action.kind} ${action.command} ${action.args.join(' ')}`
        : `  ${action.kind} ${action.target}`,
    );
  }
  if (typeof plan.launcherContents === 'string') {
    lines.push('', 'launcher bytes:', String(plan.launcherContents.length));
  }
  if (typeof plan.manifestContents === 'string') {
    lines.push('', 'manifest bytes:', String(plan.manifestContents.length));
  }
  lines.push('');
  return lines.join('\n');
}

/* c8 ignore start -- duong GHI THAT; khong chay trong CI va khong chay trong nhiem vu nay */
/**
 * @param {Record<string, any>} plan
 * @param {(command: string, args: ReadonlyArray<string>, cb: (e: unknown) => void) => void} runner
 */
function applyPlan(plan, runner) {
  for (const action of plan.actions) {
    if (action.kind === 'WRITE_FILE') {
      mkdirSync(dirname(action.target), { recursive: true });
      const contents =
        action.target === plan.launcherPath ? plan.launcherContents : plan.manifestContents;
      writeFileSync(action.target, contents, 'utf8');
      continue;
    }
    if (action.kind === 'DELETE_FILE') {
      rmSync(action.target, { force: true });
      continue;
    }
    runner(action.command, action.args, (error) => {
      if (error) process.exitCode = 1;
    });
  }
}

/**
 * @param {ReadonlyArray<string>} [argv]
 * @param {(text: string) => void} [write]
 */
export function main(
  argv = process.argv.slice(2),
  write = (text) => void process.stdout.write(text),
) {
  const args = parseArgs(argv);
  const built =
    args.mode === 'uninstall'
      ? buildUninstallPlan({ packageDir: args.packageDir })
      : buildInstallPlan({
          extensionId: args.extensionId ?? '',
          packageDir: args.packageDir,
          nodePath: args.nodePath,
        });
  if (!built.ok) {
    write(`ERROR ${built.error}\n`);
    if (built.error === 'EXTENSION_ID_INVALID') {
      write(
        'Truyen --extension-id <32 chu cai a-p> (lay tu chrome://extensions sau khi nap tien ich).\n',
      );
    }
    process.exitCode = 1;
    return;
  }
  write(renderPlan({ mode: args.mode, plan: /** @type {Record<string, any>} */ (built.plan) }));
  if (!args.apply) {
    write(`\nChay kho. De thuc hien that: --apply ${ACKNOWLEDGEMENT_FLAG}\n`);
    return;
  }
  applyPlan(/** @type {Record<string, any>} */ (built.plan), (command, cmdArgs, cb) =>
    execFile(command, [...cmdArgs], { windowsHide: true }, cb),
  );
  write('\nDa thuc hien.\n');
}

if (process.argv[1] && resolve(process.argv[1]) === resolve(fileURLToPath(import.meta.url))) {
  main();
}
/* c8 ignore stop */
