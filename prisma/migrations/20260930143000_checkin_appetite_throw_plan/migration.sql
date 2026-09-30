-- AlterTable
-- 체크인 상세의 영양 칸 둘 — 식욕(1~5)과 던지는 일정(오늘 등판 / 오늘 불펜 / 내일 등판 / 없음).
-- 둘 다 비워 둘 수 있어 이 칸을 모르는 코드도 그대로 돈다.
ALTER TABLE "DailyCheckin" ADD COLUMN     "appetite" INTEGER,
ADD COLUMN     "throwPlan" TEXT;
