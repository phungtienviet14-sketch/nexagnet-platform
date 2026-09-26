-- DUONG LUI cua `20260926100100_transport_site_intake_commercial` (#398).
--
-- Chay tay khi can quay ve hinh dang truoc migration. KHONG phai mot migration Prisma — de o day
-- de nguoi truc doc duoc trong luc su co, khong phai de chay tu dong.
--
-- MIGRATION NAY CHI THEM. Bang moi `TransportSiteIntakeCommercial` tro khoa ngoai RA `TransportRunSiteIntake`
-- va `TransportOrder`; khong bang cu nao tro VAO no. Cot moi `TransportRunSiteIntake.siteMatch` la
-- nullable. Hai trigger moi chi CHAN, khong ghi gi. Lan dien bu (muc 5 cua migration) chi CHEN hang
-- `PENDING` TRONG vao chinh bang moi — no mat cung bang, va khong mang su that nao de mat.
--
-- CAI THAT SU MAT KHI LUI: moi diem giao tai xe/van phong da chon, moi lan xac nhan noi lay hang, dau
-- vet gan don va moi lan bao bat thuong. DON, VONG CHAY, CHANG va KE HOACH van o nguyen: chung khong
-- tro sang bang moi. Chang da nhan don van giu `orderId` — lui migration KHONG go lan gan do.
--
-- Lui xong, trigger `transport_run_leg_order_binding_once` bien mat: chang lai doi don duoc bang tay
-- (`X -> Y`, `X -> NULL`) — dung nhu truoc #398.
--
-- AP LAI: Prisma KHONG tu chay lai mot migration da ghi trong `_prisma_migrations`. Muon ap lai phai
-- xoa dong `20260926100100_...` o do (`prisma migrate resolve --rolled-back`) roi `migrate deploy`.
-- Lan dien bu khi ay chi thay tinh hinh LUC AP LAI: moi lan nhan viec con dang do, chua mang don,
-- deu thanh `PENDING` — ke ca lan truoc khi lui DA bi bao bat thuong (`REJECTED`), vi ket cuc do da
-- mat cung bang. Xuat CSV o duoi TRUOC khi lui de doi chieu lai sau khi ap.
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
-- Postgres khong co `DROP VALUE`. Hang `ADOPTED` van nam trong DB, NHUNG Prisma client cua ban truoc
-- #398 khong biet gia tri do va se NEM khi doc mot ke hoach `ADOPTED` (lap ke hoach, xem ke hoach cua
-- don). Lui ma chua xu ly cac hang nay la de lai mot loi doc. Neu can go han gia tri do thi phai dung
-- lai kieu enum — mot thao tac rieng, doi dem truoc:
--
--     SELECT count(*) FROM "TransportOrderRunPlan" WHERE "outcome" = 'ADOPTED';
