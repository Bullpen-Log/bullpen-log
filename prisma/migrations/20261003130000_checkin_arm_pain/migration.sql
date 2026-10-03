-- AlterTable
-- 팔 통증 안내 — 체크인에서 어깨 · 팔꿈치가 '통증'인 날 아픈 자리(여러 개)와 정도(1~3)를 받는다.
-- 추가만 한다. 자리는 빈 목록이 기본값, 정도는 비워 둘 수 있어 이 칸을 모르는 코드도 그대로 돈다.
ALTER TABLE "DailyCheckin" ADD COLUMN     "armPainSpots" TEXT[] DEFAULT ARRAY[]::TEXT[],
ADD COLUMN     "armPainLevel" INTEGER;
