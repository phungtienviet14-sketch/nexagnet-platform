-- AlterTable
ALTER TABLE "Message" ADD COLUMN IF NOT EXISTS "direction" TEXT NOT NULL DEFAULT 'inbound';
