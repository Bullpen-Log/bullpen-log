-- 레슨 코치 찾기 3판(2026-10-22, 닥터나우식) — 더하기만. VelocityAttempt 외래키 셋(예전부터 DB 에만 있는 것)은 건드리지 않는다.

-- AlterTable
ALTER TABLE "LessonBooking" ADD COLUMN     "audience" TEXT,
ADD COLUMN     "confirmedAt" TIMESTAMP(3),
ADD COLUMN     "payMethod" TEXT,
ADD COLUMN     "specialty" TEXT;

-- AlterTable
ALTER TABLE "LessonReview" ADD COLUMN     "tags" TEXT[] DEFAULT ARRAY[]::TEXT[];

-- AlterTable
ALTER TABLE "Org" ADD COLUMN     "coachName" TEXT,
ADD COLUMN     "dummy" BOOLEAN NOT NULL DEFAULT false,
ADD COLUMN     "lessonSlots" JSONB,
ADD COLUMN     "sinkerReview" BOOLEAN NOT NULL DEFAULT false,
ADD COLUMN     "slotMin" INTEGER NOT NULL DEFAULT 60,
ADD COLUMN     "trialPrice" INTEGER;
