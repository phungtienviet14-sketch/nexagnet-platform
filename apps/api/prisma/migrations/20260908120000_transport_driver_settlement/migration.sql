-- ===========================================================================
-- TX-07b DRIVER SETTLEMENT (Lane D, Issue #237)
--
-- BEN CHI cua tien lai xe. R0 (`docs/kien-truc/transport-domain-v2.md` §1.4) do
-- dung mot dong con thieu: *"Chi tra / Disbursement — CHUA CO. `paidAt`/`paidBy`
-- la hai cot tren phieu, khong phai mot lan chi co the phan bo"*.
--
-- KHONG mot bang co san nao bi sua cau truc. Dung MOT rang buoc cu bi viet lai
-- (`TransportDriverFundEntry_sign_by_kind`), va chi de NHAN THEM mot loai but
-- toan — khong hang nao dang co tro thanh khong hop le.
-- ===========================================================================

-- CreateEnum
CREATE TYPE "TransportDriverCashoutKind" AS ENUM ('ORIGINAL', 'REVERSAL');

-- CreateEnum
CREATE TYPE "TransportDriverCashoutStatus" AS ENUM ('POSTED', 'REVERSED');

-- CreateEnum
CREATE TYPE "TransportDriverCashoutAllocationSource" AS ENUM ('WAGE', 'REIMBURSEMENT');

-- CreateTable
CREATE TABLE "TransportDriverCashout" (
    "id" TEXT NOT NULL,
    "driverId" TEXT NOT NULL,
    "kind" "TransportDriverCashoutKind" NOT NULL DEFAULT 'ORIGINAL',
    "status" "TransportDriverCashoutStatus" NOT NULL DEFAULT 'POSTED',
    "businessDate" VARCHAR(10) NOT NULL,
    "currencyCode" VARCHAR(3) NOT NULL DEFAULT 'VND',
    "method" VARCHAR(40) NOT NULL,
    "reference" TEXT,
    "reversesId" TEXT,
    "reversalReason" TEXT,
    "note" TEXT,
    "correlationKey" TEXT NOT NULL,
    "recordedBy" TEXT NOT NULL,
    "createdAt" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,

    CONSTRAINT "TransportDriverCashout_pkey" PRIMARY KEY ("id")
);

-- CreateTable
CREATE TABLE "TransportDriverCashoutAllocation" (
    "id" TEXT NOT NULL,
    "cashoutId" TEXT NOT NULL,
    "source" "TransportDriverCashoutAllocationSource" NOT NULL,
    "amount" BIGINT NOT NULL,
    "payslipId" TEXT,
    "driverFundEntryId" TEXT,
    "note" TEXT,
    "createdAt" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,

    CONSTRAINT "TransportDriverCashoutAllocation_pkey" PRIMARY KEY ("id")
);

-- CreateIndex
CREATE UNIQUE INDEX "TransportDriverCashout_reversesId_key" ON "TransportDriverCashout"("reversesId");

-- CreateIndex
CREATE UNIQUE INDEX "TransportDriverCashout_correlationKey_key" ON "TransportDriverCashout"("correlationKey");

-- CreateIndex
CREATE INDEX "TransportDriverCashout_driverId_businessDate_idx" ON "TransportDriverCashout"("driverId", "businessDate");

-- CreateIndex
CREATE INDEX "TransportDriverCashout_driverId_status_idx" ON "TransportDriverCashout"("driverId", "status");

-- CreateIndex
CREATE UNIQUE INDEX "TransportDriverCashoutAllocation_driverFundEntryId_key" ON "TransportDriverCashoutAllocation"("driverFundEntryId");

-- CreateIndex
CREATE INDEX "TransportDriverCashoutAllocation_cashoutId_idx" ON "TransportDriverCashoutAllocation"("cashoutId");

-- CreateIndex
CREATE INDEX "TransportDriverCashoutAllocation_payslipId_idx" ON "TransportDriverCashoutAllocation"("payslipId");

-- CreateIndex
CREATE INDEX "TransportDriverCashoutAllocation_source_idx" ON "TransportDriverCashoutAllocation"("source");

-- AddForeignKey
ALTER TABLE "TransportDriverCashout" ADD CONSTRAINT "TransportDriverCashout_driverId_fkey" FOREIGN KEY ("driverId") REFERENCES "TransportDriver"("id") ON DELETE RESTRICT ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "TransportDriverCashout" ADD CONSTRAINT "TransportDriverCashout_reversesId_fkey" FOREIGN KEY ("reversesId") REFERENCES "TransportDriverCashout"("id") ON DELETE RESTRICT ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "TransportDriverCashoutAllocation" ADD CONSTRAINT "TransportDriverCashoutAllocation_cashoutId_fkey" FOREIGN KEY ("cashoutId") REFERENCES "TransportDriverCashout"("id") ON DELETE RESTRICT ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "TransportDriverCashoutAllocation" ADD CONSTRAINT "TransportDriverCashoutAllocation_payslipId_fkey" FOREIGN KEY ("payslipId") REFERENCES "TransportPayslip"("id") ON DELETE RESTRICT ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "TransportDriverCashoutAllocation" ADD CONSTRAINT "TransportDriverCashoutAllocation_driverFundEntryId_fkey" FOREIGN KEY ("driverFundEntryId") REFERENCES "TransportDriverFundEntry"("id") ON DELETE RESTRICT ON UPDATE CASCADE;

-- ---------------------------------------------------------------------------
-- SO QUY NHAN THEM MOT LOAI BUT TOAN — `REIMBURSEMENT`, luon DUONG.
--
-- Rang buoc cu liet ke nam loai va tu choi moi thu khac, nen mot but toan hoan
-- ung se bi chan neu khong viet lai no. Bieu thuc moi CONG THEM mot ve; nam ve
-- cu giu nguyen tung chu, nen khong hang nao dang co tro thanh khong hop le va
-- lan kiem lai khi them rang buoc khong the that bai vi du lieu.
--
-- Huong dau: cong ty tra tien cho lai xe => so du di LEN, ve gan 0 tu phia am.
-- Doi dau o day se bien mot lan hoan ung thanh mot lan lai xe nhan them no.
-- ---------------------------------------------------------------------------

ALTER TABLE "TransportDriverFundEntry"
  DROP CONSTRAINT "TransportDriverFundEntry_sign_by_kind";

ALTER TABLE "TransportDriverFundEntry"
  ADD CONSTRAINT "TransportDriverFundEntry_sign_by_kind"
  CHECK (
    ("kind" = 'ADVANCE' AND "signedAmount" > 0)
    OR ("kind" = 'RETURN' AND "signedAmount" < 0)
    OR ("kind" = 'TRIP_EXPENSE' AND "signedAmount" < 0)
    OR ("kind" = 'ADJUSTMENT' AND "signedAmount" <> 0)
    OR ("kind" = 'REVERSAL' AND "signedAmount" <> 0)
    OR ("kind" = 'REIMBURSEMENT' AND "signedAmount" > 0)
  );

-- ---------------------------------------------------------------------------
-- NGAY NGHIEP VU la mot CHUOI 10 KY TU dang `YYYY-MM-DD` (`INV-25`).
--
-- Khong ep sang kieu ngay — cung ly le da ghi o T3/T4/T6: mot chuoi khong hop
-- le se lam ca lenh `INSERT` nem loi kieu thay vi vi pham rang buoc CO TEN, va
-- thong bao nhan duoc khi do khong noi duoc hang nao sai o cot nao.
-- ---------------------------------------------------------------------------

ALTER TABLE "TransportDriverCashout"
  ADD CONSTRAINT "TransportDriverCashout_businessDate_iso"
  CHECK ("businessDate" ~ '^[0-9]{4}-[0-9]{2}-[0-9]{2}$');

-- Hinh thuc chi la thu se hien len bang doi soat. Mot chuoi rong o do khong noi
-- gi, va no khong bao gio duoc go vao co y — no den tu mot bieu mau khong kiem.
ALTER TABLE "TransportDriverCashout"
  ADD CONSTRAINT "TransportDriverCashout_method_not_blank"
  CHECK (btrim("method") <> '');

-- ---------------------------------------------------------------------------
-- MOT PHIEU DAO PHAI TRO TOI BAN GOC VA PHAI CO LY DO.
--
-- Thieu ve dau: mot hang `REVERSAL` khong dao cai gi ca — mot khoan tien am
-- tren so cua lai xe khong co doi ung. Thieu ve sau: mot lan dao khong ly do,
-- tuc dung thu ma nguoi doi soat can doc nhat khi ho hoi "vi sao thang truoc
-- khac".
-- ---------------------------------------------------------------------------

ALTER TABLE "TransportDriverCashout"
  ADD CONSTRAINT "TransportDriverCashout_reversal_shape"
  CHECK (
    (("kind" = 'REVERSAL') = ("reversesId" IS NOT NULL))
    AND (("kind" = 'REVERSAL') = ("reversalReason" IS NOT NULL))
  );

ALTER TABLE "TransportDriverCashout"
  ADD CONSTRAINT "TransportDriverCashout_no_self_reversal"
  CHECK ("reversesId" IS NULL OR "reversesId" <> "id");

-- ---------------------------------------------------------------------------
-- KHOANG TIEN — khop `money()` cua mien, va KHAC 0.
--
-- Mot dong phan bo 0 dong khong noi gi ve the gioi va lam moi bao cao "so lan
-- rut" dem thua — cung cau chu da viet o `TransportDriverFundEntry`.
-- ---------------------------------------------------------------------------

ALTER TABLE "TransportDriverCashoutAllocation"
  ADD CONSTRAINT "TransportDriverCashoutAllocation_money_range"
  CHECK ("amount" <> 0 AND "amount" BETWEEN -9007199254740991 AND 9007199254740991);

-- ---------------------------------------------------------------------------
-- HAI NGUON, HAI HINH DANG — `#237`: *"provenance stays separate"*.
--
-- Mot dong `WAGE` phai noi duoc THANG nao (phieu luong nao); mot dong
-- `REIMBURSEMENT` phai noi duoc BUT TOAN QUY nao da dua so du ve. Cho phep mot
-- dong `WAGE` khong co phieu luong se lam "da rut tu thang nao" mat dap an, va
-- cho phep mot dong hoan ung khong co but toan quy se lam cong ty tra mot lan
-- nua o ky sau — vi so quy chua he biet minh da duoc tra.
-- ---------------------------------------------------------------------------

ALTER TABLE "TransportDriverCashoutAllocation"
  ADD CONSTRAINT "TransportDriverCashoutAllocation_source_shape"
  CHECK (
    (("source" = 'WAGE') = ("payslipId" IS NOT NULL))
    AND (("source" = 'REIMBURSEMENT') = ("driverFundEntryId" IS NOT NULL))
  );

-- ===========================================================================
-- TRIGGER — MOT LAN CHI DA GHI LA BAT BIEN (`INV-20`).
--
-- `CHECK` khong lam duoc viec nay: no chi nhin duoc hang MOI, con cau hoi o day
-- la "hang CU dang mang gi". Chi trigger doc duoc `OLD`.
--
-- Cai duoc bao ve: so tien, ngay, hinh thuc, nguoi ghi va ca khoa chong ghi
-- trung cua mot phieu da ton tai khong bao gio doi. `status` doi duoc, va CHI
-- theo mot canh: `POSTED -> REVERSED`. Khong co duong quay lai — mot phieu da
-- dao ma "khong dao nua" la viet lai lich su tien mat.
-- ===========================================================================

CREATE OR REPLACE FUNCTION "transport_driver_cashout_immutable"()
RETURNS TRIGGER AS $$
BEGIN
  IF NEW."id" IS DISTINCT FROM OLD."id"
     OR NEW."driverId" IS DISTINCT FROM OLD."driverId"
     OR NEW."kind" IS DISTINCT FROM OLD."kind"
     OR NEW."businessDate" IS DISTINCT FROM OLD."businessDate"
     OR NEW."currencyCode" IS DISTINCT FROM OLD."currencyCode"
     OR NEW."method" IS DISTINCT FROM OLD."method"
     OR NEW."reference" IS DISTINCT FROM OLD."reference"
     OR NEW."reversesId" IS DISTINCT FROM OLD."reversesId"
     OR NEW."reversalReason" IS DISTINCT FROM OLD."reversalReason"
     OR NEW."correlationKey" IS DISTINCT FROM OLD."correlationKey"
     OR NEW."recordedBy" IS DISTINCT FROM OLD."recordedBy"
     OR NEW."createdAt" IS DISTINCT FROM OLD."createdAt"
  THEN
    RAISE EXCEPTION
      'transport_driver_cashout_immutable: mot lan chi da ghi khong sua duoc, dung mot phieu dao';
  END IF;

  IF NEW."status" IS DISTINCT FROM OLD."status"
     AND NOT (OLD."status" = 'POSTED' AND NEW."status" = 'REVERSED')
  THEN
    RAISE EXCEPTION
      'transport_driver_cashout_immutable: trang thai lan chi chi di duoc mot chieu POSTED -> REVERSED';
  END IF;

  RETURN NEW;
END;
$$ LANGUAGE plpgsql;

CREATE TRIGGER "transport_driver_cashout_immutable"
  BEFORE UPDATE ON "TransportDriverCashout"
  FOR EACH ROW EXECUTE FUNCTION "transport_driver_cashout_immutable"();

-- ===========================================================================
-- TRIGGER — DONG PHAN BO KHONG SUA, KHONG XOA.
--
-- Cung khuon `transport_payslip_component_frozen` cua `TX-07`, va o day no dat
-- hon: mot dong phan bo la CAU TRA LOI cho "lan chi nay lay tu thang nao". Sua
-- duoc no nghia la doi duoc nguon goc cua mot khoan tien da tra ma khong de lai
-- dau vet — va lan doi soat sau se doc ra mot su that khac han su that da bao.
--
-- Sua bang cach GHI THEM: mot phieu `REVERSAL` mang cac dong am doi dau.
-- ===========================================================================

CREATE OR REPLACE FUNCTION "transport_driver_cashout_allocation_frozen"()
RETURNS TRIGGER AS $$
BEGIN
  RAISE EXCEPTION
    'transport_driver_cashout_allocation_frozen: dong phan bo khong sua/xoa duoc, dung mot phieu dao';
END;
$$ LANGUAGE plpgsql;

CREATE TRIGGER "transport_driver_cashout_allocation_frozen"
  BEFORE UPDATE OR DELETE ON "TransportDriverCashoutAllocation"
  FOR EACH ROW EXECUTE FUNCTION "transport_driver_cashout_allocation_frozen"();
