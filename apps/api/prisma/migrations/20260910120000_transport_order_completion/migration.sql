-- ===========================================================================
-- `#275` Lane K — CHU THE KET THUC THUONG MAI DOI TU VONG CHAY SANG DON HANG
--
-- `#268` Lane I khoa ho so nghiem thu vao mot `TransportVehicleRun`. `#275`
-- chot lai:
--
--     FINAL COMPLETION SUBJECT = TransportOrder
--     NOT VehicleRun
--     NOT projected-work-only
--
-- `#275` K0 doi *"prefer additive migration/compatibility over destructive
-- rewrite"*. Nen migration nay KHONG xoa cot `runId`, KHONG xoa mot hang nao,
-- KHONG dat mot gia tri `APPROVED` nao (`#275` K6 cam
-- *"mass fake APPROVED by system"*). No chi:
--
--   1. mo mot duong lien ket THUONG MAI truc tiep chuyen v1 <-> don v2;
--   2. them chu the `orderId` vao ho so, va noi long `runId` thanh nullable;
--   3. cuong che DUNG MOT chu the co mat tren moi hang.
-- ===========================================================================

-- ---------------------------------------------------------------------------
-- 1. LIEN KET THUONG MAI — chuyen v1 <-> nghia vu v2
--
-- Song song voi `TransportTripRunLegLink`, va co y la mot BANG KHAC. Bang kia
-- tra loi "chuyen cu nay hien ra o CHANG nao" va chi ton tai khi chuyen do
-- chieu duoc sang mot vong chay — `planTripProjection` TU CHOI chuyen
-- `EXTERNAL_CARRIER` vi xe khong phai cua B.
--
-- Bang nay tra loi "chuyen cu nay la NGHIA VU nao", va cau hoi do CO cau tra
-- loi ke ca khi B thue xe ngoai: khach van co, bien nhan giao hang van co.
-- `#275` K5 cam dung viec "khong chieu duoc" lam duong vong cua cong doi soat.
-- ---------------------------------------------------------------------------
CREATE TABLE "TransportTripOrderLink" (
    "tripId" TEXT NOT NULL,
    "orderId" TEXT NOT NULL,
    "projectedBy" TEXT NOT NULL,
    "createdAt" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,

    CONSTRAINT "TransportTripOrderLink_pkey" PRIMARY KEY ("tripId")
);

CREATE UNIQUE INDEX "TransportTripOrderLink_orderId_key"
  ON "TransportTripOrderLink"("orderId");

ALTER TABLE "TransportTripOrderLink" ADD CONSTRAINT "TransportTripOrderLink_tripId_fkey"
  FOREIGN KEY ("tripId") REFERENCES "TransportTrip"("id") ON DELETE RESTRICT ON UPDATE CASCADE;

ALTER TABLE "TransportTripOrderLink" ADD CONSTRAINT "TransportTripOrderLink_orderId_fkey"
  FOREIGN KEY ("orderId") REFERENCES "TransportOrder"("id") ON DELETE RESTRICT ON UPDATE CASCADE;

-- Danh tinh nguoi chieu khong duoc rong — cung quy uoc voi cac bang audit khac.
ALTER TABLE "TransportTripOrderLink"
  ADD CONSTRAINT "TransportTripOrderLink_projectedBy_not_blank"
  CHECK (btrim("projectedBy") <> '');

-- ---------------------------------------------------------------------------
-- 2. BACKFILL — ghi lai mot su that DA TON TAI VE CAU TRUC, khong tao su that moi
--
-- Moi chuyen da duoc chieu sang v2 DA co mot don, qua duong
-- `TripRunLegLink -> RunLeg.orderId`. Cau lenh nay chi ghi lai cung mot cap do
-- duoi dang mot lien ket doc truc tiep. Khong mot don nao duoc TAO, khong mot
-- trang thai nghiem thu nao duoc dat.
--
-- `#275` K6: *"Use deterministic compatibility based on existing authoritative
-- links"*. Day dung la the: dau vao la lien ket da duoc chap nhan, phep bien doi
-- la mot phep chieu, va chay lai khong doi ket qua (`ON CONFLICT DO NOTHING`).
--
-- `DISTINCT ON ("legId")` khong can: `TripRunLegLink.legId` da la UNIQUE va
-- `tripId` la khoa chinh, nen moi cap chi xuat hien mot lan.
-- ---------------------------------------------------------------------------
INSERT INTO "TransportTripOrderLink" ("tripId", "orderId", "projectedBy", "createdAt")
SELECT link."tripId", leg."orderId", link."projectedBy", link."createdAt"
FROM "TransportTripRunLegLink" link
JOIN "TransportRunLeg" leg ON leg."id" = link."legId"
WHERE leg."orderId" IS NOT NULL
ON CONFLICT DO NOTHING;

-- ---------------------------------------------------------------------------
-- 3. CHU THE MOI cua ho so ket thuc
--
-- `runId` tro thanh nullable thay vi bi xoa: mot hang cu (neu co) van doc duoc
-- nguyen ven, va `#275` K6 cam *"invalidate already-settled rows"* /
-- *"rewrite historical financial records"*. Khong hang nao bi UPDATE o day.
-- ---------------------------------------------------------------------------
ALTER TABLE "TransportCommercialAcceptance" ALTER COLUMN "runId" DROP NOT NULL;

ALTER TABLE "TransportCommercialAcceptance" ADD COLUMN "orderId" TEXT;

CREATE UNIQUE INDEX "TransportCommercialAcceptance_orderId_key"
  ON "TransportCommercialAcceptance"("orderId");

ALTER TABLE "TransportCommercialAcceptance" ADD CONSTRAINT "TransportCommercialAcceptance_orderId_fkey"
  FOREIGN KEY ("orderId") REFERENCES "TransportOrder"("id") ON DELETE RESTRICT ON UPDATE CASCADE;

-- ---------------------------------------------------------------------------
-- DUNG MOT CHU THE, cuong che o DB.
--
-- Prisma khong dien dat duoc rang buoc nay, va no la thu duy nhat ngan mot lan
-- sua sau nay ghi mot ho so khong co chu the nao (`#275` K5 se mat cong) hoac
-- co CA HAI (hai cau tra loi cho "cai gi da duoc ket thuc").
--
-- `prisma migrate dev` khong biet gi ve `CHECK`, nen no sinh lenh XOA o lan
-- sinh migration ke tiep. `transport-commercial-acceptance-storage.spec.ts` doc
-- CHINH TEP NAY de mot lan xoa nhu vay khong di qua duoc.
-- ---------------------------------------------------------------------------
ALTER TABLE "TransportCommercialAcceptance"
  ADD CONSTRAINT "TransportCommercialAcceptance_subject_exactly_one"
  CHECK (
    (("orderId" IS NOT NULL)::int + ("runId" IS NOT NULL)::int) = 1
  );
