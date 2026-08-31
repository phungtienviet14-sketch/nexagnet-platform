-- DUONG LUI cua `20260901000000_transport_settlement`.
--
-- Chay tay khi can quay ve hinh dang truoc migration. KHONG phai mot migration Prisma — de o day
-- de nguoi truc doc duoc trong luc su co, khong phai de chay tu dong.
--
-- ---------------------------------------------------------------------------
-- BUOC 0 — DEM TRUOC KHI QUYET.
--
-- Migration nay THUAN THEM MOI: khong sua mot cot nao cua bang da co, khong xoa mot hang nao. Nen
-- duong lui la go bay bang moi — va do la thu can can nhac, khong phai thu chay cho nhanh.
--
-- Bay bang nay giu CONG NO THAT: tien khach con no, tien cong ty con no cay xang, nha xe va doi
-- tac mang don. Go chung di la xoa so cong no, khong phai go mot tinh nang.
--
--   SELECT "direction", "flow", count(*) AS so_chung_tu, sum("signedAmount") AS tong
--   FROM "TransportSettlementDocument"
--   GROUP BY "direction", "flow"
--   ORDER BY 1, 2;
--
--   SELECT count(*) AS so_lan_tinh_hoa_hong FROM "TransportCommissionCalculation";
--   SELECT count(*) AS so_lan_phan_bo       FROM "TransportSettlementAllocation";
--
-- Neu bat cu con so nao khac 0 thi DUNG LAI. Xuat du lieu ra truoc (`COPY ... TO`), doi chieu voi
-- ke toan xem khoan nao da tra/da thu that, roi moi quyet. Khong co duong tu dong nao lam thay.
--
-- LUU Y RIENG ve `TransportCommissionCalculation`: no la ANH CHUP cua mot lan tinh hoa hong, va la
-- thu DUY NHAT tra loi duoc "vi sao doi tac nay duoc tra tung nay". Ban luat co the da doi nhieu
-- lan ke tu do, nen con so KHONG dung lai duoc tu bang luat. Mat bang nay la mat cau tra loi.
--
-- ---------------------------------------------------------------------------
-- BUOC 1 — go rang buoc viet tay, truoc de thu tu phu thuoc khong vuong.

ALTER TABLE "TransportSettlementPeriod"
  DROP CONSTRAINT IF EXISTS "TransportSettlementPeriod_no_overlap",
  DROP CONSTRAINT IF EXISTS "TransportSettlementPeriod_dates_iso";

DROP INDEX IF EXISTS "TransportSettlementDocument_one_reversal_per_target";

ALTER TABLE "TransportSettlementDocument"
  DROP CONSTRAINT IF EXISTS "TransportSettlementDocument_adjustment_kind",
  DROP CONSTRAINT IF EXISTS "TransportSettlementDocument_no_self_adjust",
  DROP CONSTRAINT IF EXISTS "TransportSettlementDocument_amount_money_range";

ALTER TABLE "TransportSettlementAllocation"
  DROP CONSTRAINT IF EXISTS "TransportSettlementAllocation_amount_money_range";

ALTER TABLE "TransportCustomerTerms"
  DROP CONSTRAINT IF EXISTS "TransportCustomerTerms_creditLimit_money_range",
  DROP CONSTRAINT IF EXISTS "TransportCustomerTerms_term_days_range";

ALTER TABLE "TransportCommissionRuleVersion"
  DROP CONSTRAINT IF EXISTS "TransportCommissionRuleVersion_calc_shape",
  DROP CONSTRAINT IF EXISTS "TransportCommissionRuleVersion_rate_range",
  DROP CONSTRAINT IF EXISTS "TransportCommissionRuleVersion_effective_order",
  DROP CONSTRAINT IF EXISTS "TransportCommissionRuleVersion_fixedAmount_money_range";

ALTER TABLE "TransportCommissionCalculation"
  DROP CONSTRAINT IF EXISTS "TransportCommissionCalculation_money_range";

-- ---------------------------------------------------------------------------
-- BUOC 2 — go bang, theo dung thu tu phu thuoc khoa ngoai.
--
-- `TransportCommissionCalculation` tro toi CA `TransportSettlementDocument` lan
-- `TransportCommissionRuleVersion`, nen no di truoc. `TransportSettlementAllocation` tro toi
-- `TransportSettlementDocument`. `TransportSettlementDocument` tro toi CHINH NO (`adjustsId`), nen
-- mot lenh don la du — Postgres go ca rang buoc tu tham chieu cung luc.

DROP TABLE IF EXISTS "TransportCommissionCalculation";
DROP TABLE IF EXISTS "TransportSettlementAllocation";
DROP TABLE IF EXISTS "TransportCommissionRuleVersion";
DROP TABLE IF EXISTS "TransportCommissionRule";
DROP TABLE IF EXISTS "TransportCustomerTerms";
DROP TABLE IF EXISTS "TransportSettlementPeriod";
DROP TABLE IF EXISTS "TransportSettlementDocument";

-- ---------------------------------------------------------------------------
-- BUOC 3 — go kieu enum. Chi chay duoc SAU khi moi bang dung chung da bien mat.

DROP TYPE IF EXISTS "TransportSettlementPeriodStatus";
DROP TYPE IF EXISTS "TransportCommissionRuleStatus";
DROP TYPE IF EXISTS "TransportCommissionCalcKind";
DROP TYPE IF EXISTS "TransportSettlementDocumentStatus";
DROP TYPE IF EXISTS "TransportSettlementDocumentKind";
DROP TYPE IF EXISTS "TransportSettlementCounterpartyKind";
DROP TYPE IF EXISTS "TransportSettlementFlow";
DROP TYPE IF EXISTS "TransportSettlementDirection";

-- KHONG go `btree_gist`: `20260830140000_transport_costing` cung dung no cho
-- `TransportDriverFundPeriod_no_overlap`. Go o day se lam do rang buoc cua `TX-03`.

-- ---------------------------------------------------------------------------
-- BUOC 4 — xoa dau vet migration de `migrate deploy` khong coi la da chay.

DELETE FROM "_prisma_migrations" WHERE "migration_name" = '20260901000000_transport_settlement';
