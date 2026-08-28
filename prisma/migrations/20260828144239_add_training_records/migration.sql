-- AlterTable
ALTER TABLE "UserExerciseLog" ADD COLUMN     "holdSecondsDone" INTEGER,
ADD COLUMN     "repsDone" INTEGER,
ADD COLUMN     "setsDone" INTEGER;

-- CreateTable
CREATE TABLE "DailyTrainingNote" (
    "id" TEXT NOT NULL,
    "userId" TEXT NOT NULL,
    "date" DATE NOT NULL,
    "intensity" INTEGER NOT NULL,
    "memo" TEXT,
    "createdAt" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,
    "updatedAt" TIMESTAMP(3) NOT NULL,

    CONSTRAINT "DailyTrainingNote_pkey" PRIMARY KEY ("id")
);

-- CreateIndex
CREATE UNIQUE INDEX "DailyTrainingNote_userId_date_key" ON "DailyTrainingNote"("userId", "date");
