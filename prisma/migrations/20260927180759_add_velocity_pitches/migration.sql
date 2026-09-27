-- CreateTable
CREATE TABLE "VelocitySession" (
    "id" TEXT NOT NULL,
    "userId" TEXT NOT NULL,
    "date" DATE NOT NULL,
    "pitchLogId" TEXT,
    "fovDeg" DOUBLE PRECISION NOT NULL,
    "calScale" DOUBLE PRECISION NOT NULL DEFAULT 1,
    "calOffset" DOUBLE PRECISION NOT NULL DEFAULT 0,
    "calPairs" INTEGER NOT NULL DEFAULT 0,
    "source" TEXT NOT NULL DEFAULT 'camera',
    "device" TEXT,
    "memo" TEXT,
    "createdAt" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,

    CONSTRAINT "VelocitySession_pkey" PRIMARY KEY ("id")
);

-- CreateTable
CREATE TABLE "VelocityPitch" (
    "id" TEXT NOT NULL,
    "sessionId" TEXT NOT NULL,
    "userId" TEXT NOT NULL,
    "seq" INTEGER NOT NULL,
    "rawKmh" DOUBLE PRECISION NOT NULL,
    "kmh" DOUBLE PRECISION NOT NULL,
    "errorKmh" DOUBLE PRECISION NOT NULL DEFAULT 0,
    "confidence" TEXT NOT NULL DEFAULT 'medium',
    "releaseKmh" DOUBLE PRECISION,
    "releaseDxCm" DOUBLE PRECISION,
    "releaseDyCm" DOUBLE PRECISION,
    "releaseDistM" DOUBLE PRECISION,
    "travelM" DOUBLE PRECISION,
    "durationSec" DOUBLE PRECISION,
    "frames" INTEGER,
    "fps" DOUBLE PRECISION,
    "pitchType" TEXT,
    "zone" INTEGER,
    "result" TEXT,
    "gunKmh" DOUBLE PRECISION,
    "memo" TEXT,
    "createdAt" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,

    CONSTRAINT "VelocityPitch_pkey" PRIMARY KEY ("id")
);

-- CreateIndex
CREATE INDEX "VelocitySession_userId_date_idx" ON "VelocitySession"("userId", "date");

-- CreateIndex
CREATE INDEX "VelocityPitch_userId_createdAt_idx" ON "VelocityPitch"("userId", "createdAt");

-- CreateIndex
CREATE INDEX "VelocityPitch_sessionId_seq_idx" ON "VelocityPitch"("sessionId", "seq");

