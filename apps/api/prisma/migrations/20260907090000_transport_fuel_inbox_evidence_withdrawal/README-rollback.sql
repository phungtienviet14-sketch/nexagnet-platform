-- DUONG LUI cua `20260907090000_transport_fuel_inbox_evidence_withdrawal`.
--
-- ---------------------------------------------------------------------------
-- DOC KY TRUOC KHI CHAY: duong lui nay CO MAT DU LIEU, va migration di len thi khong.
--
-- Bo `withdrawnAt`/`withdrawnBy` la xoa DAU VET cua moi lan go chung tu da xay ra. Byte cua nhung
-- chung tu do da bi don khoi kho anh, nen sau khi chay tep nay cac hang bang chung tuong ung se
-- hien tro lai trong danh sach dang hieu luc VA tro toi mot object khong con ton tai — man hinh se
-- bao "khong con tep bang chung trong kho anh" (`EVIDENCE_OBJECT_MISSING`).
--
-- Vi vay, thu tu dung khi phai lui:
--   1. XUAT hai cot ra ngoai truoc (cau lenh o cuoi tep nay);
--   2. moi chay phan DROP.
--
-- Ban ung dung CU khong dung hai cot nay, nen trong hau het truong hop KHONG CAN lui luoc do ca:
-- chi can trien khai lai ban ung dung cu la du.

-- ---------------------------------------------------------------------------
-- BUOC 0 — XUAT DAU VET RA TRUOC (chay va giu lai ket qua)

-- SELECT "id", "fuelEntryId", "locator", "uploadedBy", "withdrawnAt", "withdrawnBy"
--   FROM "TransportFuelReceiptEvidence"
--  WHERE "withdrawnAt" IS NOT NULL
--  ORDER BY "withdrawnAt";

-- ---------------------------------------------------------------------------
-- BUOC 1 — BO CHI SO (an toan, khong mat du lieu)

DROP INDEX IF EXISTS "TransportFuelEntry_verificationStatus_businessDate_idx";
DROP INDEX IF EXISTS "TransportFuelReceiptEvidence_fuelEntryId_withdrawnAt_idx";

-- ---------------------------------------------------------------------------
-- BUOC 2 — BO HAI COT (MAT DAU VET — chi chay sau khi da lam buoc 0)

ALTER TABLE "TransportFuelReceiptEvidence"
  DROP COLUMN IF EXISTS "withdrawnBy",
  DROP COLUMN IF EXISTS "withdrawnAt";
