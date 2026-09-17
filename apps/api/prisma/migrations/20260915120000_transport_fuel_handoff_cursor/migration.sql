-- ===========================================================================
-- CON TRO TIEU THU ban giao cua TX-04 — `#295` Lane V, P0.
--
-- Bang nay thuoc `transport-settlement`. No tra loi DUNG MOT cau hoi cua vong
-- quet: "ky doi soat nay con ban sua doi nao chua duoc doc sang cong no khong".
--
-- No KHONG phai su that ve tien. Su that do nam o
-- `TransportSettlementDocument_sourceContext_sourceId_key` — mot ban giao chi
-- sinh duoc dung mot chung tu du co goi lai bao nhieu lan. Mat bang nay thi
-- vong quet lam lai mot lan vo hai roi ghi lai chinh no; no chi ton tai de vong
-- quet dung lai, chu khong de bao ve so tien.
--
-- KHONG co khoa ngoai sang `TransportFuelReconciliation`: dat mot khoa ngoai o
-- day se buoc hai mien vao nhau o tang CSDL dung luc tang ung dung vua tach
-- chung ra. `transport-fuel` khong duoc biet bang nay ton tai.
-- ===========================================================================

-- CreateTable
CREATE TABLE "TransportSettlementFuelHandoffCursor" (
    "reconciliationId" TEXT NOT NULL,
    "consumedRevision" INTEGER NOT NULL,
    "consumedHandoffId" TEXT NOT NULL,
    "consumedAt" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,
    "updatedAt" TIMESTAMP(3) NOT NULL,

    CONSTRAINT "TransportSettlementFuelHandoffCursor_pkey" PRIMARY KEY ("reconciliationId")
);

-- CreateIndex
CREATE INDEX "TransportSettlementFuelHandoffCursor_consumedAt_idx"
    ON "TransportSettlementFuelHandoffCursor"("consumedAt");

-- ===========================================================================
-- `consumedRevision` dem tu 1, cung goc voi
-- `TransportFuelSettlementHandoff.revision`. So 0 khong co nghia gi: mot ky
-- chua tieu thu ban nao thi KHONG CO HANG, chu khong phai co mot hang mang 0.
-- Phan biet hai thu do bang su vang mat cua hang giu cho phep dem "con bao
-- nhieu ky chua ai doc" bang mot phep dem don gian.
-- ===========================================================================
ALTER TABLE "TransportSettlementFuelHandoffCursor"
    ADD CONSTRAINT "TransportSettlementFuelHandoffCursor_revision_positive"
    CHECK ("consumedRevision" >= 1);
