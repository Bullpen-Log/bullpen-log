-- CreateEnum
CREATE TYPE "ExerciseSource" AS ENUM ('OWN', 'REFERENCE');

-- AlterTable
ALTER TABLE "ExerciseVideo" ADD COLUMN     "referenceVideoId" TEXT,
ADD COLUMN     "source" "ExerciseSource" NOT NULL DEFAULT 'OWN',
ALTER COLUMN "videoPath" DROP NOT NULL;
