-- AlterTable
ALTER TABLE "VelocityPitch" ADD COLUMN     "analysis" JSONB,
ADD COLUMN     "autoDetected" BOOLEAN NOT NULL DEFAULT true,
ADD COLUMN     "calibExclude" BOOLEAN NOT NULL DEFAULT false,
ADD COLUMN     "clipBytes" INTEGER,
ADD COLUMN     "clipEventSec" DOUBLE PRECISION,
ADD COLUMN     "clipMime" TEXT,
ADD COLUMN     "clipPath" TEXT,
ADD COLUMN     "clipSec" DOUBLE PRECISION;

-- AlterTable
ALTER TABLE "VelocitySession" ADD COLUMN     "autoMode" BOOLEAN NOT NULL DEFAULT true,
ADD COLUMN     "focalPx" DOUBLE PRECISION,
ADD COLUMN     "forCalibration" BOOLEAN NOT NULL DEFAULT false,
ADD COLUMN     "frameH" INTEGER,
ADD COLUMN     "frameW" INTEGER,
ADD COLUMN     "lensCal" JSONB,
ADD COLUMN     "releaseDistM" DOUBLE PRECISION;

