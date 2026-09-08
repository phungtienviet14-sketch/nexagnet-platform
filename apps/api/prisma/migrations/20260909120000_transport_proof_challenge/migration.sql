-- LOI THACH THUC CUA MAY CHU cho chung cu van hanh (Issue #235 Lane B).
--
-- `prisma migrate diff` sinh ra ban nay CUNG VOI ba lenh cua mien KHAC — hai
-- `ALTER COLUMN "updatedAt" DROP DEFAULT` tren `DealerPriceOverride` va `User`, va mot
-- `RENAME INDEX` cua `TransportFuelCandidate`. Ca ba la DO LECH CO SAN giua schema va cac
-- migration da chay, KHONG phai he qua cua thay doi nay. Chung da duoc go bo: mot migration cua
-- `transport-proof` khong duoc dong vao bang cua mien khac, va viec ho tro do lech do la viec cua
-- mien so huu chung.

-- Chung cu co kem mot loi thach thuc con han hay khong. Mac dinh `false`: moi hang da co deu di
-- qua duong chua bao gio co loi thach thuc, va noi rang chung "da duoc kiem" se la mot loi noi doi
-- nguoc dong.
ALTER TABLE "TransportOperationalProof" ADD COLUMN "challengeVerified" BOOLEAN NOT NULL DEFAULT false;

CREATE TABLE "TransportProofChallenge" (
    "id" TEXT NOT NULL,
    "nonce" TEXT NOT NULL,
    "driverId" TEXT NOT NULL,
    "sessionId" TEXT NOT NULL,
    "issuedAt" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,
    "expiresAt" TIMESTAMP(3) NOT NULL,
    "consumedAt" TIMESTAMP(3),
    "consumedByProofId" TEXT,

    CONSTRAINT "TransportProofChallenge_pkey" PRIMARY KEY ("id")
);

-- DUNG MOT LAN duoc cuong che o tang DB, khong o tang dich vu.
--
-- Mot phep kiem `if (challenge.consumedAt !== null)` trong dich vu se thua duoi hai yeu cau gui
-- cung luc: ca hai doc thay `null`, ca hai di tiep. Chi mot chi muc duy nhat moi lam cho "mot loi
-- thach thuc phuc vu dung mot chung cu" thanh mot dieu KHONG THE sai.
CREATE UNIQUE INDEX "TransportProofChallenge_nonce_key" ON "TransportProofChallenge"("nonce");

CREATE INDEX "TransportProofChallenge_driverId_expiresAt_idx" ON "TransportProofChallenge"("driverId", "expiresAt");
CREATE INDEX "TransportProofChallenge_sessionId_idx" ON "TransportProofChallenge"("sessionId");

ALTER TABLE "TransportProofChallenge" ADD CONSTRAINT "TransportProofChallenge_driverId_fkey"
  FOREIGN KEY ("driverId") REFERENCES "TransportDriver"("id") ON DELETE RESTRICT ON UPDATE CASCADE;
ALTER TABLE "TransportProofChallenge" ADD CONSTRAINT "TransportProofChallenge_sessionId_fkey"
  FOREIGN KEY ("sessionId") REFERENCES "TransportTrackingSession"("id") ON DELETE RESTRICT ON UPDATE CASCADE;

-- DA DUNG phai co CA HAI hoac KHONG CO GI.
--
-- Mot `consumedAt` khong kem `consumedByProofId` la mot hang noi rang "loi thach thuc nay da bi
-- tieu" ma khong tra loi duoc "boi cai gi" — tuc dung cau hoi duy nhat nguoi ta se hoi khi mo no
-- ra sau nay.
ALTER TABLE "TransportProofChallenge"
  ADD CONSTRAINT "TransportProofChallenge_consumption_shape"
  CHECK (("consumedAt" IS NULL AND "consumedByProofId" IS NULL) OR ("consumedAt" IS NOT NULL AND "consumedByProofId" IS NOT NULL));

-- HAN PHAI O SAU LUC PHAT.
--
-- Day la phan "bounded" cua #235 duoc dat xuong tang luu tru. Mot loi thach thuc co `expiresAt`
-- truoc `issuedAt` da het han ngay khi sinh ra — no khong phai mot bat bien bi vi pham, no la mot
-- hang VO NGHIA, va mot hang vo nghia trong bang bang chung thi te hon mot loi.
ALTER TABLE "TransportProofChallenge"
  ADD CONSTRAINT "TransportProofChallenge_ttl_positive"
  CHECK ("expiresAt" > "issuedAt");

ALTER TABLE "TransportProofChallenge"
  ADD CONSTRAINT "TransportProofChallenge_nonce_not_blank"
  CHECK (btrim("nonce") <> '');
