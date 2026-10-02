-- 영양 목표 줄의 옛 성별 칸을 지운다(2단계) — 성별은 계정(User.sex)에 있다(2026-09-26 옮김).
-- 1단계(5de49e2)가 스키마에서 이 칸을 빼고 배포된 뒤에 돈다. 계정 성별이 빈 사람이 있으면 먼저 이 칸 값으로 채운다
-- (2026-10-03 에는 1줄뿐이었고 이미 같았다 — 안전용).
UPDATE "User" AS u
SET "sex" = np."sex"
FROM "NutritionProfile" AS np
WHERE np."userId" = u."id" AND u."sex" IS NULL AND np."sex" IS NOT NULL;

-- AlterTable
ALTER TABLE "NutritionProfile" DROP COLUMN "sex";
