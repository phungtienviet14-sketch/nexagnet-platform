/**
 * HOP DONG CAU HINH NATIVE — doc ban `expo prebuild` THAT, khong doc app.config.ts (#394).
 *
 *   pnpm --filter @nexagnet/transport-mobile test:native-config
 *
 * Vi sao doc tep SINH RA chu khong doc cau hinh: giua `app.config.ts` va AndroidManifest/Info.plist
 * con ca chuc config plugin (expo-location, expo-camera, image-picker, dev-client, cua repo...), va
 * moi plugin deu co the THEM quyen, THEM cau xin quyen tieng Anh mac dinh, hay THEM service. Nhung
 * thu do chinh la cai ma Google Play (An toan du lieu, khai bao FGS) va App Store (nhan quyen rieng
 * tu, 5.1.1) cham — nen bai kiem phai nhin dung cai ma cua hang se nhin.
 *
 * Moi danh sach quyen la DANH SACH DONG: them mot quyen moi (du do mot thu vien keo vao) lam bai nay
 * do, va nguoi them phai sua bai — tuc la phai tu tra loi "muc An toan du lieu nao doi theo".
 *
 * Chay offline (EXPO_OFFLINE=1), ~2-4 giay moi lan prebuild. `android/` + `ios/` bi xoa sau cung;
 * neu truoc do da co (may dev vua prebuild), chung duoc cat sang ben va tra lai nguyen ven.
 *
 * GIOI HAN: day la manifest CUA UNG DUNG truoc khi Gradle gop manifest thu vien. Quyen thu vien
 * dong gop chi bi chan neu nam trong `tools:node="remove"` — ban cuoi cung (APK) duoc kiem them o
 * CI bang `aapt2 dump permissions` (scripts/android-artifact-metadata.mjs).
 */
import assert from 'node:assert/strict';
import { spawnSync } from 'node:child_process';
import fs from 'node:fs';
import { createRequire } from 'node:module';
import path from 'node:path';
import { after, before, describe, it } from 'node:test';
import { fileURLToPath } from 'node:url';

const APP = path.resolve(path.dirname(fileURLToPath(import.meta.url)), '..');
const requireFromApp = createRequire(path.join(APP, 'package.json'));
const EXPO_CLI = requireFromApp.resolve('expo/bin/cli');
const { AndroidConfig } = requireFromApp('expo/config-plugins');
const requireFromExpo = createRequire(requireFromApp.resolve('expo/package.json'));
const requireFromConfigPlugins = createRequire(requireFromExpo.resolve('@expo/config-plugins'));
const plist = requireFromConfigPlugins('@expo/plist').default;

const NATIVE_DIRS = ['android', 'ios'];
const BACKUP = path.join(APP, '.native-contract-backup');
const BASE_ID = 'com.nexagnet247.transport';
const APP_VERSION = '0.1.0';

const P = (name) => `android.permission.${name}`;
const DECLARED_ALWAYS = [
  'ACCESS_COARSE_LOCATION',
  'ACCESS_FINE_LOCATION',
  'CAMERA',
  'INTERNET',
  'VIBRATE',
].map(P);
const DECLARED_WITH_BACKGROUND = [
  'ACCESS_BACKGROUND_LOCATION',
  'FOREGROUND_SERVICE',
  'FOREGROUND_SERVICE_LOCATION',
  'POST_NOTIFICATIONS',
].map(P);
const BLOCKED_ALWAYS = [
  'RECORD_AUDIO',
  'SYSTEM_ALERT_WINDOW',
  'READ_EXTERNAL_STORAGE',
  'WRITE_EXTERNAL_STORAGE',
  'READ_MEDIA_AUDIO',
  'READ_MEDIA_VIDEO',
].map(P);
const BLOCKED_WITHOUT_BACKGROUND = [
  'ACCESS_BACKGROUND_LOCATION',
  'FOREGROUND_SERVICE_LOCATION',
].map(P);
const LOCATION_SERVICE = 'expo.modules.location.services.LocationTaskService';
const UPLOAD_ENV = [
  'ANDROID_UPLOAD_KEYSTORE_PATH',
  'ANDROID_UPLOAD_KEYSTORE_PASSWORD',
  'ANDROID_UPLOAD_KEY_ALIAS',
  'ANDROID_UPLOAD_KEY_PASSWORD',
];

/** Co dau tieng Viet — de phan biet cau xin quyen cua ta voi cau tieng Anh mac dinh cua plugin. */
const VIETNAMESE = /[ăâđêôơưàáạảãầấậẩẫằắặẳẵèéẹẻẽềếệểễìíịỉĩòóọỏõồốộổỗờớợởỡùúụủũừứựửữỳýỵỷỹ]/i;

// ---------------------------------------------------------------------------------------------
// Chay prebuild / expo config trong moi truong SACH — CI co the dat APP_* o muc job.
// ---------------------------------------------------------------------------------------------

function cleanEnv(extra) {
  const env = { ...process.env };
  for (const key of Object.keys(env)) {
    if (/^(APP_|ANDROID_UPLOAD_|EXPO_PUBLIC_)/.test(key)) delete env[key];
  }
  return {
    ...env,
    EXPO_OFFLINE: '1',
    EXPO_NO_TELEMETRY: '1',
    EXPO_NO_GIT_STATUS: '1',
    CI: '1',
    ...extra,
  };
}

function expo(args, extraEnv) {
  return spawnSync(process.execPath, [EXPO_CLI, ...args], {
    cwd: APP,
    env: cleanEnv(extraEnv),
    encoding: 'utf8',
    timeout: 240_000,
  });
}

function prebuild(extraEnv, platform = 'all') {
  const result = expo(['prebuild', '--no-install', '--clean', '--platform', platform], extraEnv);
  assert.equal(
    result.status,
    0,
    `expo prebuild that bai voi ${JSON.stringify(extraEnv)}:\n${result.stdout}\n${result.stderr}`,
  );
}

function publicConfig(extraEnv) {
  const result = expo(['config', '--json', '--type', 'public'], extraEnv);
  assert.equal(result.status, 0, `expo config that bai:\n${result.stderr}`);
  return JSON.parse(result.stdout);
}

// ---------------------------------------------------------------------------------------------
// Chup lai tep sinh ra NGAY sau moi lan prebuild (lan sau se ghi de thu muc).
// ---------------------------------------------------------------------------------------------

function listFiles(dir) {
  return fs.readdirSync(dir, { withFileTypes: true }).flatMap((entry) => {
    const full = path.join(dir, entry.name);
    return entry.isDirectory() ? listFiles(full) : [full];
  });
}

const TEXT_FILE =
  /\.(gradle|xml|properties|kt|java|json|pro|plist|pbxproj|xcprivacy|swift|h|m|mm|storyboard|entitlements)$|Podfile$/;

function textOf(dir) {
  return listFiles(dir)
    .filter((file) => TEXT_FILE.test(file))
    .map((file) => fs.readFileSync(file, 'utf8'))
    .join('\n');
}

async function snapshotAndroid() {
  const root = path.join(APP, 'android');
  const manifestPath = path.join(root, 'app/src/main/AndroidManifest.xml');
  const manifest = await AndroidConfig.Manifest.readAndroidManifestAsync(manifestPath);
  const application = AndroidConfig.Manifest.getMainApplicationOrThrow(manifest);
  const permissions = (manifest.manifest['uses-permission'] ?? []).map((entry) => ({
    name: entry.$['android:name'],
    removed: entry.$['tools:node'] === 'remove',
  }));
  const securityRef = application.$['android:networkSecurityConfig'] ?? null;
  const securityFile = securityRef
    ? path.join(root, 'app/src/main/res/xml', `${securityRef.replace('@xml/', '')}.xml`)
    : null;
  return {
    buildGradle: fs.readFileSync(path.join(root, 'app/build.gradle'), 'utf8'),
    manifestText: fs.readFileSync(manifestPath, 'utf8'),
    application,
    declared: permissions
      .filter((p) => !p.removed)
      .map((p) => p.name)
      .sort(),
    blocked: permissions
      .filter((p) => p.removed)
      .map((p) => p.name)
      .sort(),
    services: (application.service ?? []).map((entry) => entry.$),
    securityRef,
    securityXml:
      securityFile && fs.existsSync(securityFile) ? fs.readFileSync(securityFile, 'utf8') : null,
    allText: textOf(root),
  };
}

function snapshotIos() {
  const root = path.join(APP, 'ios');
  const projects = fs.readdirSync(root).filter((name) => name.endsWith('.xcodeproj'));
  assert.equal(projects.length, 1, `can dung mot .xcodeproj, thay: ${projects.join(', ')}`);
  const name = projects[0].replace(/\.xcodeproj$/, '');
  const read = (rel) => fs.readFileSync(path.join(root, rel), 'utf8');
  const privacyPath = path.join(root, name, 'PrivacyInfo.xcprivacy');
  return {
    name,
    info: plist.parse(read(`${name}/Info.plist`)),
    pbxproj: read(`${name}.xcodeproj/project.pbxproj`),
    privacy: fs.existsSync(privacyPath) ? plist.parse(fs.readFileSync(privacyPath, 'utf8')) : null,
    schemes: fs.readdirSync(path.join(root, `${name}.xcodeproj/xcshareddata/xcschemes`)),
  };
}

async function scenario(extraEnv, platform = 'all') {
  prebuild(extraEnv, platform);
  return {
    android: platform === 'ios' ? null : await snapshotAndroid(),
    ios: platform === 'android' ? null : snapshotIos(),
  };
}

// ---------------------------------------------------------------------------------------------
// Khang dinh dung chung
// ---------------------------------------------------------------------------------------------

function assertAndroidIdentity(android, { id, buildNumber }) {
  assert.match(android.buildGradle, new RegExp(`applicationId '${id.replace(/\./g, '\\.')}'\\n`));
  assert.match(android.buildGradle, new RegExp(`versionCode ${buildNumber}\\n`));
  assert.match(android.buildGradle, new RegExp(`versionName "${APP_VERSION}"`));
}

function assertAndroidPermissions(android, { background }) {
  const expectedDeclared = [
    ...DECLARED_ALWAYS,
    ...(background ? DECLARED_WITH_BACKGROUND : []),
  ].sort();
  assert.deepEqual(
    android.declared,
    expectedDeclared,
    'Danh sach quyen KHAI BAO doi — cap nhat muc An toan du lieu (docs/privacy.md) roi sua bai nay',
  );
  const mustBlock = [...BLOCKED_ALWAYS, ...(background ? [] : BLOCKED_WITHOUT_BACKGROUND)];
  for (const permission of mustBlock) {
    assert.ok(
      android.blocked.includes(permission),
      `${permission} phai co tools:node="remove" de quyen do thu vien keo vao bi go o ban cuoi`,
    );
    assert.ok(!android.declared.includes(permission), `${permission} khong duoc khai bao`);
  }
}

function assertLocationService(android, { background }) {
  const service = android.services.find((entry) => entry['android:name'] === LOCATION_SERVICE);
  assert.ok(service, `thieu muc ${LOCATION_SERVICE} trong manifest ung dung`);
  if (background) {
    assert.equal(service['android:foregroundServiceType'], 'location');
    assert.equal(service['android:exported'], 'false');
    assert.equal(service['tools:node'], undefined);
  } else {
    assert.equal(service['tools:node'], 'remove', 'tat bam nen => service vi tri phai bi go');
    const typed = android.services.filter(
      (entry) => entry['android:foregroundServiceType'] && entry['tools:node'] !== 'remove',
    );
    assert.deepEqual(typed, [], 'tat bam nen => khong service tien canh nao duoc khai');
  }
}

function assertNoCleartext(android) {
  assert.equal(android.securityRef, null, 'ban thuong khong duoc co network security config e2e');
  assert.doesNotMatch(android.manifestText, /usesCleartextTraffic="true"/);
}

function assertDebugSigned(android) {
  assert.match(
    android.buildGradle,
    /buildTypes\s*\{[\s\S]*?release\s*\{[\s\S]*?signingConfig signingConfigs\.debug/,
  );
  for (const key of UPLOAD_ENV) assert.ok(!android.buildGradle.includes(key));
}

function assertIosIdentity(ios, { id, buildNumber }) {
  const ids = [...ios.pbxproj.matchAll(/PRODUCT_BUNDLE_IDENTIFIER = "?([^";]+)"?;/g)].map(
    (m) => m[1],
  );
  assert.ok(ids.length > 0, 'pbxproj khong co PRODUCT_BUNDLE_IDENTIFIER');
  assert.deepEqual([...new Set(ids)], [id]);
  assert.equal(ios.info.CFBundleVersion, String(buildNumber));
  assert.equal(ios.info.CFBundleShortVersionString, APP_VERSION);
  assert.deepEqual(ios.schemes, [`${ios.name}.xcscheme`], 'workflow suy scheme tu ten du an');
}

function assertIosPrivacy(ios, { background }) {
  const { info } = ios;
  for (const key of [
    'NSLocationWhenInUseUsageDescription',
    'NSCameraUsageDescription',
    'NSPhotoLibraryUsageDescription',
  ]) {
    assert.equal(typeof info[key], 'string', `thieu ${key}`);
    assert.match(info[key], VIETNAMESE, `${key} phai la cau tieng Viet cua ung dung`);
  }
  // Cau mac dinh tieng Anh cua plugin ("Allow $(PRODUCT_NAME) to ...") = xin mot quyen ung dung
  // khong noi ly do. NSLocalNetworkUsageDescription cua dev-launcher bi build phase cua chinh no
  // go khoi ban Release, nen khong tinh o day.
  for (const [key, value] of Object.entries(info)) {
    if (!key.endsWith('UsageDescription') || key === 'NSLocalNetworkUsageDescription') continue;
    assert.doesNotMatch(String(value), /^Allow \$\(PRODUCT_NAME\)/, `${key} con cau mac dinh`);
  }
  assert.equal(info.NSMotionUsageDescription, undefined, 'khong dung cam bien chuyen dong');
  assert.equal(info.NSFaceIDUsageDescription, undefined, 'khong dung Face ID');
  const modes = info.UIBackgroundModes ?? [];
  const always = [
    'NSLocationAlwaysAndWhenInUseUsageDescription',
    'NSLocationAlwaysUsageDescription',
  ];
  if (background) {
    assert.ok(modes.includes('location'), 'bat bam nen => UIBackgroundModes co location');
    for (const key of always) assert.match(info[key] ?? '', VIETNAMESE, key);
  } else {
    assert.ok(!modes.includes('location'), 'tat bam nen => KHONG co UIBackgroundModes location');
    for (const key of always) assert.equal(info[key], undefined, `${key} phai vang khi tat`);
  }
  assert.equal(info.ITSAppUsesNonExemptEncryption, false);
  assert.equal(info.NSAppTransportSecurity?.NSAllowsArbitraryLoads, false);
}

function assertPrivacyManifest(ios) {
  assert.ok(ios.privacy, 'thieu PrivacyInfo.xcprivacy');
  assert.match(
    ios.pbxproj,
    /PrivacyInfo\.xcprivacy/,
    'PrivacyInfo.xcprivacy phai nam trong du an Xcode',
  );
  assert.equal(ios.privacy.NSPrivacyTracking, false);
  assert.deepEqual(ios.privacy.NSPrivacyTrackingDomains ?? [], []);
  const collected = ios.privacy.NSPrivacyCollectedDataTypes ?? [];
  assert.deepEqual(collected.map((entry) => entry.NSPrivacyCollectedDataType).sort(), [
    'NSPrivacyCollectedDataTypePhotosorVideos',
    'NSPrivacyCollectedDataTypePreciseLocation',
    'NSPrivacyCollectedDataTypeUserID',
  ]);
  for (const entry of collected) {
    assert.equal(entry.NSPrivacyCollectedDataTypeLinked, true);
    assert.equal(entry.NSPrivacyCollectedDataTypeTracking, false);
    assert.deepEqual(entry.NSPrivacyCollectedDataTypePurposes, [
      'NSPrivacyCollectedDataTypePurposeAppFunctionality',
    ]);
  }
  const apis = (ios.privacy.NSPrivacyAccessedAPITypes ?? []).map((e) => e.NSPrivacyAccessedAPIType);
  for (const category of ['UserDefaults', 'FileTimestamp', 'SystemBootTime', 'DiskSpace']) {
    assert.ok(
      apis.includes(`NSPrivacyAccessedAPICategory${category}`),
      `thieu ly do API ${category}`,
    );
  }
}

// ---------------------------------------------------------------------------------------------
// Giu thu muc native co san cua may dev, don sach sau cung.
// ---------------------------------------------------------------------------------------------

before(() => {
  fs.rmSync(BACKUP, { recursive: true, force: true });
  for (const dir of NATIVE_DIRS) {
    const source = path.join(APP, dir);
    if (!fs.existsSync(source)) continue;
    fs.mkdirSync(BACKUP, { recursive: true });
    fs.renameSync(source, path.join(BACKUP, dir));
  }
});

after(() => {
  for (const dir of NATIVE_DIRS) {
    fs.rmSync(path.join(APP, dir), { recursive: true, force: true });
    const saved = path.join(BACKUP, dir);
    if (fs.existsSync(saved)) fs.renameSync(saved, path.join(APP, dir));
  }
  fs.rmSync(BACKUP, { recursive: true, force: true });
});

// ---------------------------------------------------------------------------------------------
// Kich ban
// ---------------------------------------------------------------------------------------------

describe('production mac dinh — ban cua hang', () => {
  let out;
  before(async () => {
    out = await scenario({ APP_VARIANT: 'production' });
  });

  it('ID goc + so ban dung mac dinh 1', () => {
    assertAndroidIdentity(out.android, { id: BASE_ID, buildNumber: 1 });
    assertIosIdentity(out.ios, { id: BASE_ID, buildNumber: 1 });
  });
  it('quyen Android: dung danh sach dong, bam nen TAT', () => {
    assertAndroidPermissions(out.android, { background: false });
    assertLocationService(out.android, { background: false });
  });
  it('khong HTTP tran, release ky bang khoa debug khi khong co khoa tai len', () => {
    assertNoCleartext(out.android);
    assertDebugSigned(out.android);
  });
  it('Info.plist: cau xin quyen tieng Viet, khong "luon luon", khong che do nen location', () => {
    assertIosPrivacy(out.ios, { background: false });
  });
  it('PrivacyInfo.xcprivacy khai dung loai du lieu thu thap', () => {
    assertPrivacyManifest(out.ios);
  });
});

describe('preview + APP_BACKGROUND_LOCATION=on + APP_BUILD_NUMBER=42', () => {
  let out;
  before(async () => {
    out = await scenario({
      APP_VARIANT: 'preview',
      APP_BACKGROUND_LOCATION: 'on',
      APP_BUILD_NUMBER: '42',
    });
  });

  it('ID .preview + versionCode/CFBundleVersion = 42', () => {
    assertAndroidIdentity(out.android, { id: `${BASE_ID}.preview`, buildNumber: 42 });
    assertIosIdentity(out.ios, { id: `${BASE_ID}.preview`, buildNumber: 42 });
  });
  it('quyen nen + FGS location + service kieu location CHI khi bat', () => {
    assertAndroidPermissions(out.android, { background: true });
    assertLocationService(out.android, { background: true });
  });
  it('iOS: NSLocationAlways* + UIBackgroundModes location khi bat', () => {
    assertIosPrivacy(out.ios, { background: true });
    assertPrivacyManifest(out.ios);
  });
  it('van khong HTTP tran', () => assertNoCleartext(out.android));
});

describe('development mac dinh', () => {
  let out;
  before(async () => {
    out = await scenario({});
  });

  it('ID .dev, bam nen mac dinh BAT o ban noi bo', () => {
    assertAndroidIdentity(out.android, { id: `${BASE_ID}.dev`, buildNumber: 1 });
    assertIosIdentity(out.ios, { id: `${BASE_ID}.dev`, buildNumber: 1 });
    assertAndroidPermissions(out.android, { background: true });
  });
});

describe('khoa tai len Android — chi System.getenv trong tep sinh ra', () => {
  const sentinels = {
    ANDROID_UPLOAD_KEYSTORE_PATH: '/khong-ton-tai/SENTINEL-duong-dan.jks',
    ANDROID_UPLOAD_KEYSTORE_PASSWORD: 'SENTINEL-mat-khau-kho-7731',
    ANDROID_UPLOAD_KEY_ALIAS: 'SENTINEL-alias-4410',
    ANDROID_UPLOAD_KEY_PASSWORD: 'SENTINEL-mat-khau-khoa-2209',
  };
  let out;
  before(async () => {
    out = await scenario({ APP_VARIANT: 'production', ...sentinels }, 'android');
  });

  it('release dung signingConfigs.release doc 4 bien moi truong', () => {
    assert.match(
      out.android.buildGradle,
      /buildTypes\s*\{[\s\S]*?release\s*\{[\s\S]*?signingConfig signingConfigs\.release/,
    );
    for (const key of UPLOAD_ENV) {
      assert.ok(out.android.buildGradle.includes(`System.getenv("${key}")`), `thieu getenv ${key}`);
    }
  });
  it('KHONG mot gia tri bi mat nao nam trong android/', () => {
    for (const value of Object.values(sentinels)) {
      assert.ok(!out.android.allText.includes(value), `ro gia tri bien moi truong vao android/`);
    }
    assert.ok(!out.android.allText.includes('SENTINEL'));
  });
  it('thieu MOT bien => prebuild tu choi, khong lui ve khoa debug', () => {
    const result = expo(['config', '--type', 'introspect'], {
      APP_VARIANT: 'production',
      ANDROID_UPLOAD_KEY_ALIAS: 'chi-co-alias',
    });
    assert.notEqual(result.status, 0);
    assert.match(result.stderr + result.stdout, /with-android-release-signing/);
  });
});

describe('ban e2e — HTTP tran CHI toi 10.0.2.2/localhost', () => {
  let out;
  before(async () => {
    out = await scenario({ APP_VARIANT: 'preview', APP_E2E_CLEARTEXT: 'on' }, 'android');
  });

  it('network security config chi mo hai ten may, base-config van cam', () => {
    assert.equal(out.android.securityRef, '@xml/nexagent_e2e_network_security');
    assert.ok(out.android.securityXml, 'thieu tep network security config');
    assert.match(out.android.securityXml, /<base-config cleartextTrafficPermitted="false"/);
    const domains = [...out.android.securityXml.matchAll(/<domain[^>]*>([^<]+)<\/domain>/g)].map(
      (m) => m[1],
    );
    assert.deepEqual(domains.sort(), ['10.0.2.2', 'localhost']);
    assert.doesNotMatch(out.android.manifestText, /usesCleartextTraffic="true"/);
  });
  it('extra.allowInsecureLocal chi bat o ban e2e', () => {
    assert.equal(
      publicConfig({ APP_VARIANT: 'preview', APP_E2E_CLEARTEXT: 'on' }).extra.allowInsecureLocal,
      true,
    );
    assert.equal(publicConfig({ APP_VARIANT: 'preview' }).extra.allowInsecureLocal, false);
  });
  it('production + APP_E2E_CLEARTEXT=on bi tu choi ngay khi doc cau hinh', () => {
    const result = expo(['config', '--json', '--type', 'public'], {
      APP_VARIANT: 'production',
      APP_E2E_CLEARTEXT: 'on',
    });
    assert.notEqual(result.status, 0);
    assert.match(result.stderr + result.stdout, /APP_E2E_CLEARTEXT/);
  });
});

describe('extra nhung vao ban dung', () => {
  it('khong co gia tri null bi bien thanh {} (gitSha vang mat thay vi null)', () => {
    const extra = publicConfig({ APP_VARIANT: 'production' }).extra;
    assert.equal(extra.gitSha, undefined);
    assert.equal(
      publicConfig({ APP_VARIANT: 'production', APP_GIT_SHA: 'abc1234' }).extra.gitSha,
      'abc1234',
    );
    assert.equal(extra.variant, 'production');
    assert.equal(extra.backgroundLocation, false);
  });
});

// ---------------------------------------------------------------------------------------------
// Icon/splash: rang buoc cua hang doc thang tu header PNG (khong can sharp).
// ---------------------------------------------------------------------------------------------

function pngHeader(file) {
  const bytes = fs.readFileSync(path.join(APP, 'assets', file));
  assert.equal(bytes.subarray(12, 16).toString('latin1'), 'IHDR', `${file} khong phai PNG`);
  return { width: bytes.readUInt32BE(16), height: bytes.readUInt32BE(20), colorType: bytes[25] };
}

describe('tai nguyen icon/splash', () => {
  it('icon.png 1024x1024 KHONG alpha (App Store tu choi icon co kenh alpha)', () => {
    assert.deepEqual(pngHeader('icon.png'), { width: 1024, height: 1024, colorType: 2 });
  });
  it('adaptive icon + monochrome 1024 trong suot; splash 512; favicon 48', () => {
    assert.deepEqual(pngHeader('adaptive-icon.png'), { width: 1024, height: 1024, colorType: 6 });
    assert.deepEqual(pngHeader('adaptive-icon-monochrome.png'), {
      width: 1024,
      height: 1024,
      colorType: 6,
    });
    assert.equal(pngHeader('splash-icon.png').width, 512);
    assert.equal(pngHeader('favicon.png').width, 48);
  });
});
