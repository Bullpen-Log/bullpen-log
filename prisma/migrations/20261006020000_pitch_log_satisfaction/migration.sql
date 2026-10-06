-- AlterTable
ALTER TABLE "PitchLog" ADD COLUMN     "cuesBad" TEXT[] DEFAULT ARRAY[]::TEXT[],
ADD COLUMN     "cuesGood" TEXT[] DEFAULT ARRAY[]::TEXT[],
ADD COLUMN     "satisfaction" INTEGER;
