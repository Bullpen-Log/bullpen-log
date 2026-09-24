-- 상세 체크인 칸을 더한다.
--
-- 전부 비워 둘 수 있는 칸이라 이 칸을 모르는 코드(상대방의 옛 코드)가 체크인을
-- 저장해도 실패하지 않는다. 지우거나 이름을 바꾸는 것은 없다.
-- (백업: db-2026-09-24-09-55.json)

-- AlterTable
ALTER TABLE "DailyCheckin" ADD COLUMN     "armFatigue" INTEGER,
ADD COLUMN     "bodyWeightKg" DOUBLE PRECISION,
ADD COLUMN     "fatigue" INTEGER,
ADD COLUMN     "hydration" TEXT,
ADD COLUMN     "mood" INTEGER,
ADD COLUMN     "note" TEXT,
ADD COLUMN     "nutrition" TEXT,
ADD COLUMN     "restingHr" INTEGER,
ADD COLUMN     "sleepHours" DOUBLE PRECISION,
ADD COLUMN     "soreness" INTEGER,
ADD COLUMN     "stress" INTEGER;

