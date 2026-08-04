-- Them nguon "hoc tu luong tin" cho thanh vien nhom.
--
-- Vi sao can: Zalo tra danh sach thanh vien RONG voi tai khoan that (getGroupInfo cho memberIds,
-- currentMems, adminIds deu rong du totalMember dung), va Bot Platform khong co API thanh vien nao
-- (getChat / getChatMemberCount / getChatAdministrators deu 404 — do thu 04/08/2026). Nguon con lai
-- duy nhat la chinh luong tin: ca hai kenh deu kem uid + ten nguoi gui o moi tin.
--
-- ALTER TYPE ... ADD VALUE khong chay duoc trong transaction o Postgres cu; Prisma chay file
-- migration ngoai transaction nen an toan. Them gia tri KHONG dung toi hang cu.
ALTER TYPE "ParticipantSource" ADD VALUE IF NOT EXISTS 'message_stream';
