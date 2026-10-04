-- AlterTable
ALTER TABLE "UserExerciseSet" ADD COLUMN     "rir" INTEGER;

-- CreateTable
CREATE TABLE "UserTrainingProgram" (
    "id" TEXT NOT NULL,
    "userId" TEXT NOT NULL,
    "programKey" TEXT NOT NULL,
    "status" TEXT NOT NULL DEFAULT 'active',
    "season" TEXT NOT NULL,
    "nextDay" INTEGER NOT NULL DEFAULT 1,
    "pinned" JSONB NOT NULL,
    "skippedDays" INTEGER NOT NULL DEFAULT 0,
    "lastDoneDate" DATE,
    "overrideDate" DATE,
    "startedAt" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,
    "endedAt" TIMESTAMP(3),
    "endReason" TEXT,
    "createdAt" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,
    "updatedAt" TIMESTAMP(3) NOT NULL,

    CONSTRAINT "UserTrainingProgram_pkey" PRIMARY KEY ("id")
);

-- CreateIndex
CREATE INDEX "UserTrainingProgram_userId_status_idx" ON "UserTrainingProgram"("userId", "status");

