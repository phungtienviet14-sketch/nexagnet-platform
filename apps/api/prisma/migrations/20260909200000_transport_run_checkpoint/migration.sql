-- CreateEnum
CREATE TYPE "TransportRunCheckpointType" AS ENUM ('ASSIGNED', 'DEPARTED', 'PICKUP_ARRIVAL', 'GATE_ENTRY', 'LOADING', 'PICKUP_DEPARTURE', 'DELIVERY_ARRIVAL', 'DELIVERY_ACCEPTED', 'COMPLETED');
-- CreateTable
CREATE TABLE "TransportRunCheckpoint" (
    "id" TEXT NOT NULL,
    "type" "TransportRunCheckpointType" NOT NULL,
    "runId" TEXT NOT NULL,
    "legId" TEXT,
    "recordedBy" TEXT NOT NULL,
    "driverId" TEXT,
    "observationId" TEXT,
    "clientEventId" TEXT NOT NULL,
    "capturedAt" TIMESTAMP(3),
    "receivedAt" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,
    "businessDate" VARCHAR(10) NOT NULL,
    "note" TEXT,
    "createdAt" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,

    CONSTRAINT "TransportRunCheckpoint_pkey" PRIMARY KEY ("id")
);

-- CreateIndex
CREATE UNIQUE INDEX "TransportRunCheckpoint_observationId_key" ON "TransportRunCheckpoint"("observationId");

-- CreateIndex
CREATE INDEX "TransportRunCheckpoint_runId_receivedAt_idx" ON "TransportRunCheckpoint"("runId", "receivedAt");

-- CreateIndex
CREATE INDEX "TransportRunCheckpoint_legId_idx" ON "TransportRunCheckpoint"("legId");

-- CreateIndex
CREATE INDEX "TransportRunCheckpoint_driverId_businessDate_idx" ON "TransportRunCheckpoint"("driverId", "businessDate");

-- CreateIndex
CREATE INDEX "TransportRunCheckpoint_type_businessDate_idx" ON "TransportRunCheckpoint"("type", "businessDate");

-- CreateIndex
CREATE UNIQUE INDEX "TransportRunCheckpoint_run_type_event_key" ON "TransportRunCheckpoint"("runId", "type", "clientEventId");

-- AddForeignKey
ALTER TABLE "TransportRunCheckpoint" ADD CONSTRAINT "TransportRunCheckpoint_runId_fkey" FOREIGN KEY ("runId") REFERENCES "TransportVehicleRun"("id") ON DELETE RESTRICT ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "TransportRunCheckpoint" ADD CONSTRAINT "TransportRunCheckpoint_legId_fkey" FOREIGN KEY ("legId") REFERENCES "TransportRunLeg"("id") ON DELETE RESTRICT ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "TransportRunCheckpoint" ADD CONSTRAINT "TransportRunCheckpoint_driverId_fkey" FOREIGN KEY ("driverId") REFERENCES "TransportDriver"("id") ON DELETE RESTRICT ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "TransportRunCheckpoint" ADD CONSTRAINT "TransportRunCheckpoint_observationId_fkey" FOREIGN KEY ("observationId") REFERENCES "TransportLocationObservation"("id") ON DELETE RESTRICT ON UPDATE CASCADE;

-- ===========================================================================
-- CHECK — ba dieu Prisma khong dien dat duoc, nen chung nam o day.
--
-- `prisma migrate dev` khong biet gi ve `CHECK`, nen no sinh lenh XOA chung o
-- lan sinh migration ke tiep. Bo `transport-run-checkpoint-storage.spec.ts`
-- doc CHINH TEP NAY de mot lan xoa nhu vay khong di qua duoc — mot bo bai kiem
-- HANH VI se van xanh sau do, vi hanh vi tang tren khong doi, chi con co so du
-- lieu la khong con bao ve gi nua.
-- ===========================================================================

-- Ngay nghiep vu phai dung dang ISO: no la KHOA de gom bao cao theo ngay, va
-- mot hang `07/09/2026` se lang le roi ra ngoai moi phep gom.
ALTER TABLE "TransportRunCheckpoint"
  ADD CONSTRAINT "TransportRunCheckpoint_businessDate_iso"
  CHECK ("businessDate" ~ '^\d{4}-\d{2}-\d{2}$');

-- Ma su kien rong lam khoa chan bam-hai-lan vo hieu: moi moc rong se dung
-- chung mot khoa, nen lan bam thu hai cua MOT NGUOI se dung phai lan bam cua
-- nguoi khac — va bi tu choi nham.
ALTER TABLE "TransportRunCheckpoint"
  ADD CONSTRAINT "TransportRunCheckpoint_clientEventId_not_blank"
  CHECK (btrim("clientEventId") <> '');

-- BA MOC MUC VONG CHAY khong duoc mang chang, va sau moc con lai BAT BUOC
-- mang chang. Cuong che o day chu khong chi o `checkpoint-lifecycle.ts`: mot
-- moc `DELIVERY_ARRIVAL` khong chang la mot hang khong tra loi duoc cau hoi
-- "den noi nao", va no se lam phep chieu giai doan bo qua chinh chang do.
ALTER TABLE "TransportRunCheckpoint"
  ADD CONSTRAINT "TransportRunCheckpoint_leg_scope"
  CHECK (
    ("type" IN ('ASSIGNED', 'DEPARTED', 'COMPLETED') AND "legId" IS NULL)
    OR ("type" NOT IN ('ASSIGNED', 'DEPARTED', 'COMPLETED') AND "legId" IS NOT NULL)
  );


-- ===========================================================================
-- TRIGGER — MOC LA SO GHI THEM, KHONG PHAI MOT HANG SUA DUOC.
--
-- `#243` F1 doi `append-only/auditable history`. Tang mien da khong mo duong
-- sua nao (`CheckpointRepository` khong co `update`/`delete`), nhung mot bang
-- bang chung ma chi duoc bao ve boi tang mien thi van sua duoc bang mot dong
-- `psql` — va luc do khong ai biet no da bi sua.
--
-- Chat hon `transport_driver_cashout_immutable` cua `TX-07b`: ben do con mot
-- duong doi trang thai `POSTED -> REVERSED`. O day KHONG co truong nao doi
-- duoc, vi mot moc khong co vong doi — no chi don gian la da xay ra.
--
-- Ghi nham thi ghi mot moc dinh chinh. Dong cu O LAI, va do la ca diem: mot
-- dong thoi gian ma xoa duoc thi khong con la bang chung cho bat cu dieu gi.
-- ===========================================================================
CREATE OR REPLACE FUNCTION "transport_run_checkpoint_append_only"()
RETURNS TRIGGER AS $$
BEGIN
  IF TG_OP = 'DELETE' THEN
    RAISE EXCEPTION
      'transport_run_checkpoint_append_only: khong xoa duoc mot moc da ghi, hay ghi mot moc dinh chinh';
  END IF;
  RAISE EXCEPTION
    'transport_run_checkpoint_append_only: khong sua duoc mot moc da ghi, hay ghi mot moc dinh chinh';
END;
$$ LANGUAGE plpgsql;

CREATE TRIGGER "transport_run_checkpoint_append_only"
  BEFORE UPDATE OR DELETE ON "TransportRunCheckpoint"
  FOR EACH ROW EXECUTE FUNCTION "transport_run_checkpoint_append_only"();
