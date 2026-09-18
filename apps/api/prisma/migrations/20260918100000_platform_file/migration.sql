-- CreateEnum
CREATE TYPE "PlatformFileState" AS ENUM ('STAGED', 'ACTIVE', 'WITHDRAWN', 'QUARANTINED', 'PURGED');

-- CreateEnum
CREATE TYPE "PlatformFileScanState" AS ENUM ('NOT_SCANNED', 'PENDING', 'CLEAN', 'INFECTED', 'FAILED');

-- CreateEnum
CREATE TYPE "PlatformFileStorageProvider" AS ENUM ('NONE', 'LOCAL', 'S3', 'GCS');

-- CreateEnum
CREATE TYPE "PlatformFileLinkState" AS ENUM ('ACTIVE', 'WITHDRAWN');

-- CreateTable
CREATE TABLE "PlatformFile" (
    "id" TEXT NOT NULL,
    "purpose" VARCHAR(40) NOT NULL,
    "originalFilename" TEXT NOT NULL,
    "safeFilename" TEXT NOT NULL,
    "declaredMimeType" VARCHAR(120) NOT NULL,
    "detectedMimeType" VARCHAR(120),
    "byteSize" INTEGER NOT NULL,
    "sha256" VARCHAR(64) NOT NULL,
    "storageProvider" "PlatformFileStorageProvider" NOT NULL,
    "storageKey" TEXT NOT NULL,
    "createdBy" TEXT NOT NULL,
    "state" "PlatformFileState" NOT NULL DEFAULT 'STAGED',
    "scanState" "PlatformFileScanState" NOT NULL DEFAULT 'NOT_SCANNED',
    "scannedAt" TIMESTAMP(3),
    "retainUntil" TIMESTAMP(3),
    "legalHold" BOOLEAN NOT NULL DEFAULT false,
    "captureMetadata" JSONB,
    "createdAt" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,
    "activatedAt" TIMESTAMP(3),
    "withdrawnAt" TIMESTAMP(3),
    "withdrawnBy" TEXT,
    "quarantinedAt" TIMESTAMP(3),
    "purgeRequestedAt" TIMESTAMP(3),
    "purgedAt" TIMESTAMP(3),
    "purgeAttempts" INTEGER NOT NULL DEFAULT 0,
    "purgeFailedAt" TIMESTAMP(3),
    "purgeFailureCode" VARCHAR(60),
    "updatedAt" TIMESTAMP(3) NOT NULL,

    CONSTRAINT "PlatformFile_pkey" PRIMARY KEY ("id")
);

-- CreateTable
CREATE TABLE "PlatformFileLink" (
    "id" TEXT NOT NULL,
    "fileId" TEXT NOT NULL,
    "businessOwnerType" VARCHAR(60) NOT NULL,
    "businessOwnerId" TEXT NOT NULL,
    "purpose" VARCHAR(60) NOT NULL,
    "state" "PlatformFileLinkState" NOT NULL DEFAULT 'ACTIVE',
    "createdBy" TEXT NOT NULL,
    "createdAt" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,
    "withdrawnBy" TEXT,
    "withdrawnAt" TIMESTAMP(3),

    CONSTRAINT "PlatformFileLink_pkey" PRIMARY KEY ("id")
);

-- CreateIndex
CREATE INDEX "PlatformFile_state_createdAt_idx" ON "PlatformFile"("state", "createdAt");

-- CreateIndex
CREATE INDEX "PlatformFile_createdBy_state_idx" ON "PlatformFile"("createdBy", "state");

-- CreateIndex
CREATE INDEX "PlatformFile_sha256_idx" ON "PlatformFile"("sha256");

-- CreateIndex
CREATE INDEX "PlatformFile_state_purgeRequestedAt_idx" ON "PlatformFile"("state", "purgeRequestedAt");

-- CreateIndex
CREATE INDEX "PlatformFileLink_businessOwnerType_businessOwnerId_state_idx" ON "PlatformFileLink"("businessOwnerType", "businessOwnerId", "state");

-- CreateIndex
CREATE INDEX "PlatformFileLink_fileId_state_idx" ON "PlatformFileLink"("fileId", "state");

-- AddForeignKey
ALTER TABLE "PlatformFileLink" ADD CONSTRAINT "PlatformFileLink_fileId_fkey" FOREIGN KEY ("fileId") REFERENCES "PlatformFile"("id") ON DELETE RESTRICT ON UPDATE CASCADE;

-- ===========================================================================
-- UNIQUE MOT PHAN — MOT LIEN KET DANG HIEU LUC cho mot bo
-- (tep, loai so huu, ma so huu, muc dich).
--
-- Khong co rang buoc nay thi mot lan bam hai lan sinh ra hai lien ket giong
-- het nhau, va lan rut sau do phai doan xem go cai nao. MOT PHAN vi mot lien
-- ket da go phai nhuong cho cho mot lan gan lai.
-- ===========================================================================
CREATE UNIQUE INDEX "PlatformFileLink_activeLink_key"
  ON "PlatformFileLink" ("fileId", "businessOwnerType", "businessOwnerId", "purpose")
  WHERE "state" = 'ACTIVE';

-- ===========================================================================
-- CHECK
-- ===========================================================================

-- Bam phai la hex thuong 64 ky tu. Mot chuoi rong hay mot chuoi hoa se lam
-- moi phep doi chieu toan ven ve sau im lang tra ve "khong khop".
ALTER TABLE "PlatformFile"
  ADD CONSTRAINT "PlatformFile_sha256_hex"
  CHECK ("sha256" ~ '^[0-9a-f]{64}$');

ALTER TABLE "PlatformFile"
  ADD CONSTRAINT "PlatformFile_byteSize_positive"
  CHECK ("byteSize" > 0);

ALTER TABLE "PlatformFile"
  ADD CONSTRAINT "PlatformFile_purgeAttempts_bounds"
  CHECK ("purgeAttempts" >= 0);

-- KHOA LUU TRU PHAI NAM TRONG KHU CUA NEN TANG TEP.
--
-- Cung rao ma `isPlatformFileKey()` dat o tang ung dung, lap lai o day vi cot
-- nay la mot chuoi TU DO: mot dong `UPDATE` go tay hoac mot lan nhap lieu se
-- bien duong doc thanh mot cong DOC TUY Y trong bucket — va duong don byte
-- thanh mot cong XOA tuy y, con nguy hiem hon.
ALTER TABLE "PlatformFile"
  ADD CONSTRAINT "PlatformFile_storageKey_scope"
  CHECK (
    "storageKey" LIKE 'media/platform-file/%'
    AND "storageKey" NOT LIKE '%..%'
    AND btrim("storageKey") <> ''
  );

-- HINH DANG CUA TUNG TRANG THAI — `#287` P3.
--
-- Mot hang `WITHDRAWN` khong noi duoc AI rut va LUC NAO la mot to bang chung
-- bien mat khong dau vet. Mot hang `ACTIVE` khong co moc kich hoat la mot tep
-- chua qua cong quet nao ma van dang lam bang chung.
--
-- `PURGED` doi PHAI di qua `WITHDRAWN` hoac `QUARANTINED`: byte cua mot tep
-- dang hieu luc khong duoc don, va rang buoc nay giu dieu do ke ca khi tang
-- ung dung bi di vong.
ALTER TABLE "PlatformFile"
  ADD CONSTRAINT "PlatformFile_lifecycle_shape"
  CHECK (
    ("state" = 'STAGED'
      AND "activatedAt" IS NULL AND "withdrawnAt" IS NULL
      AND "quarantinedAt" IS NULL AND "purgedAt" IS NULL)
    OR ("state" = 'ACTIVE'
      AND "activatedAt" IS NOT NULL AND "withdrawnAt" IS NULL AND "purgedAt" IS NULL)
    OR ("state" = 'WITHDRAWN'
      AND "withdrawnAt" IS NOT NULL AND "withdrawnBy" IS NOT NULL AND "purgedAt" IS NULL)
    OR ("state" = 'QUARANTINED'
      AND "quarantinedAt" IS NOT NULL AND "purgedAt" IS NULL)
    OR ("state" = 'PURGED'
      AND "purgedAt" IS NOT NULL
      AND ("withdrawnAt" IS NOT NULL OR "quarantinedAt" IS NOT NULL))
  );

-- Mot lan don byte hong phai noi duoc LUC NAO va MA GI. Mot ben co con ben kia
-- rong la mot dong nguoi van hanh khong loc duoc.
ALTER TABLE "PlatformFile"
  ADD CONSTRAINT "PlatformFile_purge_failure_shape"
  CHECK (("purgeFailedAt" IS NULL) = ("purgeFailureCode" IS NULL));

ALTER TABLE "PlatformFileLink"
  ADD CONSTRAINT "PlatformFileLink_withdraw_shape"
  CHECK (
    ("state" = 'ACTIVE' AND "withdrawnAt" IS NULL AND "withdrawnBy" IS NULL)
    OR ("state" = 'WITHDRAWN' AND "withdrawnAt" IS NOT NULL AND "withdrawnBy" IS NOT NULL)
  );

ALTER TABLE "PlatformFileLink"
  ADD CONSTRAINT "PlatformFileLink_owner_not_blank"
  CHECK (btrim("businessOwnerType") <> '' AND btrim("businessOwnerId") <> '' AND btrim("purpose") <> '');

-- ===========================================================================
-- TRIGGER 1 — MOT TEP DA GHI KHONG XOA DUOC, VA DANH TINH CUA NO KHONG DOI.
--
-- `#287` P3 bat bien 1: *"metadata/history is not hard-deleted before business
-- withdrawal"*. O day thi khong hard-delete KE CA SAU do — mot ho so bang
-- chung xoa duoc thi khong con la bang chung cho bat cu dieu gi.
--
-- Danh sach cot khoa cung quan trong khong kem. `storageKey` nam trong do, va
-- do la dong quan trong nhat: neu cot do sua duoc bang mot dong `psql` thi mot
-- hang da rut co the duoc tro sang byte cua mot tep khac — tuc vong doi bi di
-- vong ma khong lenh xoa nao duoc goi.
--
-- `sha256` cung nam trong do: mot bam sua duoc la mot phep doi chieu toan ven
-- luon luon dung, tuc vo dung.
-- ===========================================================================
CREATE OR REPLACE FUNCTION "platform_file_immutable"()
RETURNS TRIGGER AS $$
BEGIN
  IF TG_OP = 'DELETE' THEN
    RAISE EXCEPTION
      'platform_file_immutable: khong xoa duoc mot tep da ghi, hay rut roi don byte cua no';
  END IF;

  IF NEW."id" <> OLD."id"
     OR NEW."sha256" <> OLD."sha256"
     OR NEW."storageKey" <> OLD."storageKey"
     OR NEW."byteSize" <> OLD."byteSize"
     OR NEW."purpose" <> OLD."purpose"
     OR NEW."createdBy" <> OLD."createdBy"
     OR NEW."createdAt" <> OLD."createdAt"
     OR NEW."storageProvider" <> OLD."storageProvider" THEN
    RAISE EXCEPTION
      'platform_file_immutable: danh tinh cua mot tep da ghi khong doi duoc (id/sha256/storageKey/byteSize/purpose/createdBy/createdAt/storageProvider)';
  END IF;

  -- VONG DOI CHI DI MOT CHIEU. `#287` P3.
  IF OLD."state" = 'PURGED' AND NEW."state" <> 'PURGED' THEN
    RAISE EXCEPTION 'platform_file_immutable: mot tep da don byte khong quay lai duoc';
  END IF;
  IF OLD."state" IN ('WITHDRAWN', 'QUARANTINED')
     AND NEW."state" NOT IN ('WITHDRAWN', 'QUARANTINED', 'PURGED') THEN
    RAISE EXCEPTION 'platform_file_immutable: mot tep da rut hoac da cach ly khong kich hoat lai duoc';
  END IF;
  IF OLD."state" = 'ACTIVE' AND NEW."state" = 'STAGED' THEN
    RAISE EXCEPTION 'platform_file_immutable: mot tep da kich hoat khong quay ve cho kich hoat duoc';
  END IF;

  RETURN NEW;
END;
$$ LANGUAGE plpgsql;

CREATE TRIGGER "platform_file_immutable"
  BEFORE UPDATE OR DELETE ON "PlatformFile"
  FOR EACH ROW EXECUTE FUNCTION "platform_file_immutable"();

-- ===========================================================================
-- TRIGGER 2 — LUU TRU VA LENH GIU PHAP LY CHAN DON BYTE.
--
-- `#287` P3 bat bien 7 va P12 bai 12. Lap lai o tang CSDL cong ma
-- `FilePurgeService.blockedReason()` da dat, va do KHONG phai thua:
--
--   mot lenh giu theo phap ly ma mot dong `psql` di qua duoc
--   thi no khong phai mot lenh giu.
--
-- Cong nay chan dung mot phep: chuyen sang `PURGED`. Rut, cach ly, danh dau
-- can don — tat ca van di duoc. Mot lenh giu phap ly khong dong bang ho so;
-- no chi khong cho byte bien mat.
-- ===========================================================================
CREATE OR REPLACE FUNCTION "platform_file_purge_guard"()
RETURNS TRIGGER AS $$
BEGIN
  IF NEW."state" = 'PURGED' AND OLD."state" <> 'PURGED' THEN
    IF NEW."legalHold" THEN
      RAISE EXCEPTION
        'platform_file_purge_guard: tep dang duoc giu theo lenh phap ly — khong don byte duoc';
    END IF;
    IF NEW."retainUntil" IS NOT NULL AND NEW."retainUntil" > now() THEN
      RAISE EXCEPTION
        'platform_file_purge_guard: chua toi han luu tru — khong don byte duoc';
    END IF;
  END IF;
  RETURN NEW;
END;
$$ LANGUAGE plpgsql;

CREATE TRIGGER "platform_file_purge_guard"
  BEFORE UPDATE ON "PlatformFile"
  FOR EACH ROW EXECUTE FUNCTION "platform_file_purge_guard"();

-- ===========================================================================
-- TRIGGER 3 — LIEN KET LA SO GHI THEM: chi `ACTIVE -> WITHDRAWN`.
--
-- Mot lien ket go ra van o lai, mang gio va ten nguoi go. Va khong ai doi duoc
-- no tro sang mot doi tuong khac: neu `businessOwnerId` sua duoc thi mot to
-- bien nhan cua don A se thoa man duoc don B — dung lo hong ma `#279` O13 bai
-- 8 va `#287` P11 deu ton tai de chan.
-- ===========================================================================
CREATE OR REPLACE FUNCTION "platform_file_link_append_only"()
RETURNS TRIGGER AS $$
BEGIN
  IF TG_OP = 'DELETE' THEN
    RAISE EXCEPTION
      'platform_file_link_append_only: khong xoa duoc mot lien ket da ghi, hay go no';
  END IF;

  IF NEW."fileId" <> OLD."fileId"
     OR NEW."businessOwnerType" <> OLD."businessOwnerType"
     OR NEW."businessOwnerId" <> OLD."businessOwnerId"
     OR NEW."purpose" <> OLD."purpose"
     OR NEW."createdBy" <> OLD."createdBy" THEN
    RAISE EXCEPTION
      'platform_file_link_append_only: mot lien ket da ghi khong tro sang doi tuong khac duoc';
  END IF;

  IF OLD."state" <> 'ACTIVE' THEN
    RAISE EXCEPTION
      'platform_file_link_append_only: mot lien ket da go khong doi duoc nua';
  END IF;

  RETURN NEW;
END;
$$ LANGUAGE plpgsql;

CREATE TRIGGER "platform_file_link_append_only"
  BEFORE UPDATE OR DELETE ON "PlatformFileLink"
  FOR EACH ROW EXECUTE FUNCTION "platform_file_link_append_only"();
