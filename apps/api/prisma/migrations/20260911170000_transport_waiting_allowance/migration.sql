-- CreateEnum
CREATE TYPE "TransportWaitingAllowanceStatus" AS ENUM ('PENDING', 'APPROVED', 'REJECTED');

-- ===========================================================================
-- MOT GIA TRI MOI cho nguon thanh phan luong.
--
-- `#279` O6: tong cac khoan phu cap cho DA DUOC DUYET trong ky. KHONG dung
-- `MANUAL_BONUS`: mot khoan thu cong chi song trong bang luong, con khoan nay
-- co mot HO SO RIENG dung sau no va truy nguyen duoc ve mot khoang thoi gian
-- co that.
--
-- Rang buoc `TransportPayslipComponent_deduction_manual_only` van dung nguyen:
-- gia tri moi la mot khoan CONG (`EARNING`), khong phai khoan tru. Rang buoc
-- `TransportPayslipComponent_manual_needs_signer` cung van dung: thanh phan
-- nay mang `recordedBy = NULL`, vi chu ky cua nguoi duyet song tren HO SO PHU
-- CAP (`decidedBy`) chu khong bi ghi lai o moi lan chay luong.
-- ===========================================================================
ALTER TYPE "TransportPayslipComponentSource" ADD VALUE IF NOT EXISTS 'WAITING_ALLOWANCE';

-- CreateTable
CREATE TABLE "TransportDriverWaitingAllowance" (
    "id" TEXT NOT NULL,
    "waitingSessionId" TEXT NOT NULL,
    "driverId" TEXT NOT NULL,
    "status" "TransportWaitingAllowanceStatus" NOT NULL DEFAULT 'PENDING',
    "currencyCode" VARCHAR(3) NOT NULL DEFAULT 'VND',
    "candidateAmount" BIGINT NOT NULL,
    "approvedAmount" BIGINT,
    "reason" TEXT NOT NULL,
    "proposedBy" TEXT NOT NULL,
    "proposedAt" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,
    "decidedBy" TEXT,
    "decidedAt" TIMESTAMP(3),
    "decisionNote" TEXT,
    "decisionIdempotencyKey" TEXT,
    "businessDate" VARCHAR(10) NOT NULL,
    "createdAt" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,
    "updatedAt" TIMESTAMP(3) NOT NULL,

    CONSTRAINT "TransportDriverWaitingAllowance_pkey" PRIMARY KEY ("id")
);

-- CreateIndex
CREATE UNIQUE INDEX "TransportDriverWaitingAllowance_decisionKey_key" ON "TransportDriverWaitingAllowance"("decisionIdempotencyKey");

-- CreateIndex
CREATE INDEX "TransportDriverWaitingAllowance_waitingSessionId_idx" ON "TransportDriverWaitingAllowance"("waitingSessionId");

-- CreateIndex
CREATE INDEX "TransportDriverWaitingAllowance_driverId_businessDate_idx" ON "TransportDriverWaitingAllowance"("driverId", "businessDate");

-- CreateIndex
CREATE INDEX "TransportDriverWaitingAllowance_status_proposedAt_idx" ON "TransportDriverWaitingAllowance"("status", "proposedAt");

-- AddForeignKey
ALTER TABLE "TransportDriverWaitingAllowance" ADD CONSTRAINT "TransportDriverWaitingAllowance_waitingSessionId_fkey" FOREIGN KEY ("waitingSessionId") REFERENCES "TransportDeliveryWaitingSession"("id") ON DELETE RESTRICT ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "TransportDriverWaitingAllowance" ADD CONSTRAINT "TransportDriverWaitingAllowance_driverId_fkey" FOREIGN KEY ("driverId") REFERENCES "TransportDriver"("id") ON DELETE RESTRICT ON UPDATE CASCADE;

-- ===========================================================================
-- UNIQUE MOT PHAN — MOT PHIEN CHO, MOT KHOAN DA DUYET.
--
-- Cong THAT cho `#279` O13 bai 11 (*"duplicate allowance approval does not pay
-- twice"*), va no manh hon khoa chong ghi trung: khoa kia chan hai lan bam
-- CUNG mot lenh, cai nay chan hai khoan DUOC DUYET tren cung mot khoang thoi
-- gian — ke ca khi chung den tu hai de nghi khac nhau, hai nguoi khac nhau,
-- hai ngay khac nhau.
--
-- Phai la unique MOT PHAN: mot phien cho CO THE co nhieu de nghi bi TU CHOI,
-- va `#279` O6 doi *"rejected/corrected history preserved"*.
-- ===========================================================================
CREATE UNIQUE INDEX "TransportDriverWaitingAllowance_approvedSession_key"
  ON "TransportDriverWaitingAllowance" ("waitingSessionId")
  WHERE "status" = 'APPROVED';

-- ===========================================================================
-- CHECK — nam dieu Prisma khong dien dat duoc.
-- ===========================================================================

-- SO TIEN LA SO NGUYEN DUONG, va so DUYET khong duoc lon hon so DE NGHI.
--
-- Ve thu hai la mot ranh gioi co chu dich: nguoi duyet CAT BOT duoc, KHONG
-- cong them duoc. Cho phep duyet cao hon so de nghi se bien cong duyet thanh
-- mot duong nhap lieu thu hai — va no la duong khong ai kiem, vi nguoi kiem
-- chinh la nguoi go.
ALTER TABLE "TransportDriverWaitingAllowance"
  ADD CONSTRAINT "TransportDriverWaitingAllowance_amount_range"
  CHECK (
    "candidateAmount" > 0
    AND "candidateAmount" <= 1000000000
    AND ("approvedAmount" IS NULL
         OR ("approvedAmount" > 0 AND "approvedAmount" <= "candidateAmount"))
  );

-- MOT DE NGHI DA QUYET PHAI QUYET DAY DU. Bon truong di cung nhau hoac khong
-- cai nao co mat: gio quyet, nguoi quyet, khoa chong ghi trung, va trang thai.
--
-- Va `approvedAmount` chi ton tai o dung mot trang thai. Mot hang `REJECTED`
-- mang mot so tien la mot khoan da bi tu choi van doc ra duoc mot con so — va
-- lan doc bat can dau tien se tra no vao luong.
ALTER TABLE "TransportDriverWaitingAllowance"
  ADD CONSTRAINT "TransportDriverWaitingAllowance_decision_shape"
  CHECK (
    ("status" = 'PENDING'
      AND "decidedAt" IS NULL AND "decidedBy" IS NULL
      AND "decisionIdempotencyKey" IS NULL AND "approvedAmount" IS NULL)
    OR ("status" = 'REJECTED'
      AND "decidedAt" IS NOT NULL AND "decidedBy" IS NOT NULL
      AND "decisionIdempotencyKey" IS NOT NULL AND "approvedAmount" IS NULL)
    OR ("status" = 'APPROVED'
      AND "decidedAt" IS NOT NULL AND "decidedBy" IS NOT NULL
      AND "decisionIdempotencyKey" IS NOT NULL AND "approvedAmount" IS NOT NULL)
  );

-- Mot de nghi khong co ly do la mot con so khong ai giai thich duoc, va no la
-- can cu cua mot khoan tien.
ALTER TABLE "TransportDriverWaitingAllowance"
  ADD CONSTRAINT "TransportDriverWaitingAllowance_reason_not_blank"
  CHECK (btrim("reason") <> '');

ALTER TABLE "TransportDriverWaitingAllowance"
  ADD CONSTRAINT "TransportDriverWaitingAllowance_businessDate_iso"
  CHECK ("businessDate" ~ '^\d{4}-\d{2}-\d{2}$');

-- Khoa chong ghi trung RONG lam chinh no vo hieu: moi lan quyet se dung chung
-- mot khoa, nen lan bam thu hai cua MOT NGUOI se dung phai lan bam cua nguoi
-- khac — va bi tra ve nham ket qua.
ALTER TABLE "TransportDriverWaitingAllowance"
  ADD CONSTRAINT "TransportDriverWaitingAllowance_decisionKey_not_blank"
  CHECK ("decisionIdempotencyKey" IS NULL OR btrim("decisionIdempotencyKey") <> '');

-- ===========================================================================
-- TRIGGER — MOT DE NGHI CO DUNG MOT LAN CHUYEN TRANG THAI.
--
-- `PENDING -> APPROVED` hoac `PENDING -> REJECTED`, va khong gi khac. Doi y ve
-- sau la mot de nghi MOI tren cung phien cho — `#279` O6 doi
-- *"rejected/corrected history preserved"*, va mot hang ghi de duoc thi lich su
-- do khong con.
--
-- Chin truong bi khoa cung. `#279` O6 doi *"approving user cannot rewrite
-- WaitingSession timestamps"*; o day dieu do duoc dat rong hon mot buoc — nguoi
-- duyet cung khong sua duoc CON SO DE NGHI ma ho dang duyet. Neu sua duoc thi
-- cong duyet chi con la mot o nhap lieu thu hai.
--
-- `updatedAt` co y KHONG nam trong danh sach khoa: Prisma tu dat no o moi lan
-- ghi, va khoa no lai se lam chinh lan quyet hop le that bai.
-- ===========================================================================
CREATE OR REPLACE FUNCTION "transport_waiting_allowance_immutable"()
RETURNS TRIGGER AS $$
BEGIN
  IF TG_OP = 'DELETE' THEN
    RAISE EXCEPTION
      'transport_waiting_allowance_immutable: khong xoa duoc mot de nghi phu cap da ghi';
  END IF;

  IF OLD."status" <> 'PENDING' THEN
    RAISE EXCEPTION
      'transport_waiting_allowance_immutable: de nghi da duoc quyet, khong sua duoc nua';
  END IF;

  IF NEW."status" = 'PENDING' THEN
    RAISE EXCEPTION
      'transport_waiting_allowance_immutable: mot de nghi chi di duoc tu PENDING sang APPROVED hoac REJECTED';
  END IF;

  IF NEW."id" <> OLD."id"
     OR NEW."waitingSessionId" <> OLD."waitingSessionId"
     OR NEW."driverId" <> OLD."driverId"
     OR NEW."currencyCode" <> OLD."currencyCode"
     OR NEW."candidateAmount" <> OLD."candidateAmount"
     OR NEW."reason" <> OLD."reason"
     OR NEW."proposedBy" <> OLD."proposedBy"
     OR NEW."proposedAt" <> OLD."proposedAt"
     OR NEW."businessDate" <> OLD."businessDate"
     OR NEW."createdAt" <> OLD."createdAt"
  THEN
    RAISE EXCEPTION
      'transport_waiting_allowance_immutable: chi duoc ghi phan QUYET DINH, khong sua duoc phan DE NGHI';
  END IF;

  RETURN NEW;
END;
$$ LANGUAGE plpgsql;

CREATE TRIGGER "transport_waiting_allowance_immutable"
  BEFORE UPDATE OR DELETE ON "TransportDriverWaitingAllowance"
  FOR EACH ROW EXECUTE FUNCTION "transport_waiting_allowance_immutable"();
