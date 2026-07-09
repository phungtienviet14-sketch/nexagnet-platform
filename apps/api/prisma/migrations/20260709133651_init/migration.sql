-- CreateEnum
CREATE TYPE "DealerTier" AS ENUM ('dai_ly', 'ctv');

-- CreateEnum
CREATE TYPE "PolicyType" AS ENUM ('cong_no_30', 'cong_no_45', 'ky_gui', 'thanh_toan_ngay', 'cod');

-- CreateEnum
CREATE TYPE "OrderStatus" AS ENUM ('draft', 'pending_review', 'needs_edit', 'approved', 'rejected', 'sent', 'synced');

-- CreateEnum
CREATE TYPE "GroupMappingStatus" AS ENUM ('pending', 'mapped', 'ignored');

-- CreateTable
CREATE TABLE "Dealer" (
    "id" TEXT NOT NULL,
    "code" TEXT,
    "name" TEXT NOT NULL,
    "aliases" TEXT[] DEFAULT ARRAY[]::TEXT[],
    "tier" "DealerTier" NOT NULL,
    "defaultPolicy" "PolicyType" NOT NULL,
    "phone" TEXT,
    "createdAt" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,
    "updatedAt" TIMESTAMP(3) NOT NULL,

    CONSTRAINT "Dealer_pkey" PRIMARY KEY ("id")
);

-- CreateTable
CREATE TABLE "Group" (
    "id" TEXT NOT NULL,
    "platform" TEXT NOT NULL DEFAULT 'zalo',
    "chatId" TEXT NOT NULL,
    "name" TEXT,
    "branch" TEXT,
    "dealerId" TEXT,
    "status" "GroupMappingStatus" NOT NULL DEFAULT 'pending',
    "source" TEXT,
    "lastSeenAt" TIMESTAMP(3),
    "createdAt" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,
    "updatedAt" TIMESTAMP(3) NOT NULL,

    CONSTRAINT "Group_pkey" PRIMARY KEY ("id")
);

-- CreateTable
CREATE TABLE "Product" (
    "sku" TEXT NOT NULL,
    "name" TEXT NOT NULL,
    "aliases" TEXT[] DEFAULT ARRAY[]::TEXT[],
    "unit" TEXT NOT NULL,
    "description" TEXT,

    CONSTRAINT "Product_pkey" PRIMARY KEY ("sku")
);

-- CreateTable
CREATE TABLE "Price" (
    "sku" TEXT NOT NULL,
    "wholesale" INTEGER NOT NULL,
    "minRetailPrice" INTEGER,
    "retailPrice" INTEGER,
    "listPrice" INTEGER,
    "validMonth" TEXT,
    "updatedAt" TIMESTAMP(3) NOT NULL,

    CONSTRAINT "Price_pkey" PRIMARY KEY ("sku")
);

-- CreateTable
CREATE TABLE "DealerPriceOverride" (
    "id" TEXT NOT NULL,
    "dealerId" TEXT NOT NULL,
    "sku" TEXT NOT NULL,
    "price" INTEGER NOT NULL,

    CONSTRAINT "DealerPriceOverride_pkey" PRIMARY KEY ("id")
);

-- CreateTable
CREATE TABLE "GlossaryEntry" (
    "term" TEXT NOT NULL,
    "meaning" TEXT NOT NULL,

    CONSTRAINT "GlossaryEntry_pkey" PRIMARY KEY ("term")
);

-- CreateTable
CREATE TABLE "Message" (
    "id" TEXT NOT NULL,
    "externalMessageId" TEXT NOT NULL,
    "platform" TEXT NOT NULL DEFAULT 'zalo',
    "source" TEXT NOT NULL,
    "chatId" TEXT NOT NULL,
    "groupId" TEXT,
    "senderExternalId" TEXT,
    "senderDisplayName" TEXT,
    "text" TEXT NOT NULL,
    "imageUrl" TEXT,
    "sentAt" TIMESTAMP(3) NOT NULL,
    "receivedAt" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,
    "raw" JSONB,

    CONSTRAINT "Message_pkey" PRIMARY KEY ("id")
);

-- CreateTable
CREATE TABLE "Order" (
    "id" TEXT NOT NULL,
    "status" "OrderStatus" NOT NULL DEFAULT 'pending_review',
    "orderType" TEXT,
    "intent" TEXT NOT NULL,
    "senderType" TEXT NOT NULL,
    "chatId" TEXT NOT NULL,
    "groupId" TEXT,
    "dealerId" TEXT,
    "dealerName" TEXT,
    "branch" TEXT,
    "groupName" TEXT,
    "rawText" TEXT NOT NULL,
    "imageUrl" TEXT,
    "messageId" TEXT,
    "confidence" JSONB,
    "parsed" JSONB,
    "priced" JSONB,
    "trace" JSONB,
    "grandTotal" INTEGER,
    "kiotVietCode" TEXT,
    "view" JSONB,
    "createdAt" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,
    "updatedAt" TIMESTAMP(3) NOT NULL,

    CONSTRAINT "Order_pkey" PRIMARY KEY ("id")
);

-- CreateTable
CREATE TABLE "OrderItem" (
    "id" TEXT NOT NULL,
    "orderId" TEXT NOT NULL,
    "sku" TEXT,
    "skuRaw" TEXT NOT NULL,
    "productName" TEXT,
    "quantity" INTEGER NOT NULL,
    "unitPrice" INTEGER NOT NULL,
    "lineTotal" INTEGER NOT NULL,
    "matched" BOOLEAN NOT NULL DEFAULT false,

    CONSTRAINT "OrderItem_pkey" PRIMARY KEY ("id")
);

-- CreateTable
CREATE TABLE "ParseFeedback" (
    "id" TEXT NOT NULL,
    "orderId" TEXT,
    "aiOutput" JSONB NOT NULL,
    "corrected" JSONB NOT NULL,
    "createdAt" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,

    CONSTRAINT "ParseFeedback_pkey" PRIMARY KEY ("id")
);

-- CreateTable
CREATE TABLE "User" (
    "id" TEXT NOT NULL,
    "name" TEXT NOT NULL,
    "phone" TEXT,
    "role" TEXT NOT NULL,
    "createdAt" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,

    CONSTRAINT "User_pkey" PRIMARY KEY ("id")
);

-- CreateTable
CREATE TABLE "KpiEvent" (
    "id" TEXT NOT NULL,
    "type" TEXT NOT NULL,
    "orderId" TEXT,
    "payload" JSONB,
    "at" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,

    CONSTRAINT "KpiEvent_pkey" PRIMARY KEY ("id")
);

-- CreateIndex
CREATE UNIQUE INDEX "Dealer_code_key" ON "Dealer"("code");

-- CreateIndex
CREATE INDEX "Group_status_idx" ON "Group"("status");

-- CreateIndex
CREATE UNIQUE INDEX "Group_platform_chatId_key" ON "Group"("platform", "chatId");

-- CreateIndex
CREATE UNIQUE INDEX "DealerPriceOverride_dealerId_sku_key" ON "DealerPriceOverride"("dealerId", "sku");

-- CreateIndex
CREATE INDEX "Message_chatId_idx" ON "Message"("chatId");

-- CreateIndex
CREATE UNIQUE INDEX "Message_platform_externalMessageId_key" ON "Message"("platform", "externalMessageId");

-- CreateIndex
CREATE INDEX "Order_status_idx" ON "Order"("status");

-- CreateIndex
CREATE INDEX "Order_chatId_idx" ON "Order"("chatId");

-- CreateIndex
CREATE UNIQUE INDEX "User_phone_key" ON "User"("phone");

-- CreateIndex
CREATE INDEX "KpiEvent_type_idx" ON "KpiEvent"("type");

-- AddForeignKey
ALTER TABLE "Group" ADD CONSTRAINT "Group_dealerId_fkey" FOREIGN KEY ("dealerId") REFERENCES "Dealer"("id") ON DELETE SET NULL ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "Price" ADD CONSTRAINT "Price_sku_fkey" FOREIGN KEY ("sku") REFERENCES "Product"("sku") ON DELETE RESTRICT ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "DealerPriceOverride" ADD CONSTRAINT "DealerPriceOverride_dealerId_fkey" FOREIGN KEY ("dealerId") REFERENCES "Dealer"("id") ON DELETE RESTRICT ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "DealerPriceOverride" ADD CONSTRAINT "DealerPriceOverride_sku_fkey" FOREIGN KEY ("sku") REFERENCES "Product"("sku") ON DELETE RESTRICT ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "Message" ADD CONSTRAINT "Message_groupId_fkey" FOREIGN KEY ("groupId") REFERENCES "Group"("id") ON DELETE SET NULL ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "Order" ADD CONSTRAINT "Order_groupId_fkey" FOREIGN KEY ("groupId") REFERENCES "Group"("id") ON DELETE SET NULL ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "Order" ADD CONSTRAINT "Order_dealerId_fkey" FOREIGN KEY ("dealerId") REFERENCES "Dealer"("id") ON DELETE SET NULL ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "Order" ADD CONSTRAINT "Order_messageId_fkey" FOREIGN KEY ("messageId") REFERENCES "Message"("id") ON DELETE SET NULL ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "OrderItem" ADD CONSTRAINT "OrderItem_orderId_fkey" FOREIGN KEY ("orderId") REFERENCES "Order"("id") ON DELETE CASCADE ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "OrderItem" ADD CONSTRAINT "OrderItem_sku_fkey" FOREIGN KEY ("sku") REFERENCES "Product"("sku") ON DELETE SET NULL ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "ParseFeedback" ADD CONSTRAINT "ParseFeedback_orderId_fkey" FOREIGN KEY ("orderId") REFERENCES "Order"("id") ON DELETE SET NULL ON UPDATE CASCADE;
