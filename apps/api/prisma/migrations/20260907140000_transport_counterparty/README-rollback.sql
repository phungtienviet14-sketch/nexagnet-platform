-- DUONG LUI cua `20260907140000_transport_counterparty` (R1-A — Issue #230).
--
-- Chay tay khi can quay ve hinh dang truoc migration. KHONG phai mot migration Prisma — de o day
-- de nguoi truc doc duoc trong luc su co, khong phai de chay tu dong.
--
-- MIGRATION NAY CHI THEM, va them o mot goc khong ai khac cham toi: hai bang moi, mot kieu enum
-- moi. No khong sua mot cot nao cua T2/T3/T4/T5/T6, khong doi kieu, khong doi rang buoc dang co,
-- va khong bang cu nao tro khoa ngoai vao no. Nen duong lui khong co buoc nao "co the that bai vi
-- du lieu" giong duong lui cua `20260830090000_transport_storage_invariants`.
--
-- CAI THAT SU MAT KHI LUI: toan bo danh tinh phap nhan da nhap va cac lien ket cua chung. Du lieu
-- khach hang/doi tac o `TransportCustomer` va `TransportPartner` KHONG bi anh huong — chung khong
-- biet gi ve hai bang nay, va khong cot nao cua chung tro sang day.
--
-- Truoc khi chay, DEM da:
--
--     SELECT count(*) FROM "TransportCounterparty";
--     SELECT count(*) FROM "TransportCounterpartyLink";

DROP TABLE IF EXISTS "TransportCounterpartyLink";
DROP TABLE IF EXISTS "TransportCounterparty";
DROP TYPE IF EXISTS "TransportCounterpartySubjectKind";
