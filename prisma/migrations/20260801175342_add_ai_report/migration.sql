-- CreateTable
CREATE TABLE "AiReport" (
    "id" TEXT NOT NULL,
    "userId" TEXT NOT NULL,
    "asOf" DATE NOT NULL,
    "halted" BOOLEAN NOT NULL DEFAULT false,
    "haltReason" TEXT,
    "body" JSONB,
    "facts" JSONB NOT NULL,
    "plan" JSONB NOT NULL,
    "model" TEXT NOT NULL,
    "inputTokens" INTEGER NOT NULL DEFAULT 0,
    "outputTokens" INTEGER NOT NULL DEFAULT 0,
    "createdAt" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,

    CONSTRAINT "AiReport_pkey" PRIMARY KEY ("id")
);

-- CreateIndex
CREATE INDEX "AiReport_userId_asOf_idx" ON "AiReport"("userId", "asOf");

-- CreateIndex
CREATE UNIQUE INDEX "AiReport_userId_asOf_key" ON "AiReport"("userId", "asOf");
