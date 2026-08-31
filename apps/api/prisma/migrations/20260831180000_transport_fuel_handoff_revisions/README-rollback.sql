-- DUONG LUI cua `20260831180000_transport_fuel_handoff_revisions`.
--
-- Chay tay khi can quay ve hinh dang truoc migration. KHONG phai mot migration Prisma — de o day de
-- nguoi truc doc duoc trong luc su co, khong phai de chay tu dong.
--
-- ---------------------------------------------------------------------------
-- BUOC 0 — DEM TRUOC KHI QUYET.
--
-- Duong lui nay dat lai `reconciliationId` thanh UNIQUE, nen no CHI CHAY DUOC khi moi ky co dung
-- mot ban giao. Neu mot ky da co ban sua doi thu hai, cau lenh cuoi se do — va do la dieu DUNG:
-- gop hai ban giao lai lam mot la vut di mot con so ma T5 co the da tra tien theo.
--
--   SELECT "reconciliationId", count(*) AS so_ban
--   FROM "TransportFuelSettlementHandoff"
--   GROUP BY "reconciliationId"
--   HAVING count(*) > 1;
--
-- Neu cau tren tra ve bat cu hang nao thi DUNG. Xuat du lieu ra truoc (`COPY ... TO`), quyet xem
-- ban nao la ban dung voi ke toan, roi moi xoa TAY tung hang thua — khong co duong tu dong nao lam
-- viec do ho, va cung khong nen co.

-- ---------------------------------------------------------------------------
-- BUOC 1 — go rang buoc va cot moi.
--
-- Ba cot nay chi duoc doc boi ban ung dung TU T4R tro di. Mot ban cu khong biet chung, nen buoc nay
-- khong lam hong duong doc nao dang chay.

ALTER TABLE "TransportFuelSettlementHandoff"
  DROP CONSTRAINT IF EXISTS "TransportFuelSettlementHandoff_supersedesId_fkey";

DROP INDEX IF EXISTS "TransportFuelSettlementHandoff_reconciliationId_revision_key";
DROP INDEX IF EXISTS "TransportFuelSettlementHandoff_reconciliationId_idx";
DROP INDEX IF EXISTS "TransportFuelSettlementHandoff_supersedesId_key";

ALTER TABLE "TransportFuelSettlementHandoff"
  DROP COLUMN IF EXISTS "supersedesId",
  DROP COLUMN IF EXISTS "revision",
  DROP COLUMN IF EXISTS "acceptedLineIds";

-- ---------------------------------------------------------------------------
-- BUOC 2 — dat lai unique cu.
--
-- Do o day neu BUOC 0 chua duoc lam. Do la mot loi HUU ICH: no chan dung lan quay lui truoc khi
-- mot ban sua doi bi mat, va no chi hien ra sau khi BUOC 1 da chay — nen hay lam BUOC 0 truoc.

CREATE UNIQUE INDEX "TransportFuelSettlementHandoff_reconciliationId_key"
  ON "TransportFuelSettlementHandoff"("reconciliationId");
