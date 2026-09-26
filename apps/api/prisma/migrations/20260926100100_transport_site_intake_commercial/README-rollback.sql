-- DUONG LUI cua `20260926100100_transport_site_intake_commercial` (#398).
--
-- Chay tay khi can quay ve hinh dang truoc migration. KHONG phai mot migration Prisma — de o day
-- de nguoi truc doc duoc trong luc su co, khong phai de chay tu dong.
--
-- MIGRATION NAY CHI THEM. Bang moi `TransportSiteIntakeCommercial` tro khoa ngoai RA `TransportRunSiteIntake`
-- va `TransportOrder`; khong bang cu nao tro VAO no. Cot moi `TransportRunSiteIntake.siteMatch` la
-- nullable. Hai trigger moi chi CHAN, khong ghi gi.
--
-- CAI THAT SU MAT KHI LUI: moi diem giao tai xe/van phong da chon, moi lan xac nhan noi lay hang, dau
-- vet gan don va moi lan bao bat thuong. DON, VONG CHAY, CHANG va KE HOACH van o nguyen: chung khong
-- tro sang bang moi. Chang da nhan don van giu `orderId` — lui migration KHONG go lan gan do.
--
-- Truoc khi chay, DEM va XUAT:
--
--     SELECT "status", count(*) FROM "TransportSiteIntakeCommercial" GROUP BY 1;
--     \copy (SELECT * FROM "TransportSiteIntakeCommercial") TO 'site-intake-commercial.csv' CSV HEADER;
--     \copy (SELECT "id", "siteMatch" FROM "TransportRunSiteIntake" WHERE "siteMatch" IS NOT NULL) TO 'site-intake-match.csv' CSV HEADER;

DROP TRIGGER IF EXISTS "transport_run_leg_order_binding_once" ON "TransportRunLeg";
DROP FUNCTION IF EXISTS "transport_run_leg_order_binding_once"();

DROP TRIGGER IF EXISTS "transport_site_intake_commercial_guard" ON "TransportSiteIntakeCommercial";
DROP FUNCTION IF EXISTS "transport_site_intake_commercial_guard"();

DROP TABLE IF EXISTS "TransportSiteIntakeCommercial";

ALTER TABLE "TransportRunSiteIntake" DROP COLUMN IF EXISTS "siteMatch";

DROP TYPE IF EXISTS "TransportSiteIntakeExceptionOutcome";
DROP TYPE IF EXISTS "TransportSiteIntakeActorRole";
DROP TYPE IF EXISTS "TransportSiteIntakeDestinationSource";
DROP TYPE IF EXISTS "TransportSiteIntakeBindingMode";
DROP TYPE IF EXISTS "TransportSiteIntakeCommercialStatus";
DROP TYPE IF EXISTS "TransportSiteIntakeSiteMatch";

-- `TransportRunPlanOutcome.ADOPTED` (migration `20260926100000_...`) KHONG go duoc bang `ALTER TYPE`:
-- Postgres khong co `DROP VALUE`. Ke hoach `ADOPTED` da ghi van doc duoc; neu can go han gia tri do
-- thi phai dung lai kieu enum — mot thao tac rieng, doi dem truoc:
--
--     SELECT count(*) FROM "TransportOrderRunPlan" WHERE "outcome" = 'ADOPTED';
