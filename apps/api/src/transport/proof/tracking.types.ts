import type { GeoPoint } from '../geo/geo-point.js';

/**
 * KIEU CUA MIEN `transport-proof`.
 *
 * Hai kieu KHUNG NHIN o cuoi tep nay la phan quan trong nhat, va chung co y khong the doi cho cho
 * nhau: `TrackingSummaryView` KHONG CO mot truong nao co the nhan mot toa do. Do la cach cung mot
 * ky thuat ma `DriverTripView` dung de khong bao gio lo doanh thu (`INV-09`) — mot tinh chat cua
 * KIEU, khong phai mot cau `if` ma ai do co the quen.
 */

export type TrackingSessionStatus = 'ACTIVE' | 'CLOSED' | 'EXPIRED';

export type LocationSource =
  /** May thu GNSS cua thiet bi. */
  | 'DEVICE_GNSS'
  /** Fused Location cua Android — tron GNSS, wifi, tram phat song. */
  | 'DEVICE_FUSED'
  /** Chi tu tram phat song / wifi — sai so hang tram met tro len. */
  | 'DEVICE_NETWORK'
  /** Tu hop GSHT tren xe, qua `VehicleTelematicsPort`. Nguon DOC LAP voi dien thoai. */
  | 'TELEMATICS'
  /** Nguoi nhap tay. Luon la nguon yeu nhat, va phai nhin ra duoc nhu vay. */
  | 'MANUAL';

export type DevicePlatform = 'ANDROID' | 'IOS' | 'WEB';

/**
 * PHAN QUYET TOAN VEN — mot THANG, khong phai mot cong nhi phan.
 *
 * `UNKNOWN` (chua hoi) va `UNVERIFIED` (da hoi, khong chung minh duoc) la HAI dieu khac nhau: cai
 * dau la mot ung dung chua cai dat kiem tra, cai sau la mot may khong qua duoc. Gop lai se lam
 * mot ban web binh thuong trong y het mot may da bi can thiep.
 *
 * KHONG mot gia tri nao o day duoc dung lam cong chan (#232 §7: khong bien mot dich vu cua mot
 * nha cung cap thanh su that cua nen tang). Chung deu chi la mot diem tren thang rui ro.
 */
export type DeviceIntegrityVerdict = 'UNKNOWN' | 'UNVERIFIED' | 'BASIC' | 'STRONG';

export type GeofenceSubjectKind = 'CUSTOMER' | 'FUEL_SUPPLIER' | 'DEPOT' | 'AD_HOC';
export type GeofenceStatus = 'ACTIVE' | 'INACTIVE';

/**
 * `INFO` = ghi lai de doi chieu ve sau. `REVIEW` = co nguoi nen nhin.
 *
 * KHONG co muc thu ba kieu `BLOCK`, va do la mot quyet dinh co chu y cua #232 D-02: khong mot co
 * nao trong he nay duoc tu dong chan mot chuyen, sinh mot khoan no hay tru mot dong luong.
 */
export type ProofRiskSeverity = 'INFO' | 'REVIEW';

/**
 * MA RUI RO — khai DAY DU ngay tu dau, ke ca cac ma chi duoc phat o tranche sau.
 *
 * Vi sao khai truoc: `ALTER TYPE ... ADD VALUE` tren Postgres khong dung duoc trong cung mot giao
 * dich voi cau lenh dung gia tri moi, va Prisma chay migration trong mot giao dich. Them mot ma
 * ve sau vi the la mot migration rieng chi de sua mot enum. Khai het mot lan re hon, va danh sach
 * nay cung la mot ban mo ta doc duoc ve nhung gi he thong CO THE noi.
 */
export type ProofRiskCode =
  /* --- do chinh xac va nguon --- */
  | 'ACCURACY_POOR'
  | 'ACCURACY_UNKNOWN'
  | 'MOCK_LOCATION_REPORTED'
  | 'DEVICE_INTEGRITY_UNVERIFIED'
  /* --- thoi gian --- */
  | 'CLOCK_SKEW_EXCEEDED'
  | 'TIMESTAMP_NOT_ADVANCING'
  | 'LARGE_TIME_GAP'
  /* --- chuyen dong --- */
  | 'IMPLAUSIBLE_SPEED'
  | 'OUTSIDE_OPERATING_AREA'
  /* --- hang rao (phat tu tranche chung cu) --- */
  | 'OUTSIDE_EXPECTED_GEOFENCE'
  | 'GEOFENCE_INDETERMINATE'
  | 'NO_GEOFENCE_CONFIGURED'
  /* --- anh chung cu (phat tu tranche chung cu) --- */
  | 'PHOTO_MISSING'
  | 'PHOTO_FROM_GALLERY';

export interface Geofence {
  readonly id: string;
  readonly label: string;
  readonly subjectKind: GeofenceSubjectKind;
  readonly subjectId: string | null;
  readonly centre: GeoPoint;
  readonly radiusMetres: number;
  readonly status: GeofenceStatus;
  readonly note: string | null;
  readonly recordedBy: string;
}

export interface DeviceInstallation {
  readonly id: string;
  readonly driverId: string;
  /** Ma do CHINH UNG DUNG sinh ra va giu. Duy nhat toan he, gan cung lai xe dau tien dung no. */
  readonly installationId: string;
  readonly platform: DevicePlatform;
  readonly appVersion: string;
  readonly integrityVerdict: DeviceIntegrityVerdict;
  readonly integrityCheckedAt: Date | null;
  readonly firstSeenAt: Date;
  readonly lastSeenAt: Date;
  readonly revokedAt: Date | null;
}

export interface TrackingSession {
  readonly id: string;
  readonly driverId: string;
  readonly tripId: string;
  /** Do MAY CHU giai tu ban phan cong chuyen. KHONG BAO GIO lay tu than yeu cau. */
  readonly vehicleId: string | null;
  readonly deviceInstallationId: string | null;
  readonly status: TrackingSessionStatus;
  readonly businessDate: string;
  readonly startedAt: Date;
  readonly endedAt: Date | null;
  readonly endedReason: string | null;
  readonly observationCount: number;
  readonly openedBy: string;
}

export interface LocationObservation {
  readonly id: string;
  readonly sessionId: string;
  /** Khoa idempotency do may khach sinh. Duy nhat TRONG mot phien. */
  readonly clientEventId: string;
  readonly point: GeoPoint;
  readonly accuracyMetres: number | null;
  readonly speedMetresPerSecond: number | null;
  readonly bearingDegrees: number | null;
  readonly source: LocationSource;
  /** Dong ho MAY KHACH. Khong phai su that. */
  readonly capturedAt: Date;
  /** Dong ho MAY CHU. Day moi la su that. */
  readonly receivedAt: Date;
  /** `capturedAt - receivedAt`, giay, co dau. Duoc GHI, khong bao gio dung de tu choi. */
  readonly clockSkewSeconds: number;
  /** `Location.isMock` cua Android. `null` = may khach khong noi gi. */
  readonly mockLocationReported: boolean | null;
  readonly businessDate: string;
}

export interface ProofRiskFlag {
  readonly id: string;
  readonly code: ProofRiskCode;
  readonly severity: ProofRiskSeverity;
  readonly observationId: string | null;
  readonly detail: Readonly<Record<string, unknown>>;
  readonly businessDate: string;
  readonly raisedAt: Date;
}

/* ------------------------------------------------------------------ *
 * LENH
 * ------------------------------------------------------------------ */

export interface OpenTrackingSessionCommand {
  readonly authUserId: string;
  readonly tripId: string;
  readonly device: {
    readonly installationId: string;
    readonly platform: DevicePlatform;
    readonly appVersion: string;
    readonly integrityVerdict?: DeviceIntegrityVerdict;
  } | null;
}

export interface IngestObservationCommand {
  readonly authUserId: string;
  readonly sessionId: string;
  readonly clientEventId: string;
  readonly latitude: unknown;
  readonly longitude: unknown;
  readonly accuracyMetres: number | null;
  readonly speedMetresPerSecond: number | null;
  readonly bearingDegrees: number | null;
  readonly source: LocationSource;
  readonly capturedAt: Date;
  readonly mockLocationReported: boolean | null;
}

/* ------------------------------------------------------------------ *
 * KHUNG NHIN — hai kieu, va chung KHONG doi cho cho nhau duoc
 * ------------------------------------------------------------------ */

/**
 * TOM TAT — cai ma van hanh va ke toan can, va la TAT CA nhung gi ho duoc thay.
 *
 * Kieu nay KHONG CO mot truong nao co the chua mot toa do. Do khong phai su tinh luoc: no la cach
 * duy nhat de cau "khong lo duong di chi tiet cua mot con nguoi cho vai khong can biet" tro thanh
 * mot tinh chat kiem duoc luc bien dich, thay vi mot loi hua trong tai lieu.
 */
export interface TrackingSummaryView {
  readonly sessionId: string;
  readonly tripId: string;
  readonly driverId: string;
  readonly status: TrackingSessionStatus;
  readonly businessDate: string;
  readonly startedAt: Date;
  readonly endedAt: Date | null;
  readonly observationCount: number;
  readonly firstObservedAt: Date | null;
  readonly lastObservedAt: Date | null;
  /** Tong quang duong CONG DON, met — mot con so, khong phai mot duong di. */
  readonly travelledMetres: number;
  readonly riskCounts: Readonly<Partial<Record<ProofRiskCode, number>>>;
  readonly highestSeverity: ProofRiskSeverity | null;
}

/**
 * DUONG DI THO — chi mo cho vai co `transport.location.history.read`.
 *
 * Moi cho tra ve kieu nay deu phai di qua mot lan `telemetry.decision` o diem
 * `tracking.history_read`, de viec "ai da xem duong di cua ai" ban than no cung co dau vet.
 */
export interface LocationTrackView {
  readonly sessionId: string;
  readonly points: readonly LocationObservation[];
}
