-- G1-12: bo danh tinh nha cung cap ERP khoi luoc do du lieu.
--
-- FORWARD-SAFE, GIU DU LIEU CU:
--   * `ALTER TABLE ... RENAME COLUMN` cua Postgres la thao tac METADATA — khong copy bang, khong
--     mat mot hang nao, khong khoa lau. Khong dung "them cot moi + xoa cot cu" vi buoc xoa la buoc
--     lam mat du lieu neu ai do dung giua chung.
--   * Cot `view` (JSONB) moi la nguon su that cua repository don (`prisma-orders.repository.ts`);
--     cac cot scalar chi la ban denormalize. Vi vay khoa LONG BEN TRONG cung phai doi theo, neu
--     khong thi hang cu doc ra se thieu truong — cot doi ten con JSON thi khong.
ALTER TABLE "Order" RENAME COLUMN "kiotVietCode" TO "erpCode";

-- `jsonb_exists(...)` thay cho toan tu `?` de dau hoi khong bi hieu nham la tham so truy van.
-- Chi cham hang thuc su co khoa cu; GD1 khong ghi truong nay nen thuc te gan nhu khong hang nao.
UPDATE "Order"
SET "view" = ("view" - 'kiotVietCode') || jsonb_build_object('erpCode', "view" -> 'kiotVietCode')
WHERE "view" IS NOT NULL AND jsonb_exists("view", 'kiotVietCode');
