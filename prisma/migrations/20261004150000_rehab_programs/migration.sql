-- 재활 2편 — 재활 프로그램 · 세션 · 매주 확인 표 셋을 더한다(lib/armcare/rehab.ts).
-- 추가만 한다. 이 표를 모르는 코드는 그대로 돈다. 이 저장소는 relationMode = "prisma" 라 외래키가 없다.

-- CreateTable
CREATE TABLE "UserRehabProgram" (
    "id" TEXT NOT NULL,
    "userId" TEXT NOT NULL,
    "area" TEXT NOT NULL,
    "condition" TEXT,
    "severity" TEXT NOT NULL,
    "stage" INTEGER NOT NULL DEFAULT 1,
    "stageStartedAt" DATE NOT NULL,
    "stageShortenDays" INTEGER NOT NULL DEFAULT 0,
    "activities" JSONB NOT NULL,
    "startedAt" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,
    "endedAt" TIMESTAMP(3),
    "endReason" TEXT,
    "createdAt" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,
    "updatedAt" TIMESTAMP(3) NOT NULL,

    CONSTRAINT "UserRehabProgram_pkey" PRIMARY KEY ("id")
);

-- CreateTable
CREATE TABLE "UserRehabSession" (
    "id" TEXT NOT NULL,
    "programId" TEXT NOT NULL,
    "userId" TEXT NOT NULL,
    "date" DATE NOT NULL,
    "stage" INTEGER NOT NULL,
    "leftover" INTEGER NOT NULL,
    "pain" INTEGER NOT NULL,
    "feel" TEXT NOT NULL,
    "done" DOUBLE PRECISION NOT NULL,
    "result" TEXT NOT NULL,
    "lowered" BOOLEAN NOT NULL DEFAULT false,
    "createdAt" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,

    CONSTRAINT "UserRehabSession_pkey" PRIMARY KEY ("id")
);

-- CreateTable
CREATE TABLE "UserRehabWeekly" (
    "id" TEXT NOT NULL,
    "programId" TEXT NOT NULL,
    "userId" TEXT NOT NULL,
    "date" DATE NOT NULL,
    "stage" INTEGER NOT NULL,
    "normalPct" INTEGER NOT NULL,
    "worstPain" INTEGER NOT NULL,
    "nightPain" BOOLEAN NOT NULL,
    "activities" JSONB NOT NULL,
    "confidence" INTEGER NOT NULL,
    "test" JSONB,
    "createdAt" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,

    CONSTRAINT "UserRehabWeekly_pkey" PRIMARY KEY ("id")
);

-- CreateIndex
CREATE INDEX "UserRehabProgram_userId_idx" ON "UserRehabProgram"("userId");

-- CreateIndex
CREATE INDEX "UserRehabSession_userId_idx" ON "UserRehabSession"("userId");

-- CreateIndex
CREATE UNIQUE INDEX "UserRehabSession_programId_date_key" ON "UserRehabSession"("programId", "date");

-- CreateIndex
CREATE INDEX "UserRehabWeekly_programId_idx" ON "UserRehabWeekly"("programId");
