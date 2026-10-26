-- AlterTable
ALTER TABLE "CommunityJoin" ADD COLUMN     "status" TEXT NOT NULL DEFAULT 'applied',
ADD COLUMN     "statusAt" TIMESTAMP(3);

-- AlterTable
ALTER TABLE "CommunityMessage" ADD COLUMN     "clientId" TEXT,
ADD COLUMN     "hiddenAt" TIMESTAMP(3);

-- AlterTable
ALTER TABLE "CommunityPost" ADD COLUMN     "byStaff" BOOLEAN NOT NULL DEFAULT false,
ADD COLUMN     "district" TEXT,
ADD COLUMN     "editedAt" TIMESTAMP(3),
ADD COLUMN     "firstAnswerAt" TIMESTAMP(3),
ADD COLUMN     "outcome" TEXT,
ADD COLUMN     "outcomeAt" TIMESTAMP(3);

-- AlterTable
ALTER TABLE "CommunityReport" ADD COLUMN     "messageId" TEXT,
ADD COLUMN     "outcome" TEXT;

-- CreateTable
CREATE TABLE "CommunitySave" (
    "postId" TEXT NOT NULL,
    "userId" TEXT NOT NULL,
    "createdAt" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,

    CONSTRAINT "CommunitySave_pkey" PRIMARY KEY ("postId","userId")
);

-- CreateTable
CREATE TABLE "CommunityModeration" (
    "id" TEXT NOT NULL,
    "kind" TEXT NOT NULL,
    "targetId" TEXT NOT NULL,
    "action" TEXT NOT NULL,
    "reason" TEXT,
    "actorId" TEXT,
    "createdAt" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,

    CONSTRAINT "CommunityModeration_pkey" PRIMARY KEY ("id")
);

-- CreateIndex
CREATE INDEX "CommunitySave_userId_createdAt_idx" ON "CommunitySave"("userId", "createdAt");

-- CreateIndex
CREATE INDEX "CommunityModeration_kind_targetId_createdAt_idx" ON "CommunityModeration"("kind", "targetId", "createdAt");

-- CreateIndex
CREATE INDEX "CommunityModeration_action_createdAt_idx" ON "CommunityModeration"("action", "createdAt");

-- CreateIndex
CREATE INDEX "CommunityModeration_actorId_idx" ON "CommunityModeration"("actorId");

-- CreateIndex
CREATE UNIQUE INDEX "CommunityMessage_senderId_clientId_key" ON "CommunityMessage"("senderId", "clientId");

-- CreateIndex
CREATE INDEX "CommunityReport_messageId_idx" ON "CommunityReport"("messageId");

-- CreateIndex
CREATE UNIQUE INDEX "CommunityReport_reporterId_messageId_key" ON "CommunityReport"("reporterId", "messageId");


-- 이미 있는 질문의 첫 답 시각(글쓴이가 아닌 사람의 가리지 않은 댓글) — 2026-10-26 글 0개라 비어 있어도 같은 규칙으로 채운다
UPDATE "CommunityPost" p SET "firstAnswerAt" = (
  SELECT min(c."createdAt") FROM "CommunityComment" c
  WHERE c."postId" = p."id" AND c."userId" <> p."userId" AND c."hiddenAt" IS NULL
) WHERE p."category" = 'question';
