-- CreateTable
CREATE TABLE "PoseAnalysis" (
    "id" TEXT NOT NULL,
    "userId" TEXT NOT NULL,
    "pitchLogId" TEXT NOT NULL,
    "videoPath" TEXT NOT NULL,
    "throwingSide" TEXT NOT NULL,
    "wristSide" TEXT NOT NULL,
    "leadSide" TEXT NOT NULL,
    "direction" INTEGER NOT NULL,
    "quality" DOUBLE PRECISION NOT NULL,
    "coverage" DOUBLE PRECISION NOT NULL,
    "kneeUpT" DOUBLE PRECISION,
    "footPlantT" DOUBLE PRECISION,
    "releaseT" DOUBLE PRECISION,
    "kneeUpManualT" DOUBLE PRECISION,
    "footPlantManualT" DOUBLE PRECISION,
    "releaseManualT" DOUBLE PRECISION,
    "metrics" JSONB NOT NULL,
    "createdAt" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,
    "updatedAt" TIMESTAMP(3) NOT NULL,

    CONSTRAINT "PoseAnalysis_pkey" PRIMARY KEY ("id")
);

-- CreateIndex
CREATE UNIQUE INDEX "PoseAnalysis_videoPath_key" ON "PoseAnalysis"("videoPath");

-- CreateIndex
CREATE INDEX "PoseAnalysis_userId_idx" ON "PoseAnalysis"("userId");
