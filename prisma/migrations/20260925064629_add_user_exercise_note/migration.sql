-- CreateTable
CREATE TABLE "UserExerciseNote" (
    "userId" TEXT NOT NULL,
    "exerciseId" TEXT NOT NULL,
    "body" TEXT NOT NULL,
    "createdAt" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,
    "updatedAt" TIMESTAMP(3) NOT NULL,

    CONSTRAINT "UserExerciseNote_pkey" PRIMARY KEY ("userId","exerciseId")
);

-- CreateIndex
CREATE INDEX "UserExerciseNote_exerciseId_idx" ON "UserExerciseNote"("exerciseId");

