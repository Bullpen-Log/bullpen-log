-- 덕아웃 경기 댓글(2026-10-24) — 새 표 하나(더하기만). migrate diff 가 함께 내는 VelocityAttempt 외래키 지우기 셋은 예전부터 DB 에만 있는 어긋남이라 뺐다.

-- CreateTable
CREATE TABLE "GameComment" (
    "id" TEXT NOT NULL,
    "gameId" TEXT NOT NULL,
    "userId" TEXT NOT NULL,
    "body" TEXT NOT NULL,
    "hiddenAt" TIMESTAMP(3),
    "createdAt" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,

    CONSTRAINT "GameComment_pkey" PRIMARY KEY ("id")
);

-- CreateIndex
CREATE INDEX "GameComment_gameId_createdAt_idx" ON "GameComment"("gameId", "createdAt");

-- CreateIndex
CREATE INDEX "GameComment_userId_idx" ON "GameComment"("userId");
