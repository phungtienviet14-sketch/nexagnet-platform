/**
 * Bo doc dau ra aapt2/apksigner/keytool cua `android-artifact-metadata.mjs` — chay KHONG can
 * Android SDK, tren mau dau ra that cua cac cong cu (build-tools 36, JDK 17).
 *
 * Gia tri cua bai nay nam o nhan ky: mot APK ky bang khoa debug CONG KHAI khong bao gio duoc gan
 * nhan `upload-key`, du bien moi truong co noi gi.
 */
import assert from 'node:assert/strict';
import { describe, it } from 'node:test';
import {
  DEBUG_CERT_SHA256,
  deniedPresent,
  parseApksigner,
  parseBadging,
  parseGradleIdentity,
  parseKeytoolPrintcert,
  parsePermissions,
  signingLabel,
  summarizeJarsigner,
} from './android-artifact-metadata.mjs';

const BADGING = `package: name='com.nexagnet247.transport.preview' versionCode='42' versionName='0.1.0' platformBuildVersionName='16' platformBuildVersionCode='36' compileSdkVersion='36' compileSdkVersionCodename='16'
minSdkVersion:'26'
targetSdkVersion:'36'
uses-permission: name='android.permission.INTERNET'
application-label:'Nexagent Transport (Thử)'
native-code: 'arm64-v8a' 'x86_64'
`;

const PERMISSIONS = `package: com.nexagnet247.transport.preview
uses-permission: name='android.permission.ACCESS_FINE_LOCATION'
uses-permission: name='android.permission.INTERNET'
uses-permission: name='android.permission.READ_EXTERNAL_STORAGE' maxSdkVersion='32'
permission: com.nexagnet247.transport.preview.DYNAMIC_RECEIVER_NOT_EXPORTED_PERMISSION
uses-permission: name='com.nexagnet247.transport.preview.DYNAMIC_RECEIVER_NOT_EXPORTED_PERMISSION'
`;

const APKSIGNER = `Verifies
Verified using v1 scheme (JAR signing): false
Verified using v2 scheme (APK Signature Scheme v2): true
Verified using v3 scheme (APK Signature Scheme v3): true
Verified using v3.1 scheme (APK Signature Scheme v3.1): false
Verified using v4 scheme (APK Signature Scheme v4): false
Number of signers: 1
Signer #1 certificate DN: C=US, O=Android, CN=Android Debug
Signer #1 certificate SHA-256 digest: FAC61745DC0903786FB9EDE62A962B399F7348F0BB6F899B8332667591033B9C
`;

const KEYTOOL = `Signer #1:

Certificate #1:
Owner: CN=Nexagnet Upload, O=Nexagnet, C=VN
Issuer: CN=Nexagnet Upload, O=Nexagnet, C=VN
Certificate fingerprints:
	 SHA1: 11:22:33
	 SHA256: 0A:1B:2C:3D
`;

describe('bo doc dau ra cong cu Android', () => {
  it('badging: ID, ban, SDK, ABI', () => {
    assert.deepEqual(parseBadging(BADGING), {
      applicationId: 'com.nexagnet247.transport.preview',
      versionCode: 42,
      versionName: '0.1.0',
      minSdk: 26,
      targetSdk: 36,
      nativeCode: ['arm64-v8a', 'x86_64'],
    });
  });

  it('permissions: chi uses-permission, da sap xep', () => {
    assert.deepEqual(parsePermissions(PERMISSIONS), [
      'android.permission.ACCESS_FINE_LOCATION',
      'android.permission.INTERNET',
      'android.permission.READ_EXTERNAL_STORAGE',
      'com.nexagnet247.transport.preview.DYNAMIC_RECEIVER_NOT_EXPORTED_PERMISSION',
    ]);
  });

  it('apksigner: digest chu thuong + cac scheme da xac minh', () => {
    assert.deepEqual(parseApksigner(APKSIGNER), {
      certSha256: DEBUG_CERT_SHA256,
      schemes: ['v2', 'v3'],
    });
  });

  it('apksigner: nhan ca tien to khac va hex co dau hai cham', () => {
    const colon = DEBUG_CERT_SHA256.match(/../g).join(':').toUpperCase();
    const text = [
      'Verified using v2 scheme (APK Signature Scheme v2): true',
      `Signer (minSdkVersion=26, maxSdkVersion=2147483647) certificate SHA-256 digest: ${colon}`,
    ].join('\n');
    assert.equal(parseApksigner(text).certSha256, DEBUG_CERT_SHA256);
    assert.equal(parseApksigner('Verifies').certSha256, null);
  });

  it('keytool -printcert: bo dau hai cham, chu thuong', () => {
    assert.deepEqual(parseKeytoolPrintcert(KEYTOOL), {
      certSha256: '0a1b2c3d',
      owner: 'CN=Nexagnet Upload, O=Nexagnet, C=VN',
    });
  });

  it('jarsigner: chi giu tom tat', () => {
    const summary = summarizeJarsigner(
      ['sm  1234 Thu Jan 01 base/dex/classes.dex', 'jar verified.', 'Warning:', 'x'].join('\n'),
    );
    assert.deepEqual(summary, ['jar verified.', 'Warning:']);
  });

  it('build.gradle: danh tinh cho AAB', () => {
    const gradle = `        applicationId 'com.nexagnet247.transport'\n        versionCode 7\n        versionName "0.1.0"\n`;
    assert.deepEqual(parseGradleIdentity(gradle), {
      applicationId: 'com.nexagnet247.transport',
      versionCode: 7,
      versionName: '0.1.0',
    });
  });
});

describe('nhan ky', () => {
  it('khoa debug cong khai => NOT-FOR-STORE, ke ca khi bien khoa tai len dang dat', () => {
    assert.equal(signingLabel(DEBUG_CERT_SHA256, true), 'debug-key-NOT-FOR-STORE');
    assert.equal(signingLabel(DEBUG_CERT_SHA256, false), 'debug-key-NOT-FOR-STORE');
  });
  it('khoa khac + co cau hinh khoa tai len => upload-key', () => {
    assert.equal(signingLabel('0a1b2c3d', true), 'upload-key');
  });
  it('khoa la ma khong co cau hinh => nem, khong doan', () => {
    assert.throws(() => signingLabel('0a1b2c3d', false), /khong gan nhan duoc/);
    assert.throws(() => signingLabel(null, true), /khong gan nhan duoc/);
  });
});

describe('quyen cam trong ban cuoi', () => {
  const P = (name) => `android.permission.${name}`;
  it('tat bam nen => quyen nen + FGS location la quyen cam', () => {
    const permissions = [P('INTERNET'), P('ACCESS_BACKGROUND_LOCATION'), P('RECORD_AUDIO')];
    assert.deepEqual(deniedPresent(permissions, false), [
      P('ACCESS_BACKGROUND_LOCATION'),
      P('RECORD_AUDIO'),
    ]);
    assert.deepEqual(deniedPresent(permissions, true), [P('RECORD_AUDIO')]);
  });
});
