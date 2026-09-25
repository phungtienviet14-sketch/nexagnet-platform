import * as Application from 'expo-application';
import Constants from 'expo-constants';
import { Platform } from 'react-native';

/**
 * DANH TINH BAN DUNG — hien o man "Tôi" va gui kem moi yeu cau (`X-Nexagnet-Client`).
 *
 * Khi lai xe goi van phong bao "may em bam khong duoc", cau dau tien can hoi la "ban may, may
 * nao". Ba con so nay (phien ban, so ban dung, commit) tra loi cau do ma khong can doan.
 */
export type AppVariant = 'development' | 'preview' | 'production';

interface ExtraConfig {
  readonly variant?: AppVariant;
  readonly backgroundLocation?: boolean;
  readonly buildNumber?: number;
  readonly gitSha?: string | null;
  readonly allowInsecureLocal?: boolean;
}

const extra = (Constants.expoConfig?.extra ?? {}) as ExtraConfig;

export interface BuildInfo {
  readonly appName: string;
  readonly version: string;
  readonly buildNumber: string;
  readonly variant: AppVariant;
  readonly platform: 'android' | 'ios' | 'web';
  readonly gitSha: string | null;
  readonly applicationId: string | null;
  readonly backgroundLocationBuild: boolean;
}

export const BUILD_INFO: BuildInfo = {
  appName: Constants.expoConfig?.name ?? 'Nexagent Transport',
  version: Application.nativeApplicationVersion ?? Constants.expoConfig?.version ?? '0.0.0',
  buildNumber: Application.nativeBuildVersion ?? String(extra.buildNumber ?? 0),
  variant: extra.variant ?? 'development',
  platform: Platform.OS === 'ios' ? 'ios' : Platform.OS === 'android' ? 'android' : 'web',
  gitSha: extra.gitSha ?? null,
  applicationId: Application.applicationId ?? null,
  backgroundLocationBuild: extra.backgroundLocation === true,
};

/** Gia tri `X-Nexagnet-Client`. Khong chua gi nhan dang nguoi dung. */
export const CLIENT_TAG = `transport-mobile/${BUILD_INFO.version}+${BUILD_INFO.buildNumber} (${BUILD_INFO.platform}; ${BUILD_INFO.variant})`;

/** Dia chi may chu dien san cho ban thu cua mot khach — KHONG phai bi mat. */
export const DEFAULT_SERVER_URL = process.env.EXPO_PUBLIC_DEFAULT_SERVER_URL?.trim() || null;

/**
 * Chi ban phat trien — hoac ban dung SMOKE tren may ao (`APP_E2E_CLEARTEXT=on`, co y tuong minh
 * trong app.config.ts) — moi duoc noi HTTP tran, va chi toi may cuc bo/may ao (server-url.ts).
 */
export const ALLOW_INSECURE_LOCAL =
  BUILD_INFO.variant === 'development' || extra.allowInsecureLocal === true;
