-- AlterTable
ALTER TABLE "DailyTrainingSetup" ADD COLUMN     "preferredWorkout" TEXT,
ADD COLUMN     "preferredParts" TEXT[] DEFAULT ARRAY[]::TEXT[];

-- AlterTable
ALTER TABLE "DailyNutrition" ADD COLUMN     "appetite" INTEGER,
ADD COLUMN     "mealAmount" TEXT,
ADD COLUMN     "skippedMeals" TEXT[] DEFAULT ARRAY[]::TEXT[],
ADD COLUMN     "answeredAt" TIMESTAMP(3);
