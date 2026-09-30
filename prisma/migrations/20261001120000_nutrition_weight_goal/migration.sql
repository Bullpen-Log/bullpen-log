-- AlterTable
-- 체중 목표(영양 로드맵 4번) — 목표 체중 · 주당 속도 · 체중 흐름 조정 · 계획 시작일.
-- 넷 다 비워 둘 수 있어 이 칸을 모르는 코드도 그대로 돈다(넷 다 비면 목표 숫자는 예전과 같다).
ALTER TABLE "NutritionProfile" ADD COLUMN     "kcalAdjust" INTEGER,
ADD COLUMN     "planSince" DATE,
ADD COLUMN     "targetWeightKg" DOUBLE PRECISION,
ADD COLUMN     "weeklyRateKg" DOUBLE PRECISION;
