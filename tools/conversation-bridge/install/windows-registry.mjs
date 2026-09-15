/**
 * KE HOACH CAI DAT — mot HAM THUAN tra ve nhung gi SE thay doi, khong thay doi gi ca.
 *
 * Hop dong #204 §10 doi hoi dung hinh dang nay: co cong cu cai/go tat dinh, nhung giai doan hien
 * thuc KHONG duoc dong vao registry hay trinh duyet that. Nen phan "biet phai lam gi" (tep nay)
 * tach hoan toan khoi phan "lam" (`install.mjs`), va chi phan dau moi co bai kiem.
 *
 * BA CHO DE SAI VE THOAT KY TU, va ca ba deu duoc kiem:
 *
 *   1. `path` trong manifest JSON — duong dan Windows day gach cheo nguoc, va JSON coi gach cheo
 *      nguoc la ky tu thoat. Noi chuoi tho se de ra mot tep JSON khong parse lai duoc. Dung
 *      `JSON.stringify` cho ca tep, khong tu ghep.
 *   2. Tep `.cmd` — duong dan co dau cach phai nam trong dau nhay kep, va `%~dp0` da co san mot
 *      gach cheo nguoc o cuoi (noi them mot cai nua se ra hai).
 *   3. Gia tri registry — di qua `execFile` dang MANG doi so, khong qua shell, nen khong co lop
 *      thoat ky tu thu hai nao can lo. Do la ly do ke hoach mang `args` chu khong mang mot chuoi
 *      lenh: mot chuoi lenh se doi hoi dung mot lop trich dan nua, va do la lop hay sai nhat.
 */

/** Ten host phai trung voi hang trong `extension/background.js`. Co bai kiem hop dong khoa lai. */
export const NATIVE_HOST_NAME = 'com.nexagnet.conversation_bridge';

/** Khoa registry per-user — khong can quyen quan tri (#204 §10). */
export const REGISTRY_ROOT = 'HKCU\\Software\\Google\\Chrome\\NativeMessagingHosts';

/** ID mot tien ich Chrome: dung 32 chu cai thuong trong khoang a-p. */
const EXTENSION_ID_PATTERN = /^[a-p]{32}$/;

const HOST_DESCRIPTION =
  'Nexagnet Conversation Bridge V0 — doc GitHub mot chieu ra, day mot tin nhan danh thuc co dinh vao dung mot cuoc hoi thoai ChatGPT da arm';

/**
 * Noi duong dan trong tep `.cmd`. `%~dp0` LUON ket thuc bang mot gach cheo nguoc, nen phan sau
 * khong duoc bat dau bang gach cheo nua.
 * @param {string} relative
 */
export const launcherRelative = (relative) => `%~dp0${relative.replace(/^[\\/]+/, '')}`;

/**
 * @param {{ nodePath?: string }} [options]
 * @returns {string}
 */
export function launcherContents({ nodePath = 'node' } = {}) {
  const node = nodePath.includes(' ') ? `"${nodePath}"` : nodePath;
  return [
    '@echo off',
    'rem Chrome khoi dong tep nay; stdout cua no LA duong ong Native Messaging.',
    'rem Moi log phai ra stderr — xem native-host/log.mjs.',
    `${node} "${launcherRelative('host.mjs')}" %*`,
    '',
  ].join('\r\n');
}

/** @param {string} packageDir */
const normalizeRoot = (packageDir) => packageDir.replace(/[\\/]+$/, '');

/** @param {string} root */
const launcherPathOf = (root) => `${root}\\native-host\\launch-host.cmd`;

/** @param {string} root */
const manifestPathOf = (root) => `${root}\\install\\${NATIVE_HOST_NAME}.json`;

/**
 * @param {{ extensionId: string, packageDir: string, nodePath?: string }} input
 * @returns {{ ok: true, plan: Record<string, unknown> } | { ok: false, error: string }}
 */
export function buildInstallPlan({ extensionId, packageDir, nodePath }) {
  if (typeof extensionId !== 'string' || !EXTENSION_ID_PATTERN.test(extensionId)) {
    return { ok: false, error: 'EXTENSION_ID_INVALID' };
  }
  if (typeof packageDir !== 'string' || packageDir.trim().length === 0) {
    return { ok: false, error: 'PACKAGE_DIR_INVALID' };
  }
  const root = normalizeRoot(packageDir);
  const launcherPath = launcherPathOf(root);
  const manifestPath = manifestPathOf(root);
  const manifest = {
    name: NATIVE_HOST_NAME,
    description: HOST_DESCRIPTION,
    path: launcherPath,
    type: 'stdio',
    allowed_origins: [`chrome-extension://${extensionId}/`],
  };
  const registryKey = `${REGISTRY_ROOT}\\${NATIVE_HOST_NAME}`;
  return {
    ok: true,
    plan: Object.freeze({
      registryKey,
      registryValue: manifestPath,
      manifestPath,
      // `JSON.stringify` lo phan thoat gach cheo nguoc cua duong dan Windows.
      manifestContents: `${JSON.stringify(manifest, null, 2)}\n`,
      launcherPath,
      launcherContents: launcherContents({ nodePath }),
      actions: Object.freeze([
        { kind: 'WRITE_FILE', target: launcherPath },
        { kind: 'WRITE_FILE', target: manifestPath },
        {
          kind: 'REGISTRY_ADD',
          command: 'reg',
          args: Object.freeze([
            'add',
            registryKey,
            '/ve',
            '/t',
            'REG_SZ',
            '/d',
            manifestPath,
            '/f',
          ]),
        },
      ]),
    }),
  };
}

/**
 * @param {{ packageDir: string }} input
 * @returns {{ ok: true, plan: Record<string, unknown> } | { ok: false, error: string }}
 */
export function buildUninstallPlan({ packageDir }) {
  if (typeof packageDir !== 'string' || packageDir.trim().length === 0) {
    return { ok: false, error: 'PACKAGE_DIR_INVALID' };
  }
  const root = normalizeRoot(packageDir);
  const registryKey = `${REGISTRY_ROOT}\\${NATIVE_HOST_NAME}`;
  return {
    ok: true,
    plan: Object.freeze({
      registryKey,
      actions: Object.freeze([
        {
          kind: 'REGISTRY_DELETE',
          command: 'reg',
          args: Object.freeze(['delete', registryKey, '/f']),
        },
        { kind: 'DELETE_FILE', target: manifestPathOf(root) },
        { kind: 'DELETE_FILE', target: launcherPathOf(root) },
      ]),
    }),
  };
}
