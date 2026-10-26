-- CreateTable
CREATE TABLE "UserVideo" (
    "id" TEXT NOT NULL,
    "userId" TEXT NOT NULL,
    "clientId" TEXT,
    "path" TEXT NOT NULL,
    "storage" TEXT NOT NULL DEFAULT 'phone',
    "sport" TEXT NOT NULL DEFAULT 'pitch',
    "capturedAt" TIMESTAMP(3),
    "capturedDate" DATE,
    "capturedSource" TEXT NOT NULL DEFAULT 'unknown',
    "origin" TEXT NOT NULL DEFAULT 'album',
    "feelNote" TEXT,
    "revisit" BOOLEAN NOT NULL DEFAULT false,
    "revisitAt" TIMESTAMP(3),
    "durationSec" DOUBLE PRECISION,
    "width" INTEGER,
    "height" INTEGER,
    "deletedAt" TIMESTAMP(3),
    "createdAt" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,
    "updatedAt" TIMESTAMP(3) NOT NULL,

    CONSTRAINT "UserVideo_pkey" PRIMARY KEY ("id")
);

-- CreateIndex
CREATE INDEX "UserVideo_userId_capturedDate_idx" ON "UserVideo"("userId", "capturedDate");

-- CreateIndex
CREATE UNIQUE INDEX "UserVideo_userId_path_key" ON "UserVideo"("userId", "path");

-- CreateIndex
CREATE UNIQUE INDEX "UserVideo_userId_clientId_key" ON "UserVideo"("userId", "clientId");

