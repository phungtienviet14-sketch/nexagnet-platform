-- CreateEnum
CREATE TYPE "TransportOperationalDocumentType" AS ENUM ('GATE_PASS', 'LOADING_SLIP', 'WEIGH_TICKET', 'DELIVERY_RECEIPT', 'OTHER');

-- CreateEnum
CREATE TYPE "TransportOperationalDocumentBasis" AS ENUM ('DIGITAL_FILE', 'EXTERNAL_PHYSICAL');

-- CreateEnum
CREATE TYPE "TransportOperationalDocumentStatus" AS ENUM ('ACTIVE', 'WITHDRAWN');

-- CreateEnum
CREATE TYPE "TransportReceiptHandoverState" AS ENUM ('WITH_DRIVER', 'RETURNED_TO_OFFICE', 'SUBMITTED_FOR_CONFIRMATION');

-- CreateTable
CREATE TABLE "TransportOperationalDocument" (
    "id" TEXT NOT NULL,
    "type" "TransportOperationalDocumentType" NOT NULL,
    "runId" TEXT NOT NULL,
    "legId" TEXT,
    "orderId" TEXT,
    "checkpointId" TEXT,
    "counterpartySiteId" TEXT,
    "driverId" TEXT,
    "recordedBy" TEXT NOT NULL,
    "basis" "TransportOperationalDocumentBasis" NOT NULL,
    "fileId" TEXT,
    "externalNote" TEXT,
    "label" TEXT,
    "captureMode" "TransportProofPhotoCaptureMode" NOT NULL DEFAULT 'UNKNOWN',
    "status" "TransportOperationalDocumentStatus" NOT NULL DEFAULT 'ACTIVE',
    "clientEventId" TEXT NOT NULL,
    "receivedAt" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,
    "withdrawnAt" TIMESTAMP(3),
    "withdrawnBy" TEXT,
    "extractionCandidate" TEXT,
    "extractionProvider" TEXT,
    "businessDate" VARCHAR(10) NOT NULL,
    "createdAt" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,
    "updatedAt" TIMESTAMP(3) NOT NULL,

    CONSTRAINT "TransportOperationalDocument_pkey" PRIMARY KEY ("id")
);

-- CreateTable
CREATE TABLE "TransportPhysicalReceiptHandover" (
    "id" TEXT NOT NULL,
    "orderId" TEXT NOT NULL,
    "sequence" INTEGER NOT NULL,
    "state" "TransportReceiptHandoverState" NOT NULL,
    "legId" TEXT,
    "documentId" TEXT,
    "externalNote" TEXT,
    "driverId" TEXT,
    "recordedBy" TEXT NOT NULL,
    "recordedAt" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,
    "clientEventId" TEXT NOT NULL,
    "note" TEXT,
    "businessDate" VARCHAR(10) NOT NULL,
    "createdAt" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,

    CONSTRAINT "TransportPhysicalReceiptHandover_pkey" PRIMARY KEY ("id")
);

-- CreateIndex
CREATE UNIQUE INDEX "TransportOperationalDocument_run_type_event_key" ON "TransportOperationalDocument"("runId", "type", "clientEventId");

-- CreateIndex
CREATE INDEX "TransportOperationalDocument_runId_receivedAt_idx" ON "TransportOperationalDocument"("runId", "receivedAt");

-- CreateIndex
CREATE INDEX "TransportOperationalDocument_legId_idx" ON "TransportOperationalDocument"("legId");

-- CreateIndex
CREATE INDEX "TransportOperationalDocument_orderId_status_idx" ON "TransportOperationalDocument"("orderId", "status");

-- CreateIndex
CREATE INDEX "TransportOperationalDocument_driverId_businessDate_idx" ON "TransportOperationalDocument"("driverId", "businessDate");

-- CreateIndex
CREATE INDEX "TransportOperationalDocument_type_businessDate_idx" ON "TransportOperationalDocument"("type", "businessDate");

-- CreateIndex
CREATE UNIQUE INDEX "TransportPhysicalReceiptHandover_order_event_key" ON "TransportPhysicalReceiptHandover"("orderId", "clientEventId");

-- CreateIndex
CREATE UNIQUE INDEX "TransportPhysicalReceiptHandover_order_state_key" ON "TransportPhysicalReceiptHandover"("orderId", "state");

-- CreateIndex
CREATE UNIQUE INDEX "TransportPhysicalReceiptHandover_order_sequence_key" ON "TransportPhysicalReceiptHandover"("orderId", "sequence");

-- CreateIndex
CREATE INDEX "TransportPhysicalReceiptHandover_orderId_sequence_idx" ON "TransportPhysicalReceiptHandover"("orderId", "sequence");

-- CreateIndex
CREATE INDEX "TransportPhysicalReceiptHandover_documentId_idx" ON "TransportPhysicalReceiptHandover"("documentId");

-- CreateIndex
CREATE INDEX "TransportPhysicalReceiptHandover_state_recordedAt_idx" ON "TransportPhysicalReceiptHandover"("state", "recordedAt");

-- AddForeignKey
ALTER TABLE "TransportOperationalDocument" ADD CONSTRAINT "TransportOperationalDocument_runId_fkey" FOREIGN KEY ("runId") REFERENCES "TransportVehicleRun"("id") ON DELETE RESTRICT ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "TransportOperationalDocument" ADD CONSTRAINT "TransportOperationalDocument_legId_fkey" FOREIGN KEY ("legId") REFERENCES "TransportRunLeg"("id") ON DELETE RESTRICT ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "TransportOperationalDocument" ADD CONSTRAINT "TransportOperationalDocument_orderId_fkey" FOREIGN KEY ("orderId") REFERENCES "TransportOrder"("id") ON DELETE RESTRICT ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "TransportOperationalDocument" ADD CONSTRAINT "TransportOperationalDocument_checkpointId_fkey" FOREIGN KEY ("checkpointId") REFERENCES "TransportRunCheckpoint"("id") ON DELETE RESTRICT ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "TransportOperationalDocument" ADD CONSTRAINT "TransportOperationalDocument_counterpartySiteId_fkey" FOREIGN KEY ("counterpartySiteId") REFERENCES "TransportCounterpartySite"("id") ON DELETE RESTRICT ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "TransportOperationalDocument" ADD CONSTRAINT "TransportOperationalDocument_driverId_fkey" FOREIGN KEY ("driverId") REFERENCES "TransportDriver"("id") ON DELETE RESTRICT ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "TransportPhysicalReceiptHandover" ADD CONSTRAINT "TransportPhysicalReceiptHandover_orderId_fkey" FOREIGN KEY ("orderId") REFERENCES "TransportOrder"("id") ON DELETE RESTRICT ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "TransportPhysicalReceiptHandover" ADD CONSTRAINT "TransportPhysicalReceiptHandover_legId_fkey" FOREIGN KEY ("legId") REFERENCES "TransportRunLeg"("id") ON DELETE RESTRICT ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "TransportPhysicalReceiptHandover" ADD CONSTRAINT "TransportPhysicalReceiptHandover_documentId_fkey" FOREIGN KEY ("documentId") REFERENCES "TransportOperationalDocument"("id") ON DELETE RESTRICT ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "TransportPhysicalReceiptHandover" ADD CONSTRAINT "TransportPhysicalReceiptHandover_driverId_fkey" FOREIGN KEY ("driverId") REFERENCES "TransportDriver"("id") ON DELETE RESTRICT ON UPDATE CASCADE;

-- ===========================================================================
-- UNIQUE MOT PHAN — MOT MA TEP PHUC VU NHIEU NHAT MOT CHUNG TU DANG HIEU LUC.
--
-- Cung rang buoc ma `TransportOperationalProof` da dat cho ban dinh vi cua no,
-- va cung ly le: neu mot ma tep dung duoc cho nhieu chung tu thi mot nguoi gan
-- DUNG MOT tam anh vao ca bon loai phieu — tuc mot chuyen "day du chung tu"
-- chi bang mot lan chup.
--
-- MOT PHAN vi hai le: duong chung tu giay co `fileId` rong, va mot to da bia
-- mo phai nhuong lai ma tep cho ban ghi dinh chinh.
-- ===========================================================================
CREATE UNIQUE INDEX "TransportOperationalDocument_activeFile_key"
  ON "TransportOperationalDocument" ("fileId")
  WHERE "fileId" IS NOT NULL AND "status" = 'ACTIVE';

-- ===========================================================================
-- CHECK
-- ===========================================================================

-- CAN CU va MA TEP di cung nhau, hoac khong cai nao.
--
-- Mot hang khai `DIGITAL_FILE` ma khong co ma tep la mot chung tu ban so KHONG
-- CO ban so nao — va no van dem duoc trong moi phep dem "co bao nhieu chung
-- tu". Mot hang khai `EXTERNAL_PHYSICAL` ma van cam mot ma tep thi khong ai
-- biet ben nao la can cu that.
ALTER TABLE "TransportOperationalDocument"
  ADD CONSTRAINT "TransportOperationalDocument_basis_shape"
  CHECK (
    ("basis" = 'DIGITAL_FILE' AND "fileId" IS NOT NULL)
    OR ("basis" = 'EXTERNAL_PHYSICAL'
        AND "fileId" IS NULL
        AND "externalNote" IS NOT NULL AND btrim("externalNote") <> '')
  );

-- Mot to da bia mo phai noi duoc AI bia va LUC NAO.
ALTER TABLE "TransportOperationalDocument"
  ADD CONSTRAINT "TransportOperationalDocument_withdraw_shape"
  CHECK (
    ("status" = 'ACTIVE' AND "withdrawnAt" IS NULL AND "withdrawnBy" IS NULL)
    OR ("status" = 'WITHDRAWN' AND "withdrawnAt" IS NOT NULL AND "withdrawnBy" IS NOT NULL)
  );

ALTER TABLE "TransportOperationalDocument"
  ADD CONSTRAINT "TransportOperationalDocument_businessDate_iso"
  CHECK ("businessDate" ~ '^\d{4}-\d{2}-\d{2}$');

ALTER TABLE "TransportOperationalDocument"
  ADD CONSTRAINT "TransportOperationalDocument_clientEventId_not_blank"
  CHECK (btrim("clientEventId") <> '');

-- MOT BUOC BAN GIAO PHAI CO CAN CU. `#279` O7 doi duong giay phai di duoc
-- *"using an auditable external-physical basis rather than a fake file"* — nen
-- mot buoc trong CA HAI la mot su that khong doi chieu duoc voi gi.
ALTER TABLE "TransportPhysicalReceiptHandover"
  ADD CONSTRAINT "TransportPhysicalReceiptHandover_basis"
  CHECK (
    "documentId" IS NOT NULL
    OR ("externalNote" IS NOT NULL AND btrim("externalNote") <> '')
  );

ALTER TABLE "TransportPhysicalReceiptHandover"
  ADD CONSTRAINT "TransportPhysicalReceiptHandover_sequence_positive"
  CHECK ("sequence" >= 1);

ALTER TABLE "TransportPhysicalReceiptHandover"
  ADD CONSTRAINT "TransportPhysicalReceiptHandover_businessDate_iso"
  CHECK ("businessDate" ~ '^\d{4}-\d{2}-\d{2}$');

ALTER TABLE "TransportPhysicalReceiptHandover"
  ADD CONSTRAINT "TransportPhysicalReceiptHandover_clientEventId_not_blank"
  CHECK (btrim("clientEventId") <> '');

-- ===========================================================================
-- TRIGGER — CHUNG TU CO DUNG MOT LAN CHUYEN TRANG THAI: `ACTIVE -> WITHDRAWN`.
--
-- Khong ai sua duoc loai, ma tep, moc neo, ma don hay nguoi ghi cua mot chung
-- tu da vao so. Sua mot to ghi nham la BIA MO no roi ghi mot to moi — hang cu
-- o lai, mang gio va ten nguoi bia.
--
-- `orderId` nam trong danh sach khoa, va do la dong quan trong nhat: `#279`
-- O13 bai 8 doi rang mot to bien nhan cua don A khong thoa man duoc don B. Neu
-- cot do sua duoc bang mot dong `psql` thi cong o tang mien khong con y nghia.
-- ===========================================================================
CREATE OR REPLACE FUNCTION "transport_operational_document_immutable"()
RETURNS TRIGGER AS $$
BEGIN
  IF TG_OP = 'DELETE' THEN
    RAISE EXCEPTION
      'transport_operational_document_immutable: khong xoa duoc mot chung tu da ghi, hay bia mo no';
  END IF;

  IF OLD."status" <> 'ACTIVE' THEN
    RAISE EXCEPTION
      'transport_operational_document_immutable: chung tu da bia mo, khong sua duoc nua';
  END IF;

  IF NEW."status" <> 'WITHDRAWN' THEN
    RAISE EXCEPTION
      'transport_operational_document_immutable: mot chung tu chi di duoc tu ACTIVE sang WITHDRAWN';
  END IF;

  IF NEW."id" <> OLD."id"
     OR NEW."type" <> OLD."type"
     OR NEW."runId" <> OLD."runId"
     OR NEW."legId" IS DISTINCT FROM OLD."legId"
     OR NEW."orderId" IS DISTINCT FROM OLD."orderId"
     OR NEW."checkpointId" IS DISTINCT FROM OLD."checkpointId"
     OR NEW."driverId" IS DISTINCT FROM OLD."driverId"
     OR NEW."recordedBy" <> OLD."recordedBy"
     OR NEW."basis" <> OLD."basis"
     OR NEW."fileId" IS DISTINCT FROM OLD."fileId"
     OR NEW."clientEventId" <> OLD."clientEventId"
     OR NEW."receivedAt" <> OLD."receivedAt"
     OR NEW."businessDate" <> OLD."businessDate"
     OR NEW."createdAt" <> OLD."createdAt"
  THEN
    RAISE EXCEPTION
      'transport_operational_document_immutable: chi duoc ghi phan BIA MO, khong sua duoc phan GHI';
  END IF;

  RETURN NEW;
END;
$$ LANGUAGE plpgsql;

CREATE TRIGGER "transport_operational_document_immutable"
  BEFORE UPDATE OR DELETE ON "TransportOperationalDocument"
  FOR EACH ROW EXECUTE FUNCTION "transport_operational_document_immutable"();

-- ===========================================================================
-- TRIGGER — CHUOI BAN GIAO LA SO GHI THEM.
--
-- Chat hon trigger o tren: o day KHONG co truong nao doi duoc, vi mot buoc ban
-- giao khong co vong doi — no chi don gian la da xay ra. Ghi nham thi ghi mot
-- buoc dinh chinh; dong cu O LAI.
--
-- Cung khuon `transport_run_checkpoint_append_only` cua `#243` F1.
-- ===========================================================================
CREATE OR REPLACE FUNCTION "transport_physical_receipt_handover_append_only"()
RETURNS TRIGGER AS $$
BEGIN
  IF TG_OP = 'DELETE' THEN
    RAISE EXCEPTION
      'transport_physical_receipt_handover_append_only: khong xoa duoc mot buoc ban giao da ghi';
  END IF;
  RAISE EXCEPTION
    'transport_physical_receipt_handover_append_only: khong sua duoc mot buoc ban giao da ghi';
END;
$$ LANGUAGE plpgsql;

CREATE TRIGGER "transport_physical_receipt_handover_append_only"
  BEFORE UPDATE OR DELETE ON "TransportPhysicalReceiptHandover"
  FOR EACH ROW EXECUTE FUNCTION "transport_physical_receipt_handover_append_only"();
