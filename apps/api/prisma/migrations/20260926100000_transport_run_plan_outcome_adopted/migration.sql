-- ===========================================================================
-- #398 — MOT gia tri enum, va KHONG GI KHAC.
--
-- Cung khuon va cung ly do voi `20260909230000_transport_geofence_counterparty_site_kind`:
-- `ALTER TYPE ... ADD VALUE` chay duoc trong mot giao dich tu PG 12, nhung gia tri MOI khong duoc
-- SU DUNG trong chinh giao dich do — va Prisma boc moi tep migration trong mot giao dich. Tach ra
-- mot tep rieng de migration ke tiep (`..._transport_site_intake_commercial`) duoc phep nhac ten
-- `ADOPTED`.
--
-- `ADOPTED` = lan lap ke hoach NHAN LAI mot vong chay + chang CO HANG da ton tai (vong chay do lai
-- xe xac nhan tai dia diem A tao ra, `#267`), thay vi tao vong chay moi (`NEW_RUN`) hay noi them
-- chang (`APPENDED`). Mot ke hoach `ADOPTED` khong sinh ra chang nao — no chi ghi rang don nay DA
-- nam tren chang do, de lan lap ke hoach sau cua cung don thay "da co ke hoach" va khong lap lai.
--
-- `IF NOT EXISTS` de mot lan chay lai (khoi phuc tu backup) khong lam dung ca chuoi migration.
-- ===========================================================================

ALTER TYPE "TransportRunPlanOutcome" ADD VALUE IF NOT EXISTS 'ADOPTED';
