-- `chatId` cua zca-js phu thuoc tai khoan dang nhap. `globalId` la identity on dinh de mot nhom
-- khong bi tao lai khi operator doi tai khoan phu.
ALTER TABLE "Group" ADD COLUMN "globalId" TEXT;

CREATE UNIQUE INDEX "Group_globalId_key" ON "Group"("globalId");

-- UID thanh vien cung phu thuoc tai khoan; giu globalId de khong mat phan loai khi doi account.
ALTER TABLE "GroupParticipant" ADD COLUMN "globalId" TEXT;

CREATE UNIQUE INDEX "GroupParticipant_groupId_globalId_key"
ON "GroupParticipant"("groupId", "globalId");
