-- Dot A' Task 2 — luu KHOA OBJECT cua anh da tai ve, khong chi cai link Zalo.
--
-- Vi sao can: do that 11/08/2026 tren URL anh lay tu log PoC ngay 07/07 (cach 35 ngay) — `HEAD`
-- tra 404 (`server: za-ngx-srv`), them UA Chrome + Referer chat.zalo.me van 404 (khong phai chan
-- hotlink), trong khi mot anh tinh khac tren zdn.vn tra 200 (CDN van song). URL dang
-- photo-stal-16.zdn.vn/gr/jpg/<hash>/<key>.jpg KHONG co query/chu ky/`expires` => khong phai
-- pre-signed URL co TTL, ma Zalo XOA OBJECT phia server. Cua so song <= 35 ngay.
--
-- Task 1 (11/08) da cho tin chi-anh vao DB, nhung `imageUrl` moi la CAI LINK. Khong tai file ve
-- thi 35 ngay nua van mat — trai `CLAUDE.md` "Luu moi tin nhan/don ve DB ngay khi nhan", va spec
-- khach 2.3.1 (anh bien ban giao hang tu nhom van chuyen) khong chay duoc.
--
-- 4 cot deu NULLABLE: hang cu khong can backfill, va tin khong co anh thi de nguyen null.
-- `mediaError` != NULL nghia la DA THU tai va that bai — tin van nguyen ven, chi thieu file anh.
ALTER TABLE "Message" ADD COLUMN "mediaKey" TEXT;
ALTER TABLE "Message" ADD COLUMN "mediaBytes" INTEGER;
ALTER TABLE "Message" ADD COLUMN "mediaFetchedAt" TIMESTAMP(3);
ALTER TABLE "Message" ADD COLUMN "mediaError" TEXT;
