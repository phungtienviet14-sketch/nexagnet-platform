-- `#297` LANE T — CUA NHAP TELEMATICS TRUNG LAP NHA CUNG CAP (T4).
--
-- ---------------------------------------------------------------------------
-- MOT CHIEU, KHONG XOA HANG NAO. Lan di nay chi:
--   · NOI LONG mot cot (`TransportLocationObservation.sessionId` thanh NULL duoc);
--   · them MOT cot NULL duoc (`TransportLocationObservation.vehicleId`);
--   · them MOT bang moi (`TransportTelematicsIngressEvent`);
--   · them ba index, ba khoa ngoai va HAI `CHECK`.
-- Moi hang dang co deu hop le ngay sau lan di: chung co `sessionId` khac NULL, `vehicleId` NULL,
-- va nguon `DEVICE_*` — dung ca hai `CHECK` o PHAN 2. Duong lui o `README-rollback.sql`.
--
-- NOI LONG `NOT NULL` khong lam mat du lieu va khong khoa bang lau: Postgres chi sua catalog.
--
-- PHAN 1 duoc SINH RA boi `prisma migrate diff --from-schema-datamodel <ban cu> --to-schema-datamodel`
-- va KHONG go tay. PHAN 2 thi nguoc lai: Prisma khong co cu phap cho `CHECK`.

-- ===========================================================================
-- PHAN 1 — DDL SINH RA TU `schema.prisma`
-- ===========================================================================

-- AlterTable
ALTER TABLE "TransportLocationObservation" ADD COLUMN     "vehicleId" TEXT,
ALTER COLUMN "sessionId" DROP NOT NULL;

-- CreateTable
CREATE TABLE "TransportTelematicsIngressEvent" (
    "id" TEXT NOT NULL,
    "providerId" TEXT NOT NULL,
    "externalEventId" TEXT NOT NULL,
    "vehicleId" TEXT NOT NULL,
    "observationId" TEXT NOT NULL,
    "receivedAt" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,
    "createdAt" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,

    CONSTRAINT "TransportTelematicsIngressEvent_pkey" PRIMARY KEY ("id")
);

-- CreateIndex
CREATE UNIQUE INDEX "TransportTelematicsIngressEvent_observationId_key" ON "TransportTelematicsIngressEvent"("observationId");

-- CreateIndex
CREATE INDEX "TransportTelematicsIngressEvent_vehicleId_receivedAt_idx" ON "TransportTelematicsIngressEvent"("vehicleId", "receivedAt");

-- CreateIndex
CREATE UNIQUE INDEX "TransportTelematicsIngressEvent_provider_event_key" ON "TransportTelematicsIngressEvent"("providerId", "externalEventId");

-- CreateIndex
CREATE INDEX "TransportLocationObservation_vehicleId_receivedAt_idx" ON "TransportLocationObservation"("vehicleId", "receivedAt");

-- AddForeignKey
ALTER TABLE "TransportLocationObservation" ADD CONSTRAINT "TransportLocationObservation_vehicleId_fkey" FOREIGN KEY ("vehicleId") REFERENCES "TransportVehicle"("id") ON DELETE RESTRICT ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "TransportTelematicsIngressEvent" ADD CONSTRAINT "TransportTelematicsIngressEvent_vehicleId_fkey" FOREIGN KEY ("vehicleId") REFERENCES "TransportVehicle"("id") ON DELETE RESTRICT ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "TransportTelematicsIngressEvent" ADD CONSTRAINT "TransportTelematicsIngressEvent_observationId_fkey" FOREIGN KEY ("observationId") REFERENCES "TransportLocationObservation"("id") ON DELETE RESTRICT ON UPDATE CASCADE;

-- ===========================================================================
-- PHAN 2 — HAI BAT BIEN MA PRISMA KHONG KHAI DUOC
-- ===========================================================================

-- T4/T9: MOT ban dinh vi co DUNG MOT chu the.
--
-- Khong co rang buoc nay, ba hinh dang sai deu ghi duoc va khong cai nao tu lo ra:
--   · ca hai NULL  — mot toa do khong gan vao ai va khong gan vao xe nao, tuc bang chung mo coi;
--   · ca hai khac NULL — hai chu the co the MAU THUAN nhau (phien cua xe A, cot `vehicleId` xe B),
--     va luc do khong ai biet duong doc nao dang noi that.
-- `num_nonnulls` co tu Postgres 9.6.
ALTER TABLE "TransportLocationObservation"
  ADD CONSTRAINT "TransportLocationObservation_one_subject"
  CHECK (num_nonnulls("sessionId", "vehicleId") = 1);

-- T4/T9 — RANG BUOC QUAN TRONG NHAT CUA CA LAN DI NAY.
--
-- `TELEMATICS` khi va CHI KHI hang gan THANG vao mot chiec xe.
--
-- Chieu thu nhat (`TELEMATICS` => phai co `vehicleId`) dong duong "mot chiec dien thoai tu khai
-- minh la phan cung tren xe". Duong ghi cua dien thoai luon di kem mot `sessionId`, nen sau rang
-- buoc nay no KHONG ghi noi mot hang `TELEMATICS` — ke ca khi ai do noi long enum o tang zod, ke ca
-- khi mot duong ghi thu hai duoc mo ra sau nay ma quen mat luat nay. Do la khac biet giua mot loi
-- hua trong ma nguon va mot bat bien.
--
-- Vi sao no dang gia: ca `SOURCE_FALLBACK` lan phep doi chieu cheo deu dua tren gia dinh rang hai
-- chuoi toa do den tu HAI thiet bi. Neu mot chiec dien thoai ghi duoc ca hai, thi man hinh se bao
-- "dien thoai im nhung hop GSHT tren xe con bao" trong khi ca hai ban ghi den tu cung mot may — va
-- mot nguoi truc se tin rang minh con nhin thay chiec xe.
--
-- Chieu thu hai (`vehicleId` => phai la `TELEMATICS`) giu cho cot moi khong lang le tro thanh mot
-- duong ghi vi tri thu hai cho moi nguon khac.
ALTER TABLE "TransportLocationObservation"
  ADD CONSTRAINT "TransportLocationObservation_telematics_subject"
  CHECK (("source" = 'TELEMATICS') = ("vehicleId" IS NOT NULL));
