-- AlterTable
-- 인아웃식 온보딩(2026-10-08, docs/designs/inout-onboarding.md ④ — lib/nutrition/onboarding.ts) — 목표 카드 원답 · 탄단지 나누기 · 직접 정한 지방 g · 온보딩 끝낸 시각.
-- 넷 다 비워 둘 수 있어 이 칸을 모르는 코드도 그대로 돈다(넷 다 비면 목표 숫자는 예전과 같다 — 계산은 goal · proteinPerKg 로 접은 값만 본다).
ALTER TABLE "NutritionProfile" ADD COLUMN     "fatTargetG" DOUBLE PRECISION,
ADD COLUMN     "goalKind" TEXT,
ADD COLUMN     "macroPreset" TEXT,
ADD COLUMN     "onboardedAt" TIMESTAMP(3);
