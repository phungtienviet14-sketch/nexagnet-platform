-- DUONG LUI cua `20260918100000_transport_telematics_ingress` (`#297` Lane T).
--
-- ===========================================================================
-- DOC TRUOC KHI CHAY
--
-- 1. Lui la MAT BANG CHUNG, khong phai mat cau hinh. Moi ban dinh vi den tu phan cung tren xe deu
--    nam o nhung hang co `vehicleId` khac NULL, va buoc dat lai `NOT NULL` cho `sessionId` doi
--    chung phai BIEN MAT. Dem va ket xuat TRUOC:
--
--      SELECT count(*) FROM "TransportLocationObservation" WHERE "vehicleId" IS NOT NULL;
--      \copy (SELECT o.id, o."vehicleId", o.latitude, o.longitude, o."capturedAt", o."receivedAt",
--             e."providerId", e."externalEventId"
--             FROM "TransportLocationObservation" o
--             JOIN "TransportTelematicsIngressEvent" e ON e."observationId" = o.id)
--             TO 'telematics-observations.csv' CSV HEADER
--
-- 2. Neu con so o buoc 1 khac 0 thi DUNG LAI va hoi chu so huu. Khoi `DELETE` ben duoi da duoc CO
--    Y de lai duoi dang chu thich: mot duong lui khong duoc lang le xoa bang chung vi tri. Bo
--    chu thich chi sau khi da ket xuat va co nguoi dong y.
--
-- 3. Neu con so o buoc 1 bang 0 (truong hop thuong gap — chua khach nao cam mot nguon that vao),
--    thi lan lui nay khong mat gi ca: no chi go lai mot cot rong, mot bang rong va hai `CHECK`.
--
-- ===========================================================================

BEGIN;

ALTER TABLE "TransportLocationObservation"
  DROP CONSTRAINT IF EXISTS "TransportLocationObservation_telematics_subject";
ALTER TABLE "TransportLocationObservation"
  DROP CONSTRAINT IF EXISTS "TransportLocationObservation_one_subject";

DROP TABLE IF EXISTS "TransportTelematicsIngressEvent";

-- Xem muc 2 o tren. KHONG bo chu thich khi chua ket xuat.
-- DELETE FROM "TransportProofRiskFlag"
--   WHERE "observationId" IN (SELECT id FROM "TransportLocationObservation" WHERE "vehicleId" IS NOT NULL);
-- DELETE FROM "TransportLocationObservation" WHERE "vehicleId" IS NOT NULL;

DROP INDEX IF EXISTS "TransportLocationObservation_vehicleId_receivedAt_idx";
ALTER TABLE "TransportLocationObservation"
  DROP CONSTRAINT IF EXISTS "TransportLocationObservation_vehicleId_fkey";
ALTER TABLE "TransportLocationObservation" DROP COLUMN IF EXISTS "vehicleId";

-- That bai o day nghia la van con hang `sessionId IS NULL` — tuc buoc 2 chua duoc lam. Do la mot
-- that bai DUNG: no chan mot lan lui im lang bo lai bang chung mo coi.
ALTER TABLE "TransportLocationObservation" ALTER COLUMN "sessionId" SET NOT NULL;

COMMIT;
