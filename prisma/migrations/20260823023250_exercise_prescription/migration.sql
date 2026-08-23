-- AlterTable
ALTER TABLE "ExerciseVideo" ADD COLUMN     "holdSeconds" INTEGER,
ADD COLUMN     "perSide" BOOLEAN NOT NULL DEFAULT false,
ADD COLUMN     "reps" INTEGER,
ADD COLUMN     "restSeconds" INTEGER,
ADD COLUMN     "sets" INTEGER;
