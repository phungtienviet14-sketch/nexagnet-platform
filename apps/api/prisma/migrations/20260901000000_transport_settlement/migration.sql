-- CreateEnum
CREATE TYPE "TransportSettlementDirection" AS ENUM ('RECEIVABLE', 'PAYABLE');

-- CreateEnum
CREATE TYPE "TransportSettlementFlow" AS ENUM ('CUSTOMER_FREIGHT', 'FUEL_SUPPLIER', 'CARRIER_SERVICE', 'PARTNER_COMMISSION');

-- CreateEnum
CREATE TYPE "TransportSettlementCounterpartyKind" AS ENUM ('CUSTOMER', 'PARTNER', 'FUEL_SUPPLIER');

-- CreateEnum
CREATE TYPE "TransportSettlementDocumentKind" AS ENUM ('ORIGINAL', 'ADJUSTMENT', 'REVERSAL');

-- CreateEnum
CREATE TYPE "TransportSettlementDocumentStatus" AS ENUM ('POSTED', 'REVERSED');

-- CreateEnum
CREATE TYPE "TransportCommissionCalcKind" AS ENUM ('PERCENTAGE', 'FIXED');

-- CreateEnum
CREATE TYPE "TransportCommissionRuleStatus" AS ENUM ('ACTIVE', 'ARCHIVED');

-- CreateEnum
CREATE TYPE "TransportSettlementPeriodStatus" AS ENUM ('OPEN', 'CLOSING', 'CLOSED', 'REOPENED');



-- CreateTable
CREATE TABLE "TransportSettlementDocument" (
    "id" TEXT NOT NULL,
    "direction" "TransportSettlementDirection" NOT NULL,
    "flow" "TransportSettlementFlow" NOT NULL,
    "counterpartyKind" "TransportSettlementCounterpartyKind" NOT NULL,
    "counterpartyId" TEXT NOT NULL,
    "kind" "TransportSettlementDocumentKind" NOT NULL DEFAULT 'ORIGINAL',
    "status" "TransportSettlementDocumentStatus" NOT NULL DEFAULT 'POSTED',
    "signedAmount" BIGINT NOT NULL,
    "currencyCode" VARCHAR(3) NOT NULL DEFAULT 'VND',
    "businessDate" VARCHAR(10) NOT NULL,
    "dueDate" VARCHAR(10),
    "tripId" TEXT,
    "sourceContext" VARCHAR(60) NOT NULL,
    "sourceId" VARCHAR(160) NOT NULL,
    "sourceFingerprint" TEXT NOT NULL,
    "adjustsId" TEXT,
    "invoiceRef" TEXT,
    "note" TEXT,
    "recordedBy" TEXT NOT NULL,
    "createdAt" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,

    CONSTRAINT "TransportSettlementDocument_pkey" PRIMARY KEY ("id")
);

-- CreateTable
CREATE TABLE "TransportSettlementAllocation" (
    "id" TEXT NOT NULL,
    "documentId" TEXT NOT NULL,
    "amount" BIGINT NOT NULL,
    "businessDate" VARCHAR(10) NOT NULL,
    "method" VARCHAR(40) NOT NULL,
    "sourceContext" VARCHAR(60) NOT NULL,
    "sourceId" VARCHAR(160) NOT NULL,
    "note" TEXT,
    "recordedBy" TEXT NOT NULL,
    "createdAt" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,

    CONSTRAINT "TransportSettlementAllocation_pkey" PRIMARY KEY ("id")
);

-- CreateTable
CREATE TABLE "TransportSettlementPeriod" (
    "id" TEXT NOT NULL,
    "flow" "TransportSettlementFlow" NOT NULL,
    "startDate" VARCHAR(10) NOT NULL,
    "endDate" VARCHAR(10) NOT NULL,
    "status" "TransportSettlementPeriodStatus" NOT NULL DEFAULT 'OPEN',
    "closedAt" TIMESTAMP(3),
    "closedBy" TEXT,
    "reopenedAt" TIMESTAMP(3),
    "reopenedBy" TEXT,
    "reopenReason" TEXT,
    "createdAt" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,
    "updatedAt" TIMESTAMP(3) NOT NULL,

    CONSTRAINT "TransportSettlementPeriod_pkey" PRIMARY KEY ("id")
);

-- CreateTable
CREATE TABLE "TransportCustomerTerms" (
    "customerId" TEXT NOT NULL,
    "paymentTermDays" INTEGER NOT NULL,
    "creditLimit" BIGINT,
    "currencyCode" VARCHAR(3) NOT NULL DEFAULT 'VND',
    "updatedBy" TEXT NOT NULL,
    "createdAt" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,
    "updatedAt" TIMESTAMP(3) NOT NULL,

    CONSTRAINT "TransportCustomerTerms_pkey" PRIMARY KEY ("customerId")
);

-- CreateTable
CREATE TABLE "TransportCommissionRule" (
    "id" TEXT NOT NULL,
    "partnerId" TEXT,
    "routeKey" VARCHAR(160),
    "status" "TransportCommissionRuleStatus" NOT NULL DEFAULT 'ACTIVE',
    "createdBy" TEXT NOT NULL,
    "createdAt" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,
    "updatedAt" TIMESTAMP(3) NOT NULL,

    CONSTRAINT "TransportCommissionRule_pkey" PRIMARY KEY ("id")
);

-- CreateTable
CREATE TABLE "TransportCommissionRuleVersion" (
    "id" TEXT NOT NULL,
    "ruleId" TEXT NOT NULL,
    "version" INTEGER NOT NULL,
    "calcKind" "TransportCommissionCalcKind" NOT NULL,
    "rateBasisPoints" INTEGER,
    "fixedAmount" BIGINT,
    "effectiveFrom" VARCHAR(10) NOT NULL,
    "effectiveTo" VARCHAR(10),
    "publishedAt" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,
    "publishedBy" TEXT NOT NULL,

    CONSTRAINT "TransportCommissionRuleVersion_pkey" PRIMARY KEY ("id")
);

-- CreateTable
CREATE TABLE "TransportCommissionCalculation" (
    "id" TEXT NOT NULL,
    "tripId" TEXT NOT NULL,
    "ruleVersionId" TEXT NOT NULL,
    "ruleScopeSnapshot" VARCHAR(20) NOT NULL,
    "calcKindSnapshot" "TransportCommissionCalcKind" NOT NULL,
    "rateBasisPointsSnapshot" INTEGER,
    "fixedAmountSnapshot" BIGINT,
    "basisAmount" BIGINT NOT NULL,
    "rawAmount" VARCHAR(40) NOT NULL,
    "resultAmount" BIGINT NOT NULL,
    "documentId" TEXT,
    "partnerId" TEXT NOT NULL,
    "businessDate" VARCHAR(10) NOT NULL,
    "createdAt" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,

    CONSTRAINT "TransportCommissionCalculation_pkey" PRIMARY KEY ("id")
);

-- CreateIndex
CREATE INDEX "TransportSettlementDocument_direction_flow_counterpartyId_idx" ON "TransportSettlementDocument"("direction", "flow", "counterpartyId");

-- CreateIndex
CREATE INDEX "TransportSettlementDocument_direction_dueDate_idx" ON "TransportSettlementDocument"("direction", "dueDate");

-- CreateIndex
CREATE INDEX "TransportSettlementDocument_tripId_idx" ON "TransportSettlementDocument"("tripId");

-- CreateIndex
CREATE INDEX "TransportSettlementDocument_adjustsId_idx" ON "TransportSettlementDocument"("adjustsId");

-- CreateIndex
CREATE UNIQUE INDEX "TransportSettlementDocument_sourceContext_sourceId_key" ON "TransportSettlementDocument"("sourceContext", "sourceId");

-- CreateIndex
CREATE INDEX "TransportSettlementAllocation_documentId_idx" ON "TransportSettlementAllocation"("documentId");

-- CreateIndex
CREATE UNIQUE INDEX "TransportSettlementAllocation_sourceContext_sourceId_key" ON "TransportSettlementAllocation"("sourceContext", "sourceId");

-- CreateIndex
CREATE INDEX "TransportSettlementPeriod_flow_status_idx" ON "TransportSettlementPeriod"("flow", "status");

-- CreateIndex
CREATE INDEX "TransportSettlementPeriod_flow_startDate_endDate_idx" ON "TransportSettlementPeriod"("flow", "startDate", "endDate");

-- CreateIndex
CREATE INDEX "TransportCommissionRule_status_idx" ON "TransportCommissionRule"("status");

-- CreateIndex
CREATE INDEX "TransportCommissionRule_partnerId_idx" ON "TransportCommissionRule"("partnerId");

-- CreateIndex
CREATE UNIQUE INDEX "TransportCommissionRule_partnerId_routeKey_key" ON "TransportCommissionRule"("partnerId", "routeKey");

-- CreateIndex
CREATE INDEX "TransportCommissionRuleVersion_ruleId_effectiveFrom_idx" ON "TransportCommissionRuleVersion"("ruleId", "effectiveFrom");

-- CreateIndex
CREATE UNIQUE INDEX "TransportCommissionRuleVersion_ruleId_version_key" ON "TransportCommissionRuleVersion"("ruleId", "version");

-- CreateIndex
CREATE UNIQUE INDEX "TransportCommissionCalculation_tripId_key" ON "TransportCommissionCalculation"("tripId");

-- CreateIndex
CREATE UNIQUE INDEX "TransportCommissionCalculation_documentId_key" ON "TransportCommissionCalculation"("documentId");

-- CreateIndex
CREATE INDEX "TransportCommissionCalculation_partnerId_idx" ON "TransportCommissionCalculation"("partnerId");

-- CreateIndex
CREATE INDEX "TransportCommissionCalculation_ruleVersionId_idx" ON "TransportCommissionCalculation"("ruleVersionId");

-- AddForeignKey
ALTER TABLE "TransportSettlementDocument" ADD CONSTRAINT "TransportSettlementDocument_tripId_fkey" FOREIGN KEY ("tripId") REFERENCES "TransportTrip"("id") ON DELETE SET NULL ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "TransportSettlementDocument" ADD CONSTRAINT "TransportSettlementDocument_adjustsId_fkey" FOREIGN KEY ("adjustsId") REFERENCES "TransportSettlementDocument"("id") ON DELETE RESTRICT ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "TransportSettlementAllocation" ADD CONSTRAINT "TransportSettlementAllocation_documentId_fkey" FOREIGN KEY ("documentId") REFERENCES "TransportSettlementDocument"("id") ON DELETE RESTRICT ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "TransportCustomerTerms" ADD CONSTRAINT "TransportCustomerTerms_customerId_fkey" FOREIGN KEY ("customerId") REFERENCES "TransportCustomer"("id") ON DELETE CASCADE ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "TransportCommissionRule" ADD CONSTRAINT "TransportCommissionRule_partnerId_fkey" FOREIGN KEY ("partnerId") REFERENCES "TransportPartner"("id") ON DELETE RESTRICT ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "TransportCommissionRuleVersion" ADD CONSTRAINT "TransportCommissionRuleVersion_ruleId_fkey" FOREIGN KEY ("ruleId") REFERENCES "TransportCommissionRule"("id") ON DELETE CASCADE ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "TransportCommissionCalculation" ADD CONSTRAINT "TransportCommissionCalculation_tripId_fkey" FOREIGN KEY ("tripId") REFERENCES "TransportTrip"("id") ON DELETE RESTRICT ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "TransportCommissionCalculation" ADD CONSTRAINT "TransportCommissionCalculation_ruleVersionId_fkey" FOREIGN KEY ("ruleVersionId") REFERENCES "TransportCommissionRuleVersion"("id") ON DELETE RESTRICT ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "TransportCommissionCalculation" ADD CONSTRAINT "TransportCommissionCalculation_documentId_fkey" FOREIGN KEY ("documentId") REFERENCES "TransportSettlementDocument"("id") ON DELETE RESTRICT ON UPDATE CASCADE;


-- ===========================================================================
-- RANG BUOC VIET TAY — Prisma khong co cu phap cho CHECK, EXCLUDE va unique
-- mot phan, nen phan duoi day khong sinh ra tu `schema.prisma` va se KHONG
-- duoc sinh lai neu ai do chay `migrate diff`. Doc ky truoc khi sua.
-- ===========================================================================

-- KHOANG TIEN — cot la BIGINT (rong hon `money()`), CHECK bo hep ve dung khoang
-- ma JavaScript con dem chinh xac. Rong hon mien se lam mot hang doc len khong
-- bieu dien duoc, va no hong luc DOC — cho khong ai dang nhin.

ALTER TABLE "TransportSettlementDocument"
  ADD CONSTRAINT "TransportSettlementDocument_amount_money_range"
  CHECK ("signedAmount" BETWEEN -9007199254740991 AND 9007199254740991);

ALTER TABLE "TransportSettlementAllocation"
  ADD CONSTRAINT "TransportSettlementAllocation_amount_money_range"
  CHECK ("amount" BETWEEN 1 AND 9007199254740991);

ALTER TABLE "TransportCustomerTerms"
  ADD CONSTRAINT "TransportCustomerTerms_creditLimit_money_range"
  CHECK ("creditLimit" IS NULL OR "creditLimit" BETWEEN 0 AND 9007199254740991);

ALTER TABLE "TransportCommissionRuleVersion"
  ADD CONSTRAINT "TransportCommissionRuleVersion_fixedAmount_money_range"
  CHECK ("fixedAmount" IS NULL OR "fixedAmount" BETWEEN 0 AND 9007199254740991);

ALTER TABLE "TransportCommissionCalculation"
  ADD CONSTRAINT "TransportCommissionCalculation_money_range"
  CHECK (
    "basisAmount" BETWEEN 0 AND 9007199254740991
    AND "resultAmount" BETWEEN 0 AND 9007199254740991
    AND ("fixedAmountSnapshot" IS NULL OR "fixedAmountSnapshot" BETWEEN 0 AND 9007199254740991)
  );

-- ---------------------------------------------------------------------------
-- SUA = GHI THEM. Ban sao o DB cua `settlement-documents.ts`.
--
-- Ve trai: chi ADJUSTMENT/REVERSAL duoc tro toi ban goc. Ve phai: mot ORIGINAL
-- khong duoc tro di dau. Thieu rang buoc nay thi ton tai duoc mot ADJUSTMENT
-- khong sua gi ca, va mot ORIGINAL tu nhan la ban sua cua hang khac — ca hai
-- deu doc len van hop le, va ca hai deu lam chuoi sua dut o giua.
-- ---------------------------------------------------------------------------

ALTER TABLE "TransportSettlementDocument"
  ADD CONSTRAINT "TransportSettlementDocument_adjustment_kind"
  CHECK (("kind" <> 'ORIGINAL') = ("adjustsId" IS NOT NULL));

-- Mot ban sua khong duoc tro toi chinh no.
ALTER TABLE "TransportSettlementDocument"
  ADD CONSTRAINT "TransportSettlementDocument_no_self_adjust"
  CHECK ("adjustsId" IS NULL OR "adjustsId" <> "id");

-- MOT ban goc chi bi DAO mot lan. Nhieu ADJUSTMENT thi duoc — mot ky co the
-- duoc sua nhieu dot — nhung hai lan dao cung mot hang se lam so du cua chuoi
-- am gap doi. Unique MOT PHAN vi no chi cam voi `kind = 'REVERSAL'`.
CREATE UNIQUE INDEX "TransportSettlementDocument_one_reversal_per_target"
  ON "TransportSettlementDocument" ("adjustsId")
  WHERE "kind" = 'REVERSAL';

-- ---------------------------------------------------------------------------
-- HAI CACH TINH HOA HONG, HAI BO TRUONG LOAI TRU NHAU.
--
-- PERCENTAGE doi ty le va cam so tien co dinh; FIXED thi nguoc lai. Thieu rang
-- buoc nay thi ton tai duoc mot ban luat khai CA HAI — va phep chon se lang le
-- uu tien mot ben theo thu tu dong code, tuc hai lan doc cung mot luat co the
-- ra hai so tien khac nhau sau mot lan refactor.
-- ---------------------------------------------------------------------------

ALTER TABLE "TransportCommissionRuleVersion"
  ADD CONSTRAINT "TransportCommissionRuleVersion_calc_shape"
  CHECK (
    ("calcKind" = 'PERCENTAGE' AND "rateBasisPoints" IS NOT NULL AND "fixedAmount" IS NULL)
    OR ("calcKind" = 'FIXED' AND "fixedAmount" IS NOT NULL AND "rateBasisPoints" IS NULL)
  );

-- Ty le khong am va khong qua 100%. Mot hoa hong 150% khong phai mot chinh sach,
-- no la mot lan go nham dau thap phan — va no tra ra nhieu hon ca gia cuoc.
ALTER TABLE "TransportCommissionRuleVersion"
  ADD CONSTRAINT "TransportCommissionRuleVersion_rate_range"
  CHECK ("rateBasisPoints" IS NULL OR "rateBasisPoints" BETWEEN 0 AND 10000);

-- Khoang hieu luc phai xuoi chieu.
ALTER TABLE "TransportCommissionRuleVersion"
  ADD CONSTRAINT "TransportCommissionRuleVersion_effective_order"
  CHECK ("effectiveTo" IS NULL OR "effectiveTo" >= "effectiveFrom");

-- ---------------------------------------------------------------------------
-- DANG NGAY ISO — dieu kien tien quyet cua rang buoc chong lap phia duoi.
--
-- Cung khuon `TransportDriverFundPeriod_dates_iso`: kiem CA dang chuoi LAN su
-- ton tai cua ngay. `2026-02-30` dung dang nhung khong phai mot ngay co that,
-- va neu de lot thi no thanh mot moc ky khong lich nao xep duoc.
-- ---------------------------------------------------------------------------

ALTER TABLE "TransportSettlementPeriod"
  ADD CONSTRAINT "TransportSettlementPeriod_dates_iso"
  CHECK (
    "startDate" ~ '^\d{4}-\d{2}-\d{2}$'
    AND to_char(to_date("startDate", 'YYYY-MM-DD'), 'YYYY-MM-DD') = "startDate"
    AND "endDate" ~ '^\d{4}-\d{2}-\d{2}$'
    AND to_char(to_date("endDate", 'YYYY-MM-DD'), 'YYYY-MM-DD') = "endDate"
    AND "startDate" <= "endDate"
  );

-- ---------------------------------------------------------------------------
-- KY QUYET TOAN KHONG CHONG LAP trong cung mot dong tien.
--
-- Kiem o service dung voi MOT nguoi ghi; rang buoc nay moi dung voi HAI nguoi
-- ghi cung luc — dung bai hoc T2.1/F2 va cung khuon voi `TransportDriverFundPeriod`.
--
-- KHONG dung `"startDate"::date`: phep ep chuoi sang ngay phu thuoc `DateStyle`
-- cua phien, nen Postgres coi no la STABLE chu khong IMMUTABLE va tu choi dung
-- trong bieu thuc index. `make_date(int,int,int)` cong `substr` thi IMMUTABLE.
-- Rang buoc `..._dates_iso` phia tren da bao dam ba lat cat luon la so.
--
-- `'[]'` — khoang DONG CA HAI DAU. Ky 01/08..31/08 va ky 31/08..30/09 PHAI bi
-- coi la chong lap, vi mot chung tu ngay 31/08 roi vao ca hai. Dung `'[)'` thi
-- dung cap ky do di lot, va bat bien nay rong o chinh cho de sai nhat.
--
-- `btree_gist` da duoc tao boi `20260830140000_transport_costing`; khai lai o
-- day de migration nay dung duoc mot minh tren mot DB chua co no.
-- ---------------------------------------------------------------------------

CREATE EXTENSION IF NOT EXISTS btree_gist;

ALTER TABLE "TransportSettlementPeriod"
  ADD CONSTRAINT "TransportSettlementPeriod_no_overlap"
  EXCLUDE USING gist (
    "flow" WITH =,
    daterange(
      make_date(
        substr("startDate", 1, 4)::int,
        substr("startDate", 6, 2)::int,
        substr("startDate", 9, 2)::int
      ),
      make_date(
        substr("endDate", 1, 4)::int,
        substr("endDate", 6, 2)::int,
        substr("endDate", 9, 2)::int
      ),
      '[]'
    ) WITH &&
  );

-- Dieu khoan thanh toan la mot so ngay THAT: am thi han tra roi vao qua khu.
ALTER TABLE "TransportCustomerTerms"
  ADD CONSTRAINT "TransportCustomerTerms_term_days_range"
  CHECK ("paymentTermDays" BETWEEN 0 AND 365);
