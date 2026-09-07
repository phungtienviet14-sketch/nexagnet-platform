-- CreateEnum
CREATE TYPE "TransportTrackingSessionStatus" AS ENUM ('ACTIVE', 'CLOSED', 'EXPIRED');

-- CreateEnum
CREATE TYPE "TransportLocationSource" AS ENUM ('DEVICE_GNSS', 'DEVICE_FUSED', 'DEVICE_NETWORK', 'TELEMATICS', 'MANUAL');

-- CreateEnum
CREATE TYPE "TransportDevicePlatform" AS ENUM ('ANDROID', 'IOS', 'WEB');

-- CreateEnum
CREATE TYPE "TransportDeviceIntegrityVerdict" AS ENUM ('UNKNOWN', 'UNVERIFIED', 'BASIC', 'STRONG');

-- CreateEnum
CREATE TYPE "TransportProofRiskSeverity" AS ENUM ('INFO', 'REVIEW');

-- CreateEnum
CREATE TYPE "TransportProofRiskCode" AS ENUM ('ACCURACY_POOR', 'ACCURACY_UNKNOWN', 'MOCK_LOCATION_REPORTED', 'DEVICE_INTEGRITY_UNVERIFIED', 'CLOCK_SKEW_EXCEEDED', 'TIMESTAMP_NOT_ADVANCING', 'LARGE_TIME_GAP', 'IMPLAUSIBLE_SPEED', 'OUTSIDE_OPERATING_AREA', 'OUTSIDE_EXPECTED_GEOFENCE', 'GEOFENCE_INDETERMINATE', 'NO_GEOFENCE_CONFIGURED', 'PHOTO_MISSING', 'PHOTO_FROM_GALLERY');

-- CreateEnum
CREATE TYPE "TransportGeofenceSubjectKind" AS ENUM ('CUSTOMER', 'FUEL_SUPPLIER', 'DEPOT', 'AD_HOC');

-- HAI CAU LENH DA BI GO KHOI BAN SINH TU DONG, CO Y.
--
-- `prisma migrate diff` sinh them hai dong nay:
--
--   ALTER TABLE "DealerPriceOverride" ALTER COLUMN "updatedAt" DROP DEFAULT;
--   ALTER TABLE "User"                ALTER COLUMN "updatedAt" DROP DEFAULT;
--
-- Chung KHONG thuoc ve tranche nay. Do la do lech co san giua lich su migration va lieu do, tren
-- hai bang cua HAI MIEN KHAC (`DealerPriceOverride` la ban hang Ultty, `User` la danh tinh nen
-- tang). Mot migration cua `transport-proof` ma lang le doi hai bang do la dung cai ma §8 luat 1
-- cua hop dong di tru cam: "khong doi ten, khong doi khoa ngoai" — va rong hon, khong dong vao
-- bang cua nguoi khac de tien tay.
--
-- Ai do se gap lai hai dong nay o lan `migrate diff` sau. Cach xu ly dung la mot migration RIENG
-- do chu so huu hai bang do viet, khong phai kem theo o day.

-- CreateTable
CREATE TABLE "TransportDeviceInstallation" (
    "id" TEXT NOT NULL,
    "driverId" TEXT NOT NULL,
    "installationId" TEXT NOT NULL,
    "platform" "TransportDevicePlatform" NOT NULL,
    "appVersion" TEXT NOT NULL,
    "integrityVerdict" "TransportDeviceIntegrityVerdict" NOT NULL DEFAULT 'UNKNOWN',
    "integrityCheckedAt" TIMESTAMP(3),
    "firstSeenAt" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,
    "lastSeenAt" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,
    "revokedAt" TIMESTAMP(3),
    "revokedBy" TEXT,
    "createdAt" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,
    "updatedAt" TIMESTAMP(3) NOT NULL,

    CONSTRAINT "TransportDeviceInstallation_pkey" PRIMARY KEY ("id")
);

-- CreateTable
CREATE TABLE "TransportTrackingSession" (
    "id" TEXT NOT NULL,
    "driverId" TEXT NOT NULL,
    "tripId" TEXT NOT NULL,
    "vehicleId" TEXT,
    "deviceInstallationId" TEXT,
    "status" "TransportTrackingSessionStatus" NOT NULL DEFAULT 'ACTIVE',
    "businessDate" VARCHAR(10) NOT NULL,
    "startedAt" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,
    "endedAt" TIMESTAMP(3),
    "endedReason" TEXT,
    "observationCount" INTEGER NOT NULL DEFAULT 0,
    "openedBy" TEXT NOT NULL,
    "createdAt" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,
    "updatedAt" TIMESTAMP(3) NOT NULL,

    CONSTRAINT "TransportTrackingSession_pkey" PRIMARY KEY ("id")
);

-- CreateTable
CREATE TABLE "TransportLocationObservation" (
    "id" TEXT NOT NULL,
    "sessionId" TEXT NOT NULL,
    "clientEventId" TEXT NOT NULL,
    "latitude" DOUBLE PRECISION NOT NULL,
    "longitude" DOUBLE PRECISION NOT NULL,
    "accuracyMetres" DOUBLE PRECISION,
    "speedMetresPerSecond" DOUBLE PRECISION,
    "bearingDegrees" DOUBLE PRECISION,
    "source" "TransportLocationSource" NOT NULL,
    "capturedAt" TIMESTAMP(3) NOT NULL,
    "receivedAt" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,
    "clockSkewSeconds" INTEGER NOT NULL,
    "mockLocationReported" BOOLEAN,
    "businessDate" VARCHAR(10) NOT NULL,
    "createdAt" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,

    CONSTRAINT "TransportLocationObservation_pkey" PRIMARY KEY ("id")
);

-- CreateTable
CREATE TABLE "TransportProofRiskFlag" (
    "id" TEXT NOT NULL,
    "code" "TransportProofRiskCode" NOT NULL,
    "severity" "TransportProofRiskSeverity" NOT NULL,
    "observationId" TEXT,
    "detail" JSONB NOT NULL,
    "businessDate" VARCHAR(10) NOT NULL,
    "raisedAt" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,

    CONSTRAINT "TransportProofRiskFlag_pkey" PRIMARY KEY ("id")
);

-- CreateTable
CREATE TABLE "TransportGeofence" (
    "id" TEXT NOT NULL,
    "label" TEXT NOT NULL,
    "subjectKind" "TransportGeofenceSubjectKind" NOT NULL,
    "subjectId" TEXT,
    "latitude" DOUBLE PRECISION NOT NULL,
    "longitude" DOUBLE PRECISION NOT NULL,
    "radiusMetres" INTEGER NOT NULL,
    "status" "TransportPartyStatus" NOT NULL DEFAULT 'ACTIVE',
    "note" TEXT,
    "recordedBy" TEXT NOT NULL,
    "createdAt" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,
    "updatedAt" TIMESTAMP(3) NOT NULL,

    CONSTRAINT "TransportGeofence_pkey" PRIMARY KEY ("id")
);

-- CreateIndex
CREATE UNIQUE INDEX "TransportDeviceInstallation_installationId_key" ON "TransportDeviceInstallation"("installationId");

-- CreateIndex
CREATE INDEX "TransportDeviceInstallation_driverId_revokedAt_idx" ON "TransportDeviceInstallation"("driverId", "revokedAt");

-- CreateIndex
CREATE INDEX "TransportTrackingSession_driverId_status_idx" ON "TransportTrackingSession"("driverId", "status");

-- CreateIndex
CREATE INDEX "TransportTrackingSession_tripId_idx" ON "TransportTrackingSession"("tripId");

-- CreateIndex
CREATE INDEX "TransportTrackingSession_businessDate_idx" ON "TransportTrackingSession"("businessDate");

-- CreateIndex
CREATE INDEX "TransportLocationObservation_sessionId_capturedAt_idx" ON "TransportLocationObservation"("sessionId", "capturedAt");

-- CreateIndex
CREATE INDEX "TransportLocationObservation_businessDate_idx" ON "TransportLocationObservation"("businessDate");

-- CreateIndex
CREATE UNIQUE INDEX "TransportLocationObservation_session_event_key" ON "TransportLocationObservation"("sessionId", "clientEventId");

-- CreateIndex
CREATE INDEX "TransportProofRiskFlag_code_businessDate_idx" ON "TransportProofRiskFlag"("code", "businessDate");

-- CreateIndex
CREATE INDEX "TransportProofRiskFlag_severity_businessDate_idx" ON "TransportProofRiskFlag"("severity", "businessDate");

-- CreateIndex
CREATE INDEX "TransportProofRiskFlag_observationId_idx" ON "TransportProofRiskFlag"("observationId");

-- CreateIndex
CREATE INDEX "TransportGeofence_subjectKind_subjectId_idx" ON "TransportGeofence"("subjectKind", "subjectId");

-- CreateIndex
CREATE INDEX "TransportGeofence_status_idx" ON "TransportGeofence"("status");

-- AddForeignKey
ALTER TABLE "TransportDeviceInstallation" ADD CONSTRAINT "TransportDeviceInstallation_driverId_fkey" FOREIGN KEY ("driverId") REFERENCES "TransportDriver"("id") ON DELETE RESTRICT ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "TransportTrackingSession" ADD CONSTRAINT "TransportTrackingSession_driverId_fkey" FOREIGN KEY ("driverId") REFERENCES "TransportDriver"("id") ON DELETE RESTRICT ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "TransportTrackingSession" ADD CONSTRAINT "TransportTrackingSession_tripId_fkey" FOREIGN KEY ("tripId") REFERENCES "TransportTrip"("id") ON DELETE RESTRICT ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "TransportTrackingSession" ADD CONSTRAINT "TransportTrackingSession_vehicleId_fkey" FOREIGN KEY ("vehicleId") REFERENCES "TransportVehicle"("id") ON DELETE SET NULL ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "TransportTrackingSession" ADD CONSTRAINT "TransportTrackingSession_deviceInstallationId_fkey" FOREIGN KEY ("deviceInstallationId") REFERENCES "TransportDeviceInstallation"("id") ON DELETE SET NULL ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "TransportLocationObservation" ADD CONSTRAINT "TransportLocationObservation_sessionId_fkey" FOREIGN KEY ("sessionId") REFERENCES "TransportTrackingSession"("id") ON DELETE RESTRICT ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "TransportProofRiskFlag" ADD CONSTRAINT "TransportProofRiskFlag_observationId_fkey" FOREIGN KEY ("observationId") REFERENCES "TransportLocationObservation"("id") ON DELETE RESTRICT ON UPDATE CASCADE;

-- ---------------------------------------------------------------------------------------------
-- RANG BUOC TANG LUU TRU — Prisma khong co cu phap cho `CHECK` va cho chi muc MOT PHAN, nen
-- chung song o day.
--
-- `transport-proof-storage.spec.ts` doc CHINH TEP NAY va do neu mot ten bien mat. Ly do:
-- `prisma migrate dev` sinh migration bang cach diff lieu do voi DB va SE sinh lenh xoa tat ca
-- chung neu ai do chay no roi commit thang.
-- ---------------------------------------------------------------------------------------------

-- MOT LAI XE, MOT PHIEN DANG MO.
--
-- Day la rang buoc quan trong nhat cua ca tranche. `TrackingService` co kiem truoc khi ghi, nhung
-- mot phep kiem-roi-ghi co mot khe hep giua hai buoc: hai yeu cau mo phien den cung luc tu hai
-- thiet bi se lot qua CA HAI lan kiem, va he thong se co hai phien dang mo cho cung mot nguoi —
-- tuc hai chuoi bang chung song song ma khong ai biet cai nao ta dung su that.
--
-- Chi muc mot phan dong khe do lai o tang duy nhat khong co khe: chinh co so du lieu.
CREATE UNIQUE INDEX "TransportTrackingSession_activeDriver_key"
  ON "TransportTrackingSession" ("driverId")
  WHERE "status" = 'ACTIVE';

-- Phien DANG MO thi chua ket thuc; phien da dong thi phai co moc ket thuc. Khong co trang thai
-- thu ba, va mot hang vi pham dieu do se lam moi phep tinh thoi luong ca lai ra so am hoac null.
ALTER TABLE "TransportTrackingSession"
  ADD CONSTRAINT "TransportTrackingSession_ended_shape"
  CHECK (("status" = 'ACTIVE' AND "endedAt" IS NULL) OR ("status" <> 'ACTIVE' AND "endedAt" IS NOT NULL));

ALTER TABLE "TransportTrackingSession"
  ADD CONSTRAINT "TransportTrackingSession_businessDate_iso"
  CHECK ("businessDate" ~ '^\d{4}-\d{2}-\d{2}$');

ALTER TABLE "TransportTrackingSession"
  ADD CONSTRAINT "TransportTrackingSession_observationCount_non_negative"
  CHECK ("observationCount" >= 0);

-- TOA DO PHAI LA TOA DO.
--
-- Ba phep kiem, va cai thu ba la cai dat nhat: (0, 0) — "Null Island", ngoai khoi vinh Guinea — la
-- gia tri MAC DINH cua gan nhu moi loi dinh vi (struct zero-init, truong JSON thieu, `parseFloat`
-- that bai). No hop le ve mat toan hoc va vo nghia ve mat nghiep vu. Neu de no vao, moi lan GPS
-- hong se de lai mot toa do "hop le" o chau Phi, va nhung hang do trong nhu du lieu that o moi
-- bao cao ve sau. Tang mien cung chan no (`geo-point.ts`); o day la luoi thu hai.
ALTER TABLE "TransportLocationObservation"
  ADD CONSTRAINT "TransportLocationObservation_latitude_range"
  CHECK ("latitude" >= -90 AND "latitude" <= 90);

ALTER TABLE "TransportLocationObservation"
  ADD CONSTRAINT "TransportLocationObservation_longitude_range"
  CHECK ("longitude" >= -180 AND "longitude" <= 180);

ALTER TABLE "TransportLocationObservation"
  ADD CONSTRAINT "TransportLocationObservation_not_null_island"
  CHECK (abs("latitude") > 1e-9 OR abs("longitude") > 1e-9);

-- Sai so am khong co nghia vat ly, va no NGUY HIEM hon mot gia tri thieu: phep cham hang rao tru
-- sai so ra khoi khoang cach, nen mot so am se NONG ban kinh phan quyet ra thay vi thu hep no.
ALTER TABLE "TransportLocationObservation"
  ADD CONSTRAINT "TransportLocationObservation_accuracy_non_negative"
  CHECK ("accuracyMetres" IS NULL OR "accuracyMetres" >= 0);

ALTER TABLE "TransportLocationObservation"
  ADD CONSTRAINT "TransportLocationObservation_speed_non_negative"
  CHECK ("speedMetresPerSecond" IS NULL OR "speedMetresPerSecond" >= 0);

ALTER TABLE "TransportLocationObservation"
  ADD CONSTRAINT "TransportLocationObservation_bearing_range"
  CHECK ("bearingDegrees" IS NULL OR ("bearingDegrees" >= 0 AND "bearingDegrees" < 360));

ALTER TABLE "TransportLocationObservation"
  ADD CONSTRAINT "TransportLocationObservation_businessDate_iso"
  CHECK ("businessDate" ~ '^\d{4}-\d{2}-\d{2}$');

-- Ma su kien rong se lam khoa chan phat lai vo hieu: moi ban dinh vi rong se dung chung mot khoa
-- va chi ban dau tien duoc ghi.
ALTER TABLE "TransportLocationObservation"
  ADD CONSTRAINT "TransportLocationObservation_clientEventId_not_blank"
  CHECK (btrim("clientEventId") <> '');

-- HANG RAO: chu the phai dung hinh. `AD_HOC` la hang rao khong gan vao thuc the nao (mot diem hen
-- giao mot lan), nen no KHONG duoc co chu the; moi loai khac BUOC PHAI co. Mot hang sai hinh se
-- am tham khong bao gio duoc tim thay boi truy van theo chu the.
ALTER TABLE "TransportGeofence"
  ADD CONSTRAINT "TransportGeofence_subject_shape"
  CHECK (("subjectKind" = 'AD_HOC' AND "subjectId" IS NULL) OR ("subjectKind" <> 'AD_HOC' AND "subjectId" IS NOT NULL));

ALTER TABLE "TransportGeofence"
  ADD CONSTRAINT "TransportGeofence_latitude_range"
  CHECK ("latitude" >= -90 AND "latitude" <= 90);

ALTER TABLE "TransportGeofence"
  ADD CONSTRAINT "TransportGeofence_longitude_range"
  CHECK ("longitude" >= -180 AND "longitude" <= 180);

ALTER TABLE "TransportGeofence"
  ADD CONSTRAINT "TransportGeofence_not_null_island"
  CHECK (abs("latitude") > 1e-9 OR abs("longitude") > 1e-9);

-- Chan TREN 100 km, va do khong phai su than trong thua: mot hang rao ban kinh 10 000 km se bao
-- "trong ham" cho moi ban dinh vi tren nua qua dia cau, tuc bien ca tang hang rao thanh mot ham
-- luon tra `true` ma khong ai nhan ra. Chan DUOI 10 m vi sai so thiet bi tot nhat cung ~3-8 m.
ALTER TABLE "TransportGeofence"
  ADD CONSTRAINT "TransportGeofence_radius_range"
  CHECK ("radiusMetres" >= 10 AND "radiusMetres" <= 100000);

ALTER TABLE "TransportGeofence"
  ADD CONSTRAINT "TransportGeofence_label_not_blank"
  CHECK (btrim("label") <> '');

-- Mot ban dinh vi chi mang MOT co cho moi ma. Khong co rang buoc nay thi mot lan chay lai tang
-- cham rui ro se nhan doi moi con so trong khung nhin tom tat, va nguoi doc se thay "12 lan sai
-- so kem" cho mot chuyen chi co 6.
CREATE UNIQUE INDEX "TransportProofRiskFlag_observation_code_key"
  ON "TransportProofRiskFlag" ("observationId", "code")
  WHERE "observationId" IS NOT NULL;

