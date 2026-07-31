/*
  Warnings:

  - You are about to drop the column `phase` on the `MechanicsGuide` table. All the data in the column will be lost.

*/
-- AlterTable
ALTER TABLE "MechanicsGuide" DROP COLUMN "phase",
ADD COLUMN     "category" TEXT NOT NULL DEFAULT '스로잉 드릴';

-- AlterTable
ALTER TABLE "PitchLog" ALTER COLUMN "pitchType" DROP NOT NULL;
