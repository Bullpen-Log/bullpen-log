-- AlterTable
ALTER TABLE "CommunityPost" ADD COLUMN     "acceptedCommentId" TEXT,
ADD COLUMN     "card" JSONB,
ADD COLUMN     "closedAt" TIMESTAMP(3),
ADD COLUMN     "form" JSONB,
ADD COLUMN     "media" TEXT[] DEFAULT ARRAY[]::TEXT[],
ADD COLUMN     "meetAt" TIMESTAMP(3),
ADD COLUMN     "region" TEXT,
ADD COLUMN     "tag" TEXT;

-- CreateTable
CREATE TABLE "CommunityBlock" (
    "blockerId" TEXT NOT NULL,
    "blockedId" TEXT NOT NULL,
    "createdAt" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,

    CONSTRAINT "CommunityBlock_pkey" PRIMARY KEY ("blockerId","blockedId")
);

-- CreateTable
CREATE TABLE "CommunityJoin" (
    "postId" TEXT NOT NULL,
    "userId" TEXT NOT NULL,
    "createdAt" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,

    CONSTRAINT "CommunityJoin_pkey" PRIMARY KEY ("postId","userId")
);

-- CreateTable
CREATE TABLE "CommunityMessage" (
    "id" TEXT NOT NULL,
    "postId" TEXT NOT NULL,
    "threadUserId" TEXT,
    "senderId" TEXT NOT NULL,
    "body" TEXT NOT NULL,
    "createdAt" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,

    CONSTRAINT "CommunityMessage_pkey" PRIMARY KEY ("id")
);

-- CreateIndex
CREATE INDEX "CommunityBlock_blockedId_idx" ON "CommunityBlock"("blockedId");

-- CreateIndex
CREATE INDEX "CommunityJoin_userId_idx" ON "CommunityJoin"("userId");

-- CreateIndex
CREATE INDEX "CommunityMessage_postId_threadUserId_createdAt_idx" ON "CommunityMessage"("postId", "threadUserId", "createdAt");

-- CreateIndex
CREATE INDEX "CommunityMessage_threadUserId_idx" ON "CommunityMessage"("threadUserId");

-- CreateIndex
CREATE INDEX "CommunityMessage_senderId_idx" ON "CommunityMessage"("senderId");

