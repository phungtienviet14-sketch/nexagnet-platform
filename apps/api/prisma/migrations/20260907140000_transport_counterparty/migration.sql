-- CreateEnum
CREATE TYPE "TransportCounterpartySubjectKind" AS ENUM ('CUSTOMER', 'PARTNER');

-- CreateTable
CREATE TABLE "TransportCounterparty" (
    "id" TEXT NOT NULL,
    "name" TEXT NOT NULL,
    "taxCode" TEXT,
    "status" "TransportPartyStatus" NOT NULL DEFAULT 'ACTIVE',
    "note" TEXT,
    "createdAt" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,
    "updatedAt" TIMESTAMP(3) NOT NULL,

    CONSTRAINT "TransportCounterparty_pkey" PRIMARY KEY ("id")
);

-- CreateTable
CREATE TABLE "TransportCounterpartyLink" (
    "counterpartyId" TEXT NOT NULL,
    "kind" "TransportCounterpartySubjectKind" NOT NULL,
    "subjectId" TEXT NOT NULL,
    "linkedBy" TEXT NOT NULL,
    "createdAt" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,

    CONSTRAINT "TransportCounterpartyLink_pkey" PRIMARY KEY ("kind","subjectId")
);

-- CreateIndex
CREATE UNIQUE INDEX "TransportCounterparty_taxCode_key" ON "TransportCounterparty"("taxCode");

-- CreateIndex
CREATE INDEX "TransportCounterparty_status_idx" ON "TransportCounterparty"("status");

-- CreateIndex
CREATE INDEX "TransportCounterpartyLink_counterpartyId_idx" ON "TransportCounterpartyLink"("counterpartyId");

-- AddForeignKey
ALTER TABLE "TransportCounterpartyLink" ADD CONSTRAINT "TransportCounterpartyLink_counterpartyId_fkey" FOREIGN KEY ("counterpartyId") REFERENCES "TransportCounterparty"("id") ON DELETE CASCADE ON UPDATE CASCADE;

-- ---------------------------------------------------------------------------------------------
-- RANG BUOC TANG LUU TRU — Prisma khong co cu phap cho `CHECK`, nen chung song o day.
--
-- `transport-counterparty-storage.spec.ts` doc chinh tep nay va do neu mot ten bien mat. Ly do:
-- `prisma migrate dev` sinh migration bang cach diff schema voi DB va SE sinh lenh xoa ca hai neu
-- ai do chay no roi commit thang.
-- ---------------------------------------------------------------------------------------------

-- Ten phap nhan khong duoc rong hay toan khoang trang. Mot hang ten rong khong tra loi duoc cau
-- hoi duy nhat ma bang nay ton tai de tra loi ("day la ai"), va no lot qua moi kiem o tang tren
-- neu nguoi goi gui mot chuoi khoang trang.
ALTER TABLE "TransportCounterparty"
  ADD CONSTRAINT "TransportCounterparty_name_not_blank" CHECK (btrim("name") <> '');

-- Ma so thue Viet Nam: 10 chu so (phap nhan), hoac 10 chu so + '-' + 3 chu so (don vi truc thuoc).
-- Cot nay UNIQUE, nen mot chuoi rac lot vao day se CHIEM CHO danh tinh cua mot doanh nghiep that.
ALTER TABLE "TransportCounterparty"
  ADD CONSTRAINT "TransportCounterparty_taxCode_shape"
  CHECK ("taxCode" IS NULL OR "taxCode" ~ '^[0-9]{10}(-[0-9]{3})?$');
