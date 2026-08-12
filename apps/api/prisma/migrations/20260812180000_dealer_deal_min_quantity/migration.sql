-- Deal rieng cua dai ly co the kem NGUONG SO LUONG.
--
-- Nguon: anh chup nhom Zalo that 25/07/2026 — "Lay SL 5 cai gia co tot hon k e" ->
-- "Da c lay sl 5c. E xin gia 1150k a". Neu khong co nguong nay thi don 1 cai cung an gia 1.150k
-- trong khi bang gia chung la 1.250k, tuc he thong bao THAP hon muc dai ly that su duoc huong.
--
-- FORWARD-SAFE: cot nullable, khong DEFAULT, khong NOT NULL, khong dung toi du lieu cu.
-- Moi dong dang co nhan NULL = ap cho moi so luong = dung hanh vi truoc thay doi nay.
ALTER TABLE "DealerPriceOverride" ADD COLUMN "minQuantity" INTEGER;
