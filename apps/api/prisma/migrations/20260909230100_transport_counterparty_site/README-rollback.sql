-- ROLLBACK cua TX-09 (Lane H, Issue #267 H1) — doc het truoc khi chay.
--
-- HAI PHAN, va chi MOT trong hai lui duoc.
--
-- 1. BANG `TransportCounterpartySite` — lui duoc, va lui SACH: khong bang nao khac co khoa ngoai
--    tro vao no. Hang rao tro toi dia diem qua `subjectKind`/`subjectId` la mot lien ket DA HINH,
--    khong phai khoa ngoai, nen khong co rang buoc nao chan lenh duoi day.
--
--    MAT DU LIEU: moi dia diem da khai bien mat. Hay `pg_dump -t "TransportCounterpartySite"`
--    truoc khi chay neu con muon chung.
--
-- 2. GIA TRI ENUM `COUNTERPARTY_SITE` — KHONG lui duoc. Postgres khong co `ALTER TYPE ... DROP
--    VALUE`. Duong duy nhat la tao mot type moi, doi moi cot dang dung sang no, roi bo type cu —
--    tuc mot lan doi kieu tren mot bang dang chay, de lay lai mot gia tri khong ai dung.
--
--    KHONG LAM DIEU DO. Mot gia tri enum thua khong ton mot dong nao: khong hang du lieu, khong
--    chi muc, khong phep kiem. Cai phai lam la don cac hang rao dang mang gia tri do (lenh thu
--    nhat duoi day), roi de gia tri nam yen.

BEGIN;

-- Hang rao tro toi cac dia diem sap bien mat. Khong don thi chung tro thanh hang rao mo coi:
-- `resolveSiteCandidates()` bo qua chung (khong tra ung vien nao), nhung man hinh khai bao hang
-- rao van hien ra chung nhu nhung dong khong giai thich duoc.
DELETE FROM "TransportGeofence" WHERE "subjectKind" = 'COUNTERPARTY_SITE';

DROP TABLE IF EXISTS "TransportCounterpartySite";

COMMIT;
