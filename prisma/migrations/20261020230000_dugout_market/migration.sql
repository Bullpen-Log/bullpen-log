-- 덕아웃 장터 1판(2026-10-20, docs/designs/baseball-hub.md) — 더하기만.
-- 물건(Listing) · 찜(ListingFavorite) · 채팅(Conversation · Message), 신고(CommunityReport)에 listingId. 공유 DB 적용은 배포(migrate deploy)의 일.

-- AlterTable
ALTER TABLE "CommunityReport" ADD COLUMN     "listingId" TEXT;

-- CreateTable
CREATE TABLE "Listing" (
    "id" TEXT NOT NULL,
    "userId" TEXT NOT NULL,
    "category" TEXT NOT NULL,
    "title" TEXT NOT NULL,
    "price" INTEGER NOT NULL,
    "body" TEXT NOT NULL,
    "condition" TEXT NOT NULL,
    "specs" JSONB NOT NULL DEFAULT '{}',
    "region" TEXT NOT NULL,
    "images" TEXT[] DEFAULT ARRAY[]::TEXT[],
    "status" TEXT NOT NULL DEFAULT 'ACTIVE',
    "views" INTEGER NOT NULL DEFAULT 0,
    "hiddenAt" TIMESTAMP(3),
    "createdAt" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,
    "updatedAt" TIMESTAMP(3) NOT NULL,

    CONSTRAINT "Listing_pkey" PRIMARY KEY ("id")
);

-- CreateTable
CREATE TABLE "ListingFavorite" (
    "listingId" TEXT NOT NULL,
    "userId" TEXT NOT NULL,
    "createdAt" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,

    CONSTRAINT "ListingFavorite_pkey" PRIMARY KEY ("listingId","userId")
);

-- CreateTable
CREATE TABLE "Conversation" (
    "id" TEXT NOT NULL,
    "listingId" TEXT,
    "buyerId" TEXT NOT NULL,
    "sellerId" TEXT NOT NULL,
    "lastText" TEXT,
    "lastAt" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,
    "buyerReadAt" TIMESTAMP(3),
    "sellerReadAt" TIMESTAMP(3),
    "createdAt" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,

    CONSTRAINT "Conversation_pkey" PRIMARY KEY ("id")
);

-- CreateTable
CREATE TABLE "Message" (
    "id" TEXT NOT NULL,
    "conversationId" TEXT NOT NULL,
    "senderId" TEXT NOT NULL,
    "body" TEXT NOT NULL,
    "createdAt" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,

    CONSTRAINT "Message_pkey" PRIMARY KEY ("id")
);

-- CreateIndex
CREATE INDEX "Listing_status_hiddenAt_createdAt_idx" ON "Listing"("status", "hiddenAt", "createdAt");

-- CreateIndex
CREATE INDEX "Listing_category_status_createdAt_idx" ON "Listing"("category", "status", "createdAt");

-- CreateIndex
CREATE INDEX "Listing_userId_idx" ON "Listing"("userId");

-- CreateIndex
CREATE INDEX "ListingFavorite_userId_idx" ON "ListingFavorite"("userId");

-- CreateIndex
CREATE INDEX "Conversation_buyerId_lastAt_idx" ON "Conversation"("buyerId", "lastAt");

-- CreateIndex
CREATE INDEX "Conversation_sellerId_lastAt_idx" ON "Conversation"("sellerId", "lastAt");

-- CreateIndex
CREATE UNIQUE INDEX "Conversation_listingId_buyerId_key" ON "Conversation"("listingId", "buyerId");

-- CreateIndex
CREATE INDEX "Message_conversationId_createdAt_idx" ON "Message"("conversationId", "createdAt");

-- CreateIndex
CREATE INDEX "Message_senderId_idx" ON "Message"("senderId");

-- CreateIndex
CREATE INDEX "CommunityReport_listingId_idx" ON "CommunityReport"("listingId");

-- CreateIndex
CREATE UNIQUE INDEX "CommunityReport_reporterId_listingId_key" ON "CommunityReport"("reporterId", "listingId");
