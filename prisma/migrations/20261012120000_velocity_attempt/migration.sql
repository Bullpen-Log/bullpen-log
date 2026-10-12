-- CreateTable
CREATE TABLE "VelocityAttempt" (
    "id" TEXT NOT NULL,
    "userId" TEXT NOT NULL,
    "sessionId" TEXT,
    "pitchId" TEXT,
    "date" DATE NOT NULL,
    "atSec" DOUBLE PRECISION,
    "kind" TEXT NOT NULL,
    "strength" DOUBLE PRECISION,
    "ok" BOOLEAN NOT NULL,
    "rejectCode" TEXT,
    "why" TEXT,
    "trackFrames" INTEGER,
    "rawKmh" DOUBLE PRECISION,
    "confidence" TEXT,
    "gunKmh" DOUBLE PRECISION,
    "excluded" BOOLEAN NOT NULL DEFAULT false,
    "memo" TEXT,
    "clipPath" TEXT,
    "clipBytes" INTEGER,
    "clipSec" DOUBLE PRECISION,
    "clipMime" TEXT,
    "clipEventSec" DOUBLE PRECISION,
    "analysis" JSONB,
    "engineVersion" TEXT,
    "createdAt" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,

    CONSTRAINT "VelocityAttempt_pkey" PRIMARY KEY ("id")
);

-- CreateIndex
CREATE UNIQUE INDEX "VelocityAttempt_pitchId_key" ON "VelocityAttempt"("pitchId");

-- CreateIndex
CREATE INDEX "VelocityAttempt_userId_date_idx" ON "VelocityAttempt"("userId", "date");

-- CreateIndex
CREATE INDEX "VelocityAttempt_date_idx" ON "VelocityAttempt"("date");

-- CreateIndex
CREATE INDEX "VelocityAttempt_sessionId_idx" ON "VelocityAttempt"("sessionId");

-- AddForeignKey
ALTER TABLE "VelocityAttempt" ADD CONSTRAINT "VelocityAttempt_userId_fkey" FOREIGN KEY ("userId") REFERENCES "User"("id") ON DELETE CASCADE ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "VelocityAttempt" ADD CONSTRAINT "VelocityAttempt_sessionId_fkey" FOREIGN KEY ("sessionId") REFERENCES "VelocitySession"("id") ON DELETE SET NULL ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "VelocityAttempt" ADD CONSTRAINT "VelocityAttempt_pitchId_fkey" FOREIGN KEY ("pitchId") REFERENCES "VelocityPitch"("id") ON DELETE SET NULL ON UPDATE CASCADE;
