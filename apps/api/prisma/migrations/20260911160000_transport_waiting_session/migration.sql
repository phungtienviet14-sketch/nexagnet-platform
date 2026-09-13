-- CreateEnum
CREATE TYPE "TransportWaitingReason" AS ENUM ('RECEIVER_NOT_READY', 'NO_UNLOADING_DOCK', 'QUEUE_AHEAD', 'DOCUMENT_ISSUE', 'OTHER');

-- CreateEnum
CREATE TYPE "TransportWaitingSessionStatus" AS ENUM ('OPEN', 'CLOSED');

-- CreateEnum
CREATE TYPE "TransportWaitingCloseReason" AS ENUM ('RECEIVER_ACCEPTED', 'OPERATOR_CLOSED');

-- CreateTable
CREATE TABLE "TransportDeliveryWaitingSession" (
    "id" TEXT NOT NULL,
    "runId" TEXT NOT NULL,
    "legId" TEXT NOT NULL,
    "driverId" TEXT,
    "arrivalCheckpointId" TEXT NOT NULL,
    "closingCheckpointId" TEXT,
    "status" "TransportWaitingSessionStatus" NOT NULL DEFAULT 'OPEN',
    "reason" "TransportWaitingReason" NOT NULL,
    "closeReason" "TransportWaitingCloseReason",
    "startedAt" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,
    "endedAt" TIMESTAMP(3),
    "startedBy" TEXT NOT NULL,
    "endedBy" TEXT,
    "startClientEventId" TEXT NOT NULL,
    "note" TEXT,
    "closeNote" TEXT,
    "businessDate" VARCHAR(10) NOT NULL,
    "createdAt" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,
    "updatedAt" TIMESTAMP(3) NOT NULL,

    CONSTRAINT "TransportDeliveryWaitingSession_pkey" PRIMARY KEY ("id")
);

-- CreateIndex
-- KHONG unique. Mot lan den noi CO THE sinh ra nhieu phien cho noi tiep nhau (WT-IT-09): van phong
-- dong nham mot phien roi lai xe van con phai cho that. Bat bien that la "mot chang, mot phien
-- DANG MO" — xem unique MOT PHAN o cuoi tep.
CREATE INDEX "TransportDeliveryWaitingSession_arrivalCheckpointId_idx" ON "TransportDeliveryWaitingSession"("arrivalCheckpointId");

-- CreateIndex
CREATE UNIQUE INDEX "TransportDeliveryWaitingSession_closingCheckpointId_key" ON "TransportDeliveryWaitingSession"("closingCheckpointId");

-- CreateIndex
CREATE UNIQUE INDEX "TransportDeliveryWaitingSession_leg_event_key" ON "TransportDeliveryWaitingSession"("legId", "startClientEventId");

-- CreateIndex
CREATE INDEX "TransportDeliveryWaitingSession_runId_startedAt_idx" ON "TransportDeliveryWaitingSession"("runId", "startedAt");

-- CreateIndex
CREATE INDEX "TransportDeliveryWaitingSession_legId_status_idx" ON "TransportDeliveryWaitingSession"("legId", "status");

-- CreateIndex
CREATE INDEX "TransportDeliveryWaitingSession_driverId_businessDate_idx" ON "TransportDeliveryWaitingSession"("driverId", "businessDate");

-- CreateIndex
CREATE INDEX "TransportDeliveryWaitingSession_status_startedAt_idx" ON "TransportDeliveryWaitingSession"("status", "startedAt");

-- AddForeignKey
ALTER TABLE "TransportDeliveryWaitingSession" ADD CONSTRAINT "TransportDeliveryWaitingSession_runId_fkey" FOREIGN KEY ("runId") REFERENCES "TransportVehicleRun"("id") ON DELETE RESTRICT ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "TransportDeliveryWaitingSession" ADD CONSTRAINT "TransportDeliveryWaitingSession_legId_fkey" FOREIGN KEY ("legId") REFERENCES "TransportRunLeg"("id") ON DELETE RESTRICT ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "TransportDeliveryWaitingSession" ADD CONSTRAINT "TransportDeliveryWaitingSession_driverId_fkey" FOREIGN KEY ("driverId") REFERENCES "TransportDriver"("id") ON DELETE RESTRICT ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "TransportDeliveryWaitingSession" ADD CONSTRAINT "TransportDeliveryWaitingSession_arrivalCheckpointId_fkey" FOREIGN KEY ("arrivalCheckpointId") REFERENCES "TransportRunCheckpoint"("id") ON DELETE RESTRICT ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "TransportDeliveryWaitingSession" ADD CONSTRAINT "TransportDeliveryWaitingSession_closingCheckpointId_fkey" FOREIGN KEY ("closingCheckpointId") REFERENCES "TransportRunCheckpoint"("id") ON DELETE RESTRICT ON UPDATE CASCADE;

-- ===========================================================================
-- UNIQUE MOT PHAN — MOT CHANG, MOT PHIEN DANG MO.
--
-- Day la cong THAT cho `#279` O13 bai 5 (*"concurrent wait start does not
-- create two active sessions"*). Phep doc `findOpenForLeg` o tang dich vu
-- KHONG du: hai yeu cau song song deu doc thay "chua co phien nao" vi ban kia
-- chua commit.
--
-- Phai la unique MOT PHAN chu khong unique tren `legId`: mot chang CO THE co
-- nhieu phien DA DONG (lai xe cho, van phong dong nham, lai xe cho tiep), va
-- mot unique day du se lam lich su do khong ghi duoc.
-- ===========================================================================
CREATE UNIQUE INDEX "TransportDeliveryWaitingSession_openLeg_key"
  ON "TransportDeliveryWaitingSession" ("legId")
  WHERE "status" = 'OPEN';

-- ===========================================================================
-- CHECK — bon dieu Prisma khong dien dat duoc.
-- ===========================================================================

-- Ngay nghiep vu phai dung dang ISO: no la KHOA de gom bao cao theo ngay, va
-- mot hang `09/09/2026` se lang le roi ra ngoai moi phep gom.
ALTER TABLE "TransportDeliveryWaitingSession"
  ADD CONSTRAINT "TransportDeliveryWaitingSession_businessDate_iso"
  CHECK ("businessDate" ~ '^\d{4}-\d{2}-\d{2}$');

-- Ma su kien rong lam khoa chan bam-hai-lan vo hieu.
ALTER TABLE "TransportDeliveryWaitingSession"
  ADD CONSTRAINT "TransportDeliveryWaitingSession_clientEventId_not_blank"
  CHECK (btrim("startClientEventId") <> '');

-- `#279` O13 bai 4 — GIO DONG KHONG DUOC NAM TRUOC GIO MO.
--
-- Cuong che o day chu khong chi o `evaluateWaitingClose`: mot khoang AM di
-- thang vao con so ma nguoi duyet phu cap doc (`#279` O6), va mot bang bang
-- chung chi duoc bao ve boi tang mien thi van ghi sai duoc bang mot dong
-- `psql`.
ALTER TABLE "TransportDeliveryWaitingSession"
  ADD CONSTRAINT "TransportDeliveryWaitingSession_period_order"
  CHECK ("endedAt" IS NULL OR "endedAt" >= "startedAt");

-- MOT PHIEN DA DONG PHAI DONG DAY DU. Bon truong di cung nhau hoac khong cai
-- nao co mat: gio dong, nguoi dong, ly do dong, va trang thai.
--
-- Khong co rang buoc nay thi mot hang `CLOSED` voi `endedAt IS NULL` la mot
-- phien "da dong" ma thoi luong cua no lai chay mai — va no se hien tren bang
-- dieu hanh nhu mot xe dang cho ba hom nay.
ALTER TABLE "TransportDeliveryWaitingSession"
  ADD CONSTRAINT "TransportDeliveryWaitingSession_close_pairing"
  CHECK (
    ("status" = 'OPEN'
      AND "endedAt" IS NULL AND "endedBy" IS NULL AND "closeReason" IS NULL
      AND "closingCheckpointId" IS NULL)
    OR ("status" = 'CLOSED'
      AND "endedAt" IS NOT NULL AND "endedBy" IS NOT NULL AND "closeReason" IS NOT NULL)
  );

-- Van phong dong mot phien thi PHAI noi vi sao. Mot phien bi cat cut khong
-- giai thich duoc la mot khoang thoi gian bien mat khoi can cu cua mot khoan
-- tien.
ALTER TABLE "TransportDeliveryWaitingSession"
  ADD CONSTRAINT "TransportDeliveryWaitingSession_operator_close_note"
  CHECK (
    "closeReason" IS DISTINCT FROM 'OPERATOR_CLOSED'
    OR ("closeNote" IS NOT NULL AND btrim("closeNote") <> '')
  );

-- ===========================================================================
-- TRIGGER — MOT PHIEN CHO CO DUNG MOT CANH: `OPEN -> CLOSED`.
--
-- Khac `transport_run_checkpoint_append_only` (chan MOI `UPDATE`): mot khoang
-- thoi gian khong ghi xong trong mot lan — no mo truoc, dong sau. Nen o day
-- mot `UPDATE` duoc phep, nhung CHI dung mot cai.
--
-- Bay truong bi khoa cung. `#279` O6 doi *"approving user cannot rewrite
-- WaitingSession timestamps"*: tang mien da khong mo ham nao lam duoc viec do
-- (`WaitingSessionRepository` khong co `update`), nhung mot bang la CAN CU CUA
-- MOT KHOAN TIEN thi khong duoc chi dua vao ky luat cua tang mien.
--
-- `updatedAt` co y KHONG nam trong danh sach khoa: Prisma tu dat no o moi lan
-- ghi, va khoa no lai se lam chinh lan dong hop le that bai.
-- ===========================================================================
CREATE OR REPLACE FUNCTION "transport_waiting_session_immutable"()
RETURNS TRIGGER AS $$
BEGIN
  IF TG_OP = 'DELETE' THEN
    RAISE EXCEPTION
      'transport_waiting_session_immutable: khong xoa duoc mot phien cho da ghi';
  END IF;

  IF OLD."status" <> 'OPEN' THEN
    RAISE EXCEPTION
      'transport_waiting_session_immutable: phien cho da dong, khong sua duoc nua';
  END IF;

  IF NEW."status" <> 'CLOSED' THEN
    RAISE EXCEPTION
      'transport_waiting_session_immutable: mot phien cho chi di duoc tu OPEN sang CLOSED';
  END IF;

  IF NEW."id" <> OLD."id"
     OR NEW."runId" <> OLD."runId"
     OR NEW."legId" <> OLD."legId"
     OR NEW."driverId" IS DISTINCT FROM OLD."driverId"
     OR NEW."arrivalCheckpointId" <> OLD."arrivalCheckpointId"
     OR NEW."reason" <> OLD."reason"
     OR NEW."startedAt" <> OLD."startedAt"
     OR NEW."startedBy" <> OLD."startedBy"
     OR NEW."startClientEventId" <> OLD."startClientEventId"
     OR NEW."note" IS DISTINCT FROM OLD."note"
     OR NEW."businessDate" <> OLD."businessDate"
     OR NEW."createdAt" <> OLD."createdAt"
  THEN
    RAISE EXCEPTION
      'transport_waiting_session_immutable: chi duoc ghi phan DONG phien, khong sua duoc phan MO';
  END IF;

  RETURN NEW;
END;
$$ LANGUAGE plpgsql;

CREATE TRIGGER "transport_waiting_session_immutable"
  BEFORE UPDATE OR DELETE ON "TransportDeliveryWaitingSession"
  FOR EACH ROW EXECUTE FUNCTION "transport_waiting_session_immutable"();
