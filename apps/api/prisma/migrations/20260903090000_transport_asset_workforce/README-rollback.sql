-- DUONG LUI cua `20260903090000_transport_asset_workforce` (T6 — Issue #88).
--
-- Chay tay khi can quay ve hinh dang truoc migration. KHONG phai mot migration Prisma — de o day
-- de nguoi truc doc duoc trong luc su co, khong phai de chay tu dong.
--
-- MIGRATION NAY CHI THEM. No khong sua mot cot nao cua T2/T3/T4/T5, khong doi kieu, khong doi
-- rang buoc dang co. Nen duong lui khong co buoc nao "co the that bai vi du lieu" giong duong lui
-- cua `20260830090000_transport_storage_invariants` — o do buoc `BIGINT -> INTEGER` phu thuoc vao
-- gia tri dang nam trong bang.
--
-- CAI THAT SU MAT KHI LUI: bay bang duoi day va toan bo lich su bao duong, giay to va luong trong
-- do. Truoc khi chay, DEM da:
--
--   SELECT
--     (SELECT count(*) FROM "TransportPayslip")                AS phieu_luong,
--     (SELECT count(*) FROM "TransportPayslip"
--       WHERE "status" IN ('APPROVED','PAID'))                 AS phieu_da_chot,
--     (SELECT count(*) FROM "TransportComplianceDocument")     AS giay_to,
--     (SELECT count(*) FROM "TransportMaintenanceWorkOrder")   AS lenh_sua;
--
-- Neu `phieu_da_chot > 0` thi DUNG LAI: do la lich su luong DA TRA, va `INV-20` khong cho phep
-- xoa no bang mot lenh vo tinh. Sao luu truoc, va ghi ly do vao nhat ky su co.
--
-- Cac lenh `DROP TABLE` o cuoi CO Y de duoi dang chu thich. Go chu thich la mot hanh dong PHAI
-- CO Y THUC — cung quy uoc voi cac duong lui cua T3/T4/T5.

-- 1. Trigger va ham cua chung.
DROP TRIGGER IF EXISTS "TransportMaintenancePlan_vehicle_immutable" ON "TransportMaintenancePlan";
DROP TRIGGER IF EXISTS "TransportMaintenanceWorkOrder_plan_same_vehicle" ON "TransportMaintenanceWorkOrder";
DROP TRIGGER IF EXISTS "TransportPayslip_component_frozen" ON "TransportPayslipComponent";
DROP TRIGGER IF EXISTS "TransportPayslip_posted_immutable" ON "TransportPayslip";
DROP FUNCTION IF EXISTS "transport_plan_vehicle_immutable"();
DROP FUNCTION IF EXISTS "transport_work_order_plan_same_vehicle"();
DROP FUNCTION IF EXISTS "transport_payslip_component_frozen"();
DROP FUNCTION IF EXISTS "transport_payslip_posted_immutable"();

-- 2. Unique mot phan. Bo chung khong mat du lieu, nhung ke tu do cac bat bien "mot lenh dang mo
--    cho moi lich", "mot phieu goc cho moi lan chay/lai xe" va "mot ban dao cho moi ban goc" quay
--    ve chi con duoc service giu — tuc khong con dung khi co hai nguoi ghi cung luc.
DROP INDEX IF EXISTS "TransportMaintenanceWorkOrder_one_open_per_plan";
DROP INDEX IF EXISTS "TransportPayslip_one_original_per_run_driver";
DROP INDEX IF EXISTS "TransportPayslip_one_reversal_per_target";

-- 3. Rang buoc viet tay.
ALTER TABLE "TransportPayslipComponent" DROP CONSTRAINT IF EXISTS "TransportPayslipComponent_manual_needs_signer";
ALTER TABLE "TransportPayslipComponent" DROP CONSTRAINT IF EXISTS "TransportPayslipComponent_deduction_manual_only";
ALTER TABLE "TransportPayslipComponent" DROP CONSTRAINT IF EXISTS "TransportPayslipComponent_money_range";
ALTER TABLE "TransportPayslip" DROP CONSTRAINT IF EXISTS "TransportPayslip_posted_fields";
ALTER TABLE "TransportPayslip" DROP CONSTRAINT IF EXISTS "TransportPayslip_no_self_correction";
ALTER TABLE "TransportPayslip" DROP CONSTRAINT IF EXISTS "TransportPayslip_correction_shape";
ALTER TABLE "TransportPayslip" DROP CONSTRAINT IF EXISTS "TransportPayslip_counts_range";
ALTER TABLE "TransportPayslip" DROP CONSTRAINT IF EXISTS "TransportPayslip_net_is_gross_minus_deductions";
ALTER TABLE "TransportPayslip" DROP CONSTRAINT IF EXISTS "TransportPayslip_money_range";
ALTER TABLE "TransportPayrollRun" DROP CONSTRAINT IF EXISTS "TransportPayrollRun_sequence_positive";
ALTER TABLE "TransportPayrollPeriod" DROP CONSTRAINT IF EXISTS "TransportPayrollPeriod_no_overlap";
ALTER TABLE "TransportPayrollPeriod" DROP CONSTRAINT IF EXISTS "TransportPayrollPeriod_closed_fields";
ALTER TABLE "TransportPayrollPeriod" DROP CONSTRAINT IF EXISTS "TransportPayrollPeriod_dates_iso";
ALTER TABLE "TransportComplianceDocument" DROP CONSTRAINT IF EXISTS "TransportComplianceDocument_subject_shape";
ALTER TABLE "TransportComplianceDocument" DROP CONSTRAINT IF EXISTS "TransportComplianceDocument_dates_iso";
ALTER TABLE "TransportMaintenanceWorkOrder" DROP CONSTRAINT IF EXISTS "TransportMaintenanceWorkOrder_cost_money_range";
ALTER TABLE "TransportMaintenanceWorkOrder" DROP CONSTRAINT IF EXISTS "TransportMaintenanceWorkOrder_cancellation_fields";
ALTER TABLE "TransportMaintenanceWorkOrder" DROP CONSTRAINT IF EXISTS "TransportMaintenanceWorkOrder_completion_fields";
ALTER TABLE "TransportMaintenanceWorkOrder" DROP CONSTRAINT IF EXISTS "TransportMaintenanceWorkOrder_odo_range";
ALTER TABLE "TransportMaintenanceWorkOrder" DROP CONSTRAINT IF EXISTS "TransportMaintenanceWorkOrder_dates_iso";
ALTER TABLE "TransportMaintenancePlan" DROP CONSTRAINT IF EXISTS "TransportMaintenancePlan_baselineDate_iso";
ALTER TABLE "TransportMaintenancePlan" DROP CONSTRAINT IF EXISTS "TransportMaintenancePlan_baseline_odo_range";
ALTER TABLE "TransportMaintenancePlan" DROP CONSTRAINT IF EXISTS "TransportMaintenancePlan_interval_positive";
ALTER TABLE "TransportMaintenancePlan" DROP CONSTRAINT IF EXISTS "TransportMaintenancePlan_interval_matches_trigger";

-- 4. BANG — go chu thich CO Y THUC. Thu tu duoi day ton trong khoa ngoai.
-- DROP TABLE IF EXISTS "TransportPayslipComponent";
-- DROP TABLE IF EXISTS "TransportPayslip";
-- DROP TABLE IF EXISTS "TransportPayrollRun";
-- DROP TABLE IF EXISTS "TransportPayrollPeriod";
-- DROP TABLE IF EXISTS "TransportComplianceDocument";
-- DROP TABLE IF EXISTS "TransportMaintenanceWorkOrder";
-- DROP TABLE IF EXISTS "TransportMaintenancePlan";

-- 5. Kieu enum — chi bo duoc SAU khi bay bang tren da bien mat.
-- DROP TYPE IF EXISTS "TransportPayslipComponentSource";
-- DROP TYPE IF EXISTS "TransportPayslipComponentKind";
-- DROP TYPE IF EXISTS "TransportPayslipKind";
-- DROP TYPE IF EXISTS "TransportPayslipStatus";
-- DROP TYPE IF EXISTS "TransportPayrollPeriodStatus";
-- DROP TYPE IF EXISTS "TransportComplianceDocumentStatus";
-- DROP TYPE IF EXISTS "TransportComplianceSubjectKind";
-- DROP TYPE IF EXISTS "TransportComplianceDocumentType";
-- DROP TYPE IF EXISTS "TransportMaintenanceWorkOrderStatus";
-- DROP TYPE IF EXISTS "TransportMaintenancePlanStatus";
-- DROP TYPE IF EXISTS "TransportMaintenanceTriggerKind";

-- `btree_gist` CO Y khong bi bo: `20260830140000_transport_costing` va
-- `20260901000000_transport_settlement` van dang dung no.
