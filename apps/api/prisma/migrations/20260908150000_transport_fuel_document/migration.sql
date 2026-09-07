-- CreateEnum
CREATE TYPE "TransportFuelDocumentKind" AS ENUM ('EINVOICE_XML');

-- CreateEnum
CREATE TYPE "TransportFuelDocumentStatus" AS ENUM ('PARSED', 'REJECTED', 'DUPLICATE');

-- CreateEnum
CREATE TYPE "TransportFuelDocumentRejectReason" AS ENUM ('EMPTY', 'TOO_LARGE', 'MALFORMED_XML', 'EXTERNAL_ENTITY_REJECTED', 'NOT_AN_INVOICE', 'MISSING_INVOICE_IDENTITY', 'NO_LINE_ITEMS');

-- CreateEnum
CREATE TYPE "TransportFuelStationMatch" AS ENUM ('RESOLVED', 'AMBIGUOUS', 'SUPPLIER_MISMATCH', 'NO_MATCH', 'NO_INPUT');

-- CreateEnum
CREATE TYPE "TransportFuelHintSource" AS ENUM ('EXTENSION_FIELD', 'BUYER_NAME');

-- CreateTable
CREATE TABLE "TransportFuelDocument" (
    "id" TEXT NOT NULL,
    "kind" "TransportFuelDocumentKind" NOT NULL,
    "sourceRef" TEXT NOT NULL,
    "contentDigest" VARCHAR(64) NOT NULL,
    "byteSize" INTEGER NOT NULL,
    "sellerTaxCodeRaw" TEXT,
    "supplierId" TEXT,
    "status" "TransportFuelDocumentStatus" NOT NULL,
    "rejectReason" "TransportFuelDocumentRejectReason",
    "duplicateOfId" TEXT,
    "candidateCount" INTEGER NOT NULL DEFAULT 0,
    "receivedAt" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,
    "receivedBy" TEXT NOT NULL,

    CONSTRAINT "TransportFuelDocument_pkey" PRIMARY KEY ("id")
);

-- CreateTable
CREATE TABLE "TransportFuelCandidate" (
    "id" TEXT NOT NULL,
    "documentId" TEXT NOT NULL,
    "lineNumber" INTEGER NOT NULL,
    "sellerTaxCode" TEXT NOT NULL,
    "invoiceSymbol" TEXT NOT NULL,
    "invoiceNo" TEXT NOT NULL,
    "invoiceTemplate" TEXT,
    "sellerName" TEXT,
    "stationLabelRaw" TEXT,
    "stationId" TEXT,
    "stationMatch" "TransportFuelStationMatch" NOT NULL,
    "issuedDate" VARCHAR(10),
    "issuedTimeRaw" TEXT,
    "liters" DECIMAL(12,3),
    "unitPrice" DECIMAL(12,3),
    "amount" BIGINT,
    "currencyCode" VARCHAR(3) NOT NULL DEFAULT 'VND',
    "itemName" TEXT,
    "unitRaw" TEXT,
    "plateHintRaw" TEXT,
    "plateHintSource" "TransportFuelHintSource",
    "odometerHintKm" INTEGER,
    "provenance" JSONB NOT NULL,
    "createdAt" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,

    CONSTRAINT "TransportFuelCandidate_pkey" PRIMARY KEY ("id")
);

-- CreateIndex
CREATE UNIQUE INDEX "TransportFuelDocument_contentDigest_key" ON "TransportFuelDocument"("contentDigest");

-- CreateIndex
CREATE INDEX "TransportFuelDocument_supplierId_receivedAt_idx" ON "TransportFuelDocument"("supplierId", "receivedAt");

-- CreateIndex
CREATE INDEX "TransportFuelDocument_status_receivedAt_idx" ON "TransportFuelDocument"("status", "receivedAt");

-- CreateIndex
CREATE UNIQUE INDEX "TransportFuelCandidate_documentId_lineNumber_key" ON "TransportFuelCandidate"("documentId", "lineNumber");

-- CreateIndex
CREATE UNIQUE INDEX "TransportFuelCandidate_sellerTaxCode_invoiceSymbol_invoiceNo_lineNumber_key" ON "TransportFuelCandidate"("sellerTaxCode", "invoiceSymbol", "invoiceNo", "lineNumber");

-- CreateIndex
CREATE INDEX "TransportFuelCandidate_stationId_idx" ON "TransportFuelCandidate"("stationId");

-- CreateIndex
CREATE INDEX "TransportFuelCandidate_issuedDate_idx" ON "TransportFuelCandidate"("issuedDate");

-- AddForeignKey
ALTER TABLE "TransportFuelDocument" ADD CONSTRAINT "TransportFuelDocument_supplierId_fkey" FOREIGN KEY ("supplierId") REFERENCES "TransportFuelSupplier"("id") ON DELETE RESTRICT ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "TransportFuelDocument" ADD CONSTRAINT "TransportFuelDocument_duplicateOfId_fkey" FOREIGN KEY ("duplicateOfId") REFERENCES "TransportFuelDocument"("id") ON DELETE RESTRICT ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "TransportFuelCandidate" ADD CONSTRAINT "TransportFuelCandidate_documentId_fkey" FOREIGN KEY ("documentId") REFERENCES "TransportFuelDocument"("id") ON DELETE CASCADE ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "TransportFuelCandidate" ADD CONSTRAINT "TransportFuelCandidate_stationId_fkey" FOREIGN KEY ("stationId") REFERENCES "TransportFuelStation"("id") ON DELETE SET NULL ON UPDATE CASCADE;

-- ---------------------------------------------------------------------------------------------
-- RANG BUOC TANG LUU TRU — Prisma khong co cu phap cho `CHECK`, nen chung song o day.
--
-- `transport-fuel-document-storage.spec.ts` doc CHINH tep nay va do neu mot ten bien mat. Ly do da
-- ghi o T4 va nhac lai o C1: `prisma migrate dev` sinh migration bang cach diff schema voi DB, va
-- no SE sinh lenh xoa moi rang buoc duoi day neu ai do chay no roi commit thang.
-- ---------------------------------------------------------------------------------------------

-- MOT CHUNG TU BI TU CHOI PHAI CO LY DO, VA MOT CHUNG TU DOC DUOC THI KHONG.
--
-- Hai ve cua mot tuong duong, khong phai hai phep kiem roi rac: mot hang `REJECTED` khong ly do
-- lam nguoi doi soat thay "co gi do hong" ma khong biet hong gi; mot hang `PARSED` co ly do tu
-- choi thi mau thuan voi chinh no.
ALTER TABLE "TransportFuelDocument"
  ADD CONSTRAINT "TransportFuelDocument_reject_reason_paired"
  CHECK (("status" = 'REJECTED') = ("rejectReason" IS NOT NULL));

-- Cung ly le: `DUPLICATE` phai chi ra chung tu DA CO mang cung hoa don do. Mot hang `DUPLICATE`
-- khong tro di dau la mot cau tra loi cut — nguoi doi soat khong mo duoc ban da nhap de doi chieu.
ALTER TABLE "TransportFuelDocument"
  ADD CONSTRAINT "TransportFuelDocument_duplicate_link_paired"
  CHECK (("status" = 'DUPLICATE') = ("duplicateOfId" IS NOT NULL));

-- CHI chung tu DOC DUOC moi co ung vien. Mot hang `REJECTED` mang `candidateCount > 0` nghia la
-- tang ung dung da ghi ung vien roi moi tu choi — mot duong ghi nua voi, va la dung kieu hong lam
-- so ung vien tren man hinh khong bao gio khop voi so hang trong bang.
ALTER TABLE "TransportFuelDocument"
  ADD CONSTRAINT "TransportFuelDocument_candidate_count_matches_status"
  CHECK (
    ("status" = 'PARSED' AND "candidateCount" > 0)
    OR ("status" <> 'PARSED' AND "candidateCount" = 0)
  );

ALTER TABLE "TransportFuelDocument"
  ADD CONSTRAINT "TransportFuelDocument_byteSize_positive" CHECK ("byteSize" > 0);

-- Dau van tay la SHA-256 viet thuong. Khoa nay UNIQUE, nen mot chuoi rac lot vao day se chiem cho
-- chong nhap trung cua mot tep that — va lan nhap lai tep do se im lang di qua.
ALTER TABLE "TransportFuelDocument"
  ADD CONSTRAINT "TransportFuelDocument_contentDigest_shape"
  CHECK ("contentDigest" ~ '^[0-9a-f]{64}$');

-- SO DONG dem tu 1, theo THU TU XUAT HIEN trong chung tu.
ALTER TABLE "TransportFuelCandidate"
  ADD CONSTRAINT "TransportFuelCandidate_lineNumber_positive" CHECK ("lineNumber" > 0);

-- `0` lit hay `0` dong khong noi gi ve the gioi — cung cau chu voi `TransportFuelEntry`. `NULL` la
-- "khong doc duoc", va do la mot cau tra loi khac han.
ALTER TABLE "TransportFuelCandidate"
  ADD CONSTRAINT "TransportFuelCandidate_liters_positive"
  CHECK ("liters" IS NULL OR "liters" > 0);

ALTER TABLE "TransportFuelCandidate"
  ADD CONSTRAINT "TransportFuelCandidate_unitPrice_positive"
  CHECK ("unitPrice" IS NULL OR "unitPrice" > 0);

ALTER TABLE "TransportFuelCandidate"
  ADD CONSTRAINT "TransportFuelCandidate_amount_money_range"
  CHECK ("amount" IS NULL OR ("amount" > 0 AND "amount" <= 9007199254740991));

ALTER TABLE "TransportFuelCandidate"
  ADD CONSTRAINT "TransportFuelCandidate_issuedDate_iso"
  CHECK ("issuedDate" IS NULL OR "issuedDate" ~ '^[0-9]{4}-[0-9]{2}-[0-9]{2}$');

ALTER TABLE "TransportFuelCandidate"
  ADD CONSTRAINT "TransportFuelCandidate_odometerHint_non_negative"
  CHECK ("odometerHintKm" IS NULL OR "odometerHintKm" >= 0);

-- MOT GOI Y PHAI BIET NO DEN TU DAU.
--
-- Bien so tren hoa don khong co cho quy dinh (ND 123/2020 Dieu 10 khong doi truong do), nen no
-- luon duoc doc ra tu MOT cho ta phai doan: mot truong mo rong tu dat ten, ten nguoi mua, hay ten
-- hang. Mot goi y khong ghi nguon la mot goi y khong kiem lai duoc — va mot goi y khong kiem lai
-- duoc som muon se duoc ai do doc nhu du lieu.
ALTER TABLE "TransportFuelCandidate"
  ADD CONSTRAINT "TransportFuelCandidate_plate_hint_paired"
  CHECK (("plateHintRaw" IS NULL) = ("plateHintSource" IS NULL));

-- `RESOLVED` LA KET CUC DUY NHAT CO TRAM, VA LA KET CUC DUY NHAT PHAI CO.
--
-- Bon ket cuc con lai (`AMBIGUOUS`, `SUPPLIER_MISMATCH`, `NO_MATCH`, `NO_INPUT`) deu la loi moi
-- mot NGUOI vao quyet. Neu mot hang trong so do van mang `stationId`, thi o dau do da co mot lan
-- "chon dai mot cai" — dung viec ma `resolveFuelStation()` ton tai de tu choi lam.
ALTER TABLE "TransportFuelCandidate"
  ADD CONSTRAINT "TransportFuelCandidate_station_match_paired"
  CHECK (("stationMatch" = 'RESOLVED') = ("stationId" IS NOT NULL));

-- ---------------------------------------------------------------------------------------------
-- DONG BO VOI LANE B — mot rang buoc THEM cho bang tram cua C1.
--
-- `apps/api/src/transport/geo/geo-point.ts` (Lane B, #235, da hop nhat) tu choi toa do (0, 0):
-- do la "Null Island" ngoai khoi vinh Guinea, va rat nhieu tang phan mem tra ve dung cap so do khi
-- CHUA CO DINH VI — mot struct zero-init, mot `parseFloat` that bai, mot truong JSON thieu.
--
-- Tram xang cua C1 phai theo dung luat do. Neu khong, C4 se lay mot tram o Null Island ra lam tam
-- hang rao va moi phieu do dau se nam "ngoai vong tron" ma khong ai hieu tai sao.
ALTER TABLE "TransportFuelStation"
  ADD CONSTRAINT "TransportFuelStation_not_null_island"
  CHECK ("latitudeE7" IS NULL OR "latitudeE7" <> 0 OR "longitudeE7" <> 0);
