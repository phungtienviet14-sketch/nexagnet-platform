-- ===========================================================================
-- TX-09 (Lane H, Issue #267 H1) — MOT gia tri enum, va KHONG GI KHAC.
--
-- Cung khuon va cung ly do voi `20260908110000_transport_driver_fund_reimbursement_kind`:
-- `ALTER TYPE ... ADD VALUE` chay duoc trong mot giao dich tu PG 12, nhung gia
-- tri MOI khong duoc SU DUNG trong chinh giao dich do — va Prisma boc moi tep
-- migration trong mot giao dich. Tach ra mot tep rieng la cach duy nhat de
-- migration ke tiep duoc phep nhac ten `COUNTERPARTY_SITE` trong mot bieu thuc.
--
-- `TransportGeofence_subject_shape` KHONG phai sua: no da viet dang tong quat
-- (`AD_HOC` <=> subjectId IS NULL), nen gia tri moi roi vao nhanh "buoc phai co
-- chu the" ma khong cham vao cau lenh.
--
-- `IF NOT EXISTS` de mot lan chay lai (khoi phuc tu backup, moi truong da co
-- gia tri) khong lam dung ca chuoi migration.
-- ===========================================================================

ALTER TYPE "TransportGeofenceSubjectKind" ADD VALUE IF NOT EXISTS 'COUNTERPARTY_SITE';
