-- 운동 선호(덜 추천 · 다시 추천 안 함) — 더하기만. relationMode = "prisma" 라 외래키는 없다.
-- CreateTable
CREATE TABLE "UserExercisePref" (
    "userId" TEXT NOT NULL,
    "exerciseId" TEXT NOT NULL,
    "pref" TEXT NOT NULL,
    "createdAt" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,

    CONSTRAINT "UserExercisePref_pkey" PRIMARY KEY ("userId","exerciseId")
);

-- CreateIndex
CREATE INDEX "UserExercisePref_userId_idx" ON "UserExercisePref"("userId");

-- CreateIndex
CREATE INDEX "UserExercisePref_exerciseId_idx" ON "UserExercisePref"("exerciseId");
