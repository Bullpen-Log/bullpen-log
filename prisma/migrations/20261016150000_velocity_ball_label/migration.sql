-- 사람이 찍은 공 자리(공 감지 학습 모델 2판 자료) — 새 표만. VelocityAttempt 외래키 셋은 예전부터 DB 에만 있는 것이라 건드리지 않는다.
-- CreateTable
CREATE TABLE "VelocityBallLabel" (
    "id" TEXT NOT NULL,
    "target" TEXT NOT NULL,
    "sourceW" INTEGER NOT NULL,
    "sourceH" INTEGER NOT NULL,
    "frames" JSONB NOT NULL,
    "createdAt" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,
    "updatedAt" TIMESTAMP(3) NOT NULL,

    CONSTRAINT "VelocityBallLabel_pkey" PRIMARY KEY ("id")
);

-- CreateIndex
CREATE UNIQUE INDEX "VelocityBallLabel_target_key" ON "VelocityBallLabel"("target");
