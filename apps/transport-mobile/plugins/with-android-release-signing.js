/* eslint-disable @typescript-eslint/no-require-imports -- Expo nap config plugin bang require() (CommonJS), day la hop dong cua prebuild chu khong phai lua chon */
const { withAppBuildGradle } = require('expo/config-plugins');

/**
 * KY BAN PHAT HANH ANDROID BANG KHOA TAI LEN (upload key) — ma KHONG de bi mat cham vao tep sinh ra.
 *
 * Mac dinh cua Expo: buildType `release` ky bang `debug.keystore` cua template. Ban do cai tay va
 * chay tren may ao duoc, nhung Google Play TU CHOI no — va CI dan nhan no `debug-key-NOT-FOR-STORE`.
 *
 * Plugin nay chi doi mac dinh do khi LUC PREBUILD co du CA BON bien:
 *   ANDROID_UPLOAD_KEYSTORE_PATH  ANDROID_UPLOAD_KEYSTORE_PASSWORD
 *   ANDROID_UPLOAD_KEY_ALIAS      ANDROID_UPLOAD_KEY_PASSWORD
 *
 * Khi do `android/app/build.gradle` duoc them `signingConfigs.release` chi gom `System.getenv(...)`:
 * gia tri that duoc Gradle DOC LUC CHAY, khong bao gio duoc viet ra dia. Ly do: thu muc `android/`
 * la hang sinh — no bi nen vao cache, dinh kem vao bao loi, doi khi bi commit nham. Mot mat khau
 * nam trong do la mot mat khau da lo.
 *
 * FAIL CLOSED o ca hai dau:
 *   - Luc prebuild: co MOT PHAN bien (vd quen alias) la LOI, khong lang le quay ve khoa debug —
 *     nguoi dat bien ro rang muon khoa tai len.
 *   - Luc Gradle: prebuild voi khoa tai len nhung chay Gradle thieu bien => storeFile/mat khau
 *     rong => AGP dung o `validateSigningRelease`. Khong co duong nao ra mot ban "tuong la ky that".
 *
 * Plugin KHONG sinh khoa, KHONG luu khoa. Tao khoa + dat 4 secret: docs/phat-hanh.md §4.
 */

const ENV_KEYS = [
  'ANDROID_UPLOAD_KEYSTORE_PATH',
  'ANDROID_UPLOAD_KEYSTORE_PASSWORD',
  'ANDROID_UPLOAD_KEY_ALIAS',
  'ANDROID_UPLOAD_KEY_PASSWORD',
];

const MARKER = '@nexagent/release-signing';

/** `true` khi du 4 bien; `false` khi khong co bien nao; nem khi chi co mot phan. */
function uploadKeyRequested(env) {
  const present = ENV_KEYS.filter((key) => (env[key] ?? '').trim() !== '');
  if (present.length === 0) return false;
  if (present.length !== ENV_KEYS.length) {
    const missing = ENV_KEYS.filter((key) => !present.includes(key));
    throw new Error(
      `[with-android-release-signing] Co ${present.join(', ')} nhung thieu ${missing.join(', ')}. ` +
        'Dat du ca bon bien de ky bang khoa tai len, hoac bo het de dung khoa debug (KHONG phat hanh duoc).',
    );
  }
  return true;
}

const RELEASE_SIGNING_BLOCK = `
        release {
            // ${MARKER}: khoa tai len doc tu MOI TRUONG luc Gradle chay — tep nay khong chua bi mat.
            // Thieu bien => AGP dung o validateSigningRelease, khong lui ve khoa debug.
            storeFile System.getenv("ANDROID_UPLOAD_KEYSTORE_PATH") ? file(System.getenv("ANDROID_UPLOAD_KEYSTORE_PATH")) : null
            storePassword System.getenv("ANDROID_UPLOAD_KEYSTORE_PASSWORD")
            keyAlias System.getenv("ANDROID_UPLOAD_KEY_ALIAS")
            keyPassword System.getenv("ANDROID_UPLOAD_KEY_PASSWORD")
        }`;

/** Sua build.gradle; nem khi khuon template doi — mot lan "khong tim thay" lang le = ban ky debug. */
function applyReleaseSigning(contents) {
  if (contents.includes(MARKER)) return contents;

  const buildTypeRelease =
    /(buildTypes\s*\{[\s\S]*?\brelease\s*\{[\s\S]*?)signingConfig\s+signingConfigs\.debug/;
  if (!buildTypeRelease.test(contents)) {
    throw new Error(
      '[with-android-release-signing] Khong tim thay `buildTypes { release { signingConfig signingConfigs.debug` trong android/app/build.gradle — template Expo da doi, cap nhat plugin.',
    );
  }
  const withBuildType = contents.replace(
    buildTypeRelease,
    '$1signingConfig signingConfigs.release',
  );

  const signingConfigs = /signingConfigs\s*\{/;
  if (!signingConfigs.test(withBuildType)) {
    throw new Error(
      '[with-android-release-signing] Khong tim thay khoi `signingConfigs {` trong android/app/build.gradle.',
    );
  }
  return withBuildType.replace(signingConfigs, (match) => `${match}${RELEASE_SIGNING_BLOCK}`);
}

const withAndroidReleaseSigning = (config) => {
  if (!uploadKeyRequested(process.env)) return config;
  return withAppBuildGradle(config, (gradleConfig) => {
    if (gradleConfig.modResults.language !== 'groovy') {
      throw new Error(
        '[with-android-release-signing] Chi ho tro android/app/build.gradle (Groovy).',
      );
    }
    gradleConfig.modResults.contents = applyReleaseSigning(gradleConfig.modResults.contents);
    return gradleConfig;
  });
};

module.exports = withAndroidReleaseSigning;
module.exports.applyReleaseSigning = applyReleaseSigning;
module.exports.uploadKeyRequested = uploadKeyRequested;
module.exports.ENV_KEYS = ENV_KEYS;
