-- 고객센터 · 커뮤니티 1판(2026-10-17, 금윤호) — 새 표 일곱 · enum 하나, 더하기만. 지금 코드를 깨뜨리지 않는다.
-- (prisma migrate diff 로 뽑고, DB 에만 있는 VelocityAttempt 외래키 셋을 지우는 줄은 뺐다 — 김민 10-16 메모와 같다)
-- CreateEnum
CREATE TYPE "InquiryStatus" AS ENUM ('OPEN', 'ANSWERED', 'CLOSED');

-- CreateTable
CREATE TABLE "SupportNotice" (
    "id" TEXT NOT NULL,
    "authorId" TEXT NOT NULL,
    "title" TEXT NOT NULL,
    "body" TEXT NOT NULL,
    "pinned" BOOLEAN NOT NULL DEFAULT false,
    "createdAt" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,
    "updatedAt" TIMESTAMP(3) NOT NULL,

    CONSTRAINT "SupportNotice_pkey" PRIMARY KEY ("id")
);

-- CreateTable
CREATE TABLE "SupportInquiry" (
    "id" TEXT NOT NULL,
    "userId" TEXT NOT NULL,
    "category" TEXT NOT NULL,
    "title" TEXT NOT NULL,
    "body" TEXT NOT NULL,
    "status" "InquiryStatus" NOT NULL DEFAULT 'OPEN',
    "createdAt" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,
    "updatedAt" TIMESTAMP(3) NOT NULL,

    CONSTRAINT "SupportInquiry_pkey" PRIMARY KEY ("id")
);

-- CreateTable
CREATE TABLE "SupportReply" (
    "id" TEXT NOT NULL,
    "inquiryId" TEXT NOT NULL,
    "authorId" TEXT NOT NULL,
    "fromStaff" BOOLEAN NOT NULL DEFAULT false,
    "body" TEXT NOT NULL,
    "createdAt" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,

    CONSTRAINT "SupportReply_pkey" PRIMARY KEY ("id")
);

-- CreateTable
CREATE TABLE "CommunityPost" (
    "id" TEXT NOT NULL,
    "userId" TEXT NOT NULL,
    "category" TEXT NOT NULL,
    "title" TEXT NOT NULL,
    "body" TEXT NOT NULL,
    "hiddenAt" TIMESTAMP(3),
    "createdAt" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,
    "updatedAt" TIMESTAMP(3) NOT NULL,

    CONSTRAINT "CommunityPost_pkey" PRIMARY KEY ("id")
);

-- CreateTable
CREATE TABLE "CommunityComment" (
    "id" TEXT NOT NULL,
    "postId" TEXT NOT NULL,
    "userId" TEXT NOT NULL,
    "body" TEXT NOT NULL,
    "hiddenAt" TIMESTAMP(3),
    "createdAt" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,

    CONSTRAINT "CommunityComment_pkey" PRIMARY KEY ("id")
);

-- CreateTable
CREATE TABLE "CommunityLike" (
    "postId" TEXT NOT NULL,
    "userId" TEXT NOT NULL,
    "createdAt" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,

    CONSTRAINT "CommunityLike_pkey" PRIMARY KEY ("postId","userId")
);

-- CreateTable
CREATE TABLE "CommunityReport" (
    "id" TEXT NOT NULL,
    "reporterId" TEXT NOT NULL,
    "postId" TEXT,
    "commentId" TEXT,
    "reason" TEXT NOT NULL,
    "detail" TEXT,
    "resolvedAt" TIMESTAMP(3),
    "createdAt" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,

    CONSTRAINT "CommunityReport_pkey" PRIMARY KEY ("id")
);

-- CreateIndex
CREATE INDEX "SupportNotice_pinned_createdAt_idx" ON "SupportNotice"("pinned", "createdAt");

-- CreateIndex
CREATE INDEX "SupportNotice_authorId_idx" ON "SupportNotice"("authorId");

-- CreateIndex
CREATE INDEX "SupportInquiry_userId_createdAt_idx" ON "SupportInquiry"("userId", "createdAt");

-- CreateIndex
CREATE INDEX "SupportInquiry_status_createdAt_idx" ON "SupportInquiry"("status", "createdAt");

-- CreateIndex
CREATE INDEX "SupportReply_inquiryId_createdAt_idx" ON "SupportReply"("inquiryId", "createdAt");

-- CreateIndex
CREATE INDEX "SupportReply_authorId_idx" ON "SupportReply"("authorId");

-- CreateIndex
CREATE INDEX "CommunityPost_createdAt_idx" ON "CommunityPost"("createdAt");

-- CreateIndex
CREATE INDEX "CommunityPost_category_createdAt_idx" ON "CommunityPost"("category", "createdAt");

-- CreateIndex
CREATE INDEX "CommunityPost_userId_idx" ON "CommunityPost"("userId");

-- CreateIndex
CREATE INDEX "CommunityComment_postId_createdAt_idx" ON "CommunityComment"("postId", "createdAt");

-- CreateIndex
CREATE INDEX "CommunityComment_userId_idx" ON "CommunityComment"("userId");

-- CreateIndex
CREATE INDEX "CommunityLike_userId_idx" ON "CommunityLike"("userId");

-- CreateIndex
CREATE INDEX "CommunityReport_resolvedAt_createdAt_idx" ON "CommunityReport"("resolvedAt", "createdAt");

-- CreateIndex
CREATE INDEX "CommunityReport_reporterId_idx" ON "CommunityReport"("reporterId");

