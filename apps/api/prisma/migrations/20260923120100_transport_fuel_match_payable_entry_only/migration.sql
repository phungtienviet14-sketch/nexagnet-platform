-- ===========================================================================
-- `#371` — CONG NO CAY XANG CHI DEN TU PHIEU GHI NO (`SUPPLIER_ACCOUNT`).
-- ===========================================================================
--
-- `DRIVER_CASH` nghia la lai xe DA TRA cay xang; lan tra do da vao Quy lai xe (`TX-03` cho phieu
-- chuyen v1, `RUN_EXPENSE` cho phieu Run-first — `#369` R-4). Mot cap khop giua bang ke cong no va
-- phieu do dua CUNG lan do dau vao ban giao cong no nha cung cap: tra hai lan.
--
-- Tang mien chan truoc, ba lop (`fuel-payable.ts`):
--   · `fuel-matching.ts` khong de nghi cap khop toi phieu khong ghi no (-> `PAYMENT_METHOD_CONFLICT`);
--   · `resolveDiscrepancy` doc lai cach tra DUOI KHOA (hang doi soat, roi hang phieu `FOR UPDATE`);
--   · `closeReconciliation` tu choi dong mot ky mang cap khop nhu vay (du lieu cu).
--
-- Hai trigger duoi day la LUOI CUOI cho moi duong ghi KHONG di qua tang mien — cung vai voi `INV-26`
-- (`TransportFuelMatch_no_self_source`). HAI chieu, vi bat bien so hai cot o HAI BANG:
--
--   1. ghi / sua mot cap khop       -> phieu cua no phai la `SUPPLIER_ACCOUNT`;
--   2. sua cach tra cua mot phieu   -> phieu dang co cap khop khong roi khoi `SUPPLIER_ACCOUNT`.
--
-- Thieu (2) thi (1) chi chan luc GHI CAP KHOP: mot `UPDATE` cach tra sau do tao lai dung hinh dang tra
-- hai lan ma khong cham bang cap khop nao.
--
-- HAI TRIGGER KHONG THAY DUOC KHOA HANG PHIEU O TANG KHO. Duoi `READ COMMITTED` moi trigger chi thay
-- du lieu da commit, nen mot cap khop dang ghi va mot lenh sua cach tra dang do dang lot qua CA HAI
-- (ghi-lech). `resolveDiscrepancy` khoa hang phieu roi moi doc — chinh khoa do xep hai lenh thanh
-- hang doi (do tren Postgres that o `transport-fuel-payment-method-conflict.int.spec.ts`).
--
-- KHONG KIEM LAI DU LIEU CU: trigger chi chay tren lan ghi MOI. Cap khop tien mat da ghi truoc `#371`
-- van nam do, va `closeReconciliation` tu choi dong ky mang no (`RECONCILIATION_HAS_CASH_PAID_MATCH`)
-- cho toi khi chay lai so khop (cap `AUTO`) hoac sua du lieu (cap `MANUAL`). Dem truoc khi trien khai:
--
--   SELECT m."reconciliationId", m."origin", count(*)
--   FROM "TransportFuelMatch" m
--   JOIN "TransportFuelEntry" e ON e."id" = m."fuelEntryId"
--   WHERE e."paymentMethod" <> 'SUPPLIER_ACCOUNT'
--   GROUP BY 1, 2;

CREATE OR REPLACE FUNCTION transport_fuel_match_payable_entry_only() RETURNS trigger AS $$
DECLARE
  entry_payment_method TEXT;
BEGIN
  SELECT "paymentMethod"::text INTO entry_payment_method
  FROM "TransportFuelEntry" WHERE "id" = NEW."fuelEntryId";

  -- Khong thay phieu: khoa ngoai `TransportFuelMatch_fuelEntryId_fkey` tu choi, voi dung ten cua no.
  IF FOUND AND entry_payment_method <> 'SUPPLIER_ACCOUNT' THEN
    RAISE EXCEPTION
      'TransportFuelMatch_payable_entry_only: phieu % tra bang % — khong phai cong no cay xang, khong khop voi bang ke',
      NEW."fuelEntryId", entry_payment_method
      USING ERRCODE = 'integrity_constraint_violation';
  END IF;

  RETURN NEW;
END;
$$ LANGUAGE plpgsql;

CREATE TRIGGER "TransportFuelMatch_payable_entry_only"
  BEFORE INSERT OR UPDATE ON "TransportFuelMatch"
  FOR EACH ROW EXECUTE FUNCTION transport_fuel_match_payable_entry_only();

-- Chieu nguoc. `UPDATE OF "paymentMethod"`: lenh sua phieu (`amendEntry`) luon ghi cot nay, nen
-- trigger chay o moi lan sua — mot lan tra cuu theo unique `TransportFuelMatch_fuelEntryId_key`.
CREATE OR REPLACE FUNCTION transport_fuel_entry_matched_stays_payable() RETURNS trigger AS $$
BEGIN
  IF NEW."paymentMethod" <> 'SUPPLIER_ACCOUNT'
     AND EXISTS (SELECT 1 FROM "TransportFuelMatch" WHERE "fuelEntryId" = NEW."id") THEN
    RAISE EXCEPTION
      'TransportFuelEntry_matched_stays_payable: phieu % dang co cap khop bang ke — khong doi cach tra sang %',
      NEW."id", NEW."paymentMethod"
      USING ERRCODE = 'integrity_constraint_violation';
  END IF;

  RETURN NEW;
END;
$$ LANGUAGE plpgsql;

CREATE TRIGGER "TransportFuelEntry_matched_stays_payable"
  BEFORE UPDATE OF "paymentMethod" ON "TransportFuelEntry"
  FOR EACH ROW EXECUTE FUNCTION transport_fuel_entry_matched_stays_payable();
