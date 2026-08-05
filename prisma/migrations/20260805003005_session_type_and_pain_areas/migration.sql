-- AlterTable
ALTER TABLE "DailyCheckin" ADD COLUMN     "lowerBack" TEXT NOT NULL DEFAULT '정상',
ADD COLUMN     "lowerBody" TEXT NOT NULL DEFAULT '정상',
ADD COLUMN     "wrist" TEXT NOT NULL DEFAULT '정상';

-- AlterTable
ALTER TABLE "PitchLog" ADD COLUMN     "sessionType" TEXT NOT NULL DEFAULT '불펜';
