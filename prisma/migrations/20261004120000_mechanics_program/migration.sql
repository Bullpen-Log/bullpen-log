-- CreateTable
CREATE TABLE "MechanicsProgram" (
    "id" TEXT NOT NULL,
    "userId" TEXT NOT NULL,
    "focus" TEXT,
    "progress" JSONB NOT NULL,
    "sessionsDone" INTEGER NOT NULL DEFAULT 0,
    "lastSessionOn" DATE,
    "startedAt" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,
    "updatedAt" TIMESTAMP(3) NOT NULL,

    CONSTRAINT "MechanicsProgram_pkey" PRIMARY KEY ("id")
);

-- CreateIndex
CREATE UNIQUE INDEX "MechanicsProgram_userId_key" ON "MechanicsProgram"("userId");

