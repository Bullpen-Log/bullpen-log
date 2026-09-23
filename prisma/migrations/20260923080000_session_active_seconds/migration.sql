-- AlterTable
ALTER TABLE "TrainingSession" ADD COLUMN     "activeSeconds" INTEGER NOT NULL DEFAULT 0;

-- 이미 마친 판은 지금 있는 값으로 채운다 (마지막 구간 = 본운동 시작부터 종료까지)
UPDATE "TrainingSession"
SET "activeSeconds" = GREATEST(0, FLOOR(EXTRACT(EPOCH FROM ("endedAt" - COALESCE("mainStartedAt", "startedAt"))))::int)
WHERE "status" = 'FINISHED' AND "endedAt" IS NOT NULL;
