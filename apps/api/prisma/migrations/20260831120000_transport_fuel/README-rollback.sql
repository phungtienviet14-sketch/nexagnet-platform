-- DUONG LUI cua `20260831120000_transport_fuel`.
--
-- Chay tay khi can quay ve hinh dang truoc migration. KHONG phai mot migration Prisma — de o day de
-- nguoi truc doc duoc trong luc su co, khong phai de chay tu dong.
--
-- ---------------------------------------------------------------------------
-- CANH BAO — BUOC 2 CUA DUONG LUI NAY XOA BANG CHUNG, KHONG CHI XOA DU LIEU.
--
-- Khac duong lui cua T3 (xoa so cai — dau don nhung con doi soat lai duoc voi chung tu giay), T4
-- giu THAM CHIEU TOI ANH PHIEU (`TransportFuelReceiptEvidence.locator`). Xoa bang la mat SOI DAY
-- noi mot khoan tien voi tam anh chung minh no — anh van con trong kho, nhung khong con gi biet no
-- thuoc phieu nao. `GD-20` chon giu anh vo thoi han chinh vi ly do do.
--
-- BAT BUOC dem truoc khi bo comment bat cu lenh xoa bang nao o BUOC 2:
--
--   SELECT
--     (SELECT count(*) FROM "TransportFuelEntry")             AS phieu_dau,
--     (SELECT count(*) FROM "TransportFuelReceiptEvidence")   AS anh_chung_tu,
--     (SELECT count(*) FROM "TransportFuelStatementLine")     AS dong_bang_ke,
--     (SELECT count(*) FROM "TransportFuelSettlementHandoff") AS ban_giao_t5;
--
-- Neu bat cu con so nao > 0 thi DUNG. Xuat du lieu ra truoc (`COPY ... TO`), roi moi quyet.
--
-- THEM MOT DIEU T3 KHONG CO: mot phieu dau da duyet DA GHI mot `TransportTripExpense` o `TX-03`.
-- Xoa bang cua T4 KHONG dao khoan chi do — gia thanh chuyen se giu nguyen mot dong dau khong con
-- phieu nao dang sau. Dem truoc khi quyet:
--
--   SELECT count(*) FROM "TransportTripExpense" te
--   WHERE EXISTS (SELECT 1 FROM "TransportFuelEntry" fe WHERE fe."costExpenseId" = te."id");
--
-- Neu > 0 va ban that su muon go ca hai lop, duong DUNG la dao tung khoan chi qua API cua `TX-03`
-- (`POST /transport/costing/expenses/:id/reversal`) TRUOC khi chay BUOC 2 — `INV-20` khong cho
-- `DELETE`, va mot lan xoa thang o day de lai gia thanh chuyen sai ma khong dau vet.
--
-- Neu chi can GO RANG BUOC ma GIU du lieu — tinh huong thuong gap hon nhieu — thi chay DUNG khoi
-- BUOC 1 roi dung lai. Luc do bang van con, ung dung van chay, chi khong con DB chan gi: dau tien,
-- vong doi duyet, quan he 1-1 cua mot cap khop va `INV-26` quay ve chi con duoc service giu, tuc
-- khong con dung khi co hai nguoi ghi cung luc.
--
-- BUOC 2 duoc de o dang COMMENT co chu dich: de khong ai dan ca tep nay vao `psql` roi mat bang
-- chung cua ca mot ky doi soat.
-- ---------------------------------------------------------------------------

-- ===========================================================================
-- BUOC 1 — GO RANG BUOC + TRIGGER, GIU NGUYEN DU LIEU
-- ===========================================================================

DROP TRIGGER IF EXISTS "TransportFuelMatch_no_self_source" ON "TransportFuelMatch";
DROP FUNCTION IF EXISTS transport_fuel_match_no_self_source();

ALTER TABLE "TransportFuelEntry"
  DROP CONSTRAINT IF EXISTS "TransportFuelEntry_amount_money_range",
  DROP CONSTRAINT IF EXISTS "TransportFuelEntry_liters_positive",
  DROP CONSTRAINT IF EXISTS "TransportFuelEntry_odometer_non_negative",
  DROP CONSTRAINT IF EXISTS "TransportFuelEntry_consumption_needs_odo",
  DROP CONSTRAINT IF EXISTS "TransportFuelEntry_review_lifecycle",
  DROP CONSTRAINT IF EXISTS "TransportFuelEntry_businessDate_iso";

ALTER TABLE "TransportFuelStatementLine"
  DROP CONSTRAINT IF EXISTS "TransportFuelStatementLine_amount_money_range",
  DROP CONSTRAINT IF EXISTS "TransportFuelStatementLine_liters_positive",
  DROP CONSTRAINT IF EXISTS "TransportFuelStatementLine_accepted_fields",
  DROP CONSTRAINT IF EXISTS "TransportFuelStatementLine_rejected_reason",
  DROP CONSTRAINT IF EXISTS "TransportFuelStatementLine_businessDate_iso";

ALTER TABLE "TransportFuelSupplierStatement"
  DROP CONSTRAINT IF EXISTS "TransportFuelSupplierStatement_period_order";

ALTER TABLE "TransportFuelReconciliation"
  DROP CONSTRAINT IF EXISTS "TransportFuelReconciliation_period_order";

ALTER TABLE "TransportFuelSettlementHandoff"
  DROP CONSTRAINT IF EXISTS "TransportFuelSettlementHandoff_amount_money_range",
  DROP CONSTRAINT IF EXISTS "TransportFuelSettlementHandoff_period_order";

ALTER TABLE "TransportFuelDiscrepancy"
  DROP CONSTRAINT IF EXISTS "TransportFuelDiscrepancy_resolved_fields",
  DROP CONSTRAINT IF EXISTS "TransportFuelDiscrepancy_has_subject";

-- ===========================================================================
-- BUOC 2 — XOA BANG. DOC LAI KHOI CANH BAO DAU TEP TRUOC KHI BO COMMENT.
-- ===========================================================================
--
-- Thu tu xoa di NGUOC chieu khoa ngoai. `TransportFuelEntry` phai sau `TransportFuelMatch` va
-- `TransportFuelDiscrepancy`, va `TransportFuelSupplierStatement` phai sau ca ba — vi
-- `TransportFuelEntry.sourceStatementId` tro toi no.
--
-- DROP TABLE IF EXISTS "TransportFuelSettlementHandoff";
-- DROP TABLE IF EXISTS "TransportFuelDiscrepancy";
-- DROP TABLE IF EXISTS "TransportFuelMatch";
-- DROP TABLE IF EXISTS "TransportFuelReconciliation";
-- DROP TABLE IF EXISTS "TransportFuelReceiptEvidence";
-- DROP TABLE IF EXISTS "TransportFuelStatementLine";
-- DROP TABLE IF EXISTS "TransportFuelEntry";
-- DROP TABLE IF EXISTS "TransportFuelSupplierStatement";
-- DROP TABLE IF EXISTS "TransportFuelSupplier";
--
-- DROP TYPE IF EXISTS "TransportFuelReconciliationState";
-- DROP TYPE IF EXISTS "TransportFuelDiscrepancyResolution";
-- DROP TYPE IF EXISTS "TransportFuelDiscrepancyStatus";
-- DROP TYPE IF EXISTS "TransportFuelDiscrepancyKind";
-- DROP TYPE IF EXISTS "TransportFuelMatchOrigin";
-- DROP TYPE IF EXISTS "TransportFuelStatementRejectReason";
-- DROP TYPE IF EXISTS "TransportFuelStatementLineStatus";
-- DROP TYPE IF EXISTS "TransportFuelStatementFormat";
-- DROP TYPE IF EXISTS "TransportFuelReviewReason";
-- DROP TYPE IF EXISTS "TransportFuelPaymentMethod";
-- DROP TYPE IF EXISTS "TransportFuelReconciliationStatus";
-- DROP TYPE IF EXISTS "TransportFuelVerificationStatus";
