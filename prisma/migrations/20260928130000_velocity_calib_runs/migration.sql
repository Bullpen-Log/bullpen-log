-- AlterTable
ALTER TABLE "VelocityPitch" ADD COLUMN     "engineVersion" TEXT;

-- AlterTable
ALTER TABLE "VelocitySession" ADD COLUMN     "engineVersion" TEXT;

-- CreateTable
CREATE TABLE "VelocityCalibRun" (
    "id" TEXT NOT NULL,
    "date" DATE NOT NULL,
    "pass" INTEGER NOT NULL,
    "engineVersion" TEXT NOT NULL,
    "userId" TEXT NOT NULL,
    "memo" TEXT,
    "createdAt" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,

    CONSTRAINT "VelocityCalibRun_pkey" PRIMARY KEY ("id")
);

-- CreateTable
CREATE TABLE "VelocityCalibResult" (
    "id" TEXT NOT NULL,
    "runId" TEXT NOT NULL,
    "pitchId" TEXT NOT NULL,
    "ok" BOOLEAN NOT NULL,
    "rawKmh" DOUBLE PRECISION,
    "releaseKmh" DOUBLE PRECISION,
    "errorKmh" DOUBLE PRECISION,
    "confidence" TEXT,
    "frames" INTEGER,
    "fps" DOUBLE PRECISION,
    "reject" TEXT,

    CONSTRAINT "VelocityCalibResult_pkey" PRIMARY KEY ("id")
);

-- CreateIndex
CREATE INDEX "VelocityCalibRun_date_idx" ON "VelocityCalibRun"("date");

-- CreateIndex
CREATE INDEX "VelocityCalibResult_runId_idx" ON "VelocityCalibResult"("runId");

-- CreateIndex
CREATE INDEX "VelocityCalibResult_pitchId_idx" ON "VelocityCalibResult"("pitchId");

