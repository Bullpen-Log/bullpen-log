-- AlterTable
ALTER TABLE "NutritionProfile" ADD COLUMN     "allowSupplements" BOOLEAN NOT NULL DEFAULT true,
ADD COLUMN     "avoidFoods" TEXT[] DEFAULT ARRAY[]::TEXT[],
ADD COLUMN     "dietStyle" TEXT,
ADD COLUMN     "goalEndDate" DATE,
ADD COLUMN     "mealPattern" TEXT,
ADD COLUMN     "proteinTargetG" DOUBLE PRECISION,
ADD COLUMN     "seasonPhase" TEXT;

-- CreateTable
CREATE TABLE "MealPlan" (
    "id" TEXT NOT NULL,
    "userId" TEXT NOT NULL,
    "date" DATE NOT NULL,
    "items" JSONB NOT NULL,
    "context" JSONB NOT NULL,
    "createdAt" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,
    "updatedAt" TIMESTAMP(3) NOT NULL,

    CONSTRAINT "MealPlan_pkey" PRIMARY KEY ("id")
);

-- CreateIndex
CREATE UNIQUE INDEX "MealPlan_userId_date_key" ON "MealPlan"("userId", "date");

