-- DUONG LUI cua `20260923120100_transport_fuel_match_payable_entry_only` va cua
-- `20260923120000_transport_fuel_discrepancy_payment_method_conflict_kind` (`#371`).
--
-- Chay TAY khi can quay ve hinh dang truoc `#371`. KHONG phai mot migration Prisma — de o day de
-- nguoi truc doc duoc trong luc su co, khong phai de chay tu dong.
--
-- ===========================================================================
-- DOC TRUOC KHI CHAY
--
-- 1. Go hai trigger KHONG dong vao du lieu nao — chung chi chan lan ghi MOI. Nhung go chung la mo lai
--    duong ghi cap khop toi phieu lai xe da tra tien mat cho moi duong ghi khong qua tang mien, va ban
--    ung dung CU (truoc `#371`) TU de nghi nhung cap do. Chi lui khi lui CA ban ung dung, va biet rang
--    duong tra hai lan mo lai tu luc do.
--
-- 2. Gia tri enum `PAYMENT_METHOD_CONFLICT` KHONG bo duoc: Postgres khong co
--    `ALTER TYPE ... DROP VALUE`, va tao lai kieu la mot thao tac khoa bang tren bang chenh lech dang co du lieu. Gia tri
--    thua nam lai la VO HAI voi CSDL — nhung ban ung dung CU doc mot HANG mang gia tri nay se nem
--    (client Prisma cu khong biet gia tri do). Dem truoc:
--
--      SELECT "status", count(*) FROM "TransportFuelDiscrepancy"
--      WHERE "kind" = 'PAYMENT_METHOD_CONFLICT' GROUP BY 1;
--
--    Chi co hang `PENDING` thi xoa duoc (lan chay so khop KE TIEP cua ban cu sinh lai chenh lech theo
--    luat cu). Co hang `RESOLVED` thi DUNG LAI: do la lich su quyet dinh chi-ghi-them
--    (`transport_fuel_discrepancy_decision_append_only`), khong xoa, va lui ban ung dung la sai huong —
--    duong dung la TIEN LEN.
--
-- Muc 2 bang 0 (hoac chi con `PENDING` da xoa) thi chay khoi duoi.
-- ===========================================================================

BEGIN;

DROP TRIGGER IF EXISTS "TransportFuelEntry_matched_stays_payable" ON "TransportFuelEntry";
DROP FUNCTION IF EXISTS transport_fuel_entry_matched_stays_payable();
DROP TRIGGER IF EXISTS "TransportFuelMatch_payable_entry_only" ON "TransportFuelMatch";
DROP FUNCTION IF EXISTS transport_fuel_match_payable_entry_only();

DELETE FROM "_prisma_migrations"
WHERE "migration_name" IN (
  '20260923120100_transport_fuel_match_payable_entry_only',
  '20260923120000_transport_fuel_discrepancy_payment_method_conflict_kind'
);

COMMIT;
