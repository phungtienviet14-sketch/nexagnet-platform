-- CreateEnum
CREATE TYPE "TransportCommercialAcceptanceOutcome" AS ENUM ('APPROVED', 'REJECTED', 'NEEDS_CORRECTION');

-- CreateEnum
CREATE TYPE "TransportCommercialAcceptanceBasis" AS ENUM ('DOCUMENT', 'EXTERNAL_PHYSICAL_CONFIRMATION');

-- CreateTable
CREATE TABLE "TransportCommercialAcceptance" (
    "id" TEXT NOT NULL,
    "runId" TEXT NOT NULL,
    "state" "TransportCommercialAcceptanceOutcome" NOT NULL,
    "counterpartyId" TEXT,
    "businessDate" VARCHAR(10) NOT NULL,
    "latestDecisionId" TEXT,
    "openedBy" TEXT NOT NULL,
    "createdAt" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,
    "updatedAt" TIMESTAMP(3) NOT NULL,

    CONSTRAINT "TransportCommercialAcceptance_pkey" PRIMARY KEY ("id")
);

-- CreateTable
CREATE TABLE "TransportCommercialAcceptanceDecision" (
    "id" TEXT NOT NULL,
    "acceptanceId" TEXT NOT NULL,
    "sequence" INTEGER NOT NULL,
    "outcome" "TransportCommercialAcceptanceOutcome" NOT NULL,
    "reasonCode" VARCHAR(60) NOT NULL,
    "basis" "TransportCommercialAcceptanceBasis" NOT NULL,
    "evidenceRefs" TEXT[],
    "externalNote" TEXT,
    "supersedesId" TEXT,
    "idempotencyKey" VARCHAR(120) NOT NULL,
    "decidedBy" TEXT NOT NULL,
    "decidedAt" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,

    CONSTRAINT "TransportCommercialAcceptanceDecision_pkey" PRIMARY KEY ("id")
);

-- CreateIndex
CREATE UNIQUE INDEX "TransportCommercialAcceptance_runId_key" ON "TransportCommercialAcceptance"("runId");

-- CreateIndex
CREATE INDEX "TransportCommercialAcceptance_state_businessDate_idx" ON "TransportCommercialAcceptance"("state", "businessDate");

-- CreateIndex
CREATE INDEX "TransportCommercialAcceptance_counterpartyId_idx" ON "TransportCommercialAcceptance"("counterpartyId");

-- CreateIndex
CREATE UNIQUE INDEX "TransportCommercialAcceptanceDecision_sequence_key" ON "TransportCommercialAcceptanceDecision"("acceptanceId", "sequence");

-- CreateIndex
CREATE UNIQUE INDEX "TransportCommercialAcceptanceDecision_idempotency_key" ON "TransportCommercialAcceptanceDecision"("acceptanceId", "idempotencyKey");

-- CreateIndex
CREATE INDEX "TransportCommercialAcceptanceDecision_acceptanceId_idx" ON "TransportCommercialAcceptanceDecision"("acceptanceId");

-- CreateIndex
CREATE INDEX "TransportCommercialAcceptanceDecision_decidedBy_idx" ON "TransportCommercialAcceptanceDecision"("decidedBy");

-- AddForeignKey
ALTER TABLE "TransportCommercialAcceptance" ADD CONSTRAINT "TransportCommercialAcceptance_runId_fkey" FOREIGN KEY ("runId") REFERENCES "TransportVehicleRun"("id") ON DELETE RESTRICT ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "TransportCommercialAcceptance" ADD CONSTRAINT "TransportCommercialAcceptance_counterpartyId_fkey" FOREIGN KEY ("counterpartyId") REFERENCES "TransportCounterparty"("id") ON DELETE RESTRICT ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "TransportCommercialAcceptanceDecision" ADD CONSTRAINT "TransportCommercialAcceptanceDecision_acceptanceId_fkey" FOREIGN KEY ("acceptanceId") REFERENCES "TransportCommercialAcceptance"("id") ON DELETE RESTRICT ON UPDATE CASCADE;

-- ===========================================================================
-- CHECK — bon dieu Prisma khong dien dat duoc, nen chung nam o day.
--
-- `prisma migrate dev` khong biet gi ve `CHECK` lan `TRIGGER`, nen no sinh
-- lenh XOA chung o lan sinh migration ke tiep. Bo
-- `transport-commercial-acceptance-storage.spec.ts` doc CHINH TEP NAY de mot
-- lan xoa nhu vay khong di qua duoc — mot bo bai kiem HANH VI se van xanh sau
-- do, vi hanh vi tang tren khong doi, chi con co so du lieu la khong con bao
-- ve gi nua.
-- ===========================================================================

-- Ngay nghiep vu dang ISO. Cung khuon `TransportRunCheckpoint_businessDate_iso`.
ALTER TABLE "TransportCommercialAcceptance"
  ADD CONSTRAINT "TransportCommercialAcceptance_businessDate_iso"
  CHECK ("businessDate" ~ '^[0-9]{4}-[0-9]{2}-[0-9]{2}$');

-- So thu tu bat dau tu 1. `0` hay so am se lam phep `count + 1` cua kho doc sai
-- lich su, va lam cau hoi "quyet dinh dau tien la cai nao" khong con cau tra loi.
ALTER TABLE "TransportCommercialAcceptanceDecision"
  ADD CONSTRAINT "TransportCommercialAcceptanceDecision_sequence_positive"
  CHECK ("sequence" >= 1);

-- MA ly do khong duoc rong. Mot quyet dinh khong ly do la mot quyet dinh khong
-- giai trinh duoc — va do dung la thu cong nay ton tai de bat.
ALTER TABLE "TransportCommercialAcceptanceDecision"
  ADD CONSTRAINT "TransportCommercialAcceptanceDecision_reason_not_blank"
  CHECK (btrim("reasonCode") <> '');

-- Danh tinh nguoi quyet khong duoc rong. `#268` I3 doi mot NGUOI CO THAT dung
-- sau moi lan nghiem thu; mot chuoi rong o day se lam ca cot audit vo nghia.
ALTER TABLE "TransportCommercialAcceptanceDecision"
  ADD CONSTRAINT "TransportCommercialAcceptanceDecision_decidedBy_not_blank"
  CHECK (btrim("decidedBy") <> '');

-- ===========================================================================
-- CHI GHI THEM — cuong che o DB, khong o tang dich vu.
--
-- `#268` I7 bai 11 doi chung minh *"Approved decision cannot be silently edited
-- after settlement lock"*. Mot doan ma dich vu khong chung minh duoc dieu do:
-- no chi chung minh rang DUONG DO khong sua. Trigger nay chung minh ca voi mot
-- cau `UPDATE` viet tay tren psql.
--
-- Chan CA `DELETE`, cung ly le voi `transport_run_checkpoint_append_only`: mot
-- lich su nghiem thu ma xoa duoc thi khong con la can cu cho bat cu khoan tien
-- nao. Vi vay khoa ngoai tro ve ho so la `RESTRICT` chu khong `CASCADE` — mot
-- lenh xoa day chuyen se dung o day va noi ro ly do.
--
-- Doi y ve sau la mot quyet dinh MOI (`sequence` ke tiep, `supersedesId` tro ve
-- ban cu), khong phai mot lan ghi de.
-- ===========================================================================
CREATE OR REPLACE FUNCTION "transport_commercial_acceptance_append_only"()
RETURNS TRIGGER AS $$
BEGIN
  IF TG_OP = 'DELETE' THEN
    RAISE EXCEPTION
      'transport_commercial_acceptance_append_only: khong xoa duoc mot quyet dinh nghiem thu da ghi';
  END IF;
  RAISE EXCEPTION
    'transport_commercial_acceptance_append_only: khong sua duoc mot quyet dinh da ghi, hay ghi mot quyet dinh moi';
END;
$$ LANGUAGE plpgsql;

CREATE TRIGGER "transport_commercial_acceptance_append_only"
  BEFORE UPDATE OR DELETE ON "TransportCommercialAcceptanceDecision"
  FOR EACH ROW EXECUTE FUNCTION "transport_commercial_acceptance_append_only"();
