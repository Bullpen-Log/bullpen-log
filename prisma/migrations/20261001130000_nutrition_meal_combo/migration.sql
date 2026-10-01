-- CreateTable
CREATE TABLE "MealCombo" (
    "id" TEXT NOT NULL,
    "userId" TEXT NOT NULL,
    "name" TEXT NOT NULL,
    "meal" TEXT,
    "items" JSONB NOT NULL,
    "useCount" INTEGER NOT NULL DEFAULT 0,
    "lastUsedAt" TIMESTAMP(3),
    "createdAt" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,
    "updatedAt" TIMESTAMP(3) NOT NULL,

    CONSTRAINT "MealCombo_pkey" PRIMARY KEY ("id")
);

-- CreateIndex
CREATE INDEX "MealCombo_userId_idx" ON "MealCombo"("userId");

