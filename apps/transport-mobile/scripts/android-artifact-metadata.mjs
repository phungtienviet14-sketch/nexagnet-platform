#!/usr/bin/env node
/**
 * HO SO MOT BAN DUNG ANDROID — `build-metadata.json` di kem moi APK/AAB cua CI (#394).
 *
 *   node scripts/android-artifact-metadata.mjs --artifact app.apk --kind apk --variant preview \
 *     --background on --gradle android/app/build.gradle --out build-metadata.json
 *
 * Tra loi bon cau hoi ma nguoi nhan mot tep .apk/.aab phai hoi, TU CHINH TEP chu khong tu y dinh
 * cua nguoi dung:
 *   1. Day la ung dung nao, ban nao?   APK: `aapt2 dump badging`. AAB: build.gradle vua sinh (can
 *                                       bundletool moi doc duoc manifest proto cua AAB).
 *   2. Ky bang khoa nao?                APK: `apksigner verify --print-certs`; AAB: `keytool
 *                                       -printcert -jarfile` + tom tat `jarsigner -verify`.
 *                                       Chu ky trung khoa debug cong khai cua template RN => nhan
 *                                       `debug-key-NOT-FOR-STORE`, bat ke ai noi gi.
 *   3. Xin nhung quyen gi (ban CUOI, sau manifest merger)?  APK: `aapt2 dump permissions`. Mot quyen
 *                                       trong danh sach cam => THOAT 1: muc An toan du lieu dang noi
 *                                       doi. (AAB: xem gioi han o cau 1.)
 *   4. Dung tu commit nao, lan chay CI nao, bam sha256 bao nhieu.
 *
 * Can ANDROID_HOME (build-tools) + JDK tren PATH. Chi chay tren runner/may co Android SDK.
 */
import { spawnSync } from 'node:child_process';
import { createHash } from 'node:crypto';
import { existsSync, readdirSync, readFileSync, statSync, writeFileSync } from 'node:fs';
import { basename, join } from 'node:path';
import process from 'node:process';
import { fileURLToPath } from 'node:url';

/** SHA-256 chung chi cua `debug.keystore` trong template React Native — CONG KHAI, ai cung co. */
export const DEBUG_CERT_SHA256 = 'fac61745dc0903786fb9ede62a962b399f7348f0bb6f899b8332667591033b9c';

const P = (name) => `android.permission.${name}`;
export const DENIED_ALWAYS = [
  'RECORD_AUDIO',
  'SYSTEM_ALERT_WINDOW',
  'READ_EXTERNAL_STORAGE',
  'WRITE_EXTERNAL_STORAGE',
  'READ_MEDIA_AUDIO',
  'READ_MEDIA_VIDEO',
].map(P);
export const DENIED_WITHOUT_BACKGROUND = [
  'ACCESS_BACKGROUND_LOCATION',
  'FOREGROUND_SERVICE_LOCATION',
].map(P);

// ---------------------------------------------------------------------------------------------
// Bo doc dau ra cong cu — thuan, co test (android-artifact-metadata.test.mjs).
// ---------------------------------------------------------------------------------------------

export function parseBadging(text) {
  const pick = (pattern) => pattern.exec(text)?.[1] ?? null;
  const nativeLine = /^native-code:(.*)$/m.exec(text)?.[1] ?? '';
  return {
    applicationId: pick(/^package: name='([^']+)'/m),
    versionCode: Number(pick(/versionCode='(\d+)'/)),
    versionName: pick(/versionName='([^']*)'/),
    minSdk: Number(pick(/^(?:minSdkVersion|sdkVersion):'(\d+)'/m)),
    targetSdk: Number(pick(/^targetSdkVersion:'(\d+)'/m)),
    nativeCode: [...nativeLine.matchAll(/'([^']+)'/g)].map((m) => m[1]),
  };
}

export function parsePermissions(text) {
  return [...text.matchAll(/^uses-permission(?:-sdk-23)?: name='([^']+)'/gm)]
    .map((m) => m[1])
    .sort();
}

export function parseApksigner(text) {
  const digest = /Signer #1 certificate SHA-256 digest: ([0-9a-f]+)/i.exec(text)?.[1] ?? null;
  const schemes = [...text.matchAll(/^Verified using (v[\d.]+) scheme[^:]*: true$/gm)].map(
    (m) => m[1],
  );
  return { certSha256: digest?.toLowerCase() ?? null, schemes };
}

export function parseKeytoolPrintcert(text) {
  const raw = /SHA256:\s*([0-9A-F:]+)/i.exec(text)?.[1] ?? null;
  const owner = /^Owner:\s*(.+)$/m.exec(text)?.[1]?.trim() ?? null;
  return { certSha256: raw ? raw.replace(/:/g, '').toLowerCase() : null, owner };
}

/** Chi giu phan tom tat — danh sach tung muc cua jarsigner dai hang nghin dong. */
export function summarizeJarsigner(text) {
  const keep =
    /^(jar verified\.|jar is unsigned\.|Warning:|This jar contains|The signer certificate|- Signed by|\s+Digest algorithm|\s+Signature algorithm)/;
  return text
    .split('\n')
    .filter((line) => keep.test(line))
    .map((line) => line.trim())
    .slice(0, 12);
}

export function parseGradleIdentity(text) {
  return {
    applicationId: /applicationId '([^']+)'/.exec(text)?.[1] ?? null,
    versionCode: Number(/versionCode (\d+)/.exec(text)?.[1]),
    versionName: /versionName "([^"]+)"/.exec(text)?.[1] ?? null,
  };
}

export function signingLabel(certSha256, uploadKeyConfigured) {
  if (certSha256 === DEBUG_CERT_SHA256) return 'debug-key-NOT-FOR-STORE';
  if (certSha256 && uploadKeyConfigured) return 'upload-key';
  throw new Error(
    `Chu ky ${certSha256 ?? '(khong doc duoc)'} khong phai khoa debug ma cung khong co khoa tai len duoc cau hinh — khong gan nhan duoc.`,
  );
}

export function deniedPresent(permissions, backgroundLocation) {
  const denied = [...DENIED_ALWAYS, ...(backgroundLocation ? [] : DENIED_WITHOUT_BACKGROUND)];
  return permissions.filter((permission) => denied.includes(permission));
}

// ---------------------------------------------------------------------------------------------
// Chay cong cu SDK
// ---------------------------------------------------------------------------------------------

function run(command, args) {
  const result = spawnSync(command, args, { encoding: 'utf8', maxBuffer: 64 * 1024 * 1024 });
  if (result.error) throw result.error;
  return { status: result.status, output: `${result.stdout ?? ''}${result.stderr ?? ''}` };
}

function buildTool(name) {
  const sdk = process.env.ANDROID_HOME ?? process.env.ANDROID_SDK_ROOT;
  if (!sdk) throw new Error('Thieu ANDROID_HOME — can build-tools (aapt2, apksigner).');
  const root = join(sdk, 'build-tools');
  const versions = readdirSync(root)
    .filter((dir) => existsSync(join(root, dir, name)))
    .sort((a, b) => b.localeCompare(a, undefined, { numeric: true }));
  if (versions.length === 0) throw new Error(`Khong tim thay ${name} trong ${root}`);
  return join(root, versions[0], name);
}

function describeApk(file, background) {
  const badging = run(buildTool('aapt2'), ['dump', 'badging', file]);
  if (badging.status !== 0) throw new Error(`aapt2 dump badging that bai:\n${badging.output}`);
  const permissions = parsePermissions(
    run(buildTool('aapt2'), ['dump', 'permissions', file]).output,
  );
  const verify = run(buildTool('apksigner'), ['verify', '--print-certs', '--verbose', file]);
  if (verify.status !== 0) throw new Error(`apksigner verify that bai:\n${verify.output}`);
  const signer = parseApksigner(verify.output);
  return {
    identitySource: 'aapt2 dump badging',
    ...parseBadging(badging.output),
    permissions,
    deniedPermissions: deniedPresent(permissions, background),
    signerCertSha256: signer.certSha256,
    signatureSchemes: signer.schemes,
  };
}

function describeAab(file, gradlePath) {
  const printcert = parseKeytoolPrintcert(run('keytool', ['-printcert', '-jarfile', file]).output);
  const jar = run('jarsigner', ['-verify', '-verbose', '-certs', file]);
  if (jar.status !== 0) throw new Error(`jarsigner -verify that bai:\n${jar.output.slice(-2000)}`);
  return {
    identitySource: `${basename(gradlePath)} (bundletool khong co tren runner — xem docs/phat-hanh.md)`,
    ...parseGradleIdentity(readFileSync(gradlePath, 'utf8')),
    permissions: null,
    deniedPermissions: [],
    signerCertSha256: printcert.certSha256,
    signerOwner: printcert.owner,
    jarsigner: summarizeJarsigner(jar.output),
  };
}

function parseArgs(argv) {
  const args = {};
  for (let i = 0; i < argv.length; i += 2) {
    const key = argv[i]?.replace(/^--/, '');
    if (!key || argv[i + 1] === undefined) throw new Error(`Doi so thieu gia tri: ${argv[i]}`);
    args[key] = argv[i + 1];
  }
  for (const key of ['artifact', 'kind', 'variant', 'background', 'out']) {
    if (!args[key]) throw new Error(`Thieu --${key}`);
  }
  if (args.kind !== 'apk' && args.kind !== 'aab') throw new Error('--kind phai la apk|aab');
  if (args.background !== 'on' && args.background !== 'off') throw new Error('--background on|off');
  if (args.kind === 'aab' && !args.gradle)
    throw new Error('AAB can --gradle android/app/build.gradle');
  return args;
}

function main() {
  const args = parseArgs(process.argv.slice(2));
  const file = args.artifact;
  const bytes = readFileSync(file);
  const background = args.background === 'on';
  const details =
    args.kind === 'apk' ? describeApk(file, background) : describeAab(file, args.gradle);
  const uploadKeyConfigured = (process.env.ANDROID_UPLOAD_KEYSTORE_PATH ?? '').trim() !== '';
  const metadata = {
    artifact: basename(file),
    kind: args.kind,
    variant: args.variant,
    backgroundLocation: background,
    gitSha: process.env.GITHUB_SHA ?? process.env.APP_GIT_SHA ?? null,
    ciRun: process.env.GITHUB_RUN_ID
      ? {
          id: process.env.GITHUB_RUN_ID,
          number: process.env.GITHUB_RUN_NUMBER,
          attempt: process.env.GITHUB_RUN_ATTEMPT,
        }
      : null,
    sha256: createHash('sha256').update(bytes).digest('hex'),
    sizeBytes: statSync(file).size,
    signing: signingLabel(details.signerCertSha256, uploadKeyConfigured),
    ...details,
  };
  writeFileSync(args.out, `${JSON.stringify(metadata, null, 2)}\n`);
  process.stdout.write(`${JSON.stringify(metadata, null, 2)}\n`);
  if (metadata.deniedPermissions.length > 0) {
    process.stderr.write(
      `Ban cuoi xin quyen bi cam: ${metadata.deniedPermissions.join(', ')} — sua blockedPermissions trong app.config.ts.\n`,
    );
    process.exit(1);
  }
}

if (process.argv[1] === fileURLToPath(import.meta.url)) main();
