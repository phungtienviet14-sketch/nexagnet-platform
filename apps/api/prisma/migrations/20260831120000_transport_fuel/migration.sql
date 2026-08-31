-- T4 — FUEL + DOI SOAT BANG KE (`TX-04`), Issue #86.
--
-- MOT chieu: THEM. Khong `ALTER` cot nao dang co, khong `DROP` gi, khong doc mot hang nao. Moi kieu
-- va moi bang duoi day deu moi tinh, nen migration nay ap len mot DB dang chay ma khong cham toi
-- du lieu cua `transport-core`, cua `transport-costing` hay cua mien ban hang.
--
-- DUONG LUI: cac lenh dao nguoc nam trong `README-rollback.sql` cung thu muc.
--
-- ---------------------------------------------------------------------------
-- PHAN DDL BANG/INDEX/KHOA NGOAI o duoi duoc SINH RA boi `prisma migrate diff`, khong go tay: hinh
-- dang bang phai khop tuyet doi voi `schema.prisma`, va go tay mot cot sai kieu se lam Prisma va
-- Postgres bat dong y nhau ma khong ai thay cho toi luc mot truy van tra sai.
--
-- PHAN RANG BUOC + TRIGGER o cuoi thi NGUOC LAI: Prisma khong co cu phap cho `CHECK` lan cho
-- trigger, nen chung CHI ton tai o day. Sinh lai migration nay tu schema se lam TAT CA bien mat —
-- va he thong van chay binh thuong, chi khong con chan gi ca.
-- `transport-fuel-storage.spec.ts` doc chinh tep nay va do neu mot ten bien mat.
--
-- ---------------------------------------------------------------------------
-- KHONG CO PHU THUOC VAN HANH MOI. Khac T3 (`btree_gist` cho `EXCLUDE`), T4 chi dung `CHECK` va
-- mot trigger PL/pgSQL — deu la nang luc loi cua PostgreSQL, khong extension nao. Mot muc tieu
-- trien khai da chay duoc T3 thi chay duoc T4 ma khong phai cap them quyen gi.

-- ===========================================================================
-- PHAN 1 — DDL SINH RA TU `schema.prisma`
-- ===========================================================================

-- CreateEnum
CREATE TYPE "TransportFuelVerificationStatus" AS ENUM ('DECLARED', 'VERIFIED', 'REJECTED');

-- CreateEnum
CREATE TYPE "TransportFuelReconciliationStatus" AS ENUM ('UNMATCHED', 'MATCHED', 'MISMATCHED', 'SETTLED', 'IGNORED');

-- CreateEnum
CREATE TYPE "TransportFuelPaymentMethod" AS ENUM ('DRIVER_CASH', 'SUPPLIER_ACCOUNT');

-- CreateEnum
CREATE TYPE "TransportFuelReviewReason" AS ENUM ('ODOMETER_NOT_ADVANCED', 'NO_PREVIOUS_ODOMETER', 'CONSUMPTION_ABOVE_NORM');

-- CreateEnum
CREATE TYPE "TransportFuelStatementFormat" AS ENUM ('CSV', 'XLSX');

-- CreateEnum
CREATE TYPE "TransportFuelStatementLineStatus" AS ENUM ('ACCEPTED', 'REJECTED');

-- CreateEnum
CREATE TYPE "TransportFuelStatementRejectReason" AS ENUM ('MISSING_REQUIRED_FIELD', 'MALFORMED_DATE', 'MALFORMED_AMOUNT', 'MALFORMED_LITERS', 'UNKNOWN_VEHICLE', 'DUPLICATE_ROW');

-- CreateEnum
CREATE TYPE "TransportFuelMatchOrigin" AS ENUM ('AUTO', 'MANUAL');

-- CreateEnum
CREATE TYPE "TransportFuelDiscrepancyKind" AS ENUM ('AMBIGUOUS_CANDIDATES', 'STATEMENT_LINE_ONLY', 'FUEL_ENTRY_ONLY', 'OUT_OF_TOLERANCE', 'SELF_SOURCED_BLOCKED');

-- CreateEnum
CREATE TYPE "TransportFuelDiscrepancyStatus" AS ENUM ('PENDING', 'RESOLVED');

-- CreateEnum
CREATE TYPE "TransportFuelDiscrepancyResolution" AS ENUM ('ACCEPT_SUPPLIER_AMOUNT', 'REJECT_SUPPLIER_LINE', 'MATCH_CONFIRMED', 'IGNORE_WITH_REASON', 'ENTRY_CORRECTION_REQUIRED');

-- CreateEnum
CREATE TYPE "TransportFuelReconciliationState" AS ENUM ('DRAFT', 'MATCHING', 'RESOLVED', 'CLOSED', 'REOPENED');


-- CreateTable
CREATE TABLE "TransportFuelSupplier" (
    "id" TEXT NOT NULL,
    "name" TEXT NOT NULL,
    "code" TEXT,
    "phone" TEXT,
    "address" TEXT,
    "taxCode" TEXT,
    "status" "TransportPartyStatus" NOT NULL DEFAULT 'ACTIVE',
    "createdAt" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,
    "updatedAt" TIMESTAMP(3) NOT NULL,

    CONSTRAINT "TransportFuelSupplier_pkey" PRIMARY KEY ("id")
);

-- CreateTable
CREATE TABLE "TransportFuelEntry" (
    "id" TEXT NOT NULL,
    "tripId" TEXT NOT NULL,
    "vehicleId" TEXT NOT NULL,
    "driverId" TEXT NOT NULL,
    "supplierId" TEXT NOT NULL,
    "businessDate" VARCHAR(10) NOT NULL,
    "occurredAt" TIMESTAMP(3) NOT NULL,
    "liters" DECIMAL(12,3) NOT NULL,
    "amount" BIGINT NOT NULL,
    "currencyCode" VARCHAR(3) NOT NULL DEFAULT 'VND',
    "odometerKm" INTEGER NOT NULL,
    "previousOdometerKm" INTEGER,
    "consumptionL100km" DECIMAL(10,3),
    "reviewReasons" "TransportFuelReviewReason"[],
    "paymentMethod" "TransportFuelPaymentMethod" NOT NULL,
    "verificationStatus" "TransportFuelVerificationStatus" NOT NULL DEFAULT 'DECLARED',
    "reconciliationStatus" "TransportFuelReconciliationStatus" NOT NULL DEFAULT 'UNMATCHED',
    "sourceStatementId" TEXT,
    "costExpenseId" TEXT,
    "correlationKey" TEXT NOT NULL,
    "invoiceNo" TEXT,
    "note" TEXT,
    "declaredBy" TEXT NOT NULL,
    "verifiedAt" TIMESTAMP(3),
    "verifiedBy" TEXT,
    "rejectedAt" TIMESTAMP(3),
    "rejectedBy" TEXT,
    "reviewNote" TEXT,
    "createdAt" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,
    "updatedAt" TIMESTAMP(3) NOT NULL,

    CONSTRAINT "TransportFuelEntry_pkey" PRIMARY KEY ("id")
);

-- CreateTable
CREATE TABLE "TransportFuelReceiptEvidence" (
    "id" TEXT NOT NULL,
    "fuelEntryId" TEXT NOT NULL,
    "locator" TEXT NOT NULL,
    "contentType" TEXT,
    "byteSize" INTEGER,
    "capturedAt" TIMESTAMP(3),
    "uploadedBy" TEXT NOT NULL,
    "createdAt" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,

    CONSTRAINT "TransportFuelReceiptEvidence_pkey" PRIMARY KEY ("id")
);

-- CreateTable
CREATE TABLE "TransportFuelSupplierStatement" (
    "id" TEXT NOT NULL,
    "supplierId" TEXT NOT NULL,
    "periodStart" VARCHAR(10) NOT NULL,
    "periodEnd" VARCHAR(10) NOT NULL,
    "format" "TransportFuelStatementFormat" NOT NULL,
    "sourceRef" TEXT NOT NULL,
    "sourceDigest" VARCHAR(64) NOT NULL,
    "rowCount" INTEGER NOT NULL,
    "acceptedCount" INTEGER NOT NULL,
    "rejectedCount" INTEGER NOT NULL,
    "importedAt" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,
    "importedBy" TEXT NOT NULL,

    CONSTRAINT "TransportFuelSupplierStatement_pkey" PRIMARY KEY ("id")
);

-- CreateTable
CREATE TABLE "TransportFuelStatementLine" (
    "id" TEXT NOT NULL,
    "statementId" TEXT NOT NULL,
    "rowNumber" INTEGER NOT NULL,
    "status" "TransportFuelStatementLineStatus" NOT NULL,
    "rejectReason" "TransportFuelStatementRejectReason",
    "vehiclePlateRaw" TEXT NOT NULL,
    "vehicleId" TEXT,
    "businessDate" VARCHAR(10),
    "liters" DECIMAL(12,3),
    "amount" BIGINT,
    "currencyCode" VARCHAR(3) NOT NULL DEFAULT 'VND',
    "invoiceNo" TEXT,
    "note" TEXT,
    "rawValues" JSONB NOT NULL,
    "reconciliationStatus" "TransportFuelReconciliationStatus" NOT NULL DEFAULT 'UNMATCHED',
    "createdAt" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,

    CONSTRAINT "TransportFuelStatementLine_pkey" PRIMARY KEY ("id")
);

-- CreateTable
CREATE TABLE "TransportFuelReconciliation" (
    "id" TEXT NOT NULL,
    "supplierId" TEXT NOT NULL,
    "statementId" TEXT NOT NULL,
    "periodStart" VARCHAR(10) NOT NULL,
    "periodEnd" VARCHAR(10) NOT NULL,
    "state" "TransportFuelReconciliationState" NOT NULL DEFAULT 'DRAFT',
    "lastMatchedAt" TIMESTAMP(3),
    "closedAt" TIMESTAMP(3),
    "closedBy" TEXT,
    "reopenedAt" TIMESTAMP(3),
    "reopenedBy" TEXT,
    "reopenReason" TEXT,
    "createdAt" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,
    "updatedAt" TIMESTAMP(3) NOT NULL,

    CONSTRAINT "TransportFuelReconciliation_pkey" PRIMARY KEY ("id")
);

-- CreateTable
CREATE TABLE "TransportFuelMatch" (
    "id" TEXT NOT NULL,
    "reconciliationId" TEXT NOT NULL,
    "statementLineId" TEXT NOT NULL,
    "fuelEntryId" TEXT NOT NULL,
    "amountDeltaVnd" BIGINT NOT NULL,
    "businessDateDeltaDays" INTEGER NOT NULL,
    "origin" "TransportFuelMatchOrigin" NOT NULL,
    "matchedAt" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,
    "matchedBy" TEXT NOT NULL,

    CONSTRAINT "TransportFuelMatch_pkey" PRIMARY KEY ("id")
);

-- CreateTable
CREATE TABLE "TransportFuelDiscrepancy" (
    "id" TEXT NOT NULL,
    "reconciliationId" TEXT NOT NULL,
    "kind" "TransportFuelDiscrepancyKind" NOT NULL,
    "status" "TransportFuelDiscrepancyStatus" NOT NULL DEFAULT 'PENDING',
    "statementLineId" TEXT,
    "fuelEntryId" TEXT,
    "candidateEntryIds" TEXT[],
    "candidateLineIds" TEXT[],
    "resolution" "TransportFuelDiscrepancyResolution",
    "resolutionNote" TEXT,
    "resolvedAt" TIMESTAMP(3),
    "resolvedBy" TEXT,
    "createdAt" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,

    CONSTRAINT "TransportFuelDiscrepancy_pkey" PRIMARY KEY ("id")
);

-- CreateTable
CREATE TABLE "TransportFuelSettlementHandoff" (
    "id" TEXT NOT NULL,
    "reconciliationId" TEXT NOT NULL,
    "supplierId" TEXT NOT NULL,
    "periodStart" VARCHAR(10) NOT NULL,
    "periodEnd" VARCHAR(10) NOT NULL,
    "acceptedAmount" BIGINT NOT NULL,
    "currencyCode" VARCHAR(3) NOT NULL DEFAULT 'VND',
    "acceptedLineCount" INTEGER NOT NULL,
    "revision" INTEGER NOT NULL DEFAULT 1,
    "supersedesHandoffId" TEXT,
    "emittedAt" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,
    "emittedBy" TEXT NOT NULL,

    CONSTRAINT "TransportFuelSettlementHandoff_pkey" PRIMARY KEY ("id")
);

-- CreateIndex
CREATE UNIQUE INDEX "TransportFuelSupplier_code_key" ON "TransportFuelSupplier"("code");

-- CreateIndex
CREATE INDEX "TransportFuelSupplier_status_idx" ON "TransportFuelSupplier"("status");

-- CreateIndex
CREATE UNIQUE INDEX "TransportFuelEntry_costExpenseId_key" ON "TransportFuelEntry"("costExpenseId");

-- CreateIndex
CREATE UNIQUE INDEX "TransportFuelEntry_correlationKey_key" ON "TransportFuelEntry"("correlationKey");

-- CreateIndex
CREATE INDEX "TransportFuelEntry_tripId_idx" ON "TransportFuelEntry"("tripId");

-- CreateIndex
CREATE INDEX "TransportFuelEntry_vehicleId_businessDate_idx" ON "TransportFuelEntry"("vehicleId", "businessDate");

-- CreateIndex
CREATE INDEX "TransportFuelEntry_driverId_idx" ON "TransportFuelEntry"("driverId");

-- CreateIndex
CREATE INDEX "TransportFuelEntry_supplierId_businessDate_idx" ON "TransportFuelEntry"("supplierId", "businessDate");

-- CreateIndex
CREATE INDEX "TransportFuelEntry_verificationStatus_idx" ON "TransportFuelEntry"("verificationStatus");

-- CreateIndex
CREATE INDEX "TransportFuelEntry_reconciliationStatus_idx" ON "TransportFuelEntry"("reconciliationStatus");

-- CreateIndex
CREATE INDEX "TransportFuelEntry_sourceStatementId_idx" ON "TransportFuelEntry"("sourceStatementId");

-- CreateIndex
CREATE INDEX "TransportFuelReceiptEvidence_fuelEntryId_idx" ON "TransportFuelReceiptEvidence"("fuelEntryId");

-- CreateIndex
CREATE INDEX "TransportFuelSupplierStatement_supplierId_idx" ON "TransportFuelSupplierStatement"("supplierId");

-- CreateIndex
CREATE UNIQUE INDEX "TransportFuelSupplierStatement_supplierId_periodStart_perio_key" ON "TransportFuelSupplierStatement"("supplierId", "periodStart", "periodEnd");

-- CreateIndex
CREATE INDEX "TransportFuelStatementLine_statementId_status_idx" ON "TransportFuelStatementLine"("statementId", "status");

-- CreateIndex
CREATE INDEX "TransportFuelStatementLine_vehicleId_businessDate_idx" ON "TransportFuelStatementLine"("vehicleId", "businessDate");

-- CreateIndex
CREATE UNIQUE INDEX "TransportFuelStatementLine_statementId_rowNumber_key" ON "TransportFuelStatementLine"("statementId", "rowNumber");

-- CreateIndex
CREATE UNIQUE INDEX "TransportFuelReconciliation_statementId_key" ON "TransportFuelReconciliation"("statementId");

-- CreateIndex
CREATE INDEX "TransportFuelReconciliation_supplierId_state_idx" ON "TransportFuelReconciliation"("supplierId", "state");

-- CreateIndex
CREATE UNIQUE INDEX "TransportFuelMatch_statementLineId_key" ON "TransportFuelMatch"("statementLineId");

-- CreateIndex
CREATE UNIQUE INDEX "TransportFuelMatch_fuelEntryId_key" ON "TransportFuelMatch"("fuelEntryId");

-- CreateIndex
CREATE INDEX "TransportFuelMatch_reconciliationId_idx" ON "TransportFuelMatch"("reconciliationId");

-- CreateIndex
CREATE INDEX "TransportFuelDiscrepancy_reconciliationId_status_idx" ON "TransportFuelDiscrepancy"("reconciliationId", "status");

-- CreateIndex
CREATE INDEX "TransportFuelDiscrepancy_statementLineId_idx" ON "TransportFuelDiscrepancy"("statementLineId");

-- CreateIndex
CREATE INDEX "TransportFuelDiscrepancy_fuelEntryId_idx" ON "TransportFuelDiscrepancy"("fuelEntryId");

-- CreateIndex
CREATE UNIQUE INDEX "TransportFuelSettlementHandoff_reconciliationId_revision_key" ON "TransportFuelSettlementHandoff"("reconciliationId", "revision");

-- CreateIndex
CREATE UNIQUE INDEX "TransportFuelSettlementHandoff_supersedesHandoffId_key" ON "TransportFuelSettlementHandoff"("supersedesHandoffId");

-- CreateIndex
CREATE INDEX "TransportFuelSettlementHandoff_supplierId_idx" ON "TransportFuelSettlementHandoff"("supplierId");

-- AddForeignKey
ALTER TABLE "TransportFuelEntry" ADD CONSTRAINT "TransportFuelEntry_tripId_fkey" FOREIGN KEY ("tripId") REFERENCES "TransportTrip"("id") ON DELETE RESTRICT ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "TransportFuelEntry" ADD CONSTRAINT "TransportFuelEntry_vehicleId_fkey" FOREIGN KEY ("vehicleId") REFERENCES "TransportVehicle"("id") ON DELETE RESTRICT ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "TransportFuelEntry" ADD CONSTRAINT "TransportFuelEntry_driverId_fkey" FOREIGN KEY ("driverId") REFERENCES "TransportDriver"("id") ON DELETE RESTRICT ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "TransportFuelEntry" ADD CONSTRAINT "TransportFuelEntry_supplierId_fkey" FOREIGN KEY ("supplierId") REFERENCES "TransportFuelSupplier"("id") ON DELETE RESTRICT ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "TransportFuelEntry" ADD CONSTRAINT "TransportFuelEntry_sourceStatementId_fkey" FOREIGN KEY ("sourceStatementId") REFERENCES "TransportFuelSupplierStatement"("id") ON DELETE SET NULL ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "TransportFuelReceiptEvidence" ADD CONSTRAINT "TransportFuelReceiptEvidence_fuelEntryId_fkey" FOREIGN KEY ("fuelEntryId") REFERENCES "TransportFuelEntry"("id") ON DELETE CASCADE ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "TransportFuelSupplierStatement" ADD CONSTRAINT "TransportFuelSupplierStatement_supplierId_fkey" FOREIGN KEY ("supplierId") REFERENCES "TransportFuelSupplier"("id") ON DELETE RESTRICT ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "TransportFuelStatementLine" ADD CONSTRAINT "TransportFuelStatementLine_statementId_fkey" FOREIGN KEY ("statementId") REFERENCES "TransportFuelSupplierStatement"("id") ON DELETE CASCADE ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "TransportFuelStatementLine" ADD CONSTRAINT "TransportFuelStatementLine_vehicleId_fkey" FOREIGN KEY ("vehicleId") REFERENCES "TransportVehicle"("id") ON DELETE SET NULL ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "TransportFuelReconciliation" ADD CONSTRAINT "TransportFuelReconciliation_supplierId_fkey" FOREIGN KEY ("supplierId") REFERENCES "TransportFuelSupplier"("id") ON DELETE RESTRICT ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "TransportFuelReconciliation" ADD CONSTRAINT "TransportFuelReconciliation_statementId_fkey" FOREIGN KEY ("statementId") REFERENCES "TransportFuelSupplierStatement"("id") ON DELETE RESTRICT ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "TransportFuelMatch" ADD CONSTRAINT "TransportFuelMatch_reconciliationId_fkey" FOREIGN KEY ("reconciliationId") REFERENCES "TransportFuelReconciliation"("id") ON DELETE CASCADE ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "TransportFuelMatch" ADD CONSTRAINT "TransportFuelMatch_statementLineId_fkey" FOREIGN KEY ("statementLineId") REFERENCES "TransportFuelStatementLine"("id") ON DELETE RESTRICT ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "TransportFuelMatch" ADD CONSTRAINT "TransportFuelMatch_fuelEntryId_fkey" FOREIGN KEY ("fuelEntryId") REFERENCES "TransportFuelEntry"("id") ON DELETE RESTRICT ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "TransportFuelDiscrepancy" ADD CONSTRAINT "TransportFuelDiscrepancy_reconciliationId_fkey" FOREIGN KEY ("reconciliationId") REFERENCES "TransportFuelReconciliation"("id") ON DELETE CASCADE ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "TransportFuelDiscrepancy" ADD CONSTRAINT "TransportFuelDiscrepancy_statementLineId_fkey" FOREIGN KEY ("statementLineId") REFERENCES "TransportFuelStatementLine"("id") ON DELETE SET NULL ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "TransportFuelDiscrepancy" ADD CONSTRAINT "TransportFuelDiscrepancy_fuelEntryId_fkey" FOREIGN KEY ("fuelEntryId") REFERENCES "TransportFuelEntry"("id") ON DELETE SET NULL ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "TransportFuelSettlementHandoff" ADD CONSTRAINT "TransportFuelSettlementHandoff_reconciliationId_fkey" FOREIGN KEY ("reconciliationId") REFERENCES "TransportFuelReconciliation"("id") ON DELETE CASCADE ON UPDATE CASCADE;

-- AddForeignKey
--
-- Chuoi ban sua doi cua mot ky tro NGUOC ve ban truoc no. `ON DELETE RESTRICT`: xoa mot ban giao
-- da bi thay the se lam dut day va bo lai mot ban moi khong giai thich duoc no sua cai gi.
ALTER TABLE "TransportFuelSettlementHandoff" ADD CONSTRAINT "TransportFuelSettlementHandoff_supersedesHandoffId_fkey" FOREIGN KEY ("supersedesHandoffId") REFERENCES "TransportFuelSettlementHandoff"("id") ON DELETE RESTRICT ON UPDATE CASCADE;


-- ===========================================================================
-- PHAN 2 — RANG BUOC PRISMA KHONG KHAI DUOC
-- ===========================================================================

-- ---------------------------------------------------------------------------
-- KHOANG TIEN — cung hai hang so voi `money()`, voi `TransportTrip.freightAmount` (T2.1/F1) va voi
-- so cai cua T3.
--
-- Khac hai cho tren o MOT diem: tien cua mot phieu dau phai DUONG. Mot phieu do dau 0 dong khong
-- noi gi ve the gioi, va mot phieu am la mot khoan hoan tien — thu khong di duong nay. Duong sua
-- mot phieu sai la dao phieu (`GD-10`), khong phai ghi mot phieu am de bu.
-- ---------------------------------------------------------------------------

ALTER TABLE "TransportFuelEntry"
  ADD CONSTRAINT "TransportFuelEntry_amount_money_range"
  CHECK ("amount" > 0 AND "amount" <= 9007199254740991);

ALTER TABLE "TransportFuelStatementLine"
  ADD CONSTRAINT "TransportFuelStatementLine_amount_money_range"
  CHECK ("amount" IS NULL OR ("amount" > 0 AND "amount" <= 9007199254740991));

-- `>= 0` chu khong `> 0`: mot ky doi soat ma MOI dong deu bi tu choi van dong duoc, va ban giao cua
-- no mang so 0. Do la mot ket qua that, khong phai mot loi — ep no duong se buoc nguoi doi soat
-- phai bia ra mot dong de dong duoc ky.
ALTER TABLE "TransportFuelSettlementHandoff"
  ADD CONSTRAINT "TransportFuelSettlementHandoff_amount_money_range"
  CHECK ("acceptedAmount" >= 0 AND "acceptedAmount" <= 9007199254740991);

-- ---------------------------------------------------------------------------
-- CHUOI BAN SUA DOI BAN GIAO — Issue #103 SS2.
--
-- `revision` dem tu 1, va ban DAU TIEN khong thay the ban nao. Hai dieu do di cung nhau: mot hang
-- `revision = 1` co `supersedesHandoffId` la mot day bat dau tu giua chung, va mot hang
-- `revision > 1` khong co no la mot ban sua doi khong noi duoc no sua cai gi.
--
-- `CHECK` doc duoc ca hai vi ca hai cot deu nam tren CHINH hang do — khac `INV-26`, thu phai la
-- trigger vi no so hai cot o hai bang.
-- ---------------------------------------------------------------------------

ALTER TABLE "TransportFuelSettlementHandoff"
  ADD CONSTRAINT "TransportFuelSettlementHandoff_revision_chain"
  CHECK (
    "revision" >= 1
    AND (("revision" = 1) = ("supersedesHandoffId" IS NULL))
  );

-- ---------------------------------------------------------------------------
-- SO LIT — `NUMERIC(12,3)` da chan so thuc nhi phan, `CHECK` chan so 0 va so am.
--
-- Cot la `NUMERIC` chu khong `DOUBLE PRECISION` vi mot lan do dau 12,345 lit phai doc len dung
-- 12,345 sau khi di qua mot phep cong; `DOUBLE PRECISION` khong hua dieu do. Con `> 0` la vi mot
-- phieu 0 lit khong phai mot lan do dau, va no se lam moi phep tinh tieu hao ra 0 L/100km — mot con
-- so trong nhu binh thuong tren bao cao.
-- ---------------------------------------------------------------------------

ALTER TABLE "TransportFuelEntry"
  ADD CONSTRAINT "TransportFuelEntry_liters_positive"
  CHECK ("liters" > 0);

ALTER TABLE "TransportFuelStatementLine"
  ADD CONSTRAINT "TransportFuelStatementLine_liters_positive"
  CHECK ("liters" IS NULL OR "liters" > 0);

-- ---------------------------------------------------------------------------
-- ODO — khong am, o ca hai cot.
--
-- Mot odo am khong ton tai tren dong ho nao, va neu lot vao thi hieu `odo - odoTruoc` co the ra mot
-- mau so DUONG tu hai so vo nghia — tuc `INV-06` se tinh ra mot con so tieu hao trong nhu that.
-- ---------------------------------------------------------------------------

ALTER TABLE "TransportFuelEntry"
  ADD CONSTRAINT "TransportFuelEntry_odometer_non_negative"
  CHECK ("odometerKm" >= 0 AND ("previousOdometerKm" IS NULL OR "previousOdometerKm" >= 0));

-- ---------------------------------------------------------------------------
-- `INV-06` O TANG DB — co tieu hao thi PHAI co mau so duong.
--
-- Ham TypeScript (`fuel-quantity.ts`) chi dung voi cac hang di QUA ung dung. Mot `UPDATE` tay hay
-- mot ban khoi phuc cu co the dat mot con so tieu hao vao mot phieu khong co odo truoc — va con so
-- do se di thang vao bao cao dinh muc ma khong ai truy nguoc duoc no tu dau ra.
--
-- Rang buoc doc theo dung chieu cua `INV-06`: KHONG cam phieu thieu tieu hao (do la truong hop
-- binh thuong, danh dau `ODOMETER_NOT_ADVANCED`), chi cam phieu CO tieu hao ma khong co mau so.
-- ---------------------------------------------------------------------------

ALTER TABLE "TransportFuelEntry"
  ADD CONSTRAINT "TransportFuelEntry_consumption_needs_odo"
  CHECK (
    "consumptionL100km" IS NULL
    OR ("previousOdometerKm" IS NOT NULL AND "odometerKm" > "previousOdometerKm")
  );

-- ---------------------------------------------------------------------------
-- HAI TRUC TRANG THAI phai mang du dau vet cua chinh no.
--
-- `VERIFIED` ma khong biet ai duyet, luc nao — do la mot phieu da duoc tin ma khong ai chiu trach
-- nhiem. Bieu dien bang tuong duong hai chieu (`=`) chu khong bang mot chieu: no chan CA hai kieu
-- hong, ke ca kieu it ai nghi toi — mot phieu con `DECLARED` nhung mang san `verifiedBy` cua mot
-- lan duyet da bi go.
-- ---------------------------------------------------------------------------

ALTER TABLE "TransportFuelEntry"
  ADD CONSTRAINT "TransportFuelEntry_review_lifecycle"
  CHECK (
    (("verificationStatus" = 'VERIFIED') = ("verifiedAt" IS NOT NULL AND "verifiedBy" IS NOT NULL))
    AND (("verificationStatus" = 'REJECTED') = ("rejectedAt" IS NOT NULL AND "rejectedBy" IS NOT NULL))
  );

-- ---------------------------------------------------------------------------
-- DONG BANG KE — "khong doan ngam" duoc cuong che, khong chi duoc viet trong tai lieu.
--
-- Mot dong `ACCEPTED` phai co DU bon truong ma so khop can (xe, ngay, lit, tien). Neu thieu mot
-- truong ma van `ACCEPTED`, dong do se di vao vong so khop roi khong khop duoc voi gi — va no se
-- hien ra nhu mot chenh lech nghiep vu, trong khi that ra la mot dong nhap hong.
--
-- Va mot dong `REJECTED` phai co LY DO CO TEN. Tu choi khong ly do la dieu te nhat co the lam voi
-- mot file nhap: nguoi dung thay dong bi bo ma khong biet phai sua gi.
-- ---------------------------------------------------------------------------

ALTER TABLE "TransportFuelStatementLine"
  ADD CONSTRAINT "TransportFuelStatementLine_accepted_fields"
  CHECK (
    "status" <> 'ACCEPTED'
    OR (
      "vehicleId" IS NOT NULL
      AND "businessDate" IS NOT NULL
      AND "liters" IS NOT NULL
      AND "amount" IS NOT NULL
    )
  );

ALTER TABLE "TransportFuelStatementLine"
  ADD CONSTRAINT "TransportFuelStatementLine_rejected_reason"
  CHECK (("status" = 'REJECTED') = ("rejectReason" IS NOT NULL));

-- ---------------------------------------------------------------------------
-- NGAY NGHIEP VU — dang `YYYY-MM-DD`, giong hai migration truoc.
--
-- Cot la `VARCHAR(10)` chu khong `DATE` CO Y (`INV-25`): mot cot timestamp la thu duy nhat ma nguoi
-- doc co the "suy nguoc ra ngay", va suy nguoc bang UTC chinh la loi ma `INV-25` sinh ra de chan.
-- `CHECK` nay la thu giu cho no van la mot NGAY chu khong thanh mot o ghi chu tu do.
--
-- `~` khong phai `LIKE`: `LIKE '____-__-__'` cho qua `abcd-ef-gh`.
-- ---------------------------------------------------------------------------

ALTER TABLE "TransportFuelEntry"
  ADD CONSTRAINT "TransportFuelEntry_businessDate_iso"
  CHECK ("businessDate" ~ '^\d{4}-\d{2}-\d{2}$');

ALTER TABLE "TransportFuelStatementLine"
  ADD CONSTRAINT "TransportFuelStatementLine_businessDate_iso"
  CHECK ("businessDate" IS NULL OR "businessDate" ~ '^\d{4}-\d{2}-\d{2}$');

-- ---------------------------------------------------------------------------
-- KHOANG KY — dang ngay dung VA hai dau dung thu tu.
--
-- `periodStart > periodEnd` cho ra mot ky RONG. Moi truy van "cac dong trong ky" se tra ve 0 hang,
-- nen bang doi soat hien ra trong nhu mot ky khong co giao dich nao — thay vi bao rang khoang ngay
-- da nhap nguoc. So sanh chuoi la du vi ISO-8601 sap xep theo tu dien.
-- ---------------------------------------------------------------------------

ALTER TABLE "TransportFuelSupplierStatement"
  ADD CONSTRAINT "TransportFuelSupplierStatement_period_order"
  CHECK (
    "periodStart" ~ '^\d{4}-\d{2}-\d{2}$'
    AND "periodEnd" ~ '^\d{4}-\d{2}-\d{2}$'
    AND "periodStart" <= "periodEnd"
  );

ALTER TABLE "TransportFuelReconciliation"
  ADD CONSTRAINT "TransportFuelReconciliation_period_order"
  CHECK (
    "periodStart" ~ '^\d{4}-\d{2}-\d{2}$'
    AND "periodEnd" ~ '^\d{4}-\d{2}-\d{2}$'
    AND "periodStart" <= "periodEnd"
  );

ALTER TABLE "TransportFuelSettlementHandoff"
  ADD CONSTRAINT "TransportFuelSettlementHandoff_period_order"
  CHECK (
    "periodStart" ~ '^\d{4}-\d{2}-\d{2}$'
    AND "periodEnd" ~ '^\d{4}-\d{2}-\d{2}$'
    AND "periodStart" <= "periodEnd"
  );

-- ---------------------------------------------------------------------------
-- MOT CHENH LECH DA QUYET phai noi duoc AI quyet, LUC NAO va QUYET GI.
--
-- `FUEL-RECON-004` chan dong ky khi con chenh lech `PENDING`. Neu mot hang co the mang
-- `status = 'RESOLVED'` ma khong co `resolution`, thi cong do di qua duoc bang mot lan `UPDATE`
-- doi dung mot cot — va ky dong lai voi mot chenh lech khong ai thuc su quyet.
-- ---------------------------------------------------------------------------

ALTER TABLE "TransportFuelDiscrepancy"
  ADD CONSTRAINT "TransportFuelDiscrepancy_resolved_fields"
  CHECK (
    ("status" = 'RESOLVED')
    = ("resolution" IS NOT NULL AND "resolvedAt" IS NOT NULL AND "resolvedBy" IS NOT NULL)
  );

-- ---------------------------------------------------------------------------
-- MOT CHENH LECH phai gan vao it nhat MOT ve.
--
-- Mot hang khong tro toi dong bang ke nao lan phieu nao la mot viec khong ai lam duoc gi voi no:
-- no chan viec dong ky (`PENDING`) ma khong chi ra cho nao de xem.
-- ---------------------------------------------------------------------------

ALTER TABLE "TransportFuelDiscrepancy"
  ADD CONSTRAINT "TransportFuelDiscrepancy_has_subject"
  CHECK (
    "statementLineId" IS NOT NULL
    OR "fuelEntryId" IS NOT NULL
    OR cardinality("candidateEntryIds") > 0
    OR cardinality("candidateLineIds") > 0
  );

-- ===========================================================================
-- PHAN 3 — `INV-26` O TANG DB
-- ===========================================================================
--
-- "Doi soat khong duoc tu khop voi chinh minh": mot dong bang ke khong duoc khop voi mot phieu duoc
-- de ra TU CHINH bang ke do. Neu khong chan, he thong LUON bao khop 100% va toan bo gia tri chong
-- that thoat cua `TX-04` bien mat — khong loi, khong canh bao, chi mot bao cao dep.
--
-- VI SAO KHONG PHAI MOT `CHECK`: bat bien nay so hai cot o HAI BANG KHAC NHAU
-- (`TransportFuelEntry.sourceStatementId` va `TransportFuelStatementLine.statementId`), con `CHECK`
-- cua PostgreSQL chi doc duoc hang cua chinh no. Duong "khoa ngoai ghep" cung khong dung: cot
-- `sourceStatementId` NULL duoc (phieu do lai xe khai la truong hop THUONG GAP), va mot khoa ngoai
-- ghep co cot NULL thi `MATCH SIMPLE` bo qua khong kiem — tuc dung o cho no can chan nhat.
--
-- Nen o day la mot TRIGGER. No nam trong cung giao dich voi lan `INSERT`/`UPDATE`, doc hai bang, va
-- tu choi bang mot thong diep CO TEN de tang kho dich lai duoc thanh mot ly do nghiep vu.
--
-- Tang mien cung chan (`fuel-matching.ts` khong bao gio de nghi mot cap tu-nguon). Hai lop la co y,
-- va thu tu quan trong: tang mien tra ve mot CHENH LECH co ten cho nguoi doi soat; trigger nay la
-- luoi cuoi cho moi duong ghi KHONG di qua tang do.

CREATE OR REPLACE FUNCTION transport_fuel_match_no_self_source() RETURNS trigger AS $$
DECLARE
  entry_source_statement TEXT;
  line_statement TEXT;
BEGIN
  SELECT "sourceStatementId" INTO entry_source_statement
  FROM "TransportFuelEntry" WHERE "id" = NEW."fuelEntryId";

  SELECT "statementId" INTO line_statement
  FROM "TransportFuelStatementLine" WHERE "id" = NEW."statementLineId";

  IF entry_source_statement IS NOT NULL AND entry_source_statement = line_statement THEN
    RAISE EXCEPTION
      'TransportFuelMatch_no_self_source: phieu % duoc de ra tu chinh bang ke % dang doi soat (INV-26)',
      NEW."fuelEntryId", line_statement
      USING ERRCODE = 'integrity_constraint_violation';
  END IF;

  RETURN NEW;
END;
$$ LANGUAGE plpgsql;

CREATE TRIGGER "TransportFuelMatch_no_self_source"
  BEFORE INSERT OR UPDATE ON "TransportFuelMatch"
  FOR EACH ROW EXECUTE FUNCTION transport_fuel_match_no_self_source();
