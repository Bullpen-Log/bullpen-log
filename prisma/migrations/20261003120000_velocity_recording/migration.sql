-- CreateTable
CREATE TABLE "VelocityRecording" (
    "id" TEXT NOT NULL,
    "userId" TEXT NOT NULL,
    "date" DATE NOT NULL,
    "status" TEXT NOT NULL DEFAULT 'recording',
    "durationSec" DOUBLE PRECISION,
    "meta" JSONB,
    "memo" TEXT,
    "createdAt" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,
    "updatedAt" TIMESTAMP(3) NOT NULL,

    CONSTRAINT "VelocityRecording_pkey" PRIMARY KEY ("id")
);

-- CreateTable
CREATE TABLE "VelocityRecordingPart" (
    "id" TEXT NOT NULL,
    "recordingId" TEXT NOT NULL,
    "index" INTEGER NOT NULL,
    "path" TEXT NOT NULL,
    "bytes" INTEGER NOT NULL,
    "mime" TEXT NOT NULL,
    "offsetSec" DOUBLE PRECISION NOT NULL,
    "durationSec" DOUBLE PRECISION,
    "createdAt" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,

    CONSTRAINT "VelocityRecordingPart_pkey" PRIMARY KEY ("id")
);

-- CreateTable
CREATE TABLE "VelocityRecordingCut" (
    "id" TEXT NOT NULL,
    "recordingId" TEXT NOT NULL,
    "partId" TEXT NOT NULL,
    "startSec" DOUBLE PRECISION NOT NULL,
    "endSec" DOUBLE PRECISION NOT NULL,
    "eventSec" DOUBLE PRECISION,
    "gunKmh" DOUBLE PRECISION,
    "pitchType" TEXT,
    "memo" TEXT,
    "excluded" BOOLEAN NOT NULL DEFAULT false,
    "ok" BOOLEAN,
    "rawKmh" DOUBLE PRECISION,
    "releaseKmh" DOUBLE PRECISION,
    "errorKmh" DOUBLE PRECISION,
    "reject" TEXT,
    "engineVersion" TEXT,
    "measuredAt" TIMESTAMP(3),
    "analysis" JSONB,
    "createdAt" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,
    "updatedAt" TIMESTAMP(3) NOT NULL,

    CONSTRAINT "VelocityRecordingCut_pkey" PRIMARY KEY ("id")
);

-- CreateIndex
CREATE INDEX "VelocityRecording_userId_date_idx" ON "VelocityRecording"("userId", "date");

-- CreateIndex
CREATE INDEX "VelocityRecording_date_idx" ON "VelocityRecording"("date");

-- CreateIndex
CREATE UNIQUE INDEX "VelocityRecordingPart_recordingId_index_key" ON "VelocityRecordingPart"("recordingId", "index");

-- CreateIndex
CREATE INDEX "VelocityRecordingCut_recordingId_idx" ON "VelocityRecordingCut"("recordingId");

-- CreateIndex
CREATE INDEX "VelocityRecordingCut_partId_idx" ON "VelocityRecordingCut"("partId");

