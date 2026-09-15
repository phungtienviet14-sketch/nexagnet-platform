-- ===========================================================================
-- LICH SU REVIEW ETC VA BAN NAP NGUON: CHI GHI THEM — `#295` Lane V.
--
-- `schema.prisma` da NOI dieu nay tu Lane J: TransportTollReviewDecision la
-- *"GHI THEM, khong bao gio ghi de"*, va TransportTollImport la *"bat bien sau
-- khi ghi"*. Nhung cau do chi song o tang ung dung: kho toll khong lo mot ham
-- update/delete nao cho hai bang.
--
-- Do KHONG du. Bon mien anh em (`transport_run_checkpoint`,
-- `transport_driver_cashout`, `transport_commercial_acceptance`,
-- `transport_fuel`) deu da hoc dieu nay: mot bang bang chung chi duoc bao ve boi
-- ky luat cua tang ung dung thi van sua duoc bang MOT DONG `psql` — va khong ai
-- biet. Do la phat hien duoc do lai tren `de30a082`: `UPDATE`/`DELETE` thang vao
-- hai bang nay THANH CONG im lang.
-- ===========================================================================

CREATE OR REPLACE FUNCTION "transport_toll_review_decision_append_only"()
RETURNS TRIGGER AS $$
BEGIN
  IF TG_OP = 'DELETE' THEN
    RAISE EXCEPTION
      'transport_toll_review_decision_append_only: khong xoa duoc mot quyet dinh da ghi, hay ghi mot quyet dinh moi (REOPEN)';
  END IF;
  RAISE EXCEPTION
    'transport_toll_review_decision_append_only: khong sua duoc mot quyet dinh da ghi, hay ghi mot quyet dinh moi (REOPEN)';
END;
$$ LANGUAGE plpgsql;

CREATE TRIGGER "transport_toll_review_decision_append_only"
  BEFORE UPDATE OR DELETE ON "TransportTollReviewDecision"
  FOR EACH ROW EXECUTE FUNCTION "transport_toll_review_decision_append_only"();

-- ===========================================================================
-- MOT TRIGGER KHONG SONG CANH MOT KHOA NGOAI `CASCADE`.
--
-- `transport-run-checkpoint-storage.spec.ts` da viet ra bai hoc nay: *"khong ai
-- `DELETE` bang moc ca, ho `DELETE` cai bang cha"*. Chung nao
-- `TransportTollReviewDecision_candidateId_fkey` con `ON DELETE CASCADE`, xoa
-- mot ung vien van xoa sach lich su quyet dinh cua no va trigger tren khong noi
-- duoc mot loi nao.
--
-- Doi sang `RESTRICT` la KHOI PHUC dieu `schema.prisma` da hua, khong phai mot
-- nghia moi: khong mot duong san xuat nao xoa ung vien (kho toll khong co ham
-- xoa; chi cleanup cua bo kiem thu xoa, va no tu tat trigger trong mot giao
-- dich). Sau dong nay, muon bo mot ung vien thi phai bo lich su cua no TRUOC —
-- mot hanh dong co chu dich, khong phai mot he qua phu.
-- ===========================================================================
ALTER TABLE "TransportTollReviewDecision"
  DROP CONSTRAINT "TransportTollReviewDecision_candidateId_fkey";

ALTER TABLE "TransportTollReviewDecision"
  ADD CONSTRAINT "TransportTollReviewDecision_candidateId_fkey"
  FOREIGN KEY ("candidateId") REFERENCES "TransportTollTransactionCandidate"("id")
  ON DELETE RESTRICT ON UPDATE CASCADE;

-- ===========================================================================
-- BAN NAP NGUON: bat bien vi no la DANH TINH cua nguon.
--
-- `@@unique([provider, sourceDigest])` la ca phep chong nap trung cua Lane J:
-- cung mot tep nap lai hai lan thi lan sau PHAT LAI ban cu. Mot lenh `UPDATE`
-- doi `sourceDigest` se lam mot tep da nap co the nap lai lan nua duoi mot danh
-- tinh khac, va `rowCount`/`acceptedCount` sua duoc se lam bao cao nap khong con
-- doi chieu duoc voi so ung vien that su ton tai.
--
-- `TransportTollTransactionCandidate_importId_fkey` CO Y giu `CASCADE`: ung vien
-- la hang LAM VIEC, khong phai lich su. Nhung duong xoa do gio khong voi toi
-- duoc nua, vi lenh `DELETE` phai bat dau tu chinh ban nap — va trigger duoi
-- day chan no o do.
-- ===========================================================================
CREATE OR REPLACE FUNCTION "transport_toll_import_append_only"()
RETURNS TRIGGER AS $$
BEGIN
  IF TG_OP = 'DELETE' THEN
    RAISE EXCEPTION
      'transport_toll_import_append_only: khong xoa duoc mot ban nap nguon da ghi';
  END IF;
  RAISE EXCEPTION
    'transport_toll_import_append_only: khong sua duoc mot ban nap nguon da ghi — danh tinh nguon la (provider, sourceDigest)';
END;
$$ LANGUAGE plpgsql;

CREATE TRIGGER "transport_toll_import_append_only"
  BEFORE UPDATE OR DELETE ON "TransportTollImport"
  FOR EACH ROW EXECUTE FUNCTION "transport_toll_import_append_only"();
