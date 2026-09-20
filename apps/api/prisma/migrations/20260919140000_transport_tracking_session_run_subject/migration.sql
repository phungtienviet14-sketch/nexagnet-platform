-- ===========================================================================
-- `#327` — CHU THE THU HAI cho mot phien bam vi tri: mot VONG CHAY.
-- ===========================================================================
--
-- Vi sao di tru nay ton tai, noi bang mot cau: luong Order-first cua Lane W sinh
-- `TransportVehicleRun` chu khong sinh `TransportTrip`, nen mot lai xe tren mot vong chay THAT
-- khong mo noi phien bam vi tri — khong lam noi ban dinh vi — khong ghi noi `DELIVERY_ARRIVAL`,
-- mot moc ma chinh sach `#232` D-08 BAT BUOC kem vi tri. Bon rang buoc dung dan giao nhau thanh
-- mot o kin.
--
-- Hai duong vong da bi tu choi co y (`ARCHITECTURE_DECISION_2026_09_19`): bia mot `TransportTrip`
-- chi de lam cho dua se keo mot thuc the cu tro lai duong chay moi; noi long danh sach moc bat
-- buoc kem vi tri se bo mat bang chung o dung doan duong ma bang chung dang gia nhat.

-- ---------------------------------------------------------------------------
-- PHAN 1 — CHU THE CU THANH TUY CHON, CHU THE MOI DUOC THEM
-- ---------------------------------------------------------------------------

-- Moi phien DA CO deu co `tripId`, nen bo `NOT NULL` khong lam hang nao doi nghia. Chieu nguoc
-- lai thi khong the: giu `NOT NULL` thi moi phien theo vong chay phai dien mot `tripId` gia.
ALTER TABLE "TransportTrackingSession" ALTER COLUMN "tripId" DROP NOT NULL;

ALTER TABLE "TransportTrackingSession" ADD COLUMN "runId" TEXT;

ALTER TABLE "TransportTrackingSession"
  ADD CONSTRAINT "TransportTrackingSession_runId_fkey"
  FOREIGN KEY ("runId") REFERENCES "TransportVehicleRun"("id") ON DELETE RESTRICT ON UPDATE CASCADE;

-- Doc "cac phien cua vong chay nay" la duong doc cua man hinh dieu hanh; khong co chi muc thi no
-- quet ca bang bang chung.
CREATE INDEX "TransportTrackingSession_runId_idx" ON "TransportTrackingSession"("runId");

-- ---------------------------------------------------------------------------
-- PHAN 2 — BAT BIEN MA PRISMA KHONG KHAI DUOC
-- ---------------------------------------------------------------------------

-- MOT PHIEN, MOT CHU THE.
--
-- Khong co rang buoc nay, ba hinh dang sai deu ghi duoc va khong cai nao tu lo ra:
--   · ca hai NULL   — mot phien khong bam theo viec gi, tuc mot chuoi toa do mo coi;
--   · ca hai khac NULL — hai chu the co the MAU THUAN (chuyen cua xe A, vong chay cua xe B), va
--     luc do khong ai biet duong doc nao dang noi that;
--   · va ca hai chi lo ra khi co nguoi mo bang len tim.
--
-- Cung ky thuat voi `TransportLocationObservation_one_subject` cua `#297` T4, va cung ly le.
-- `num_nonnulls` co tu Postgres 9.6.
--
-- Moi hang DA CO deu co `tripId` va chua co `runId`, nen `num_nonnulls = 1` dung ngay voi toan bo
-- du lieu cu — rang buoc nay khong can mot buoc va du lieu nao di truoc.
ALTER TABLE "TransportTrackingSession"
  ADD CONSTRAINT "TransportTrackingSession_one_subject"
  CHECK (num_nonnulls("tripId", "runId") = 1);
