/*
  Warnings:

  - You are about to drop the `UserGuideProgress` table. If the table is not empty, all the data it contains will be lost.

*/
-- DropTable
DROP TABLE "UserGuideProgress";

-- CreateTable
CREATE TABLE "UserExerciseFavorite" (
    "userId" TEXT NOT NULL,
    "exerciseId" TEXT NOT NULL,
    "createdAt" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,

    CONSTRAINT "UserExerciseFavorite_pkey" PRIMARY KEY ("userId","exerciseId")
);

-- CreateTable
CREATE TABLE "UserDrillFavorite" (
    "userId" TEXT NOT NULL,
    "guideId" TEXT NOT NULL,
    "createdAt" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,

    CONSTRAINT "UserDrillFavorite_pkey" PRIMARY KEY ("userId","guideId")
);

-- CreateIndex
CREATE INDEX "UserExerciseFavorite_userId_idx" ON "UserExerciseFavorite"("userId");

-- CreateIndex
CREATE INDEX "UserDrillFavorite_userId_idx" ON "UserDrillFavorite"("userId");
