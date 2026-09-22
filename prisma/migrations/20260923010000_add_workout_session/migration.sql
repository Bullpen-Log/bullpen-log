-- 실시간 운동 세션.
--
-- TrainingSession   운동 한 판. [운동 시작]에 열리고 [운동 종료]에 닫힌다.
--                   시작할 때 오늘 목록을 plan 에 찍어 얼려 둔다.
-- UserExerciseSet   세트 한 줄. 한 세트를 마칠 때마다 생긴다.
--
-- 기존 UserExerciseLog 는 그대로 둔다. 서버가 세트에서 다시 계산해 채우는
-- 요약으로 쓰므로, 부하·부위별 세트 수·달력을 읽는 코드가 전부 그대로 돈다.
--
-- (sessionId, exerciseId, setNo) 를 유일하게 묶는다. 신호가 끊겼다 다시
-- 보내도 같은 줄을 덮어쓸 뿐 두 번 쌓이지 않는다.
--
-- relationMode = "prisma" 라 외래키는 만들지 않는다. 이 SQL 은 손으로 쓰지
-- 않고 prisma migrate diff 로 스키마에서 그대로 뽑았다 — 지난번에 손으로
-- 쓰다가 스키마에 없는 칸을 만들어 놓는 실수를 했다.

-- CreateTable
CREATE TABLE "TrainingSession" (
    "id" TEXT NOT NULL,
    "userId" TEXT NOT NULL,
    "date" DATE NOT NULL,
    "themeKey" TEXT NOT NULL,
    "plan" JSONB NOT NULL,
    "status" TEXT NOT NULL DEFAULT 'ACTIVE',
    "startedAt" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,
    "mainStartedAt" TIMESTAMP(3),
    "endedAt" TIMESTAMP(3),
    "warmupOutcome" TEXT,
    "warmupDoneIds" TEXT[],
    "createdAt" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,
    "updatedAt" TIMESTAMP(3) NOT NULL,

    CONSTRAINT "TrainingSession_pkey" PRIMARY KEY ("id")
);

-- CreateTable
CREATE TABLE "UserExerciseSet" (
    "id" TEXT NOT NULL,
    "sessionId" TEXT NOT NULL,
    "userId" TEXT NOT NULL,
    "exerciseId" TEXT NOT NULL,
    "date" DATE NOT NULL,
    "setNo" INTEGER NOT NULL,
    "weightKg" DOUBLE PRECISION,
    "reps" INTEGER,
    "holdSeconds" INTEGER,
    "recordedAt" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,

    CONSTRAINT "UserExerciseSet_pkey" PRIMARY KEY ("id")
);

-- CreateIndex
CREATE INDEX "TrainingSession_userId_idx" ON "TrainingSession"("userId");

-- CreateIndex
CREATE UNIQUE INDEX "TrainingSession_userId_date_key" ON "TrainingSession"("userId", "date");

-- CreateIndex
CREATE INDEX "UserExerciseSet_sessionId_idx" ON "UserExerciseSet"("sessionId");

-- CreateIndex
CREATE INDEX "UserExerciseSet_userId_date_idx" ON "UserExerciseSet"("userId", "date");

-- CreateIndex
CREATE INDEX "UserExerciseSet_exerciseId_idx" ON "UserExerciseSet"("exerciseId");

-- CreateIndex
CREATE UNIQUE INDEX "UserExerciseSet_sessionId_exerciseId_setNo_key" ON "UserExerciseSet"("sessionId", "exerciseId", "setNo");

