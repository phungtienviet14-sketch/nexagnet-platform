-- Lane C / C3 (Issue #236) — cua vao thu hai cua mot chung tu nhien lieu: MOT BUC ANH.
--
-- ===========================================================================
-- KHONG BANG MOI NAO, VA DO LA CA THIET KE
--
-- Mot phieu do dau doc tu anh la CUNG MOT LOAI SU VAT voi mot dong hoa don dien tu: mot dong hang
-- chua ai xac nhan. Cho no mot bang rieng se doi hai bo phep kiem, hai man hinh ra soat, hai duong
-- chong nhap trung — roi mot ngay chung lech nhau va khong ai biet ben nao dung.
--
-- Cai KHAC nhau la DO TIN CAY, va no duoc noi bang DUNG MOT COT: `confidence`.
--   `NULL`        -> ung vien den tu mot nguon TAT DINH (hoa don XML da ky).
--   mot doi tuong -> ung vien den tu mot bo doc anh, kem muc tin tung truong.
--
-- Nho vay `NULL` khong con la "chua do duoc" ma la "cau hoi nay khong ap dung" — mot su phan biet
-- ma cot nay giu duoc chinh xac vi no la cot DUY NHAT noi ve dieu do.

-- `ALTER TYPE ... ADD VALUE` khong duoc dung gia tri vua them ngay trong cung mot giao dich. O day
-- ta chi THEM gia tri va khong dung no o cau lenh nao ben duoi, nen an toan.
ALTER TYPE "TransportFuelDocumentKind" ADD VALUE IF NOT EXISTS 'RECEIPT_IMAGE';

ALTER TYPE "TransportFuelDocumentRejectReason" ADD VALUE IF NOT EXISTS 'UNSUPPORTED_MEDIA_TYPE';
ALTER TYPE "TransportFuelDocumentRejectReason" ADD VALUE IF NOT EXISTS 'EXTRACTION_UNAVAILABLE';
ALTER TYPE "TransportFuelDocumentRejectReason" ADD VALUE IF NOT EXISTS 'EXTRACTION_MALFORMED_OUTPUT';

ALTER TABLE "TransportFuelCandidate" ADD COLUMN "confidence" JSONB;

-- Mot BANG muc tin, khong phai mot con so va khong phai mot chuoi.
--
-- Rang buoc nay re va no bat dung kieu hong de xay ra nhat: mot ngay nao do co nguoi "don gian hoa"
-- bang cach ghi mot con so trung binh vao day. Luc do moi phat hien "o nao mo" cua C4 mat sach
-- thong tin ve O NAO — va mat trong im lang, vi mot con so van doc ra duoc.
ALTER TABLE "TransportFuelCandidate"
  ADD CONSTRAINT "TransportFuelCandidate_confidence_is_object"
  CHECK ("confidence" IS NULL OR jsonb_typeof("confidence") = 'object');
