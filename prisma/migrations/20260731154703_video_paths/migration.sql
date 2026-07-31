/*
  Warnings:

  - You are about to drop the column `videoUrls` on the `PitchLog` table. All the data in the column will be lost.

*/
-- AlterTable
ALTER TABLE "PitchLog" DROP COLUMN "videoUrls",
ADD COLUMN     "videoPaths" TEXT[];
