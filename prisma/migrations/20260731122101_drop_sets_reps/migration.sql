/*
  Warnings:

  - You are about to drop the column `reps` on the `ExerciseVideo` table. All the data in the column will be lost.
  - You are about to drop the column `sets` on the `ExerciseVideo` table. All the data in the column will be lost.

*/
-- AlterTable
ALTER TABLE "ExerciseVideo" DROP COLUMN "reps",
DROP COLUMN "sets";
