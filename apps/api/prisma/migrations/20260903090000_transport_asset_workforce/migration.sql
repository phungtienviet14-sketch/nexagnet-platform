-- CreateEnum
CREATE TYPE "TransportMaintenanceTriggerKind" AS ENUM ('ODOMETER', 'CALENDAR', 'ODOMETER_OR_CALENDAR');

-- CreateEnum
CREATE TYPE "TransportMaintenancePlanStatus" AS ENUM ('ACTIVE', 'INACTIVE');

-- CreateEnum
CREATE TYPE "TransportMaintenanceWorkOrderStatus" AS ENUM ('OPEN', 'COMPLETED', 'CANCELLED');

-- CreateEnum
CREATE TYPE "TransportComplianceDocumentType" AS ENUM ('VEHICLE_INSPECTION', 'VEHICLE_INSURANCE', 'VEHICLE_TRANSPORT_BADGE', 'DRIVER_LICENCE', 'COMPANY_TRANSPORT_LICENSE', 'CONDITIONAL_CARGO_PERMIT');

-- CreateEnum
CREATE TYPE "TransportComplianceSubjectKind" AS ENUM ('VEHICLE', 'DRIVER', 'COMPANY');

-- CreateEnum
CREATE TYPE "TransportComplianceDocumentStatus" AS ENUM ('ACTIVE', 'SUPERSEDED', 'REVOKED');

-- CreateEnum
CREATE TYPE "TransportPayrollPeriodStatus" AS ENUM ('OPEN', 'CLOSED');

-- CreateEnum
CREATE TYPE "TransportPayslipStatus" AS ENUM ('DRAFT', 'APPROVED', 'PAID', 'REVERSED');

-- CreateEnum
CREATE TYPE "TransportPayslipKind" AS ENUM ('ORIGINAL', 'SUPPLEMENTAL', 'REVERSAL');

-- CreateEnum
CREATE TYPE "TransportPayslipComponentKind" AS ENUM ('EARNING', 'DEDUCTION');

-- CreateEnum
CREATE TYPE "TransportPayslipComponentSource" AS ENUM ('BASE_SALARY', 'PER_TRIP', 'PER_KM', 'FUEL_SAVING_BONUS', 'MANUAL_BONUS', 'MANUAL_DEDUCTION');

-- CreateTable
CREATE TABLE "TransportMaintenancePlan" (
    "id" TEXT NOT NULL,
    "vehicleId" TEXT NOT NULL,
    "name" TEXT NOT NULL,
    "triggerKind" "TransportMaintenanceTriggerKind" NOT NULL,
    "intervalKm" INTEGER,
    "intervalDays" INTEGER,
    "baselineOdoKm" INTEGER NOT NULL,
    "baselineDate" VARCHAR(10) NOT NULL,
    "status" "TransportMaintenancePlanStatus" NOT NULL DEFAULT 'ACTIVE',
    "createdBy" TEXT NOT NULL,
    "createdAt" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,
    "updatedAt" TIMESTAMP(3) NOT NULL,

    CONSTRAINT "TransportMaintenancePlan_pkey" PRIMARY KEY ("id")
);

-- CreateTable
CREATE TABLE "TransportMaintenanceWorkOrder" (
    "id" TEXT NOT NULL,
    "vehicleId" TEXT NOT NULL,
    "planId" TEXT,
    "status" "TransportMaintenanceWorkOrderStatus" NOT NULL DEFAULT 'OPEN',
    "description" TEXT NOT NULL,
    "openedDate" VARCHAR(10) NOT NULL,
    "openedOdoKm" INTEGER NOT NULL,
    "openedBy" TEXT NOT NULL,
    "openedAt" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,
    "completedDate" VARCHAR(10),
    "completedOdoKm" INTEGER,
    "completedBy" TEXT,
    "completedAt" TIMESTAMP(3),
    "cancelledAt" TIMESTAMP(3),
    "cancelledBy" TEXT,
    "cancellationReason" TEXT,
    "costAmount" BIGINT,
    "currencyCode" VARCHAR(3) NOT NULL DEFAULT 'VND',
    "costingExpenseRef" TEXT,
    "note" TEXT,
    "updatedAt" TIMESTAMP(3) NOT NULL,

    CONSTRAINT "TransportMaintenanceWorkOrder_pkey" PRIMARY KEY ("id")
);

-- CreateTable
CREATE TABLE "TransportComplianceDocument" (
    "id" TEXT NOT NULL,
    "subjectKind" "TransportComplianceSubjectKind" NOT NULL,
    "subjectId" TEXT,
    "documentType" "TransportComplianceDocumentType" NOT NULL,
    "documentNo" TEXT,
    "validFrom" VARCHAR(10) NOT NULL,
    "validTo" VARCHAR(10) NOT NULL,
    "status" "TransportComplianceDocumentStatus" NOT NULL DEFAULT 'ACTIVE',
    "evidenceRef" TEXT,
    "note" TEXT,
    "recordedBy" TEXT NOT NULL,
    "createdAt" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,
    "updatedAt" TIMESTAMP(3) NOT NULL,

    CONSTRAINT "TransportComplianceDocument_pkey" PRIMARY KEY ("id")
);

-- CreateTable
CREATE TABLE "TransportPayrollPeriod" (
    "id" TEXT NOT NULL,
    "label" TEXT NOT NULL,
    "startDate" VARCHAR(10) NOT NULL,
    "endDate" VARCHAR(10) NOT NULL,
    "status" "TransportPayrollPeriodStatus" NOT NULL DEFAULT 'OPEN',
    "closedAt" TIMESTAMP(3),
    "closedBy" TEXT,
    "createdBy" TEXT NOT NULL,
    "createdAt" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,
    "updatedAt" TIMESTAMP(3) NOT NULL,

    CONSTRAINT "TransportPayrollPeriod_pkey" PRIMARY KEY ("id")
);

-- CreateTable
CREATE TABLE "TransportPayrollRun" (
    "id" TEXT NOT NULL,
    "periodId" TEXT NOT NULL,
    "sequence" INTEGER NOT NULL,
    "policySnapshot" JSONB NOT NULL,
    "policyVersion" VARCHAR(64) NOT NULL,
    "missingInputs" TEXT[],
    "runBy" TEXT NOT NULL,
    "runAt" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,

    CONSTRAINT "TransportPayrollRun_pkey" PRIMARY KEY ("id")
);

-- CreateTable
CREATE TABLE "TransportPayslip" (
    "id" TEXT NOT NULL,
    "runId" TEXT NOT NULL,
    "driverId" TEXT NOT NULL,
    "kind" "TransportPayslipKind" NOT NULL DEFAULT 'ORIGINAL',
    "status" "TransportPayslipStatus" NOT NULL DEFAULT 'DRAFT',
    "grossEarnings" BIGINT NOT NULL,
    "totalDeductions" BIGINT NOT NULL,
    "netAmount" BIGINT NOT NULL,
    "currencyCode" VARCHAR(3) NOT NULL DEFAULT 'VND',
    "driverFundBalanceSnapshot" BIGINT,
    "tripCount" INTEGER NOT NULL,
    "distanceKm" INTEGER NOT NULL,
    "correctsId" TEXT,
    "correctionReason" TEXT,
    "approvedAt" TIMESTAMP(3),
    "approvedBy" TEXT,
    "paidAt" TIMESTAMP(3),
    "paidBy" TEXT,
    "createdAt" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,
    "updatedAt" TIMESTAMP(3) NOT NULL,

    CONSTRAINT "TransportPayslip_pkey" PRIMARY KEY ("id")
);

-- CreateTable
CREATE TABLE "TransportPayslipComponent" (
    "id" TEXT NOT NULL,
    "payslipId" TEXT NOT NULL,
    "kind" "TransportPayslipComponentKind" NOT NULL,
    "source" "TransportPayslipComponentSource" NOT NULL,
    "label" TEXT NOT NULL,
    "amount" BIGINT NOT NULL,
    "quantity" INTEGER,
    "unitAmount" BIGINT,
    "recordedBy" TEXT,
    "note" TEXT,
    "createdAt" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,

    CONSTRAINT "TransportPayslipComponent_pkey" PRIMARY KEY ("id")
);

-- CreateIndex
CREATE INDEX "TransportMaintenancePlan_vehicleId_status_idx" ON "TransportMaintenancePlan"("vehicleId", "status");

-- CreateIndex
CREATE INDEX "TransportMaintenanceWorkOrder_vehicleId_status_idx" ON "TransportMaintenanceWorkOrder"("vehicleId", "status");

-- CreateIndex
CREATE INDEX "TransportMaintenanceWorkOrder_planId_idx" ON "TransportMaintenanceWorkOrder"("planId");

-- CreateIndex
CREATE INDEX "TransportMaintenanceWorkOrder_status_idx" ON "TransportMaintenanceWorkOrder"("status");

-- CreateIndex
CREATE INDEX "TransportComplianceDocument_subjectKind_subjectId_idx" ON "TransportComplianceDocument"("subjectKind", "subjectId");

-- CreateIndex
CREATE INDEX "TransportComplianceDocument_documentType_validTo_idx" ON "TransportComplianceDocument"("documentType", "validTo");

-- CreateIndex
CREATE INDEX "TransportComplianceDocument_status_validTo_idx" ON "TransportComplianceDocument"("status", "validTo");

-- CreateIndex
CREATE INDEX "TransportPayrollPeriod_status_idx" ON "TransportPayrollPeriod"("status");

-- CreateIndex
CREATE INDEX "TransportPayrollPeriod_startDate_endDate_idx" ON "TransportPayrollPeriod"("startDate", "endDate");

-- CreateIndex
CREATE INDEX "TransportPayrollRun_periodId_idx" ON "TransportPayrollRun"("periodId");

-- CreateIndex
CREATE UNIQUE INDEX "TransportPayrollRun_periodId_sequence_key" ON "TransportPayrollRun"("periodId", "sequence");

-- CreateIndex
CREATE INDEX "TransportPayslip_runId_idx" ON "TransportPayslip"("runId");

-- CreateIndex
CREATE INDEX "TransportPayslip_driverId_status_idx" ON "TransportPayslip"("driverId", "status");

-- CreateIndex
CREATE INDEX "TransportPayslip_correctsId_idx" ON "TransportPayslip"("correctsId");

-- CreateIndex
CREATE INDEX "TransportPayslipComponent_payslipId_idx" ON "TransportPayslipComponent"("payslipId");

-- AddForeignKey
ALTER TABLE "TransportMaintenancePlan" ADD CONSTRAINT "TransportMaintenancePlan_vehicleId_fkey" FOREIGN KEY ("vehicleId") REFERENCES "TransportVehicle"("id") ON DELETE RESTRICT ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "TransportMaintenanceWorkOrder" ADD CONSTRAINT "TransportMaintenanceWorkOrder_vehicleId_fkey" FOREIGN KEY ("vehicleId") REFERENCES "TransportVehicle"("id") ON DELETE RESTRICT ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "TransportMaintenanceWorkOrder" ADD CONSTRAINT "TransportMaintenanceWorkOrder_planId_fkey" FOREIGN KEY ("planId") REFERENCES "TransportMaintenancePlan"("id") ON DELETE RESTRICT ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "TransportPayrollRun" ADD CONSTRAINT "TransportPayrollRun_periodId_fkey" FOREIGN KEY ("periodId") REFERENCES "TransportPayrollPeriod"("id") ON DELETE RESTRICT ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "TransportPayslip" ADD CONSTRAINT "TransportPayslip_runId_fkey" FOREIGN KEY ("runId") REFERENCES "TransportPayrollRun"("id") ON DELETE RESTRICT ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "TransportPayslip" ADD CONSTRAINT "TransportPayslip_driverId_fkey" FOREIGN KEY ("driverId") REFERENCES "TransportDriver"("id") ON DELETE RESTRICT ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "TransportPayslip" ADD CONSTRAINT "TransportPayslip_correctsId_fkey" FOREIGN KEY ("correctsId") REFERENCES "TransportPayslip"("id") ON DELETE RESTRICT ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "TransportPayslipComponent" ADD CONSTRAINT "TransportPayslipComponent_payslipId_fkey" FOREIGN KEY ("payslipId") REFERENCES "TransportPayslip"("id") ON DELETE CASCADE ON UPDATE CASCADE;



-- ===========================================================================
-- RANG BUOC VIET TAY — Prisma khong co cu phap cho CHECK, EXCLUDE, unique mot
-- phan va trigger, nen phan duoi day khong sinh ra tu `schema.prisma` va se
-- KHONG duoc sinh lai neu ai do chay `migrate diff`. Doc ky truoc khi sua.
-- ===========================================================================

-- ---------------------------------------------------------------------------
-- TX-06 §1 — LICH BAO DUONG
--
-- `intervalKm`/`intervalDays` phai KHOP voi `triggerKind`. Khong rang buoc thi
-- ton tai duoc mot lich `ODOMETER` khong co chu ky km nao — tuc mot lich khong
-- bao gio den han, va no im lang: khong ai thay canh bao vang mat.
-- ---------------------------------------------------------------------------

ALTER TABLE "TransportMaintenancePlan"
  ADD CONSTRAINT "TransportMaintenancePlan_interval_matches_trigger"
  CHECK (
    ("triggerKind" = 'ODOMETER' AND "intervalKm" IS NOT NULL AND "intervalDays" IS NULL)
    OR ("triggerKind" = 'CALENDAR' AND "intervalDays" IS NOT NULL AND "intervalKm" IS NULL)
    OR ("triggerKind" = 'ODOMETER_OR_CALENDAR' AND "intervalKm" IS NOT NULL AND "intervalDays" IS NOT NULL)
  );

-- Chu ky `0` se lam moc den han trung voi moc truoc do va lich keu vinh vien.
ALTER TABLE "TransportMaintenancePlan"
  ADD CONSTRAINT "TransportMaintenancePlan_interval_positive"
  CHECK (
    ("intervalKm" IS NULL OR "intervalKm" BETWEEN 1 AND 10000000)
    AND ("intervalDays" IS NULL OR "intervalDays" BETWEEN 1 AND 3650)
  );

ALTER TABLE "TransportMaintenancePlan"
  ADD CONSTRAINT "TransportMaintenancePlan_baseline_odo_range"
  CHECK ("baselineOdoKm" BETWEEN 0 AND 100000000);

-- `INV-25` — cung khuon `TransportSettlementPeriod_dates_iso`: kiem CA dang
-- chuoi LAN su ton tai cua ngay. `2026-02-30` dung dang nhung khong co that.
ALTER TABLE "TransportMaintenancePlan"
  ADD CONSTRAINT "TransportMaintenancePlan_baselineDate_iso"
  CHECK (
    "baselineDate" ~ '^\d{4}-\d{2}-\d{2}$'
    AND to_char(to_date("baselineDate", 'YYYY-MM-DD'), 'YYYY-MM-DD') = "baselineDate"
  );

-- ---------------------------------------------------------------------------
-- TX-06 §2 — LENH SUA
-- ---------------------------------------------------------------------------

ALTER TABLE "TransportMaintenanceWorkOrder"
  ADD CONSTRAINT "TransportMaintenanceWorkOrder_dates_iso"
  CHECK (
    "openedDate" ~ '^\d{4}-\d{2}-\d{2}$'
    AND to_char(to_date("openedDate", 'YYYY-MM-DD'), 'YYYY-MM-DD') = "openedDate"
    AND (
      "completedDate" IS NULL
      OR (
        "completedDate" ~ '^\d{4}-\d{2}-\d{2}$'
        AND to_char(to_date("completedDate", 'YYYY-MM-DD'), 'YYYY-MM-DD') = "completedDate"
        AND "completedDate" >= "openedDate"
      )
    )
  );

-- Odo khong lui. Mot lenh sua dong voi so odo NHO HON luc mo la mot con so
-- nhap sai, va no se lam moc bao duong ke tiep tinh ra qua khu.
ALTER TABLE "TransportMaintenanceWorkOrder"
  ADD CONSTRAINT "TransportMaintenanceWorkOrder_odo_range"
  CHECK (
    "openedOdoKm" BETWEEN 0 AND 100000000
    AND (
      "completedOdoKm" IS NULL
      OR ("completedOdoKm" BETWEEN 0 AND 100000000 AND "completedOdoKm" >= "openedOdoKm")
    )
  );

-- TRANG THAI KEO THEO TRUONG. `=` chu khong `->`: mot lenh con `OPEN` ma da co
-- `completedAt` cung sai het nhu mot lenh `COMPLETED` thieu no.
ALTER TABLE "TransportMaintenanceWorkOrder"
  ADD CONSTRAINT "TransportMaintenanceWorkOrder_completion_fields"
  CHECK (
    ("status" = 'COMPLETED')
    = ("completedDate" IS NOT NULL AND "completedOdoKm" IS NOT NULL
       AND "completedBy" IS NOT NULL AND "completedAt" IS NOT NULL)
  );

ALTER TABLE "TransportMaintenanceWorkOrder"
  ADD CONSTRAINT "TransportMaintenanceWorkOrder_cancellation_fields"
  CHECK (
    ("status" = 'CANCELLED')
    = ("cancelledAt" IS NOT NULL AND "cancelledBy" IS NOT NULL AND "cancellationReason" IS NOT NULL)
  );

ALTER TABLE "TransportMaintenanceWorkOrder"
  ADD CONSTRAINT "TransportMaintenanceWorkOrder_cost_money_range"
  CHECK ("costAmount" IS NULL OR "costAmount" BETWEEN 0 AND 9007199254740991);

-- MOT lenh dang mo cho MOI lich. Kiem o service dung voi MOT nguoi ghi; unique
-- mot phan nay moi dung voi HAI nguoi bam "mo lenh" cung luc — dung bai hoc
-- T2.1/F2. Lenh sua dot xuat (`planId IS NULL`) KHONG bi rang buoc: hai hong
-- hoc khac nhau tren cung mot xe la chuyen binh thuong.
CREATE UNIQUE INDEX "TransportMaintenanceWorkOrder_one_open_per_plan"
  ON "TransportMaintenanceWorkOrder"("planId")
  WHERE "status" = 'OPEN' AND "planId" IS NOT NULL;

-- ---------------------------------------------------------------------------
-- TX-06 §3 — GIAY TO PHAP LY
--
-- KHONG co khoa ngoai cho `subjectId`: no tro sang `TransportVehicle` HOAC
-- `TransportDriver` HOAC khong tro dau ca, tuy `subjectKind`. Postgres khong
-- co khoa ngoai da dich. Su ton tai duoc kiem o tang service qua cong
-- `AssetComplianceCoreFacts` — va do la mot khoang cach CO Y GHI TEN, khong
-- phai mot cho quen.
-- ---------------------------------------------------------------------------

ALTER TABLE "TransportComplianceDocument"
  ADD CONSTRAINT "TransportComplianceDocument_dates_iso"
  CHECK (
    "validFrom" ~ '^\d{4}-\d{2}-\d{2}$'
    AND to_char(to_date("validFrom", 'YYYY-MM-DD'), 'YYYY-MM-DD') = "validFrom"
    AND "validTo" ~ '^\d{4}-\d{2}-\d{2}$'
    AND to_char(to_date("validTo", 'YYYY-MM-DD'), 'YYYY-MM-DD') = "validTo"
    AND "validFrom" <= "validTo"
  );

-- `COMPANY` khong co chu the con. Giay phep kinh doanh van tai la cua phap
-- nhan; gan no vao mot xe se lam mot xe ban di keo theo giay phep cua ca cong ty.
ALTER TABLE "TransportComplianceDocument"
  ADD CONSTRAINT "TransportComplianceDocument_subject_shape"
  CHECK (("subjectKind" = 'COMPANY') = ("subjectId" IS NULL));

-- ---------------------------------------------------------------------------
-- TX-07 §1 — KY LUONG
-- ---------------------------------------------------------------------------

ALTER TABLE "TransportPayrollPeriod"
  ADD CONSTRAINT "TransportPayrollPeriod_dates_iso"
  CHECK (
    "startDate" ~ '^\d{4}-\d{2}-\d{2}$'
    AND to_char(to_date("startDate", 'YYYY-MM-DD'), 'YYYY-MM-DD') = "startDate"
    AND "endDate" ~ '^\d{4}-\d{2}-\d{2}$'
    AND to_char(to_date("endDate", 'YYYY-MM-DD'), 'YYYY-MM-DD') = "endDate"
    AND "startDate" <= "endDate"
  );

ALTER TABLE "TransportPayrollPeriod"
  ADD CONSTRAINT "TransportPayrollPeriod_closed_fields"
  CHECK (("status" = 'CLOSED') = ("closedAt" IS NOT NULL AND "closedBy" IS NOT NULL));

-- KY LUONG KHONG CHONG LAP.
--
-- Cung khuon `TransportSettlementPeriod_no_overlap` cua T5 va
-- `TransportDriverFundPeriod` cua T3, va cung ba ly do ky thuat:
--
--   · KHONG dung `"startDate"::date` — phep ep chuoi sang ngay phu thuoc
--     `DateStyle` cua phien nen Postgres coi no la STABLE, khong dung duoc
--     trong bieu thuc index. `make_date` + `substr` thi IMMUTABLE;
--   · `'[]'` — khoang DONG CA HAI DAU. Ky 01/08..31/08 va 31/08..30/09 PHAI bi
--     coi la chong lap, vi mot chuyen ngay 31/08 roi vao ca hai ky luong;
--   · `..._dates_iso` phia tren bao dam ba lat cat luon la so.
--
-- KHONG co cot phan hoach o day (khac T5, von phan theo `flow`): mot lai xe
-- chi thuoc MOT ky luong tai mot thoi diem, va hai ky luong chong nhau se lam
-- cung mot chuyen duoc tra cong hai lan.
CREATE EXTENSION IF NOT EXISTS btree_gist;

ALTER TABLE "TransportPayrollPeriod"
  ADD CONSTRAINT "TransportPayrollPeriod_no_overlap"
  EXCLUDE USING gist (
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

-- ---------------------------------------------------------------------------
-- TX-07 §2 — LAN CHAY LUONG
-- ---------------------------------------------------------------------------

ALTER TABLE "TransportPayrollRun"
  ADD CONSTRAINT "TransportPayrollRun_sequence_positive"
  CHECK ("sequence" >= 1);

-- ---------------------------------------------------------------------------
-- TX-07 §3 — PHIEU LUONG
-- ---------------------------------------------------------------------------

ALTER TABLE "TransportPayslip"
  ADD CONSTRAINT "TransportPayslip_money_range"
  CHECK (
    "grossEarnings" BETWEEN 0 AND 9007199254740991
    AND "totalDeductions" BETWEEN 0 AND 9007199254740991
    AND "netAmount" BETWEEN -9007199254740991 AND 9007199254740991
    AND ("driverFundBalanceSnapshot" IS NULL
         OR "driverFundBalanceSnapshot" BETWEEN -9007199254740991 AND 9007199254740991)
  );

-- TIEN RONG LA MOT PHEP TRU, khong phai mot o nho song song. Neu ba cot nay
-- lech nhau thi phieu in ra mot so va bao cao cong ra mot so khac — kieu lech
-- chi lo ra o ky quyet toan, khi khong con sua duoc.
ALTER TABLE "TransportPayslip"
  ADD CONSTRAINT "TransportPayslip_net_is_gross_minus_deductions"
  CHECK ("netAmount" = "grossEarnings" - "totalDeductions");

ALTER TABLE "TransportPayslip"
  ADD CONSTRAINT "TransportPayslip_counts_range"
  CHECK ("tripCount" BETWEEN 0 AND 1000000 AND "distanceKm" BETWEEN 0 AND 100000000);

-- Phieu sua PHAI tro ve ban goc, phieu goc PHAI khong tro di dau.
ALTER TABLE "TransportPayslip"
  ADD CONSTRAINT "TransportPayslip_correction_shape"
  CHECK (("kind" <> 'ORIGINAL') = ("correctsId" IS NOT NULL));

ALTER TABLE "TransportPayslip"
  ADD CONSTRAINT "TransportPayslip_no_self_correction"
  CHECK ("correctsId" IS NULL OR "correctsId" <> "id");

-- MOC DA TRA SONG SOT QUA `REVERSED`.
--
-- Ve thu hai tung la mot DANG THUC `("status" = 'PAID') = (paid* IS NOT NULL)`.
-- Dang thuc do lam mot phieu DA TRA khong bao gio dao duoc: canh
-- `PAID -> REVERSED` giu nguyen moc da tra, nen ve trai thanh sai trong khi ve
-- phai van dung, va Postgres tu choi hang moi. May trang thai
-- (`payslip-lifecycle.ts`) va kho thi deu cho phep dung canh do — ba lop noi
-- hai dieu khac nhau, va lop duoi cung la lop thang. Bai `B4 (P9)` cua
-- `transport-workforce.int.spec.ts` giu cho no khong quay lai.
--
-- Cai VAN duoc giu nguyen: phieu `PAID` bat buoc co moc da tra; phieu chua tra
-- (`DRAFT`/`APPROVED`) bat buoc KHONG co; va hai cot do luon di cung nhau.
ALTER TABLE "TransportPayslip"
  ADD CONSTRAINT "TransportPayslip_posted_fields"
  CHECK (
    (("status" IN ('APPROVED', 'PAID', 'REVERSED'))
      = ("approvedAt" IS NOT NULL AND "approvedBy" IS NOT NULL))
    AND (("paidAt" IS NULL) = ("paidBy" IS NULL))
    AND ("status" <> 'PAID' OR "paidAt" IS NOT NULL)
    AND ("status" NOT IN ('DRAFT', 'APPROVED') OR "paidAt" IS NULL)
  );

-- MOT phieu goc cho moi (lan chay, lai xe). Chay lai luong = mot
-- `TransportPayrollRun` MOI, khong phai mot phieu goc thu hai trong cung lan chay.
CREATE UNIQUE INDEX "TransportPayslip_one_original_per_run_driver"
  ON "TransportPayslip"("runId", "driverId")
  WHERE "kind" = 'ORIGINAL';

-- MOT ban dao cho moi ban goc — cung khuon
-- `TransportSettlementDocument_one_reversal_per_target` cua T5. Bo sung
-- (`SUPPLEMENTAL`) thi khong gioi han: mot ky co the phai bu nhieu lan.
CREATE UNIQUE INDEX "TransportPayslip_one_reversal_per_target"
  ON "TransportPayslip"("correctsId")
  WHERE "kind" = 'REVERSAL';

-- ---------------------------------------------------------------------------
-- TX-07 §4 — THANH PHAN PHIEU LUONG
-- ---------------------------------------------------------------------------

ALTER TABLE "TransportPayslipComponent"
  ADD CONSTRAINT "TransportPayslipComponent_money_range"
  CHECK (
    "amount" BETWEEN 0 AND 9007199254740991
    AND ("unitAmount" IS NULL OR "unitAmount" BETWEEN 0 AND 9007199254740991)
    AND ("quantity" IS NULL OR "quantity" BETWEEN 0 AND 100000000)
  );

-- ===========================================================================
-- `GD-12` DUOC GIU BANG CAU TRUC, KHONG BANG KY LUAT.
--
-- Mot khoan TRU chi ton tai duoc khi nguon cua no la `MANUAL_DEDUCTION`, tuc
-- khi co mot NGUOI ky ten (`..._manual_needs_signer` ngay duoi). Khong mot
-- duong nao — khong ket qua doi soat bang ke, khong so du quy am, khong mot
-- lan chay luong nao — sinh ra duoc mot dong tru tu dong, vi hang do KHONG GHI
-- DUOC vao bang.
--
-- Day la `INV-27` + `GD-12` + xung dot C-02 duoc dong lai o tang luu tru. Neu
-- sau nay khach quyet dinh bat khau tru tu dong, cho phai sua la rang buoc nay
-- — mot lan sua CO CHU DICH, khong phai mot dong code lot qua review.
-- ===========================================================================

ALTER TABLE "TransportPayslipComponent"
  ADD CONSTRAINT "TransportPayslipComponent_deduction_manual_only"
  CHECK (("kind" = 'DEDUCTION') = ("source" = 'MANUAL_DEDUCTION'));

ALTER TABLE "TransportPayslipComponent"
  ADD CONSTRAINT "TransportPayslipComponent_manual_needs_signer"
  CHECK (
    ("source" IN ('MANUAL_BONUS', 'MANUAL_DEDUCTION')) = ("recordedBy" IS NOT NULL)
  );

-- ===========================================================================
-- TRIGGER — LICH SU LUONG DA CHOT LA BAT BIEN (`INV-20`, acceptance 12).
--
-- Bon `CHECK` khong lam duoc viec nay: mot `CHECK` chi nhin duoc hang MOI, con
-- cau hoi o day la "hang CU dang o trang thai nao". Chi trigger doc duoc `OLD`.
--
-- Cai duoc bao ve: mot phieu da roi `DRAFT` thi MOI con so tren no dong bang.
-- Duong sua duy nhat la ghi mot phieu `SUPPLEMENTAL`/`REVERSAL` moi — dung
-- cach `TransportSettlementDocument` cua T5 xu ly, va la dieu kien de mot ky
-- luong da tra doc ra cung mot so mai mai.
--
-- Trang thai van di duoc TIEP: `APPROVED -> PAID -> REVERSED`. Khong lui.
-- ===========================================================================

CREATE OR REPLACE FUNCTION "transport_payslip_posted_immutable"()
RETURNS TRIGGER AS $$
BEGIN
  IF OLD."status" = 'DRAFT' THEN
    RETURN NEW;
  END IF;

  IF NEW."grossEarnings" IS DISTINCT FROM OLD."grossEarnings"
     OR NEW."totalDeductions" IS DISTINCT FROM OLD."totalDeductions"
     OR NEW."netAmount" IS DISTINCT FROM OLD."netAmount"
     OR NEW."driverId" IS DISTINCT FROM OLD."driverId"
     OR NEW."runId" IS DISTINCT FROM OLD."runId"
     OR NEW."kind" IS DISTINCT FROM OLD."kind"
     OR NEW."tripCount" IS DISTINCT FROM OLD."tripCount"
     OR NEW."distanceKm" IS DISTINCT FROM OLD."distanceKm"
     OR NEW."driverFundBalanceSnapshot" IS DISTINCT FROM OLD."driverFundBalanceSnapshot"
     OR NEW."correctsId" IS DISTINCT FROM OLD."correctsId"
     OR NEW."currencyCode" IS DISTINCT FROM OLD."currencyCode"
  THEN
    RAISE EXCEPTION
      'TransportPayslip_posted_immutable: phieu luong da chot khong sua duoc noi dung, dung phieu bo sung hoac phieu dao';
  END IF;

  -- LICH SU cung dong bang, khong chi cac con so tien.
  --
  -- Bang canh ben duoi CHAP NHAN canh `X -> X`, tuc mot `UPDATE` khong doi trang thai van di
  -- qua duoc. Nen neu cac cot nay de ngo thi mot lan ghi THANG vao DB doi duoc NGUOI DA DUYET
  -- va LY DO SUA cua mot phieu da chot — khong phieu bo sung, khong phieu dao, khong mot dau
  -- vet nao. Do dung la viet lai lich su ma acceptance 12 noi la khong xay ra; tien dung yen
  -- ma chu ky doi nguoi thi ban doi chieu van sai, chi la sai o cot khac.
  IF NEW."id" IS DISTINCT FROM OLD."id"
     OR NEW."createdAt" IS DISTINCT FROM OLD."createdAt"
     OR NEW."approvedAt" IS DISTINCT FROM OLD."approvedAt"
     OR NEW."approvedBy" IS DISTINCT FROM OLD."approvedBy"
     OR NEW."correctionReason" IS DISTINCT FROM OLD."correctionReason"
  THEN
    RAISE EXCEPTION
      'TransportPayslip_posted_immutable: lich su cua phieu luong da chot khong viet lai duoc';
  END IF;

  -- MOC DA TRA chi ghi duoc tren DUNG MOT canh, va vi the chi ghi duoc MOT lan.
  --
  -- `APPROVED -> PAID` la lan duy nhat `paidAt`/`paidBy` co quyen doi gia tri. Moi lan khac —
  -- ke ca `PAID -> PAID` va `PAID -> REVERSED` — phai giu nguyen chung.
  IF NOT (OLD."status" = 'APPROVED' AND NEW."status" = 'PAID') THEN
    IF NEW."paidAt" IS DISTINCT FROM OLD."paidAt"
       OR NEW."paidBy" IS DISTINCT FROM OLD."paidBy"
    THEN
      RAISE EXCEPTION
        'TransportPayslip_posted_immutable: moc da tra chi ghi duoc khi phieu chuyen sang PAID';
    END IF;
  END IF;

  IF NOT (
    (OLD."status" = 'APPROVED' AND NEW."status" IN ('APPROVED', 'PAID', 'REVERSED'))
    OR (OLD."status" = 'PAID' AND NEW."status" IN ('PAID', 'REVERSED'))
    OR (OLD."status" = 'REVERSED' AND NEW."status" = 'REVERSED')
  ) THEN
    RAISE EXCEPTION
      'TransportPayslip_posted_immutable: trang thai phieu luong da chot khong lui duoc';
  END IF;

  RETURN NEW;
END;
$$ LANGUAGE plpgsql;

CREATE TRIGGER "TransportPayslip_posted_immutable"
  BEFORE UPDATE ON "TransportPayslip"
  FOR EACH ROW EXECUTE FUNCTION "transport_payslip_posted_immutable"();

-- ===========================================================================
-- TRIGGER — CAC DONG cua mot phieu da chot cung dong bang.
--
-- Khoa cot tren `TransportPayslip` ma de `TransportPayslipComponent` mo la khoa
-- cua truoc va de cua sau: tong van dung trong khi cac dong giai thich no da
-- bi viet lai, va phieu in ra khong con doi chieu duoc voi chinh no.
--
-- `IF NOT FOUND THEN RETURN` — khi phieu cha bi xoa, `ON DELETE CASCADE` xoa
-- cac dong con SAU do, luc hang cha khong con. Do la duong xoa hop le duy nhat
-- (chi phieu `DRAFT` moi xoa duoc, va cong do nam o tang service), nen o day
-- chan lai se lam mot phieu nhap nham khong go duoc.
-- ===========================================================================

CREATE OR REPLACE FUNCTION "transport_payslip_component_frozen"()
RETURNS TRIGGER AS $$
DECLARE
  parent_status "TransportPayslipStatus";
  parent_id TEXT;
BEGIN
  -- MOT DONG KHONG DOI CHA.
  --
  -- Phan con lai cua ham nay hoi DUNG MOT cau: "phieu o `NEW.payslipId` co phai `DRAFT`
  -- khong". Voi mot `UPDATE` doi chinh `payslipId`, cau hoi do duoc dat ve phia phieu DEN —
  -- va neu phieu den la mot ban nhap thi cau tra loi la "duoc", trong khi hang vua roi khoi
  -- mot phieu DA CHOT. Tong tren phieu goc van nguyen, cac dong giai thich no thi bot mot:
  -- phieu in ra khong con doi chieu duoc voi chinh no.
  --
  -- Cha cua mot dong la mot phan DANH TINH cua dong do, khong phai mot o sua duoc. Chan o day
  -- cung lam cho lan `SELECT` ben duoi du: sau cau nay `OLD."payslipId"` va `NEW."payslipId"`
  -- luon bang nhau, nen kiem mot phia la kiem ca hai.
  IF TG_OP = 'UPDATE' AND NEW."payslipId" IS DISTINCT FROM OLD."payslipId" THEN
    RAISE EXCEPTION
      'TransportPayslip_component_frozen: khong doi duoc phieu cha cua mot dong luong';
  END IF;

  IF TG_OP = 'DELETE' THEN
    parent_id := OLD."payslipId";
  ELSE
    parent_id := NEW."payslipId";
  END IF;

  SELECT "status" INTO parent_status
    FROM "TransportPayslip" WHERE "id" = parent_id;

  IF NOT FOUND THEN
    IF TG_OP = 'DELETE' THEN
      RETURN OLD;
    END IF;
    RETURN NEW;
  END IF;

  IF parent_status <> 'DRAFT' THEN
    RAISE EXCEPTION
      'TransportPayslip_component_frozen: khong sua duoc cac dong cua mot phieu luong da chot';
  END IF;

  IF TG_OP = 'DELETE' THEN
    RETURN OLD;
  END IF;
  RETURN NEW;
END;
$$ LANGUAGE plpgsql;

CREATE TRIGGER "TransportPayslip_component_frozen"
  BEFORE INSERT OR UPDATE OR DELETE ON "TransportPayslipComponent"
  FOR EACH ROW EXECUTE FUNCTION "transport_payslip_component_frozen"();

-- ===========================================================================
-- TRIGGER — LENH SUA VA KE HOACH BAO DUONG PHAI NOI VE CUNG MOT XE.
--
-- `TransportMaintenanceWorkOrder` co HAI khoa ngoai DOC LAP: mot toi xe, mot
-- toi ke hoach. Ca hai deu tro toi hang co that trong khi CAP DOI van sai, va
-- khong khoa ngoai nao phat hien duoc dieu do. `CHECK` cung khong: no chi doc
-- duoc hang cua chinh no, con `vehicleId` cua ke hoach nam o BANG KHAC.
--
-- Cai bi hong khi cap doi sai khong phai mot hang xau nhin thay ngay:
-- `maintenance-schedule.ts` tinh han bao duong ke tiep cua mot ke hoach tu cac
-- lenh DA DONG cua chinh ke hoach do. Mot lenh cua xe B nam trong ke hoach cua
-- xe A keo moc chu ky cua xe A di theo so odo cua mot chiec xe khac — roi khoa
-- va mo xe theo mot lich sai.
--
-- KHONG dung khoa ngoai gop `(planId, vehicleId)`: Prisma khong bieu dien duoc
-- no trong `schema.prisma`, nen mot lan `migrate diff` sau nay se sinh ra cau
-- lenh XOA no — dung cai bay do lech ma `transport-asset-workforce-storage.spec.ts`
-- dang canh. Trigger thi Prisma khong nhin thay, cung ly do hai trigger phieu
-- luong o tren la trigger.
-- ===========================================================================

CREATE OR REPLACE FUNCTION "transport_work_order_plan_same_vehicle"()
RETURNS TRIGGER AS $$
DECLARE
  plan_vehicle_id TEXT;
BEGIN
  -- Sua DOT XUAT khong theo lich nao — khong co gi de doi chieu.
  IF NEW."planId" IS NULL THEN
    RETURN NEW;
  END IF;

  SELECT "vehicleId" INTO plan_vehicle_id
    FROM "TransportMaintenancePlan" WHERE "id" = NEW."planId";

  -- Ke hoach khong ton tai la viec cua khoa ngoai, khong phai cua trigger nay.
  IF NOT FOUND THEN
    RETURN NEW;
  END IF;

  IF plan_vehicle_id <> NEW."vehicleId" THEN
    RAISE EXCEPTION
      'TransportMaintenanceWorkOrder_plan_same_vehicle: lenh sua va ke hoach bao duong phai cung mot xe';
  END IF;

  RETURN NEW;
END;
$$ LANGUAGE plpgsql;

CREATE TRIGGER "TransportMaintenanceWorkOrder_plan_same_vehicle"
  BEFORE INSERT OR UPDATE ON "TransportMaintenanceWorkOrder"
  FOR EACH ROW EXECUTE FUNCTION "transport_work_order_plan_same_vehicle"();

-- ===========================================================================
-- TRIGGER — MOT KE HOACH BAO DUONG KHONG DOI SANG XE KHAC.
--
-- Cua sau cua trigger tren: neu `TransportMaintenancePlan.vehicleId` sua duoc
-- thi mot lan `UPDATE` tren BANG KE HOACH lam moi lenh sua dang treo o do lech
-- xe cung mot luc — va trigger o bang lenh sua khong he chay.
--
-- `UpdateMaintenancePlanInput` khong co truong `vehicleId`, nen duong ung dung
-- da dong. Cau nay dong not duong ghi thang. Mot ke hoach thuoc ve mot chiec xe
-- tron doi; muon lich do cho xe khac thi lap mot ke hoach moi, va lich su bao
-- duong cua tung xe van doc duoc theo mot chieu.
-- ===========================================================================

CREATE OR REPLACE FUNCTION "transport_plan_vehicle_immutable"()
RETURNS TRIGGER AS $$
BEGIN
  IF NEW."vehicleId" IS DISTINCT FROM OLD."vehicleId" THEN
    RAISE EXCEPTION
      'TransportMaintenancePlan_vehicle_immutable: ke hoach bao duong khong chuyen sang xe khac duoc';
  END IF;
  RETURN NEW;
END;
$$ LANGUAGE plpgsql;

CREATE TRIGGER "TransportMaintenancePlan_vehicle_immutable"
  BEFORE UPDATE ON "TransportMaintenancePlan"
  FOR EACH ROW EXECUTE FUNCTION "transport_plan_vehicle_immutable"();
