-- T4R §2 — BAN GIAO CONG NO SANG T5 TRO THANH MOT CHUOI BAN SUA DOI (Issue #103).
--
-- ---------------------------------------------------------------------------
-- CAI DUOC SUA, noi bang mot vi du:
--
--   dong ky lan 1                  -> ban giao 10.000.000d
--   mo lai, sua mot dong bang ke
--   dong ky lan 2                  -> VAN tra ve ban giao 10.000.000d cu
--
-- Truoc migration nay, `reconciliationId` la UNIQUE tren bang ban giao, nen lan dong thu hai chi
-- doc lai hang cu. Dieu do idempotent DUNG khi ket qua kinh te khong doi va SAI hoan toan khi no
-- doi: T5 khong bao gio hoc duoc ve lan sua, va cay xang duoc tra sai so tien.
--
-- Sau migration nay, mot ky co MOT CHUOI ban giao chi them:
--
--   ket qua KHONG doi -> phat lai ban gan nhat, khong them hang nao
--   ket qua DOI       -> them ban N+1, `supersedesId` tro nguoc ve ban N
--
-- ---------------------------------------------------------------------------
-- MOT CHIEU, VA KHONG XOA MOT HANG NAO. Cac lenh duoi day chi:
--   · bo mot unique index (`reconciliationId`) va dat lai bang mot unique HEP HON `(ky, ban)`;
--   · them ba cot, ca ba deu co gia tri hop le cho MOI hang dang co;
--   · dien `acceptedLineIds` cho cac hang cu tu chinh du lieu doi soat cua chung.
--
-- Khong bo cot nao, khong bo bang nao, khong doi kieu cot nao. Mot ban ung dung CU van chay duoc
-- tren luoc do MOI: no khong biet ba cot moi, va ba cot do deu co mac dinh. Duong lui nam o
-- `README-rollback.sql` cung thu muc.
--
-- ---------------------------------------------------------------------------
-- PHAN DDL duoc SINH RA boi `prisma migrate diff`, KHONG go tay. Phan DIEN DU LIEU o cuoi thi
-- nguoc lai: Prisma khong sinh backfill, nen no chi ton tai o day.

-- ===========================================================================
-- PHAN 1 — DDL SINH RA TU `schema.prisma`
-- ===========================================================================

-- DropIndex
DROP INDEX "TransportFuelSettlementHandoff_reconciliationId_key";

-- AlterTable
ALTER TABLE "TransportFuelSettlementHandoff" ADD COLUMN     "acceptedLineIds" TEXT[],
ADD COLUMN     "revision" INTEGER NOT NULL DEFAULT 1,
ADD COLUMN     "supersedesId" TEXT;

-- CreateIndex
CREATE UNIQUE INDEX "TransportFuelSettlementHandoff_supersedesId_key" ON "TransportFuelSettlementHandoff"("supersedesId");

-- CreateIndex
CREATE INDEX "TransportFuelSettlementHandoff_reconciliationId_idx" ON "TransportFuelSettlementHandoff"("reconciliationId");

-- CreateIndex
CREATE UNIQUE INDEX "TransportFuelSettlementHandoff_reconciliationId_revision_key" ON "TransportFuelSettlementHandoff"("reconciliationId", "revision");

-- AddForeignKey
ALTER TABLE "TransportFuelSettlementHandoff" ADD CONSTRAINT "TransportFuelSettlementHandoff_supersedesId_fkey" FOREIGN KEY ("supersedesId") REFERENCES "TransportFuelSettlementHandoff"("id") ON DELETE RESTRICT ON UPDATE CASCADE;

-- ===========================================================================
-- PHAN 2 — DIEN `acceptedLineIds` CHO CAC BAN GIAO DA PHAT
-- ===========================================================================
--
-- VI SAO PHAI DIEN, chu khong de mang rong.
--
-- `acceptedLineIds` la mot NUA cua phep so "ket qua co doi khong". Mot ban giao cu voi mang rong
-- se KHONG BAO GIO khop voi mot ket qua vua tinh (luon co it nhat mot dong), nen lan dong lai dau
-- tien sau khi nang cap se them mot ban sua doi THUA — cung so tien, cung so dong, chi khac o cho
-- ban cu khong biet dong nao. Vo hai ve tien, nhung no ghi vao lich su mot "lan sua" khong ai lam.
--
-- Bo dong duoc chap nhan cua mot ky la dieu SUY LAI DUOC tu chinh du lieu dang co, va phep suy do
-- la dung phep cong ma `sumAcceptedSettlement()` (`fuel-settlement.ts`) thuc hien:
--
--   dong DA KHOP  (moi hang `TransportFuelMatch` cua ky)
--   HOP           dong co chenh lech duoc quyet `ACCEPT_SUPPLIER_AMOUNT`
--
-- CHAY LAI DUOC: menh de cuoi chi cham cac hang con dang RONG, nen mot lan chay thu hai khong ghi
-- de len bat cu ban giao nao do ma nguon moi sinh ra.

UPDATE "TransportFuelSettlementHandoff" AS h
SET "acceptedLineIds" = accepted."ids"
FROM (
  SELECT
    r."id" AS "reconciliationId",
    ARRAY(
      SELECT DISTINCT "lineId" FROM (
        SELECT m."statementLineId" AS "lineId"
        FROM "TransportFuelMatch" m
        WHERE m."reconciliationId" = r."id"
        UNION
        SELECT d."statementLineId"
        FROM "TransportFuelDiscrepancy" d
        WHERE d."reconciliationId" = r."id"
          AND d."resolution" = 'ACCEPT_SUPPLIER_AMOUNT'
          AND d."statementLineId" IS NOT NULL
      ) AS "candidates"
      ORDER BY "lineId"
    ) AS "ids"
  FROM "TransportFuelReconciliation" r
) AS accepted
WHERE h."reconciliationId" = accepted."reconciliationId"
  AND cardinality(h."acceptedLineIds") = 0;
