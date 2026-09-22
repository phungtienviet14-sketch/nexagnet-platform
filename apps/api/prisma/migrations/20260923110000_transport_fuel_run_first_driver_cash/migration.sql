-- `#369` R-4 — TIEN MAT LAI XE UNG TREN VONG CHAY: phieu dau Run-first `DRIVER_CASH` vao Quy lai xe
-- KHONG can chuyen v1 gia, va KHONG sinh mot so cai gia thanh thu hai.
--
-- ---------------------------------------------------------------------------
-- VI SAO KHONG "BO NOT NULL CUA `TransportTripExpense.tripId`"
--
-- `DRIVER_CASH` cua phieu chuyen v1 di qua `TX-03`: MOT su kien, HAI chan cung khoa (`INV-03`) — dong
-- gia thanh `TransportTripExpense` + but toan Quy `TRIP_EXPENSE`. Phieu Run-first da co so cai gia
-- thanh RIENG (`TransportFuelCostAttribution`, `#364`). Cho `TripExpense` mot dong khong chuyen se
-- lam cung mot khoan dau nam o HAI so cai gia thanh — dung dieu `#364` §3 dong lai o tang CSDL.
--
-- Nen o day chi co CHAN TIEN MAT: mot but toan Quy loai MOI `RUN_EXPENSE` (am), mang ngu canh vong
-- chay, noi nguoc tu phieu qua `TransportFuelEntry.driverFundEntryId` — doi xung `costExpenseId`.
--
--   phieu chuyen v1  + DRIVER_CASH -> TripExpense (gia thanh) + DriverFundEntry TRIP_EXPENSE (tien mat)
--   phieu Run-first  + DRIVER_CASH -> FuelCostAttribution (gia thanh, ke toan quyet)
--                                     + DriverFundEntry RUN_EXPENSE (tien mat, luc duyet)
--
-- KHOA SU KIEN `fuel:<id>` la MOT cho ca hai duong (`fuelCostCorrelationKey`), va unique
-- `TransportDriverFundEntry.correlationKey` vi vay giu "mot phieu, toi da MOT but toan Quy goc" o
-- CHINH so Quy — bat ke duong ghi nao.
--
-- Cong no nha cung cap (doi soat bang ke -> dong ky -> ban giao) KHONG doc bang nao duoc them/sua o
-- day, va cac bang o day khong co khoa ngoai nao toi bang cua no.
--
-- ---------------------------------------------------------------------------
-- MOT CHIEU, KHONG XOA HANG NAO, KHONG VIET LAI HANG NAO. Moi hang dang co hop le ngay sau lan di:
--   · but toan cu co `runId`/`legId` NULL — ba CHECK moi tren so Quy deu dung;
--   · phieu cu co `driverFundEntryId` NULL — CHECK va trigger moi tren phieu deu dung;
--   · `CHECK TransportFuelEntry_driver_cash_needs_trip` (`#364`) bi GO — go mot rang buoc khong the
--     lam mot hang tro thanh khong hop le.
-- Duong lui o `README-rollback.sql` cung thu muc.
--
-- PHAN 1 duoc SINH RA boi `prisma migrate diff` (tu mot DB dung bang chuoi migration cua `main`), roi
-- GO BO moi cau KHONG thuoc `#369` — lenh diff keo theo do lech co san cua bang khac
-- (`DealerPriceOverride`, `User`, `TransportTrackingSession`, doi ten index `TransportCustomer*`,
-- `TransportFuelCandidate`). `transport-fuel-run-first-driver-cash-storage.spec.ts` khoa lai: moi doi
-- tuong o day deu la `TransportDriverFund*` hoac `TransportFuel*`.

-- ===========================================================================
-- PHAN 1 — DDL SINH RA TU `schema.prisma`
-- ===========================================================================

-- AlterTable
ALTER TABLE "TransportDriverFundEntry" ADD COLUMN     "legId" TEXT,
ADD COLUMN     "runId" TEXT;

-- AlterTable
ALTER TABLE "TransportFuelEntry" ADD COLUMN     "driverFundEntryId" TEXT;

-- CreateIndex
CREATE INDEX "TransportDriverFundEntry_runId_idx" ON "TransportDriverFundEntry"("runId");

-- CreateIndex
CREATE INDEX "TransportDriverFundEntry_legId_idx" ON "TransportDriverFundEntry"("legId");

-- CreateIndex
CREATE UNIQUE INDEX "TransportFuelEntry_driverFundEntryId_key" ON "TransportFuelEntry"("driverFundEntryId");

-- AddForeignKey
ALTER TABLE "TransportDriverFundEntry" ADD CONSTRAINT "TransportDriverFundEntry_runId_fkey" FOREIGN KEY ("runId") REFERENCES "TransportVehicleRun"("id") ON DELETE RESTRICT ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "TransportDriverFundEntry" ADD CONSTRAINT "TransportDriverFundEntry_legId_fkey" FOREIGN KEY ("legId") REFERENCES "TransportRunLeg"("id") ON DELETE RESTRICT ON UPDATE CASCADE;

-- ===========================================================================
-- PHAN 2 — SO QUY LAI XE NHAN MOT LOAI BUT TOAN MOI: `RUN_EXPENSE`
-- ===========================================================================

-- DAU THEO LOAI — cong them MOT ve; sau ve cu giu nguyen tung chu, nen khong hang nao dang co tro thanh
-- khong hop le va lan kiem lai khi them rang buoc khong the that bai vi du lieu. `RUN_EXPENSE` AM:
-- lai xe tieu tien cua quy, so du di XUONG — y het `TRIP_EXPENSE`.
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
    OR ("kind" = 'RUN_EXPENSE' AND "signedAmount" < 0)
  );

-- CHUYEN v1 HOAC VONG CHAY, khong ca hai — cung ky thuat voi `TransportFuelEntry_one_context_kind`.
-- Hai ngu canh tren mot but toan co the MAU THUAN, va khi do khong duong doc nao biet cai nao that.
ALTER TABLE "TransportDriverFundEntry"
  ADD CONSTRAINT "TransportDriverFundEntry_one_context_kind"
  CHECK (num_nonnulls("tripId", "runId") <= 1);

-- Co chang thi phai co vong chay: mot chang mo coi khong noi duoc no thuoc vong chay nao.
ALTER TABLE "TransportDriverFundEntry"
  ADD CONSTRAINT "TransportDriverFundEntry_leg_needs_run"
  CHECK ("legId" IS NULL OR "runId" IS NOT NULL);

-- Mot khoan chi Run-first PHAI noi no thuoc vong chay nao — do la ca noi dung cua loai nay. Khong
-- vong chay thi no la mot `ADJUSTMENT` doi ten, va khong ai doi soat duoc no voi viec da chay.
ALTER TABLE "TransportDriverFundEntry"
  ADD CONSTRAINT "TransportDriverFundEntry_run_expense_shape"
  CHECK ("kind" <> 'RUN_EXPENSE' OR "runId" IS NOT NULL);

-- Chang phai thuoc CHINH vong chay cua but toan. So hai bang nen song trong trigger — cung ly do voi
-- `transport_fuel_entry_run_context` (`#364`). Tang mien kiem truoc (`RUN_EXPENSE_LEG_NOT_IN_RUN`);
-- trigger la luoi cuoi cho moi lan ghi khong di qua tang mien.
CREATE OR REPLACE FUNCTION "transport_driver_fund_entry_run_context"()
RETURNS TRIGGER AS $$
DECLARE
  leg_run TEXT;
BEGIN
  IF NEW."legId" IS NOT NULL THEN
    SELECT "runId" INTO leg_run
    FROM "TransportRunLeg"
    WHERE "id" = NEW."legId";

    IF leg_run IS DISTINCT FROM NEW."runId" THEN
      RAISE EXCEPTION
        'transport_driver_fund_entry_leg_run: chang % khong thuoc vong chay % cua but toan %',
        NEW."legId", NEW."runId", NEW."id"
        USING ERRCODE = 'integrity_constraint_violation';
    END IF;
  END IF;

  RETURN NEW;
END;
$$ LANGUAGE plpgsql;

CREATE TRIGGER "transport_driver_fund_entry_run_context"
  BEFORE INSERT OR UPDATE OF "runId", "legId" ON "TransportDriverFundEntry"
  FOR EACH ROW EXECUTE FUNCTION "transport_driver_fund_entry_run_context"();

-- ===========================================================================
-- PHAN 3 — PHIEU DAU RUN-FIRST NOI TOI CHAN QUY CUA NO
-- ===========================================================================

-- `#364` cam `DRIVER_CASH` tren phieu Run-first vi khi do CHUA CO duong ghi Quy khong chuyen. Duong do
-- ra doi o PHAN 2 — rang buoc nay thoi dung, va giu no lai la giu mot chuyen gia lam dieu kien.
ALTER TABLE "TransportFuelEntry"
  DROP CONSTRAINT "TransportFuelEntry_driver_cash_needs_trip";

-- MOT PHIEU, MOT CHAN QUY. Chan Quy RIENG (`driverFundEntryId`) chi co tren phieu Run-first
-- `DRIVER_CASH` da duyet. Phieu chuyen v1 da co chan Quy qua `TX-03` (`costExpenseId` ->
-- `TransportTripExpense.driverFundEntryId`), nen cho no mang them cot nay la hai lan tru quy cho mot
-- lan do dau. `tripId` bat bien sau khi ghi, nen hai `CHECK` (`cost_expense_needs_trip` va cai nay)
-- khong the cung dung tren mot hang: mot phieu co toi da MOT duong vao Quy.
ALTER TABLE "TransportFuelEntry"
  ADD CONSTRAINT "TransportFuelEntry_driver_fund_leg_shape"
  CHECK (
    "driverFundEntryId" IS NULL
    OR ("tripId" IS NULL AND "paymentMethod" = 'DRIVER_CASH' AND "verificationStatus" = 'VERIFIED')
  );

-- CHAN QUY PHAI DUNG LA CUA PHIEU NAY — khong chi "mot but toan nao do":
--
--   · loai `RUN_EXPENSE`, so tien `-amount` cua phieu, cung tien te, cung ngay nghiep vu;
--   · so Quy cua CHINH lai xe tren phieu (nguoi da bo tien mat);
--   · cung vong chay va cung chang voi ngu canh cua phieu;
--   · khoa `fuel:<id>` cua CHINH phieu — va vi khoa do UNIQUE trong so Quy, but toan nay la but toan
--     goc DUY NHAT so Quy tung ghi cho lan do dau nay.
--
-- Chay ca khi mot cot cua phieu ma but toan phu thuoc bi doi (mot `UPDATE` tay, mot script): phieu da
-- duyet thi bat bien (`GD-10`), nen o duong ghi that trigger chi chay luc GAN.
CREATE OR REPLACE FUNCTION "transport_fuel_entry_driver_fund_leg"()
RETURNS TRIGGER AS $$
DECLARE
  fund RECORD;
BEGIN
  IF NEW."driverFundEntryId" IS NULL THEN
    RETURN NEW;
  END IF;

  SELECT e."kind", e."signedAmount", e."currencyCode", e."businessDate", e."runId", e."legId",
         e."correlationKey", a."driverId"
  INTO fund
  FROM "TransportDriverFundEntry" e
  JOIN "TransportDriverFundAccount" a ON a."id" = e."accountId"
  WHERE e."id" = NEW."driverFundEntryId";

  IF NOT FOUND
    OR fund."kind" <> 'RUN_EXPENSE'
    OR fund."signedAmount" <> -NEW."amount"
    OR fund."currencyCode" IS DISTINCT FROM NEW."currencyCode"
    OR fund."businessDate" <> NEW."businessDate"
    OR fund."driverId" <> NEW."driverId"
    OR fund."runId" IS DISTINCT FROM NEW."runId"
    OR fund."legId" IS DISTINCT FROM NEW."legId"
    OR fund."correlationKey" <> 'fuel:' || NEW."id" THEN
    RAISE EXCEPTION
      'transport_fuel_entry_driver_fund_leg: but toan % khong phai chan Quy cua phieu % — phai la RUN_EXPENSE cua chinh lai xe, vong chay, so tien va khoa fuel:%',
      NEW."driverFundEntryId", NEW."id", NEW."id"
      USING ERRCODE = 'integrity_constraint_violation';
  END IF;

  RETURN NEW;
END;
$$ LANGUAGE plpgsql;

CREATE TRIGGER "transport_fuel_entry_driver_fund_leg"
  BEFORE INSERT OR UPDATE OF "driverFundEntryId", "amount", "currencyCode", "businessDate",
    "driverId", "runId", "legId" ON "TransportFuelEntry"
  FOR EACH ROW EXECUTE FUNCTION "transport_fuel_entry_driver_fund_leg"();
