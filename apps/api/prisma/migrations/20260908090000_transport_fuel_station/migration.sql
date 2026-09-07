-- CreateEnum
CREATE TYPE "TransportFuelIngestChannel" AS ENUM ('STATEMENT_FILE', 'EINVOICE');

-- AlterTable
--
-- CHIN COT MOI, TAT CA NULLABLE (hoac mang rong). Khong cot nao co `NOT NULL` va khong cot nao co
-- `DEFAULT` phai tinh tren tung hang, nen `ALTER TABLE ... ADD COLUMN` o Postgres 11+ chi ghi
-- catalogue va KHONG viet lai bang. Tren mot bang cay xang cua doi ~10 xe dieu do la tuc thi, va
-- no van dung o quy mo lon hon — do la ly do chon dang nay thay vi mot cot `jsonb` sieu du lieu.
ALTER TABLE "TransportFuelSupplier"
  ADD COLUMN "contactName" TEXT,
  ADD COLUMN "contactEmail" TEXT,
  ADD COLUMN "contractNo" TEXT,
  ADD COLUMN "contractStartDate" VARCHAR(10),
  ADD COLUMN "contractEndDate" VARCHAR(10),
  ADD COLUMN "paymentTermDays" INTEGER,
  ADD COLUMN "termsNote" TEXT,
  ADD COLUMN "ingestChannels" "TransportFuelIngestChannel"[],
  ADD COLUMN "ingestAccountRef" TEXT;

-- CreateTable
CREATE TABLE "TransportFuelStation" (
    "id" TEXT NOT NULL,
    "supplierId" TEXT NOT NULL,
    "name" TEXT NOT NULL,
    "nameNormalized" TEXT NOT NULL,
    "code" TEXT,
    "codeNormalized" TEXT,
    "address" TEXT,
    "latitudeE7" INTEGER,
    "longitudeE7" INTEGER,
    "geofenceRadiusM" INTEGER,
    "status" "TransportPartyStatus" NOT NULL DEFAULT 'ACTIVE',
    "note" TEXT,
    "createdAt" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,
    "updatedAt" TIMESTAMP(3) NOT NULL,

    CONSTRAINT "TransportFuelStation_pkey" PRIMARY KEY ("id")
);

-- CreateTable
CREATE TABLE "TransportFuelStationAlias" (
    "id" TEXT NOT NULL,
    "stationId" TEXT NOT NULL,
    "normalized" TEXT NOT NULL,
    "raw" TEXT NOT NULL,
    "createdBy" TEXT NOT NULL,
    "createdAt" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,

    CONSTRAINT "TransportFuelStationAlias_pkey" PRIMARY KEY ("id")
);

-- CreateIndex
CREATE UNIQUE INDEX "TransportFuelStation_supplierId_codeNormalized_key" ON "TransportFuelStation"("supplierId", "codeNormalized");

-- CreateIndex
CREATE INDEX "TransportFuelStation_supplierId_status_idx" ON "TransportFuelStation"("supplierId", "status");

-- CreateIndex
CREATE INDEX "TransportFuelStation_codeNormalized_idx" ON "TransportFuelStation"("codeNormalized");

-- CreateIndex
CREATE INDEX "TransportFuelStation_nameNormalized_idx" ON "TransportFuelStation"("nameNormalized");

-- CreateIndex
CREATE UNIQUE INDEX "TransportFuelStationAlias_normalized_key" ON "TransportFuelStationAlias"("normalized");

-- CreateIndex
CREATE INDEX "TransportFuelStationAlias_stationId_idx" ON "TransportFuelStationAlias"("stationId");

-- AddForeignKey
ALTER TABLE "TransportFuelStation" ADD CONSTRAINT "TransportFuelStation_supplierId_fkey" FOREIGN KEY ("supplierId") REFERENCES "TransportFuelSupplier"("id") ON DELETE RESTRICT ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "TransportFuelStationAlias" ADD CONSTRAINT "TransportFuelStationAlias_stationId_fkey" FOREIGN KEY ("stationId") REFERENCES "TransportFuelStation"("id") ON DELETE CASCADE ON UPDATE CASCADE;

-- ---------------------------------------------------------------------------------------------
-- RANG BUOC TANG LUU TRU — Prisma khong co cu phap cho `CHECK`, nen chung song o day.
--
-- `transport-fuel-station-storage.spec.ts` doc CHINH tep nay va do neu mot ten bien mat. Ly do da
-- ghi o T4: `prisma migrate dev` sinh migration bang cach diff schema voi DB, va no SE sinh lenh
-- xoa moi rang buoc duoi day neu ai do chay no roi commit thang. He thong van chay sau do — chi
-- khong con chan gi ca, va lan dau tien co nguoi biet la khi mot toa do rac da vao mot bao cao.
-- ---------------------------------------------------------------------------------------------

-- Ten tram khong duoc rong. Mot hang ten rong khong tra loi duoc cau hoi duy nhat bang nay ton tai
-- de tra loi ("day la tram nao"), va no lot qua moi kiem o tang tren neu nguoi goi gui khoang trang.
ALTER TABLE "TransportFuelStation"
  ADD CONSTRAINT "TransportFuelStation_name_not_blank" CHECK (btrim("name") <> '');

-- `nameNormalized` la KHOA SO KHOP, khong phai mot ban sao trang tri cua `name`. Mot chuoi rong o
-- day se khop voi MOI tram khac cung rong — tuc mot lan ghi quen chuan hoa bien thanh mot lan khop
-- nham hang loat. Khuon duoi khoa dung dau ra cua `normalizeStationLabel()`: neu ai do ghi thang
-- mot chuoi con dau tieng Viet vao cot nay, no se khong bao gio khop, va DB noi ngay tu lan ghi.
ALTER TABLE "TransportFuelStation"
  ADD CONSTRAINT "TransportFuelStation_nameNormalized_shape"
  CHECK ("nameNormalized" ~ '^[A-Z0-9]+( [A-Z0-9]+)*$');

-- `code` va `codeNormalized` phai cung co hoac cung khong. Mot ben co ben khong nghia la khoa
-- unique dang bao ve mot gia tri khong con ai doc duoc, hoac nguoc lai.
ALTER TABLE "TransportFuelStation"
  ADD CONSTRAINT "TransportFuelStation_code_paired"
  CHECK (("code" IS NULL) = ("codeNormalized" IS NULL));

ALTER TABLE "TransportFuelStation"
  ADD CONSTRAINT "TransportFuelStation_codeNormalized_shape"
  CHECK ("codeNormalized" IS NULL OR "codeNormalized" ~ '^[A-Z0-9]+$');

-- TOA DO: ty le 1e-7 do. `+-90 * 1e7` cho vi do, `+-180 * 1e7` cho kinh do — ca hai nam trong
-- `INTEGER` 32-bit (1,8e9 < 2,147e9). Mot con so ngoai khoang nay khong phai mot diem tren Trai Dat.
ALTER TABLE "TransportFuelStation"
  ADD CONSTRAINT "TransportFuelStation_latitudeE7_range"
  CHECK ("latitudeE7" IS NULL OR ("latitudeE7" BETWEEN -900000000 AND 900000000));

ALTER TABLE "TransportFuelStation"
  ADD CONSTRAINT "TransportFuelStation_longitudeE7_range"
  CHECK ("longitudeE7" IS NULL OR ("longitudeE7" BETWEEN -1800000000 AND 1800000000));

-- MOT NUA TOA DO KHONG PHAI MOT DIEM. Cho phep mot cot co mot cot khong se de lai nhung hang tra
-- loi "co toa do" cho moi phep kiem `IS NOT NULL` roi lam phep tinh khoang cach ra `NULL` giua chung.
ALTER TABLE "TransportFuelStation"
  ADD CONSTRAINT "TransportFuelStation_coordinates_paired"
  CHECK (("latitudeE7" IS NULL) = ("longitudeE7" IS NULL));

-- BAN KINH KHONG CO TAM thi khong khoanh duoc gi. Va mot ban kinh 0 met khong phai "khong kiem" —
-- "khong kiem" la `NULL`; `0` se lam moi phieu deu nam ngoai vong tron.
ALTER TABLE "TransportFuelStation"
  ADD CONSTRAINT "TransportFuelStation_geofence_needs_coordinates"
  CHECK ("geofenceRadiusM" IS NULL OR ("geofenceRadiusM" > 0 AND "latitudeE7" IS NOT NULL));

-- Cung ly le voi `nameNormalized`: bi danh la KHOA, va khoa nay UNIQUE toan cuc. Mot chuoi rong
-- lot vao day se chiem cho cua moi bi danh rong sau no, va mot chuoi con dau se khong bao gio khop.
ALTER TABLE "TransportFuelStationAlias"
  ADD CONSTRAINT "TransportFuelStationAlias_normalized_shape"
  CHECK ("normalized" ~ '^[A-Z0-9]+( [A-Z0-9]+)*$');

-- SIEU DU LIEU HOP DONG cua nha cung cap — kiem DANG, khong kiem chinh sach.
--
-- `paymentTermDays` chan mot lan go nham (`3650` ngay, hay mot so am), khong phai mot luat kinh
-- doanh: `Q-08` chua co loi, va khong duong tinh tien nao doc cot nay.
ALTER TABLE "TransportFuelSupplier"
  ADD CONSTRAINT "TransportFuelSupplier_paymentTermDays_range"
  CHECK ("paymentTermDays" IS NULL OR ("paymentTermDays" BETWEEN 0 AND 365));

ALTER TABLE "TransportFuelSupplier"
  ADD CONSTRAINT "TransportFuelSupplier_contractDates_iso"
  CHECK (
    ("contractStartDate" IS NULL OR "contractStartDate" ~ '^[0-9]{4}-[0-9]{2}-[0-9]{2}$')
    AND ("contractEndDate" IS NULL OR "contractEndDate" ~ '^[0-9]{4}-[0-9]{2}-[0-9]{2}$')
  );

-- Ngay bat dau <= ngay ket thuc. Chi kiem khi CA HAI cung co — mot hop dong chua co ngay ket thuc
-- la chuyen binh thuong, va ep phai co se buoc nguoi nhap bia ra mot ngay.
ALTER TABLE "TransportFuelSupplier"
  ADD CONSTRAINT "TransportFuelSupplier_contract_period_order"
  CHECK (
    "contractStartDate" IS NULL
    OR "contractEndDate" IS NULL
    OR "contractStartDate" <= "contractEndDate"
  );
