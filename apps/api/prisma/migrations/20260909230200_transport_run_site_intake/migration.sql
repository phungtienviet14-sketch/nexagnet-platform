-- TX-10 NHAN VIEC TAI DIA DIEM A — cham xac nhan cua lai xe (Lane H, Issue #267 H3/H4)
--
-- KHONG co lenh doi mot bang nao dang chay. Migration nay CONG THEM mot enum, mot bang, bon rang
-- buoc va mot trigger. Moi truy van va moi hang du lieu co truoc no deu doc/ghi y nguyen sau no.
--
-- BANG NAY LA CAI CHAM CUA CON NGUOI. `#267` mo dau bang mot cau cam — *"No trip/run may be
-- silently auto-created solely because a device entered a geofence"* — va mot cau cam thi khong tu
-- no thanh mot bao dam. Bang nay la cho de doc lai rang lan tao NAY da co mot nguoi bam vao no.

CREATE TYPE "TransportSiteIntakeLocationTrust" AS ENUM ('SERVER_BOUND', 'DRIVER_REPORTED');

CREATE TABLE "TransportRunSiteIntake" (
    "id" TEXT NOT NULL,
    "runId" TEXT NOT NULL,
    "legId" TEXT NOT NULL,
    "siteId" TEXT NOT NULL,
    "driverId" TEXT NOT NULL,
    "confirmedBy" TEXT NOT NULL,
    "locationTrust" "TransportSiteIntakeLocationTrust" NOT NULL,
    "observationId" TEXT,
    "distanceMetres" INTEGER,
    "clientEventId" TEXT NOT NULL,
    "confirmedAt" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,
    "businessDate" VARCHAR(10) NOT NULL,
    "createdAt" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,

    CONSTRAINT "TransportRunSiteIntake_pkey" PRIMARY KEY ("id")
);

-- MOT vong chay co NHIEU NHAT mot lan nhan viec, va mot chang cung vay.
CREATE UNIQUE INDEX "TransportRunSiteIntake_runId_key" ON "TransportRunSiteIntake"("runId");
CREATE UNIQUE INDEX "TransportRunSiteIntake_legId_key" ON "TransportRunSiteIntake"("legId");

-- MOT ban dinh vi phuc vu NHIEU NHAT mot lan nhan viec — cung khuon
-- `TransportRunCheckpoint_observationId_key`. Khong co no thi mot ban dinh vi duy nhat lam bang
-- chung cho hai lan nhan viec khac nhau, va ca hai deu trong nhu co chung cu vi tri rieng.
CREATE UNIQUE INDEX "TransportRunSiteIntake_observationId_key"
  ON "TransportRunSiteIntake"("observationId");

-- KHOA CHONG LAP, va day la rang buoc quan trong nhat cua ca bang.
--
-- `#267` H3 doi *"Prove retry/idempotency so double tap/offline replay cannot create two Runs"*.
-- Khoa phai chan duoc lan ghi THU HAI *truoc khi* co vong chay thu hai — nen no khong the chua
-- `runId`, thu chi hinh thanh SAU cai ma no dang tim cach chan. Cham hai lan va mot hang doi ngoai
-- tuyen phat lai deu mang CUNG `clientEventId`, va lan thu hai dung o day.
CREATE UNIQUE INDEX "TransportRunSiteIntake_driver_event_key"
  ON "TransportRunSiteIntake"("driverId", "clientEventId");

CREATE INDEX "TransportRunSiteIntake_siteId_businessDate_idx"
  ON "TransportRunSiteIntake"("siteId", "businessDate");
CREATE INDEX "TransportRunSiteIntake_businessDate_idx"
  ON "TransportRunSiteIntake"("businessDate");

-- `RESTRICT` o CA NAM khoa ngoai. Mot lan nhan viec la bang chung; khong hang nao ma no tro toi
-- duoc phep bien mat va mang theo cau tra loi "vong chay nay tu dau ra".
ALTER TABLE "TransportRunSiteIntake" ADD CONSTRAINT "TransportRunSiteIntake_runId_fkey"
  FOREIGN KEY ("runId") REFERENCES "TransportVehicleRun"("id") ON DELETE RESTRICT ON UPDATE CASCADE;
ALTER TABLE "TransportRunSiteIntake" ADD CONSTRAINT "TransportRunSiteIntake_legId_fkey"
  FOREIGN KEY ("legId") REFERENCES "TransportRunLeg"("id") ON DELETE RESTRICT ON UPDATE CASCADE;
ALTER TABLE "TransportRunSiteIntake" ADD CONSTRAINT "TransportRunSiteIntake_siteId_fkey"
  FOREIGN KEY ("siteId") REFERENCES "TransportCounterpartySite"("id") ON DELETE RESTRICT ON UPDATE CASCADE;
ALTER TABLE "TransportRunSiteIntake" ADD CONSTRAINT "TransportRunSiteIntake_driverId_fkey"
  FOREIGN KEY ("driverId") REFERENCES "TransportDriver"("id") ON DELETE RESTRICT ON UPDATE CASCADE;
ALTER TABLE "TransportRunSiteIntake" ADD CONSTRAINT "TransportRunSiteIntake_observationId_fkey"
  FOREIGN KEY ("observationId") REFERENCES "TransportLocationObservation"("id") ON DELETE RESTRICT ON UPDATE CASCADE;

-- ---------------------------------------------------------------------------------------------
-- BA RANG BUOC HINH DANG

-- Ngay nghiep vu duoc CHOT MOT LAN luc ghi, theo mui gio tenant (`INV-25`). Mot chuoi sai dang o
-- day se lam moi bao cao theo ngay bo qua hang do ma khong bao gi.
ALTER TABLE "TransportRunSiteIntake"
  ADD CONSTRAINT "TransportRunSiteIntake_businessDate_iso"
  CHECK ("businessDate" ~ '^[0-9]{4}-[0-9]{2}-[0-9]{2}$');

-- Khoa chong lap rong la mot khoa khong chan gi: hai lan cham deu mang chuoi rong va deu di tiep.
ALTER TABLE "TransportRunSiteIntake"
  ADD CONSTRAINT "TransportRunSiteIntake_clientEventId_shape"
  CHECK (btrim("clientEventId") <> '');

-- `SERVER_BOUND` ma khong co ban dinh vi la mot lan noi doi ve suc nang cua bang chung: no se doc
-- ra la "vi tri da qua kiem" trong khi khong co hang nao de mo. Chieu nguoc lai KHONG bi cam —
-- mot lan `DRIVER_REPORTED` co the van dinh kem mot ban dinh vi neu co, va nhan tin cua no van la
-- nhan thap hon.
ALTER TABLE "TransportRunSiteIntake"
  ADD CONSTRAINT "TransportRunSiteIntake_trust_shape"
  CHECK ("locationTrust" <> 'SERVER_BOUND' OR "observationId" IS NOT NULL);

-- ---------------------------------------------------------------------------------------------
-- GHI THEM, KHONG GHI DE, KHONG XOA
--
-- Cung khuon va cung ly do voi `transport_run_checkpoint_append_only` cua `#243` F1: mot lan xac
-- nhan la mot viec DA XAY RA. Khong co truong nao cua no doi duoc — mot lan bam nham duoc sua bang
-- cach HUY vong chay (`cancelRun`, kem ly do bang chu), khong bang cach doi hang nay.
--
-- Neu hang nay sua duoc thi cau tra loi cho *"co ai bam khong, hay may tu tao"* cung sua duoc, va
-- luc do ca bang khong con chung minh dieu gi.
CREATE OR REPLACE FUNCTION "transport_run_site_intake_append_only"()
RETURNS TRIGGER AS $$
BEGIN
  IF TG_OP = 'DELETE' THEN
    RAISE EXCEPTION
      'transport_run_site_intake_append_only: khong xoa duoc mot lan xac nhan da ghi, hay huy vong chay kem ly do';
  END IF;
  RAISE EXCEPTION
    'transport_run_site_intake_append_only: khong sua duoc mot lan xac nhan da ghi, hay huy vong chay kem ly do';
END;
$$ LANGUAGE plpgsql;

CREATE TRIGGER "transport_run_site_intake_append_only"
  BEFORE UPDATE OR DELETE ON "TransportRunSiteIntake"
  FOR EACH ROW EXECUTE FUNCTION "transport_run_site_intake_append_only"();
