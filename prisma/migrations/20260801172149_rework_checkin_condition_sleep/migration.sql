/*
  Warnings:

  - You are about to drop the column `equipment` on the `DailyCheckin` table. All the data in the column will be lost.
  - You are about to drop the column `fatigue` on the `DailyCheckin` table. All the data in the column will be lost.
  - Added the required column `condition` to the `DailyCheckin` table without a default value. This is not possible if the table is not empty.

*/
-- AlterTable
ALTER TABLE "DailyCheckin" DROP COLUMN "equipment",
DROP COLUMN "fatigue",
ADD COLUMN     "condition" INTEGER NOT NULL;
