-- DUONG LUI cua `20260911140000_transport_run_planning` (Lane L — Issue #276).
--
-- Chay tay khi can quay ve hinh dang truoc migration. KHONG phai mot migration Prisma — de o day
-- de nguoi truc doc duoc trong luc su co, khong phai de chay tu dong.
--
-- MIGRATION NAY CHI THEM. Hai kieu enum moi, mot bang moi, MOT cot nullable them vao
-- `TransportRunLeg`, mot rang buoc `CHECK` tren chinh cot moi do, va mot trigger tren
-- `TransportRunLeg`. No KHONG doi kieu mot cot nao, khong go mot rang buoc nao dang co, va khong
-- bang cu nao tro khoa ngoai VAO bang moi. Chieu khoa ngoai chi di MOT huong:
-- `TransportOrderRunPlan` -> (`TransportOrder`, `TransportVehicleRun`, `TransportRunLeg`).
--
-- DAC BIET: `TransportRunLeg` KHONG mat mot cot nao va khong doi nghia mot cot nao.
-- `distanceKm` van la quang duong DA GHI NHAN, y het truoc migration; cot moi
-- `plannedDistanceKm` la mot cho RIENG cho con so du kien. Moi phep doc cu — ke ca
-- `summariseRunDistance()` — cho ra cung ket qua truoc va sau ca migration lan duong lui nay.
--
-- CAI THAT SU MAT KHI LUI: toan bo lich su lap ke hoach (`TransportOrderRunPlan`) va moi con so
-- km DU KIEN da nhap. Vong chay, chang, don va lich su cam lai KHONG bi anh huong: khong cot nao
-- cua chung tro sang bang moi.
--
-- Truoc khi chay, DEM da:
--
--     SELECT count(*) FROM "TransportOrderRunPlan";
--     SELECT count(*) FROM "TransportRunLeg" WHERE "plannedDistanceKm" IS NOT NULL;
--
-- Va neu can giu lai de dung lai sau, xuat truoc:
--
--     \copy (SELECT * FROM "TransportOrderRunPlan") TO 'order-run-plan.csv' CSV HEADER;
--     \copy (SELECT "id", "plannedDistanceKm" FROM "TransportRunLeg" WHERE "plannedDistanceKm" IS NOT NULL) TO 'leg-planned-km.csv' CSV HEADER;

BEGIN;

-- 1. Trigger bat bien cua chang da hoan thanh.
DROP TRIGGER IF EXISTS "transport_run_leg_completed_is_immutable" ON "TransportRunLeg";
DROP FUNCTION IF EXISTS "transport_run_leg_completed_is_immutable"();

-- 2. Bang lich su lap ke hoach — keo theo ca hai unique mot phan va bon khoa ngoai cua no.
DROP TABLE IF EXISTS "TransportOrderRunPlan";

-- 3. Hai kieu enum chi bang tren dung. Xoa SAU bang, neu khong Postgres tu choi vi con phu thuoc.
DROP TYPE IF EXISTS "TransportRunPlanOutcome";
DROP TYPE IF EXISTS "TransportRunGrouping";

-- 4. Cot km du kien va rang buoc cua no. `DROP COLUMN` tu go luon `CHECK` gan tren cot, nhung go
--    tuong minh truoc de duong lui doc ra dung nhung gi migration da tao.
ALTER TABLE "TransportRunLeg"
  DROP CONSTRAINT IF EXISTS "TransportRunLeg_planned_distance_non_negative";
ALTER TABLE "TransportRunLeg" DROP COLUMN IF EXISTS "plannedDistanceKm";

COMMIT;
