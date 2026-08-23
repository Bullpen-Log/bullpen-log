-- AlterTable
ALTER TABLE "MechanicsGuide" ADD COLUMN     "referenceVideoId" TEXT,
ADD COLUMN     "source" "ExerciseSource" NOT NULL DEFAULT 'OWN',
ALTER COLUMN "videoPath" DROP NOT NULL;
