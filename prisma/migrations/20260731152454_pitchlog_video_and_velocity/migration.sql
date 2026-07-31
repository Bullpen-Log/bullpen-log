/*
  Warnings:

  - You are about to drop the column `pitchType` on the `PitchLog` table. All the data in the column will be lost.
  - You are about to drop the column `velocity` on the `PitchLog` table. All the data in the column will be lost.
  - Added the required column `maxVelocity` to the `PitchLog` table without a default value. This is not possible if the table is not empty.

*/
-- AlterTable
ALTER TABLE "PitchLog" DROP COLUMN "pitchType",
DROP COLUMN "velocity",
ADD COLUMN     "avgVelocity" DOUBLE PRECISION,
ADD COLUMN     "maxVelocity" DOUBLE PRECISION NOT NULL,
ADD COLUMN     "videoUrls" TEXT[];
