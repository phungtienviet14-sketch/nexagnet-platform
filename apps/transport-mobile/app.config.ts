import type { ConfigContext, ExpoConfig } from 'expo/config';

/**
 * CAU HINH NATIVE — nguon DUY NHAT cua moi thu nam trong AndroidManifest/Info.plist (#394).
 *
 * `android/` va `ios/` KHONG duoc commit: chung duoc SINH tu tep nay bang `expo prebuild`
 * (Continuous Native Generation). Sua quyen, ID, icon, chuoi xin quyen O DAY; sua trong thu muc
 * sinh ra se mat o lan prebuild sau. Hop dong quyen duoc khoa bang
 * `scripts/native-config.contract.test.mjs` (doc ban prebuild THAT).
 *
 * BIEN MOI TRUONG (khong bien nao la bi mat — ky phat hanh nam ngoai repo, xem docs/phat-hanh.md):
 *   APP_VARIANT             development | preview | production   (mac dinh: development)
 *   APP_BUILD_NUMBER        so nguyen tang dan: versionCode Android + CFBundleVersion iOS
 *   APP_BUNDLE_ID           ghi de ID goc (mac dinh com.nexagnet247.transport)
 *   APP_BACKGROUND_LOCATION on | off — bam vi tri NEN trong ca chay (mac dinh: on o preview/dev,
 *                           off o production cho toi khi khai bao Google Play duoc duyet — M-01)
 *   EXPO_PUBLIC_DEFAULT_SERVER_URL  dia chi may chu dien san (ban thu cho mot khach)
 *   APP_E2E_CLEARTEXT       on | off — CHI ban kiem thu e2e tren may ao: cho HTTP tran toi 10.0.2.2/
 *                           localhost (plugins/with-android-e2e-cleartext.js). Cam voi production.
 *   APP_GIT_SHA             commit cua ban dung, hien o man "Tôi" (CI dat bang github.sha)
 *
 * KY PHAT HANH ANDROID: `ANDROID_UPLOAD_KEYSTORE_PATH/_PASSWORD`, `ANDROID_UPLOAD_KEY_ALIAS/_PASSWORD`
 * — LA bi mat, nhung khong bao gio vao tep sinh ra: plugins/with-android-release-signing.js chi viet
 * `System.getenv(...)`. Thieu ca bon => release ky bang khoa debug (khong len Play duoc).
 */

type Variant = 'development' | 'preview' | 'production';

const VARIANT: Variant = ((): Variant => {
  const raw = process.env.APP_VARIANT ?? 'development';
  if (raw === 'development' || raw === 'preview' || raw === 'production') return raw;
  throw new Error(`APP_VARIANT khong hop le: ${raw}`);
})();

/**
 * ID ung dung KHONG DOI DUOC sau lan tai len dau tien len Google Play / App Store. Mac dinh la ten
 * mien dao nguoc cua `nexagnet247.com` (ten mien chu so huu dang dung). Chu so huu PHAI xac nhan
 * truoc lan tai len dau — xem docs/phat-hanh.md §1.
 */
const BASE_ID = process.env.APP_BUNDLE_ID ?? 'com.nexagnet247.transport';
const APP_ID =
  VARIANT === 'production' ? BASE_ID : `${BASE_ID}.${VARIANT === 'preview' ? 'preview' : 'dev'}`;
const NAME_SUFFIX = VARIANT === 'production' ? '' : VARIANT === 'preview' ? ' (Thử)' : ' (Dev)';

const BUILD_NUMBER = ((): number => {
  const raw = process.env.APP_BUILD_NUMBER ?? '1';
  const value = Number(raw);
  if (!Number.isInteger(value) || value < 1 || value > 2_100_000_000) {
    throw new Error(`APP_BUILD_NUMBER phai la so nguyen duong: ${raw}`);
  }
  return value;
})();

/**
 * Ban kiem thu e2e (APK chay tren may ao CI) — KHONG BAO GIO la ban cua hang. Tu choi ngay o day
 * neu ai do ghep no voi production: loi luc prebuild re hon mot APK noi HTTP tran len Play.
 */
const E2E_CLEARTEXT = ((): boolean => {
  const raw = process.env.APP_E2E_CLEARTEXT ?? 'off';
  if (raw !== 'on' && raw !== 'off') throw new Error(`APP_E2E_CLEARTEXT phai la on|off: ${raw}`);
  if (raw === 'on' && VARIANT === 'production') {
    throw new Error('APP_E2E_CLEARTEXT=on chi danh cho ban kiem thu, khong dung voi production');
  }
  return raw === 'on';
})();

const BACKGROUND_LOCATION = ((): boolean => {
  const raw = process.env.APP_BACKGROUND_LOCATION ?? (VARIANT === 'production' ? 'off' : 'on');
  if (raw !== 'on' && raw !== 'off')
    throw new Error(`APP_BACKGROUND_LOCATION phai la on|off: ${raw}`);
  return raw === 'on';
})();

/** Chuoi xin quyen — noi DUNG viec ung dung lam, bang tieng Viet, khong hua qua. */
const PERMISSION_TEXT = {
  locationWhenInUse:
    'Ứng dụng lấy vị trí tại đúng lúc bạn bấm mốc giao nhận (đã tới, đã giao) để làm bằng chứng hiện trường cho chuyến được giao.',
  locationAlways:
    'Khi bạn bật "Bám vị trí ca chạy", ứng dụng ghi vị trí xe trong lúc vòng chạy đang mở — kể cả khi màn hình tắt — và dừng khi vòng chạy kết thúc hoặc bạn tắt.',
  camera: 'Chụp ảnh chứng từ giao nhận, phiếu đổ dầu và biên nhận ngay tại hiện trường.',
  photos: 'Chọn ảnh chứng từ đã chụp trước đó. Ảnh chọn từ thư viện được ghi rõ là "từ thư viện".',
} as const;

export default ({ config }: ConfigContext): ExpoConfig => ({
  ...config,
  name: `Nexagent Transport${NAME_SUFFIX}`,
  slug: 'nexagent-transport',
  scheme: VARIANT === 'production' ? 'nexagent-transport' : `nexagent-transport-${VARIANT}`,
  version: '0.1.0',
  runtimeVersion: { policy: 'appVersion' },
  orientation: 'portrait',
  userInterfaceStyle: 'automatic',
  icon: './assets/icon.png',
  ios: {
    bundleIdentifier: APP_ID,
    buildNumber: String(BUILD_NUMBER),
    supportsTablet: false,
    config: { usesNonExemptEncryption: false },
    infoPlist: {
      NSLocationWhenInUseUsageDescription: PERMISSION_TEXT.locationWhenInUse,
      ...(BACKGROUND_LOCATION
        ? {
            NSLocationAlwaysAndWhenInUseUsageDescription: PERMISSION_TEXT.locationAlways,
            NSLocationAlwaysUsageDescription: PERMISSION_TEXT.locationAlways,
          }
        : {}),
      NSCameraUsageDescription: PERMISSION_TEXT.camera,
      NSPhotoLibraryUsageDescription: PERMISSION_TEXT.photos,
      // `ITSAppUsesNonExemptEncryption` do `config.usesNonExemptEncryption` o tren viet — khai
      // hai noi thi prebuild bo mot noi va canh bao (chi dung HTTPS cua he dieu hanh => false).
    },
    privacyManifests: {
      NSPrivacyTracking: false,
      NSPrivacyTrackingDomains: [],
      NSPrivacyCollectedDataTypes: [
        {
          NSPrivacyCollectedDataType: 'NSPrivacyCollectedDataTypePreciseLocation',
          NSPrivacyCollectedDataTypeLinked: true,
          NSPrivacyCollectedDataTypeTracking: false,
          NSPrivacyCollectedDataTypePurposes: ['NSPrivacyCollectedDataTypePurposeAppFunctionality'],
        },
        {
          NSPrivacyCollectedDataType: 'NSPrivacyCollectedDataTypePhotosorVideos',
          NSPrivacyCollectedDataTypeLinked: true,
          NSPrivacyCollectedDataTypeTracking: false,
          NSPrivacyCollectedDataTypePurposes: ['NSPrivacyCollectedDataTypePurposeAppFunctionality'],
        },
        {
          NSPrivacyCollectedDataType: 'NSPrivacyCollectedDataTypeUserID',
          NSPrivacyCollectedDataTypeLinked: true,
          NSPrivacyCollectedDataTypeTracking: false,
          NSPrivacyCollectedDataTypePurposes: ['NSPrivacyCollectedDataTypePurposeAppFunctionality'],
        },
      ],
      NSPrivacyAccessedAPITypes: [
        {
          NSPrivacyAccessedAPIType: 'NSPrivacyAccessedAPICategoryUserDefaults',
          NSPrivacyAccessedAPITypeReasons: ['CA92.1'],
        },
        {
          NSPrivacyAccessedAPIType: 'NSPrivacyAccessedAPICategoryFileTimestamp',
          NSPrivacyAccessedAPITypeReasons: ['C617.1'],
        },
        {
          NSPrivacyAccessedAPIType: 'NSPrivacyAccessedAPICategorySystemBootTime',
          NSPrivacyAccessedAPITypeReasons: ['35F9.1'],
        },
        {
          NSPrivacyAccessedAPIType: 'NSPrivacyAccessedAPICategoryDiskSpace',
          NSPrivacyAccessedAPITypeReasons: ['E174.1'],
        },
      ],
    },
  },
  android: {
    package: APP_ID,
    versionCode: BUILD_NUMBER,
    adaptiveIcon: {
      foregroundImage: './assets/adaptive-icon.png',
      monochromeImage: './assets/adaptive-icon-monochrome.png',
      backgroundColor: '#0E5C63',
    },
    // Chan nhung quyen do THU VIEN keo vao ma ung dung KHONG dung: ghi am (expo-camera), cua so
    // noi (dev client), bo nho ngoai kieu cu (image-picker). Moi quyen thua la mot dong phai giai
    // trinh o muc An toan du lieu cua Google Play.
    blockedPermissions: [
      'android.permission.RECORD_AUDIO',
      'android.permission.SYSTEM_ALERT_WINDOW',
      'android.permission.READ_EXTERNAL_STORAGE',
      'android.permission.WRITE_EXTERNAL_STORAGE',
      'android.permission.READ_MEDIA_AUDIO',
      'android.permission.READ_MEDIA_VIDEO',
      // Tat bam nen => chan ca quyen nen LAN quyen dich vu tien canh kieu vi tri, de khong thu vien
      // nao gop lai chung vao ban cuoi (service di kem do plugins/with-run-tracking-service.js go).
      ...(BACKGROUND_LOCATION
        ? []
        : [
            'android.permission.ACCESS_BACKGROUND_LOCATION',
            'android.permission.FOREGROUND_SERVICE_LOCATION',
          ]),
    ],
    permissions: [
      'android.permission.ACCESS_COARSE_LOCATION',
      'android.permission.ACCESS_FINE_LOCATION',
      'android.permission.CAMERA',
      ...(BACKGROUND_LOCATION
        ? [
            'android.permission.ACCESS_BACKGROUND_LOCATION',
            'android.permission.FOREGROUND_SERVICE',
            'android.permission.FOREGROUND_SERVICE_LOCATION',
            'android.permission.POST_NOTIFICATIONS',
          ]
        : []),
    ],
  },
  web: {
    bundler: 'metro',
    output: 'single',
    favicon: './assets/favicon.png',
  },
  plugins: [
    'expo-router',
    // Khong dung `requireAuthentication` (xem secure-session-storage.ts) => khong xin Face ID; de
    // mac dinh thi Info.plist mang mot cau xin quyen tieng Anh cho mot viec ung dung khong lam.
    ['expo-secure-store', { configureAndroidBackup: true, faceIDPermission: false }],
    'expo-sqlite',
    [
      'expo-location',
      {
        locationWhenInUsePermission: PERMISSION_TEXT.locationWhenInUse,
        // `false` XOA khoa khoi Info.plist; bo trong thi plugin tu dien cau tieng Anh mac dinh cho
        // CA quyen "luon luon" lan cam bien chuyen dong — hai viec ban tat nen khong lam.
        locationAlwaysAndWhenInUsePermission: BACKGROUND_LOCATION
          ? PERMISSION_TEXT.locationAlways
          : false,
        locationAlwaysPermission: BACKGROUND_LOCATION ? PERMISSION_TEXT.locationAlways : false,
        motionUsagePermission: false,
        isIosBackgroundLocationEnabled: BACKGROUND_LOCATION,
        isAndroidBackgroundLocationEnabled: BACKGROUND_LOCATION,
        isAndroidForegroundServiceEnabled: BACKGROUND_LOCATION,
      },
    ],
    [
      'expo-camera',
      {
        cameraPermission: PERMISSION_TEXT.camera,
        microphonePermission: false,
        recordAudioAndroid: false,
        // Khong quet ma vach: tat de khong keo ML Kit vao APK.
        barcodeScannerEnabled: false,
      },
    ],
    [
      'expo-image-picker',
      {
        photosPermission: PERMISSION_TEXT.photos,
        cameraPermission: PERMISSION_TEXT.camera,
        microphonePermission: false,
      },
    ],
    [
      'expo-splash-screen',
      {
        image: './assets/splash-icon.png',
        imageWidth: 160,
        resizeMode: 'contain',
        backgroundColor: '#F4F1EA',
        dark: { image: './assets/splash-icon.png', backgroundColor: '#0F1113' },
      },
    ],
    '@maplibre/maplibre-react-native',
    [
      'expo-build-properties',
      {
        android: { minSdkVersion: 26 },
        ios: { deploymentTarget: '16.4' },
      },
    ],
    'expo-font',
    // Plugin cua repo (plugins/) — CommonJS vi prebuild nap chung bang require().
    ['./plugins/with-run-tracking-service.js', { enabled: BACKGROUND_LOCATION }],
    './plugins/with-android-release-signing.js',
    './plugins/with-android-e2e-cleartext.js',
  ],
  experiments: { typedRoutes: true },
  extra: {
    variant: VARIANT,
    backgroundLocation: BACKGROUND_LOCATION,
    buildNumber: BUILD_NUMBER,
    // BO khoa khi khong co commit, KHONG ghi `null`: cau hinh cong khai cua Expo (thu duoc nhung
    // vao ban dung) bien `null` thanh `{}` — mot object truthy lam `gitSha.slice` o man "Tôi" nem.
    ...(process.env.APP_GIT_SHA?.trim() ? { gitSha: process.env.APP_GIT_SHA.trim() } : {}),
    // Doc boi src/config/build-info.ts (ALLOW_INSECURE_LOCAL): chi ban e2e moi nhan http:// toi
    // 10.0.2.2/localhost. Di cung network security config cua plugin cleartext o tren.
    allowInsecureLocal: E2E_CLEARTEXT,
  },
});
