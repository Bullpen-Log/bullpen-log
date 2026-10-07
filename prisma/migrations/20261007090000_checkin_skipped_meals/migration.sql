-- AlterTable
-- 체크인 '걸른 끼니'(영양 간단 관리 — 메인 추천 9번 2단계). 영양 조언(lib/nutrition/advice.ts)이 읽는다.
-- 더하기만이라 이 칸을 모르는 코드도 그대로 돈다(비면 안 걸렀거나 안 적은 것). '끼니 양'은 있던 nutrition 칸을 그대로 쓴다.
ALTER TABLE "DailyCheckin" ADD COLUMN     "skippedMeals" TEXT[] DEFAULT ARRAY[]::TEXT[];
