-- 트레이닝 영상 촬영 체크(2026-10-09, 관리자 /admin/shoot — lib/shoot/progress.ts). 새 표 하나만 더한다 — 이 표를 모르는 코드도 그대로 돈다.
-- CreateTable
CREATE TABLE "ShootCheck" (
    "id" TEXT NOT NULL,
    "exerciseId" TEXT NOT NULL,
    "status" TEXT NOT NULL DEFAULT 'done',
    "note" TEXT,
    "userId" TEXT NOT NULL,
    "checkedAt" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,
    "createdAt" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,
    "updatedAt" TIMESTAMP(3) NOT NULL,

    CONSTRAINT "ShootCheck_pkey" PRIMARY KEY ("id")
);

-- CreateIndex
CREATE UNIQUE INDEX "ShootCheck_exerciseId_key" ON "ShootCheck"("exerciseId");

-- CreateIndex
CREATE INDEX "ShootCheck_checkedAt_idx" ON "ShootCheck"("checkedAt");

