import * as Location from 'expo-location';
import type { FrozenFix } from '../outbox/field-actions';
import { LocationCaptureError } from './location-state';

/**
 * LAY VI TRI TAI DUNG LUC BAM — cong vi tri cua cac moc "Đã đến nơi" / "Khách đã nhận".
 *
 * Thu tu giu dung web (`driver-location.ts`): khong co vi tri thi KHONG ghi moc, va noi thang "moc
 * chua duoc ghi". Ban dinh vi duoc DONG BANG ngay tai day (toa do + `capturedAt`) roi xep hang cung
 * moc — gui lai 4 tieng sau van la dung ban do, dung gio do.
 *
 * Khong dung `getLastKnownPositionAsync`: mot vi tri cu tu cuoc goi truoc co the o cach day ca
 * chuc km, va may chu khong co cach nao biet no cu.
 */
const CAPTURE_TIMEOUT_MS = 15_000;

/**
 * `maximumAge: 0` — BAT BUOC mot ban dinh vi MOI tren PWA.
 *
 * Ban web cua `expo-location` goi `navigator.geolocation.getCurrentPosition` voi
 * `maximumAge: Infinity` roi moi rai `options` len tren: khong ghi de thi trinh duyet duoc tra lai
 * BAT KY vi tri nao con trong bo nho dem, ke ca tu mot tieng truoc — dung cai "vi tri cu" ma chu
 * thich o tren cam. Tu `#398` may chu con tu choi ban dinh vi qua tuoi (`LOCATION_STALE`), nen mot
 * vi tri dem se lam lai xe ket o "Tìm lại địa điểm" toi khi tai lai trang. Native bo qua truong nay
 * (Fused Location / Core Location luon xin ban moi o day). Kieu `LocationOptions` khong khai truong
 * nay, nen mo rong kieu thay vi ep kieu.
 */
const CAPTURE_OPTIONS: Location.LocationOptions & { readonly maximumAge: number } = {
  accuracy: Location.Accuracy.High,
  mayShowUserSettingsDialog: true,
  maximumAge: 0,
};

function toFix(location: Location.LocationObject): FrozenFix {
  const { coords } = location;
  return {
    latitude: coords.latitude,
    longitude: coords.longitude,
    accuracyMetres: coords.accuracy !== null && coords.accuracy >= 0 ? coords.accuracy : null,
    speedMetresPerSecond: coords.speed !== null && coords.speed >= 0 ? coords.speed : null,
    bearingDegrees:
      coords.heading !== null && coords.heading >= 0 && coords.heading < 360
        ? coords.heading
        : null,
    // Fused Location (Android) / Core Location (iOS) deu tron nhieu nguon.
    source: 'DEVICE_FUSED',
    capturedAt: new Date(location.timestamp).toISOString(),
    // iOS khong co khai niem nay -> null, KHAC voi false ("da hoi, khong gia lap").
    mockLocationReported: typeof location.mocked === 'boolean' ? location.mocked : null,
  };
}

export async function ensureForegroundPermission(): Promise<void> {
  if (!(await Location.hasServicesEnabledAsync())) throw new LocationCaptureError('SERVICES_OFF');
  const current = await Location.getForegroundPermissionsAsync();
  if (current.granted) return;
  if (!current.canAskAgain) throw new LocationCaptureError('PERMISSION_DENIED');
  const asked = await Location.requestForegroundPermissionsAsync();
  if (!asked.granted) throw new LocationCaptureError('PERMISSION_DENIED');
}

export async function captureFix(): Promise<FrozenFix> {
  await ensureForegroundPermission();
  let timer: ReturnType<typeof setTimeout> | undefined;
  try {
    const location = await Promise.race([
      Location.getCurrentPositionAsync(CAPTURE_OPTIONS),
      new Promise<never>((_resolve, reject) => {
        timer = setTimeout(() => reject(new LocationCaptureError('TIMEOUT')), CAPTURE_TIMEOUT_MS);
      }),
    ]);
    return toFix(location);
  } catch (error) {
    if (error instanceof LocationCaptureError) throw error;
    throw new LocationCaptureError('UNAVAILABLE');
  } finally {
    if (timer) clearTimeout(timer);
  }
}

export { toFix as fixFromLocation };
