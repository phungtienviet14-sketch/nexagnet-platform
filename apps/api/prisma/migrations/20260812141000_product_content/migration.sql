CREATE TYPE "ContentStatus" AS ENUM ('draft', 'reviewed', 'approved', 'active');
CREATE TYPE "ContentAssetKind" AS ENUM ('image', 'video', 'pdf', 'catalog', 'company_profile');
CREATE TYPE "ContentSourceKind" AS ENUM ('local_manifest', 'google_drive', 'object_storage', 'operator');
CREATE TYPE "ContentLinkKind" AS ENUM ('video', 'catalog', 'company_profile');

CREATE TABLE "SourceProvenance" (
  "id" TEXT NOT NULL,
  "kind" "ContentSourceKind" NOT NULL,
  "sourceId" TEXT NOT NULL,
  "locator" TEXT,
  "hash" TEXT,
  "version" TEXT,
  "importedAt" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,
  CONSTRAINT "SourceProvenance_pkey" PRIMARY KEY ("id")
);

CREATE TABLE "Asset" (
  "id" TEXT NOT NULL,
  "externalId" TEXT NOT NULL,
  "kind" "ContentAssetKind" NOT NULL,
  "title" TEXT,
  "locator" TEXT NOT NULL,
  "mimeType" TEXT,
  "source" "ContentSourceKind" NOT NULL,
  "sourceFileId" TEXT,
  "hash" TEXT,
  "version" TEXT,
  "status" "ContentStatus" NOT NULL DEFAULT 'draft',
  "provenanceId" TEXT,
  "operatorEdited" BOOLEAN NOT NULL DEFAULT false,
  "createdAt" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,
  "updatedAt" TIMESTAMP(3) NOT NULL,
  CONSTRAINT "Asset_pkey" PRIMARY KEY ("id")
);

CREATE TABLE "ProductAsset" (
  "productSku" TEXT NOT NULL,
  "assetId" TEXT NOT NULL,
  CONSTRAINT "ProductAsset_pkey" PRIMARY KEY ("productSku", "assetId")
);

CREATE TABLE "FAQ" (
  "id" TEXT NOT NULL,
  "externalId" TEXT NOT NULL,
  "productSku" TEXT,
  "question" TEXT NOT NULL,
  "answer" TEXT NOT NULL,
  "status" "ContentStatus" NOT NULL DEFAULT 'draft',
  "provenanceId" TEXT,
  "operatorEdited" BOOLEAN NOT NULL DEFAULT false,
  "createdAt" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,
  "updatedAt" TIMESTAMP(3) NOT NULL,
  CONSTRAINT "FAQ_pkey" PRIMARY KEY ("id")
);

CREATE TABLE "AdviceContent" (
  "id" TEXT NOT NULL,
  "externalId" TEXT NOT NULL,
  "productSku" TEXT,
  "title" TEXT NOT NULL,
  "body" TEXT NOT NULL,
  "status" "ContentStatus" NOT NULL DEFAULT 'draft',
  "provenanceId" TEXT,
  "operatorEdited" BOOLEAN NOT NULL DEFAULT false,
  "createdAt" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,
  "updatedAt" TIMESTAMP(3) NOT NULL,
  CONSTRAINT "AdviceContent_pkey" PRIMARY KEY ("id")
);

CREATE TABLE "ContentLink" (
  "id" TEXT NOT NULL,
  "externalId" TEXT NOT NULL,
  "productSku" TEXT,
  "kind" "ContentLinkKind" NOT NULL,
  "title" TEXT NOT NULL,
  "url" TEXT NOT NULL,
  "status" "ContentStatus" NOT NULL DEFAULT 'draft',
  "provenanceId" TEXT,
  "operatorEdited" BOOLEAN NOT NULL DEFAULT false,
  "createdAt" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,
  "updatedAt" TIMESTAMP(3) NOT NULL,
  CONSTRAINT "ContentLink_pkey" PRIMARY KEY ("id")
);

CREATE TABLE "ContentReadiness" (
  "key" TEXT NOT NULL,
  "productSku" TEXT,
  "ready" BOOLEAN NOT NULL DEFAULT false,
  "missing" TEXT[] DEFAULT ARRAY[]::TEXT[],
  "checkedAt" TIMESTAMP(3) NOT NULL,
  CONSTRAINT "ContentReadiness_pkey" PRIMARY KEY ("key")
);

CREATE UNIQUE INDEX "SourceProvenance_kind_sourceId_key" ON "SourceProvenance"("kind", "sourceId");
CREATE UNIQUE INDEX "Asset_provenanceId_externalId_key" ON "Asset"("provenanceId", "externalId");
CREATE INDEX "Asset_status_kind_idx" ON "Asset"("status", "kind");
CREATE INDEX "ProductAsset_assetId_idx" ON "ProductAsset"("assetId");
CREATE UNIQUE INDEX "FAQ_provenanceId_externalId_key" ON "FAQ"("provenanceId", "externalId");
CREATE INDEX "FAQ_productSku_status_idx" ON "FAQ"("productSku", "status");
CREATE UNIQUE INDEX "AdviceContent_provenanceId_externalId_key" ON "AdviceContent"("provenanceId", "externalId");
CREATE INDEX "AdviceContent_productSku_status_idx" ON "AdviceContent"("productSku", "status");
CREATE UNIQUE INDEX "ContentLink_provenanceId_externalId_key" ON "ContentLink"("provenanceId", "externalId");
CREATE INDEX "ContentLink_productSku_status_kind_idx" ON "ContentLink"("productSku", "status", "kind");
CREATE UNIQUE INDEX "ContentReadiness_productSku_key" ON "ContentReadiness"("productSku");

ALTER TABLE "Asset" ADD CONSTRAINT "Asset_provenanceId_fkey" FOREIGN KEY ("provenanceId") REFERENCES "SourceProvenance"("id") ON DELETE SET NULL ON UPDATE CASCADE;
ALTER TABLE "ProductAsset" ADD CONSTRAINT "ProductAsset_productSku_fkey" FOREIGN KEY ("productSku") REFERENCES "Product"("sku") ON DELETE CASCADE ON UPDATE CASCADE;
ALTER TABLE "ProductAsset" ADD CONSTRAINT "ProductAsset_assetId_fkey" FOREIGN KEY ("assetId") REFERENCES "Asset"("id") ON DELETE CASCADE ON UPDATE CASCADE;
ALTER TABLE "FAQ" ADD CONSTRAINT "FAQ_productSku_fkey" FOREIGN KEY ("productSku") REFERENCES "Product"("sku") ON DELETE SET NULL ON UPDATE CASCADE;
ALTER TABLE "FAQ" ADD CONSTRAINT "FAQ_provenanceId_fkey" FOREIGN KEY ("provenanceId") REFERENCES "SourceProvenance"("id") ON DELETE SET NULL ON UPDATE CASCADE;
ALTER TABLE "AdviceContent" ADD CONSTRAINT "AdviceContent_productSku_fkey" FOREIGN KEY ("productSku") REFERENCES "Product"("sku") ON DELETE SET NULL ON UPDATE CASCADE;
ALTER TABLE "AdviceContent" ADD CONSTRAINT "AdviceContent_provenanceId_fkey" FOREIGN KEY ("provenanceId") REFERENCES "SourceProvenance"("id") ON DELETE SET NULL ON UPDATE CASCADE;
ALTER TABLE "ContentLink" ADD CONSTRAINT "ContentLink_productSku_fkey" FOREIGN KEY ("productSku") REFERENCES "Product"("sku") ON DELETE SET NULL ON UPDATE CASCADE;
ALTER TABLE "ContentLink" ADD CONSTRAINT "ContentLink_provenanceId_fkey" FOREIGN KEY ("provenanceId") REFERENCES "SourceProvenance"("id") ON DELETE SET NULL ON UPDATE CASCADE;
ALTER TABLE "ContentReadiness" ADD CONSTRAINT "ContentReadiness_productSku_fkey" FOREIGN KEY ("productSku") REFERENCES "Product"("sku") ON DELETE CASCADE ON UPDATE CASCADE;
