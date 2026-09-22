-- `#364` — FUEL EVENT RUN-FIRST: phieu do dau thoi can chuyen v1; ngu canh van hanh tuy chon;
-- phan bo gia thanh la mot lop RIENG. Quyet dinh nguon: `OWNER_DECISIONS_2026_09_22` (`#327`, `#364`).
--
-- ---------------------------------------------------------------------------
-- MOT CHIEU, KHONG XOA HANG NAO, KHONG VIET LAI HANG NAO. Lan di nay chi:
--   · bo `NOT NULL` cua `TransportFuelEntry.tripId` (moi phieu dang co VAN co `tripId`);
--   · them HAI cot NULL duoc (`runId`, `legId`) — KHONG backfill: moi phieu cu giu dung ngu canh
--     chuyen v1 cua no, khong doan vong chay/chang tu `TransportTripRunLegLink`;
--   · them mot bang MOI (`TransportFuelCostAttribution`) va hai enum cua no;
--   · them `CHECK` va trigger cho nhung bat bien Prisma khong khai duoc.
-- Moi hang dang co deu hop le ngay sau lan di: ba `CHECK` moi deu dung voi (`tripId` co, `runId`/
-- `legId` NULL), trigger chi kiem hang DUOC GHI sau thoi diem nay, va bang moi rong. Duong lui o
-- `README-rollback.sql` cung thu muc.
--
-- PHAN 1 duoc SINH RA boi `prisma migrate diff` (tu mot DB dung bang chuoi migration cua `main`), roi
-- GO BO moi cau KHONG thuoc `#364` — lenh diff keo theo do lech co san cua bang khac
-- (`DealerPriceOverride`, `User`, `TransportTrackingSession`, doi ten index `TransportCustomer*`).
-- `transport-fuel-run-first-storage.spec.ts` khoa lai: moi doi tuong o day deu la `TransportFuel*`.
-- PHAN 2/3 thi nguoc lai: Prisma khong co cu phap cho `CHECK` hay trigger.

-- ===========================================================================
-- PHAN 1 — DDL SINH RA TU `schema.prisma`
-- ===========================================================================

-- CreateEnum
CREATE TYPE "TransportFuelCostTargetKind" AS ENUM ('RUN', 'LEG');

-- CreateEnum
CREATE TYPE "TransportFuelCostAttributionKind" AS ENUM ('ALLOCATION', 'REVERSAL');

-- AlterTable
-- Khoa ngoai `TransportFuelEntry_tripId_fkey` KHONG bi dong toi: no van `ON DELETE RESTRICT` nhu
-- migration goc (`schema.prisma` khai `onDelete: Restrict` tuong minh chinh vi dieu nay).
ALTER TABLE "TransportFuelEntry" ADD COLUMN     "legId" TEXT,
ADD COLUMN     "runId" TEXT,
ALTER COLUMN "tripId" DROP NOT NULL;

-- CreateTable
CREATE TABLE "TransportFuelCostAttribution" (
    "id" TEXT NOT NULL,
    "fuelEntryId" TEXT NOT NULL,
    "kind" "TransportFuelCostAttributionKind" NOT NULL,
    "targetKind" "TransportFuelCostTargetKind" NOT NULL,
    "runId" TEXT NOT NULL,
    "legId" TEXT,
    "signedAmount" BIGINT NOT NULL,
    "currencyCode" VARCHAR(3) NOT NULL DEFAULT 'VND',
    "reversalOfId" TEXT,
    "correlationKey" TEXT NOT NULL,
    "note" TEXT,
    "recordedBy" TEXT NOT NULL,
    "createdAt" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,

    CONSTRAINT "TransportFuelCostAttribution_pkey" PRIMARY KEY ("id")
);

-- CreateIndex
CREATE UNIQUE INDEX "TransportFuelCostAttribution_reversalOfId_key" ON "TransportFuelCostAttribution"("reversalOfId");

-- CreateIndex
CREATE UNIQUE INDEX "TransportFuelCostAttribution_correlationKey_key" ON "TransportFuelCostAttribution"("correlationKey");

-- CreateIndex
CREATE INDEX "TransportFuelCostAttribution_fuelEntryId_idx" ON "TransportFuelCostAttribution"("fuelEntryId");

-- CreateIndex
CREATE INDEX "TransportFuelCostAttribution_runId_idx" ON "TransportFuelCostAttribution"("runId");

-- CreateIndex
CREATE INDEX "TransportFuelCostAttribution_legId_idx" ON "TransportFuelCostAttribution"("legId");

-- CreateIndex
CREATE INDEX "TransportFuelEntry_runId_idx" ON "TransportFuelEntry"("runId");

-- CreateIndex
CREATE INDEX "TransportFuelEntry_legId_idx" ON "TransportFuelEntry"("legId");

-- AddForeignKey
ALTER TABLE "TransportFuelEntry" ADD CONSTRAINT "TransportFuelEntry_runId_fkey" FOREIGN KEY ("runId") REFERENCES "TransportVehicleRun"("id") ON DELETE RESTRICT ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "TransportFuelEntry" ADD CONSTRAINT "TransportFuelEntry_legId_fkey" FOREIGN KEY ("legId") REFERENCES "TransportRunLeg"("id") ON DELETE RESTRICT ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "TransportFuelCostAttribution" ADD CONSTRAINT "TransportFuelCostAttribution_fuelEntryId_fkey" FOREIGN KEY ("fuelEntryId") REFERENCES "TransportFuelEntry"("id") ON DELETE RESTRICT ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "TransportFuelCostAttribution" ADD CONSTRAINT "TransportFuelCostAttribution_runId_fkey" FOREIGN KEY ("runId") REFERENCES "TransportVehicleRun"("id") ON DELETE RESTRICT ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "TransportFuelCostAttribution" ADD CONSTRAINT "TransportFuelCostAttribution_legId_fkey" FOREIGN KEY ("legId") REFERENCES "TransportRunLeg"("id") ON DELETE RESTRICT ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "TransportFuelCostAttribution" ADD CONSTRAINT "TransportFuelCostAttribution_reversalOfId_fkey" FOREIGN KEY ("reversalOfId") REFERENCES "TransportFuelCostAttribution"("id") ON DELETE RESTRICT ON UPDATE CASCADE;

-- ===========================================================================
-- PHAN 2 — SU KIEN DO DAU: XE LA GOC, NGU CANH LA TUY CHON
-- ===========================================================================

-- Co chang thi phai co vong chay. Chang khong co vong chay la mot chang mo coi — khong ai biet no
-- thuoc xe nao, va trigger duoi day khong con gi de so.
ALTER TABLE "TransportFuelEntry"
  ADD CONSTRAINT "TransportFuelEntry_leg_needs_run"
  CHECK ("legId" IS NULL OR "runId" IS NOT NULL);

-- Chuyen v1 HOAC vong chay v2 — khong ca hai. Hai ngu canh tren mot phieu co the MAU THUAN (chuyen
-- cua xe A, vong chay cua xe B) va luc do khong duong doc nao biet cai nao noi that. Cung ky thuat
-- voi `TransportTrackingSession_one_subject` (`#327`), nhung `<= 1` chu khong `= 1`: mot phieu KHONG
-- ngu canh van la mot su kien cua xe hop le o tang du lieu — tang mien moi la noi quyet ai duoc khai
-- no (`FUEL_ENTRY_CONTEXT_REQUIRED`).
ALTER TABLE "TransportFuelEntry"
  ADD CONSTRAINT "TransportFuelEntry_one_context_kind"
  CHECK (num_nonnulls("tripId", "runId") <= 1);

-- TIEN MAT LAI XE UNG chi tren chuyen v1. `DRIVER_CASH` di vao Quy lai xe qua `TX-03`
-- (`TransportTripExpense.tripId` NOT NULL, `TransportTripExpense_fund_leg`), va chua co duong nao
-- ghi mot khoan chi quy khong gan chuyen. Cho mot phieu Run-first mang `DRIVER_CASH` se de lai mot
-- khoan lai xe da bo tui ma so quy khong bao gio thay — lai xe bi doi tra lai tien da tieu.
-- Phieu Run-first vi vay KHONG BAO GIO cham Quy lai xe.
ALTER TABLE "TransportFuelEntry"
  ADD CONSTRAINT "TransportFuelEntry_driver_cash_needs_trip"
  CHECK ("paymentMethod" <> 'DRIVER_CASH' OR "tripId" IS NOT NULL);

-- Vong chay phai la cua CHINH xe tren phieu; chang phai thuoc CHINH vong chay do. Hai dieu so hai
-- bang nen song trong trigger — cung ly do voi `transport_fuel_entry_station_supplier` (`#317`).
-- Tang mien kiem truoc (`FUEL_ENTRY_VEHICLE_NOT_RUN_VEHICLE`, `FUEL_ENTRY_LEG_NOT_IN_RUN`); trigger
-- la luoi cuoi cho moi lan ghi khong di qua tang mien.
CREATE OR REPLACE FUNCTION "transport_fuel_entry_run_context"()
RETURNS TRIGGER AS $$
DECLARE
  run_vehicle TEXT;
  leg_run TEXT;
BEGIN
  IF NEW."runId" IS NOT NULL THEN
    SELECT "vehicleId" INTO run_vehicle
    FROM "TransportVehicleRun"
    WHERE "id" = NEW."runId";

    IF run_vehicle IS DISTINCT FROM NEW."vehicleId" THEN
      RAISE EXCEPTION
        'transport_fuel_entry_run_vehicle: vong chay % khong phai cua xe % tren phieu %',
        NEW."runId", NEW."vehicleId", NEW."id"
        USING ERRCODE = 'integrity_constraint_violation';
    END IF;
  END IF;

  IF NEW."legId" IS NOT NULL THEN
    SELECT "runId" INTO leg_run
    FROM "TransportRunLeg"
    WHERE "id" = NEW."legId";

    IF leg_run IS DISTINCT FROM NEW."runId" THEN
      RAISE EXCEPTION
        'transport_fuel_entry_leg_run: chang % khong thuoc vong chay % cua phieu %',
        NEW."legId", NEW."runId", NEW."id"
        USING ERRCODE = 'integrity_constraint_violation';
    END IF;
  END IF;

  RETURN NEW;
END;
$$ LANGUAGE plpgsql;

CREATE TRIGGER "transport_fuel_entry_run_context"
  BEFORE INSERT OR UPDATE OF "runId", "legId", "vehicleId" ON "TransportFuelEntry"
  FOR EACH ROW EXECUTE FUNCTION "transport_fuel_entry_run_context"();

-- ===========================================================================
-- PHAN 3 — PHAN BO GIA THANH: LOP RIENG, CHI GHI THEM, KHONG VUOT SO TIEN PHIEU
-- ===========================================================================

-- Dich `RUN` khong mang chang; dich `LEG` bat buoc mang chang (va `runId` cua chang do — trigger).
ALTER TABLE "TransportFuelCostAttribution"
  ADD CONSTRAINT "TransportFuelCostAttribution_target_shape"
  CHECK (
    ("targetKind" = 'RUN' AND "legId" IS NULL)
    OR ("targetKind" = 'LEG' AND "legId" IS NOT NULL)
  );

-- Cap phat: duong, khong tro dao. Dao: am, tro ve dung mot dong khac. Mot co `boolean` "da dao" se
-- buoc moi truy van tong phai nho loai tru no — cung ly le voi `TransportTripExpense.signedAmount`.
ALTER TABLE "TransportFuelCostAttribution"
  ADD CONSTRAINT "TransportFuelCostAttribution_kind_shape"
  CHECK (
    ("kind" = 'ALLOCATION' AND "signedAmount" > 0 AND "reversalOfId" IS NULL)
    OR ("kind" = 'REVERSAL' AND "signedAmount" < 0 AND "reversalOfId" IS NOT NULL
        AND "reversalOfId" <> "id")
  );

-- Khoang tien +-(2^53-1) — khop `money()`, cung bien voi `TransportFuelEntry_amount_money_range`.
ALTER TABLE "TransportFuelCostAttribution"
  ADD CONSTRAINT "TransportFuelCostAttribution_amount_money_range"
  CHECK ("signedAmount" >= -9007199254740991 AND "signedAmount" <= 9007199254740991);

-- BAT BIEN TRUNG TAM, chay TRONG giao dich ghi:
--
--   1. KHOA hang phieu (`FOR UPDATE`) truoc moi phep doc. Hai lan cap phat dong thoi cho CUNG mot
--      phieu vi vay XEP HANG tai day, va lan sau doc tong SAU khi lan truoc da commit — khong the
--      cung "thay con du" roi cung ghi. Ham `VOLATILE` + `READ COMMITTED`: moi cau lenh trong ham lay
--      anh chup MOI, nen phep cong o buoc 6 nhin thay dong vua commit cua ben kia.
--   2. Phieu gan CHUYEN v1 khong co dong nao o day: so cai phan bo cua no la `TransportTripExpense`
--      (`costExpenseId`). Mot phieu, mot so cai — khong the dem hai lan.
--   3. Chi phieu `VERIFIED` moi duoc CAP PHAT: so tien cua no khi do da bat bien (`GD-10`), nen tong
--      da phan bo khong the bi mot lan sua phieu ve sau lam vuot.
--   4. Cung tien te voi phieu — khong co phep doi ngoai te nao trong `transport`.
--   5. Vong chay dich la cua CHINH xe tren phieu; chang dich thuoc CHINH vong chay dich.
--   6. Dong dao phai dao DUNG mot cap phat cua CHINH phieu, cung dich, dung so tien.
--   7. `0 <= tong sau lan ghi nay <= so tien phieu`.
CREATE OR REPLACE FUNCTION "transport_fuel_cost_attribution_guard"()
RETURNS TRIGGER AS $$
DECLARE
  entry RECORD;
  run_vehicle TEXT;
  leg_run TEXT;
  reversed RECORD;
  attributed BIGINT;
BEGIN
  SELECT "id", "tripId", "vehicleId", "amount", "currencyCode", "verificationStatus"
  INTO entry
  FROM "TransportFuelEntry"
  WHERE "id" = NEW."fuelEntryId"
  FOR UPDATE;

  IF NOT FOUND THEN
    RAISE EXCEPTION
      'transport_fuel_cost_attribution_entry: phieu % khong ton tai',
      NEW."fuelEntryId"
      USING ERRCODE = 'integrity_constraint_violation';
  END IF;

  IF entry."tripId" IS NOT NULL THEN
    RAISE EXCEPTION
      'transport_fuel_cost_attribution_legacy_trip: phieu % gan chuyen v1 % — gia thanh cua no nam o TransportTripExpense',
      entry."id", entry."tripId"
      USING ERRCODE = 'integrity_constraint_violation';
  END IF;

  IF NEW."kind" = 'ALLOCATION' AND entry."verificationStatus" <> 'VERIFIED' THEN
    RAISE EXCEPTION
      'transport_fuel_cost_attribution_not_verified: phieu % dang % — chi phieu da duyet moi phan bo duoc',
      entry."id", entry."verificationStatus"
      USING ERRCODE = 'integrity_constraint_violation';
  END IF;

  IF NEW."currencyCode" IS DISTINCT FROM entry."currencyCode" THEN
    RAISE EXCEPTION
      'transport_fuel_cost_attribution_currency: phan bo % khac tien te % cua phieu %',
      NEW."currencyCode", entry."currencyCode", entry."id"
      USING ERRCODE = 'integrity_constraint_violation';
  END IF;

  SELECT "vehicleId" INTO run_vehicle
  FROM "TransportVehicleRun"
  WHERE "id" = NEW."runId";

  IF run_vehicle IS DISTINCT FROM entry."vehicleId" THEN
    RAISE EXCEPTION
      'transport_fuel_cost_attribution_target_vehicle: vong chay % khong phai cua xe % tren phieu %',
      NEW."runId", entry."vehicleId", entry."id"
      USING ERRCODE = 'integrity_constraint_violation';
  END IF;

  IF NEW."legId" IS NOT NULL THEN
    SELECT "runId" INTO leg_run
    FROM "TransportRunLeg"
    WHERE "id" = NEW."legId";

    IF leg_run IS DISTINCT FROM NEW."runId" THEN
      RAISE EXCEPTION
        'transport_fuel_cost_attribution_leg_run: chang % khong thuoc vong chay %',
        NEW."legId", NEW."runId"
        USING ERRCODE = 'integrity_constraint_violation';
    END IF;
  END IF;

  IF NEW."kind" = 'REVERSAL' THEN
    SELECT "fuelEntryId", "kind", "targetKind", "runId", "legId", "signedAmount"
    INTO reversed
    FROM "TransportFuelCostAttribution"
    WHERE "id" = NEW."reversalOfId";

    IF NOT FOUND
      OR reversed."kind" <> 'ALLOCATION'
      OR reversed."fuelEntryId" <> NEW."fuelEntryId"
      OR reversed."targetKind" <> NEW."targetKind"
      OR reversed."runId" <> NEW."runId"
      OR reversed."legId" IS DISTINCT FROM NEW."legId"
      OR reversed."signedAmount" <> -NEW."signedAmount" THEN
      RAISE EXCEPTION
        'transport_fuel_cost_attribution_reversal_shape: % khong dao duoc % — phai la mot cap phat cua cung phieu, cung dich, dung so tien',
        NEW."id", NEW."reversalOfId"
        USING ERRCODE = 'integrity_constraint_violation';
    END IF;
  END IF;

  SELECT COALESCE(SUM("signedAmount"), 0) INTO attributed
  FROM "TransportFuelCostAttribution"
  WHERE "fuelEntryId" = NEW."fuelEntryId";

  IF attributed + NEW."signedAmount" > entry."amount" OR attributed + NEW."signedAmount" < 0 THEN
    RAISE EXCEPTION
      'transport_fuel_cost_attribution_exceeds_entry: phieu % da phan bo %, them % se ra ngoai [0, %]',
      entry."id", attributed, NEW."signedAmount", entry."amount"
      USING ERRCODE = 'integrity_constraint_violation';
  END IF;

  RETURN NEW;
END;
$$ LANGUAGE plpgsql;

CREATE TRIGGER "transport_fuel_cost_attribution_guard"
  BEFORE INSERT ON "TransportFuelCostAttribution"
  FOR EACH ROW EXECUTE FUNCTION "transport_fuel_cost_attribution_guard"();

-- CHI GHI THEM: mot dong phan bo la lich su. Sua = them mot dong dao roi cap phat lai. Ca `UPDATE`
-- lan `DELETE` deu bi tu choi — ke ca qua mot khoa ngoai `ON DELETE CASCADE` (khong co cai nao, va
-- trigger nay la ly do se khong ai them). Cleanup cua bo kiem thu va reset demo tu tat trigger TRONG
-- mot giao dich (`deleteFuelCostAttributionsForTest`, `wipeFuelCostAttributions`).
CREATE OR REPLACE FUNCTION "transport_fuel_cost_attribution_append_only"()
RETURNS TRIGGER AS $$
BEGIN
  RAISE EXCEPTION
    'transport_fuel_cost_attribution_append_only: dong phan bo % la lich su — ghi mot dong dao, khong sua/xoa (#364)',
    OLD."id"
    USING ERRCODE = 'integrity_constraint_violation';
END;
$$ LANGUAGE plpgsql;

CREATE TRIGGER "transport_fuel_cost_attribution_append_only"
  BEFORE UPDATE OR DELETE ON "TransportFuelCostAttribution"
  FOR EACH ROW EXECUTE FUNCTION "transport_fuel_cost_attribution_append_only"();
