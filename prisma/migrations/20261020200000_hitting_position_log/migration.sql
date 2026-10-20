-- 타격 1단계(2026-10-20, docs/designs/hitting-restructure.md) — 더하기만.
-- migrate diff 가 함께 내는 VelocityAttempt 외래키 셋 지우기는 넣지 않았다(예전부터 DB 에만 있는 것, HANDOFF 2026-10-16).

-- AlterTable
ALTER TABLE "User" ADD COLUMN     "battingHand" TEXT,
ADD COLUMN     "hitSetupAt" TIMESTAMP(3),
ADD COLUMN     "position" TEXT;

-- CreateTable
CREATE TABLE "HittingLog" (
    "id" TEXT NOT NULL,
    "userId" TEXT NOT NULL,
    "date" DATE NOT NULL,
    "sessionType" TEXT NOT NULL,
    "swings" INTEGER NOT NULL,
    "effortPct" INTEGER,
    "memo" TEXT,
    "videoPaths" TEXT[] DEFAULT ARRAY[]::TEXT[],
    "satisfaction" INTEGER,
    "createdAt" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,

    CONSTRAINT "HittingLog_pkey" PRIMARY KEY ("id")
);

-- CreateIndex
CREATE INDEX "HittingLog_userId_date_idx" ON "HittingLog"("userId", "date");
