-- DUONG LUI cua `20260907190000_transport_movement` (R1-B -- Issue #232 `D-01` / #234 A1).
--
-- Chay tay khi can quay ve hinh dang truoc migration. KHONG phai mot migration Prisma -- de o day
-- de nguoi truc doc duoc trong luc su co, khong phai de chay tu dong.
--
-- MIGRATION NAY CHI THEM. Bon kieu enum moi, nam bang moi. No KHONG sua mot cot nao cua
-- T2/T3/T4/T5/T6/T7, khong doi kieu, khong doi rang buoc dang co, va khong bang cu nao tro khoa
-- ngoai VAO no. Chieu khoa ngoai chi di MOT huong: bang moi -> bang cu
-- (`TransportCustomer`, `TransportVehicle`, `TransportDriver`, `TransportTrip`). Nen duong lui
-- khong co buoc nao "co the that bai vi du lieu cu" giong duong lui cua
-- `20260830090000_transport_storage_invariants`.
--
-- DAC BIET: `TransportTrip` KHONG bi cham. `UAT-VIET-01` va moi chuyen khac doc/ghi y nguyen truoc
-- va sau ca migration lan duong lui nay -- do la toan bo ly do phep chieu di qua mot bang TUONG
-- UNG (`TransportTripRunLegLink`) thay vi mot cot `runId` tren chinh `TransportTrip`.
--
-- CAI THAT SU MAT KHI LUI: toan bo nghia vu thuong mai (`TransportOrder`), vong chay
-- (`TransportVehicleRun`), chang (`TransportRunLeg`), lich su cam lai (`TransportRunAssignment`)
-- va cac lien ket chieu tu chuyen cu (`TransportTripRunLegLink`). Du lieu v1 -- chuyen, so quy,
-- nhien lieu, cong no, luong -- KHONG bi anh huong: khong cot nao cua chung tro sang day.
--
-- Truoc khi chay, DEM da:
--
--     SELECT count(*) FROM "TransportOrder";
--     SELECT count(*) FROM "TransportVehicleRun";
--     SELECT count(*) FROM "TransportRunLeg";
--     SELECT count(*) FROM "TransportRunAssignment";
--     SELECT count(*) FROM "TransportTripRunLegLink";
--
-- Va neu can giu lai phep chieu de dung lai sau, xuat truoc:
--
--     \copy (SELECT * FROM "TransportTripRunLegLink") TO 'trip-run-leg-link.csv' CSV HEADER;

DROP TABLE IF EXISTS "TransportTripRunLegLink";
DROP TABLE IF EXISTS "TransportRunLeg";
DROP TABLE IF EXISTS "TransportRunAssignment";
DROP TABLE IF EXISTS "TransportVehicleRun";
DROP TABLE IF EXISTS "TransportOrder";
DROP TYPE IF EXISTS "TransportRunLegStatus";
DROP TYPE IF EXISTS "TransportRunLegKind";
DROP TYPE IF EXISTS "TransportVehicleRunStatus";
DROP TYPE IF EXISTS "TransportOrderStatus";
