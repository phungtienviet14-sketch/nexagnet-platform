CREATE TYPE "UserRole" AS ENUM ('SALE', 'MANAGER', 'ACCOUNTING', 'ADMIN');

ALTER TABLE "User"
  ADD COLUMN "username" TEXT,
  ADD COLUMN "email" TEXT,
  ADD COLUMN "passwordHash" TEXT,
  ADD COLUMN "disabledAt" TIMESTAMP(3),
  ADD COLUMN "credentialVersion" INTEGER NOT NULL DEFAULT 1,
  ADD COLUMN "updatedAt" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,
  ADD COLUMN "lastLoginAt" TIMESTAMP(3),
  ADD COLUMN "passwordChangedAt" TIMESTAMP(3),
  ADD COLUMN "roleNext" "UserRole";

-- Preserve any pre-auth Phase 5 rows without inventing usable credentials. An administrator must
-- explicitly reset/re-enable them after migration; there is no default password.
UPDATE "User"
SET
  "username" = 'legacy_' || "id",
  "passwordHash" = '!legacy-user-disabled-until-reset!',
  "disabledAt" = CURRENT_TIMESTAMP,
  "roleNext" = CASE "role"
    WHEN 'sale' THEN 'SALE'::"UserRole"
    WHEN 'ke_toan' THEN 'ACCOUNTING'::"UserRole"
    WHEN 'quan_ly' THEN 'MANAGER'::"UserRole"
    ELSE 'SALE'::"UserRole"
  END;

ALTER TABLE "User"
  ALTER COLUMN "username" SET NOT NULL,
  ALTER COLUMN "passwordHash" SET NOT NULL,
  ALTER COLUMN "roleNext" SET NOT NULL,
  DROP COLUMN "role";

ALTER TABLE "User" RENAME COLUMN "roleNext" TO "role";

CREATE UNIQUE INDEX "User_username_key" ON "User"("username");
CREATE UNIQUE INDEX "User_email_key" ON "User"("email");

CREATE TABLE "Session" (
  "id" TEXT NOT NULL,
  "sid" TEXT NOT NULL,
  "data" TEXT NOT NULL,
  "expiresAt" TIMESTAMP(3) NOT NULL,
  CONSTRAINT "Session_pkey" PRIMARY KEY ("id")
);

CREATE UNIQUE INDEX "Session_sid_key" ON "Session"("sid");
CREATE INDEX "Session_expiresAt_idx" ON "Session"("expiresAt");
