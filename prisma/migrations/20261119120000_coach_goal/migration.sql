-- AlterTable
ALTER TABLE "CoachMessage" ADD COLUMN     "goal" JSONB;

-- CreateTable
CREATE TABLE "CoachGoal" (
    "id" TEXT NOT NULL,
    "userId" TEXT NOT NULL,
    "what" TEXT NOT NULL,
    "trigger" TEXT,
    "checkOn" DATE NOT NULL,
    "watchFrom" DATE NOT NULL,
    "status" TEXT NOT NULL DEFAULT 'open',
    "feel" TEXT,
    "result" TEXT,
    "setAt" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,
    "laterOn" DATE,
    "answeredAt" TIMESTAMP(3),
    "updatedAt" TIMESTAMP(3) NOT NULL,

    CONSTRAINT "CoachGoal_pkey" PRIMARY KEY ("id")
);

-- CreateIndex
CREATE UNIQUE INDEX "CoachGoal_userId_key" ON "CoachGoal"("userId");

