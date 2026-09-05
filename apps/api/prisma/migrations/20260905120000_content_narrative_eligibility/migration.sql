-- Issue #205: LOP THAM QUYEN cua mot ban ghi noi dung da duyet.
--
-- NULL = chua ai tuyen bo = KHONG duoc ke lai trong loi nhan gui khach. Vang mat la TU CHOI,
-- khong bao gio la cho phep: moi ban ghi dang co giu NULL va vi the fail closed.
--
-- Tien len mot chieu, trung tinh voi moi khach, va KHONG doi mot dong du lieu nao dang co.
ALTER TABLE "FAQ" ADD COLUMN "narrativeEligible" BOOLEAN;

ALTER TABLE "AdviceContent" ADD COLUMN "narrativeEligible" BOOLEAN;
