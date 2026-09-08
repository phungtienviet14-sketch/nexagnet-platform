-- CreateEnum
CREATE TYPE "TransportRunGrouping" AS ENUM ('ONE_ORDER_PER_RUN', 'MULTI_ORDER_RUN');

-- CreateEnum
CREATE TYPE "TransportRunPlanOutcome" AS ENUM ('NEW_RUN', 'APPENDED');

-- AlterTable
ALTER TABLE "TransportRunLeg" ADD COLUMN "plannedDistanceKm" INTEGER;

-- CreateTable
CREATE TABLE "TransportOrderRunPlan" (
    "id" TEXT NOT NULL,
    "orderId" TEXT NOT NULL,
    "runId" TEXT NOT NULL,
    "vehicleId" TEXT NOT NULL,
    "loadedLegId" TEXT NOT NULL,
    "emptyLegId" TEXT,
    "grouping" "TransportRunGrouping" NOT NULL,
    "outcome" "TransportRunPlanOutcome" NOT NULL,
    "idempotencyKey" VARCHAR(120) NOT NULL,
    "plannedBy" TEXT NOT NULL,
    "businessDate" VARCHAR(10) NOT NULL,
    "createdAt" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,
    "cancelledAt" TIMESTAMP(3),
    "cancellationReason" TEXT,

    CONSTRAINT "TransportOrderRunPlan_pkey" PRIMARY KEY ("id")
);

-- CreateIndex
CREATE UNIQUE INDEX "TransportOrderRunPlan_loadedLegId_key" ON "TransportOrderRunPlan"("loadedLegId");

-- CreateIndex
CREATE UNIQUE INDEX "TransportOrderRunPlan_emptyLegId_key" ON "TransportOrderRunPlan"("emptyLegId");

-- CreateIndex
CREATE UNIQUE INDEX "TransportOrderRunPlan_idempotencyKey_key" ON "TransportOrderRunPlan"("idempotencyKey");

-- CreateIndex
CREATE INDEX "TransportOrderRunPlan_runId_idx" ON "TransportOrderRunPlan"("runId");

-- CreateIndex
CREATE INDEX "TransportOrderRunPlan_orderId_idx" ON "TransportOrderRunPlan"("orderId");

-- CreateIndex
CREATE INDEX "TransportOrderRunPlan_vehicleId_idx" ON "TransportOrderRunPlan"("vehicleId");

-- CreateIndex
CREATE INDEX "TransportOrderRunPlan_businessDate_idx" ON "TransportOrderRunPlan"("businessDate");

-- AddForeignKey
ALTER TABLE "TransportOrderRunPlan" ADD CONSTRAINT "TransportOrderRunPlan_orderId_fkey" FOREIGN KEY ("orderId") REFERENCES "TransportOrder"("id") ON DELETE RESTRICT ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "TransportOrderRunPlan" ADD CONSTRAINT "TransportOrderRunPlan_runId_fkey" FOREIGN KEY ("runId") REFERENCES "TransportVehicleRun"("id") ON DELETE RESTRICT ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "TransportOrderRunPlan" ADD CONSTRAINT "TransportOrderRunPlan_loadedLegId_fkey" FOREIGN KEY ("loadedLegId") REFERENCES "TransportRunLeg"("id") ON DELETE RESTRICT ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "TransportOrderRunPlan" ADD CONSTRAINT "TransportOrderRunPlan_emptyLegId_fkey" FOREIGN KEY ("emptyLegId") REFERENCES "TransportRunLeg"("id") ON DELETE RESTRICT ON UPDATE CASCADE;

-- ---------------------------------------------------------------------------------------------
-- RANG BUOC TANG LUU TRU — Prisma khong co cu phap cho `CHECK`, cho `WHERE` tren index, lan cho
-- `TRIGGER`, nen chung song o day.
--
-- `transport-planning-storage.spec.ts` doc chinh tep nay nhu VAN BAN va do neu mot ten bien mat.
-- Ly do da ghi o khoi canh bao dau muc Transport trong `schema.prisma`: `prisma migrate dev` sinh
-- migration bang cach diff schema voi DB va SE sinh lenh XOA tat ca chung neu ai do chay no roi
-- commit thang.
-- ---------------------------------------------------------------------------------------------

-- Km DU KIEN khong am. NULL VAN DUOC PHEP va co nghia rieng: "chua biet", khong phai 0 — cung quy
-- uoc voi `TransportRunLeg_distance_non_negative` cua cot da ghi nhan.
ALTER TABLE "TransportRunLeg"
  ADD CONSTRAINT "TransportRunLeg_planned_distance_non_negative"
  CHECK ("plannedDistanceKm" IS NULL OR "plannedDistanceKm" >= 0);

-- Chang rong va chang co hang cua CUNG mot ke hoach khong duoc la MOT hang. Hai khoa ngoai tro ve
-- cung bang nen khong co gi trong hinh dang Prisma chan duoc dieu do, va neu no xay ra thi mot
-- chang se vua duoc dem la co hang vua duoc dem la rong.
ALTER TABLE "TransportOrderRunPlan"
  ADD CONSTRAINT "TransportOrderRunPlan_legs_distinct"
  CHECK ("emptyLegId" IS NULL OR "emptyLegId" <> "loadedLegId");

-- HUY thi phai co LY DO, va co ly do thi phai la da huy. `GD-02` cam xoa, nen huy la duong duy
-- nhat de go mot ke hoach — mot lan huy khong giai trinh duoc lam duong do vo nghia.
ALTER TABLE "TransportOrderRunPlan"
  ADD CONSTRAINT "TransportOrderRunPlan_cancellation_paired"
  CHECK (("cancelledAt" IS NULL) = ("cancellationReason" IS NULL));

ALTER TABLE "TransportOrderRunPlan"
  ADD CONSTRAINT "TransportOrderRunPlan_plannedBy_not_blank" CHECK (btrim("plannedBy") <> '');

-- MOT ke hoach DANG hieu luc cho moi don — #276 L9 bai 1 va bai 2.
--
-- Day la thu duy nhat dung khi HAI yeu cau den cung luc. Ca hai qua duoc phep doc "don nay chua
-- co ke hoach nao" (ban kia chua commit), roi ca hai cung ghi; chi unique nay chan duoc ban thu
-- hai. Thieu no thi mot don duoc gan len HAI chiec xe, va khong con cach nao biet xe nao that.
--
-- `WHERE "cancelledAt" IS NULL` chu khong unique tron: huy roi lap lai la mot viec that cua dieu
-- xe, va lich su cac lan huy phai o lai (`GD-02`).
CREATE UNIQUE INDEX "TransportOrderRunPlan_activeOrder_key"
  ON "TransportOrderRunPlan"("orderId") WHERE "cancelledAt" IS NULL;

-- CHE DO `ONE_ORDER_PER_RUN` DUOC CUONG CHE O DB — #276 L9 bai 6.
--
-- Mot cong o tang mien chung minh duoc rang DUONG DO khong gom hai don vao mot vong chay. No
-- khong chung minh duoc rang khong duong nao khac lam the. Index nay thi co: o che do mot-don-mot-
-- vong-chay, mot vong chay khong nhan duoc ke hoach thu hai — ke ca tu mot cau `INSERT` viet tay.
--
-- Index khong ap len cac hang `MULTI_ORDER_RUN`, va do la ca diem: hai che do song canh nhau tren
-- cung mot bang, moi che do mang dung rang buoc cua chinh no.
CREATE UNIQUE INDEX "TransportOrderRunPlan_oneOrderPerRun_key"
  ON "TransportOrderRunPlan"("runId")
  WHERE "cancelledAt" IS NULL AND "grouping" = 'ONE_ORDER_PER_RUN';

-- ===========================================================================
-- CHANG DA HOAN THANH LA BAT BIEN — #276 L3 / L9 bai 4.
--
-- L3 viet *"completed legs remain historical/immutable"*. Mot cong o tang dich
-- vu chung minh duoc rang DUONG DO khong sua; no khong chung minh duoc rang
-- khong con duong nao khac. Trigger nay chung minh ca voi mot cau `UPDATE`
-- viet tay tren psql — cung ly le voi
-- `transport_commercial_acceptance_append_only`.
--
-- BAY COT bi khoa, va danh sach nay la CO CHON:
--
--   `runId`, `sequence`      — chang thuoc vong chay nao, o vi tri nao;
--   `kind`                   — co hang hay rong (truc ma bao cao km rong dem);
--   `orderId`                — chang da di phuc vu don nao;
--   `originLabel`, `destinationLabel` — no da di tu dau den dau;
--   `status`                 — mot chang da hoan thanh khong quay nguoc.
--
-- `distanceKm` CO Y KHONG nam trong danh sach. `GD-14` chot km la so NHAP TAY,
-- va so do thuong ve sau khi chang da dong — khoa no lai se bien mot quy trinh
-- that thanh mot loi. `plannedDistanceKm` cung mo, vi ly do nguoc lai: no la
-- con so DU KIEN, khong phai su that van hanh, nen sua no khong viet lai lich
-- su nao. `note` mo de nguoi truc ghi chu duoc.
-- ===========================================================================
CREATE OR REPLACE FUNCTION "transport_run_leg_completed_is_immutable"()
RETURNS TRIGGER AS $$
BEGIN
  IF OLD."status" <> 'COMPLETED' THEN
    RETURN NEW;
  END IF;
  IF NEW."runId" IS DISTINCT FROM OLD."runId"
     OR NEW."sequence" IS DISTINCT FROM OLD."sequence"
     OR NEW."kind" IS DISTINCT FROM OLD."kind"
     OR NEW."orderId" IS DISTINCT FROM OLD."orderId"
     OR NEW."originLabel" IS DISTINCT FROM OLD."originLabel"
     OR NEW."destinationLabel" IS DISTINCT FROM OLD."destinationLabel"
     OR NEW."status" IS DISTINCT FROM OLD."status" THEN
    RAISE EXCEPTION
      'transport_run_leg_completed_is_immutable: khong sua duoc chang da hoan thanh (chang %)', OLD."id";
  END IF;
  RETURN NEW;
END;
$$ LANGUAGE plpgsql;

CREATE TRIGGER "transport_run_leg_completed_is_immutable"
  BEFORE UPDATE ON "TransportRunLeg"
  FOR EACH ROW EXECUTE FUNCTION "transport_run_leg_completed_is_immutable"();
