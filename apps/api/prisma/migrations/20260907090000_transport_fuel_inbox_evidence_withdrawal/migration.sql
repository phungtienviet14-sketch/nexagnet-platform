-- #222 — HOP THU PHIEU NHIEN LIEU (P1-B) va GO MOT BANG CHUNG TAI NHAM (P1-C).
--
-- ---------------------------------------------------------------------------
-- MIGRATION NAY CHI THEM. Khong DROP mot bang/cot/index nao, khong doi kieu mot cot nao, khong
-- dong toi mot HANG du lieu nao.
--
-- Do khong phai mot loi hua chung chung ma la mot rang buoc CUA TASK NAY: no chay tren mot stack
-- DANG CO NGUOI DUNG THAT (`transport-preview/gd1-test`), va chuyen `UAT-VIET-01` cua chu so huu —
-- ke ca tam PDF tai nham cua no — la BANG CHUNG NGHIEM THU. Mot cau lenh dong toi du lieu o day se
-- pha chinh thu ma ban va nay phai chung minh.
--
-- Mot ban ung dung CU van chay nguyen ven tren luoc do MOI:
--   · hai cot moi deu NULL duoc va khong co `NOT NULL`;
--   · hai index moi chi lam mot so truy van nhanh len.
--
-- ---------------------------------------------------------------------------
-- PHAN 1 — P1-C: BIA MO CHO BANG CHUNG
--
-- Mot chung tu tai chinh khong duoc bien mat khong dau vet. Duong "go chung tu" vi vay KHONG xoa
-- hang: no ghi `withdrawnAt`/`withdrawnBy` roi moi don byte o kho anh, va `listEvidence` loc hang
-- da bia mo ra khoi danh sach dang hieu luc.
--
-- `locator` CO Y O LAI tren hang da bia mo. Neu lenh xoa object hong giua chung, do la thu duy nhat
-- con tim lai duoc object mo coi de don ve sau.

ALTER TABLE "TransportFuelReceiptEvidence"
  ADD COLUMN "withdrawnAt" TIMESTAMP(3),
  ADD COLUMN "withdrawnBy" TEXT;

-- Duong doc thuong xuyen nhat sau lan sua nay: "cac bang chung CON HIEU LUC cua mot phieu".
CREATE INDEX "TransportFuelReceiptEvidence_fuelEntryId_withdrawnAt_idx"
  ON "TransportFuelReceiptEvidence"("fuelEntryId", "withdrawnAt");

-- ---------------------------------------------------------------------------
-- PHAN 2 — P1-B: THU TU DOC CUA HOP THU
--
-- Hop thu doc theo `(verificationStatus ASC, businessDate DESC)`. `DECLARED` la gia tri DAU TIEN
-- cua enum `TransportFuelVerificationStatus`, nen phieu DANG CHO XAC THUC len dau — "actionable
-- first" khong phai mot phep sap xep bia them o tang ung dung, no la thu tu tu nhien cua enum va co
-- mot bai kiem doc chinh tep `schema.prisma` de khoa dieu do.
--
-- Chi so mot cot `TransportFuelEntry_verificationStatus_idx` da co van o lai: no phuc vu cac phep
-- dem theo trang thai. Chi so hai cot nay phuc vu phep SAP XEP, va hai viec do khac nhau.

CREATE INDEX "TransportFuelEntry_verificationStatus_businessDate_idx"
  ON "TransportFuelEntry"("verificationStatus", "businessDate");
