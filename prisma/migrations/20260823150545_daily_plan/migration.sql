-- AlterTable
ALTER TABLE "DailyTrainingSetup" ADD COLUMN     "generatedAt" TIMESTAMP(3),
ADD COLUMN     "plan" JSONB;
