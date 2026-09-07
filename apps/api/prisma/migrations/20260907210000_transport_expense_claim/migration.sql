-- CreateEnum
CREATE TYPE "TransportExpenseClaimStatus" AS ENUM ('PENDING_REVIEW', 'APPROVED', 'REJECTED');

-- CreateEnum
CREATE TYPE "TransportExpenseClaimDecisionOutcome" AS ENUM ('APPROVED', 'REJECTED');

-- CreateTable
CREATE TABLE "TransportExpenseClaim" (
    "id" TEXT NOT NULL,
    "driverId" TEXT NOT NULL,
    "status" "TransportExpenseClaimStatus" NOT NULL DEFAULT 'PENDING_REVIEW',
    "categoryCode" VARCHAR(60) NOT NULL,
    "claimedAmount" BIGINT NOT NULL,
    "approvedAmount" BIGINT,
    "currencyCode" VARCHAR(3) NOT NULL DEFAULT 'VND',
    "businessDate" VARCHAR(10) NOT NULL,
    "note" TEXT,
    "evidenceLocator" TEXT,
    "tripId" TEXT,
    "runId" TEXT,
    "legId" TEXT,
    "submittedBy" TEXT NOT NULL,
    "submittedAt" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,
    "decidedAt" TIMESTAMP(3),
    "settlementExpenseId" TEXT,
    "createdAt" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,
    "updatedAt" TIMESTAMP(3) NOT NULL,

    CONSTRAINT "TransportExpenseClaim_pkey" PRIMARY KEY ("id")
);

-- CreateTable
CREATE TABLE "TransportExpenseClaimDecision" (
    "id" TEXT NOT NULL,
    "claimId" TEXT NOT NULL,
    "sequence" INTEGER NOT NULL,
    "outcome" "TransportExpenseClaimDecisionOutcome" NOT NULL,
    "approvedAmount" BIGINT,
    "reasonCode" VARCHAR(60) NOT NULL,
    "note" TEXT,
    "decidedBy" TEXT NOT NULL,
    "decidedAt" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,

    CONSTRAINT "TransportExpenseClaimDecision_pkey" PRIMARY KEY ("id")
);

-- CreateIndex
CREATE UNIQUE INDEX "TransportExpenseClaim_settlementExpenseId_key" ON "TransportExpenseClaim"("settlementExpenseId");

-- CreateIndex
CREATE INDEX "TransportExpenseClaim_driverId_status_idx" ON "TransportExpenseClaim"("driverId", "status");

-- CreateIndex
CREATE INDEX "TransportExpenseClaim_status_businessDate_idx" ON "TransportExpenseClaim"("status", "businessDate");

-- CreateIndex
CREATE INDEX "TransportExpenseClaim_tripId_idx" ON "TransportExpenseClaim"("tripId");

-- CreateIndex
CREATE INDEX "TransportExpenseClaim_runId_idx" ON "TransportExpenseClaim"("runId");

-- CreateIndex
CREATE INDEX "TransportExpenseClaim_legId_idx" ON "TransportExpenseClaim"("legId");

-- CreateIndex
CREATE UNIQUE INDEX "TransportExpenseClaimDecision_claimId_sequence_key" ON "TransportExpenseClaimDecision"("claimId", "sequence");

-- CreateIndex
CREATE INDEX "TransportExpenseClaimDecision_claimId_idx" ON "TransportExpenseClaimDecision"("claimId");

-- CreateIndex
CREATE INDEX "TransportExpenseClaimDecision_decidedBy_idx" ON "TransportExpenseClaimDecision"("decidedBy");

-- AddForeignKey
ALTER TABLE "TransportExpenseClaim" ADD CONSTRAINT "TransportExpenseClaim_driverId_fkey" FOREIGN KEY ("driverId") REFERENCES "TransportDriver"("id") ON DELETE RESTRICT ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "TransportExpenseClaim" ADD CONSTRAINT "TransportExpenseClaim_tripId_fkey" FOREIGN KEY ("tripId") REFERENCES "TransportTrip"("id") ON DELETE RESTRICT ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "TransportExpenseClaim" ADD CONSTRAINT "TransportExpenseClaim_runId_fkey" FOREIGN KEY ("runId") REFERENCES "TransportVehicleRun"("id") ON DELETE RESTRICT ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "TransportExpenseClaim" ADD CONSTRAINT "TransportExpenseClaim_legId_fkey" FOREIGN KEY ("legId") REFERENCES "TransportRunLeg"("id") ON DELETE RESTRICT ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "TransportExpenseClaim" ADD CONSTRAINT "TransportExpenseClaim_settlementExpenseId_fkey" FOREIGN KEY ("settlementExpenseId") REFERENCES "TransportTripExpense"("id") ON DELETE RESTRICT ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "TransportExpenseClaimDecision" ADD CONSTRAINT "TransportExpenseClaimDecision_claimId_fkey" FOREIGN KEY ("claimId") REFERENCES "TransportExpenseClaim"("id") ON DELETE CASCADE ON UPDATE CASCADE;

-- ---------------------------------------------------------------------------------------------
-- RANG BUOC TANG LUU TRU -- Prisma khong co cu phap cho `CHECK`, nen chung song o day.
--
-- `transport-expense-claim-storage.spec.ts` doc chinh tep nay va do neu mot ten bien mat.
-- ---------------------------------------------------------------------------------------------

-- Mot de nghi bang 0 dong khong phai mot de nghi. Tran tren trung voi `money()`: cot la BIGINT nen
-- DB nhan duoc so lon hon `Number.MAX_SAFE_INTEGER`, con tang mien doc ra bang `number`.
ALTER TABLE "TransportExpenseClaim"
  ADD CONSTRAINT "TransportExpenseClaim_claimed_amount_range"
  CHECK ("claimedAmount" > 0 AND "claimedAmount" <= 9007199254740991);

-- SO DUYET KHONG BAO GIO VUOT SO DE NGHI.
--
-- Rang buoc la `<=` chu KHONG phai `=`, va do la ca thiet ke: hom nay `D-06` chi cho duyet TRON
-- KHOAN nen hai so luon bang nhau, nhung khi `Q-04` co loi thi duyet mot phan chi la mot lan noi
-- long o TANG MIEN -- khong phai mot lan doi kieu du lieu, va khong phai mot lan viet lai lich su
-- cua nhung de nghi da duyet.
ALTER TABLE "TransportExpenseClaim"
  ADD CONSTRAINT "TransportExpenseClaim_approved_amount_bounded"
  CHECK ("approvedAmount" IS NULL OR ("approvedAmount" > 0 AND "approvedAmount" <= "claimedAmount"));

-- SO DUYET CO MAT KHI VA CHI KHI DA DUYET. Hai cot noi cung mot su that, nen chung khong duoc
-- phep noi nguoc nhau: mot hang `REJECTED` mang `approvedAmount` la mot hang khong ai doc dung.
ALTER TABLE "TransportExpenseClaim"
  ADD CONSTRAINT "TransportExpenseClaim_approved_amount_matches_status"
  CHECK (("status" = 'APPROVED') = ("approvedAmount" IS NOT NULL));

-- CHI KHOAN DA DUYET MOI CHAM VAO GIA THANH. `D-06` viet dieu nay bang loi; day la cho no thanh
-- mot rang buoc. Mot de nghi `PENDING_REVIEW` hay `REJECTED` gan duoc vao mot dong gia thanh la
-- dung cai ma cong duyet sinh ra de chan.
ALTER TABLE "TransportExpenseClaim"
  ADD CONSTRAINT "TransportExpenseClaim_settlement_only_when_approved"
  CHECK ("settlementExpenseId" IS NULL OR "status" = 'APPROVED');

-- Mot de nghi phai gan vao MOT viec co that. Khong tham chieu nao thi khong ai tra loi duoc
-- "khoan nay phat sinh o dau", va no khong bao gio vao duoc gia thanh cua bat ky chuyen nao.
ALTER TABLE "TransportExpenseClaim"
  ADD CONSTRAINT "TransportExpenseClaim_reference_required"
  CHECK ("tripId" IS NOT NULL OR "runId" IS NOT NULL OR "legId" IS NOT NULL);

-- NHIEN LIEU VA ETC KHONG DI DUONG NAY (`D-05`, `D-07`).
--
-- Dau o cay xang co hop dong da co duong rieng tu T4 va KHONG dung vao quy lai xe; ETC la tien
-- cong ty tra va quy trinh quyet toan that cua khach chua ai biet. De chung lot vao day se tao
-- NGUON SU THAT THU HAI cho cung mot khoan tien -- va hai so se lech nhau ma khong co gi bao.
ALTER TABLE "TransportExpenseClaim"
  ADD CONSTRAINT "TransportExpenseClaim_category_not_reserved"
  CHECK (upper(btrim("categoryCode")) NOT IN ('FUEL', 'ETC'));

-- Lich su quyet dinh danh so tu 1.
ALTER TABLE "TransportExpenseClaimDecision"
  ADD CONSTRAINT "TransportExpenseClaimDecision_sequence_positive" CHECK ("sequence" >= 1);

-- Mot quyet dinh `REJECTED` mang so tien la mot mau thuan; mot `APPROVED` khong mang so tien thi
-- khong noi duoc no duyet bao nhieu.
ALTER TABLE "TransportExpenseClaimDecision"
  ADD CONSTRAINT "TransportExpenseClaimDecision_amount_matches_outcome"
  CHECK (("outcome" = 'APPROVED') = ("approvedAmount" IS NOT NULL));

ALTER TABLE "TransportExpenseClaimDecision"
  ADD CONSTRAINT "TransportExpenseClaimDecision_amount_range"
  CHECK ("approvedAmount" IS NULL OR ("approvedAmount" > 0 AND "approvedAmount" <= 9007199254740991));
