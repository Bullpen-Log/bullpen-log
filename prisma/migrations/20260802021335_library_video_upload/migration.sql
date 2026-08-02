/*
  Warnings:

  - You are about to drop the column `videoUrl` on the `ExerciseVideo` table. All the data in the column will be lost.
  - You are about to drop the column `videoUrl` on the `MechanicsGuide` table. All the data in the column will be lost.
  - Added the required column `videoPath` to the `ExerciseVideo` table without a default value. This is not possible if the table is not empty.
  - Added the required column `videoPath` to the `MechanicsGuide` table without a default value. This is not possible if the table is not empty.

*/
-- AlterTable
ALTER TABLE "ExerciseVideo" DROP COLUMN "videoUrl",
ADD COLUMN     "videoPath" TEXT NOT NULL;

-- AlterTable
ALTER TABLE "MechanicsGuide" DROP COLUMN "videoUrl",
ADD COLUMN     "videoPath" TEXT NOT NULL;
