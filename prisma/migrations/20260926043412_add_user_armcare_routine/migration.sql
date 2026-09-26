-- CreateTable
CREATE TABLE "UserArmcareRoutine" (
    "id" TEXT NOT NULL,
    "userId" TEXT NOT NULL,
    "name" TEXT NOT NULL,
    "items" JSONB NOT NULL,
    "createdAt" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,
    "updatedAt" TIMESTAMP(3) NOT NULL,

    CONSTRAINT "UserArmcareRoutine_pkey" PRIMARY KEY ("id")
);

-- CreateIndex
CREATE INDEX "UserArmcareRoutine_userId_idx" ON "UserArmcareRoutine"("userId");

