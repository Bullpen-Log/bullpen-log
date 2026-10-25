-- 싱커 팀 · 레슨장 3단계 준비(2026-10-26, docs/designs/sinker-team-lesson-contract.md 4절) — 코치가 대신 남긴 세트 표시. 더하기만.
-- migrate diff 가 늘 내는 VelocityAttempt 외래키 지우기 셋은 우리 변경이 아니라 뺐다.

-- AlterTable
ALTER TABLE "UserExerciseSet" ADD COLUMN     "enteredById" TEXT,
ADD COLUMN     "orgEventId" TEXT;

-- CreateIndex
CREATE INDEX "UserExerciseSet_orgEventId_idx" ON "UserExerciseSet"("orgEventId");
