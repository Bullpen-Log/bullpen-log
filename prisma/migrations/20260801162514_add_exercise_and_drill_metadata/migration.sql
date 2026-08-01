-- AlterTable
ALTER TABLE "ExerciseVideo" ADD COLUMN     "bodyParts" TEXT[],
ADD COLUMN     "difficulty" TEXT,
ADD COLUMN     "equipment" TEXT[],
ADD COLUMN     "intensity" TEXT NOT NULL DEFAULT '중간';

-- AlterTable
ALTER TABLE "MechanicsGuide" ADD COLUMN     "equipment" TEXT[],
ADD COLUMN     "focusPoints" TEXT[];
