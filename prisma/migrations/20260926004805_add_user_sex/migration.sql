-- 성별을 계정(User)에 둔다 — 가입할 때 받고, 내 정보에서 고친다.
-- 영양 목표 창에서 따로 고르던 NutritionProfile.sex 를 대신한다.
--
-- 비워 둘 수 있게 둔다. 이 칸을 모르는 코드(상대방 쪽, 아직 떠 있는 옛 배포)가
-- 회원 줄을 만들어도 실패하지 않고, 이 칸이 생기기 전에 가입한 계정도 그대로 산다.

-- AlterTable
ALTER TABLE "User" ADD COLUMN     "sex" TEXT;

-- 영양 목표에서 이미 고른 성별을 계정으로 옮겨 적는다. 목록 안의 값만, 빈 칸에만.
-- 다시 돌려도 결과가 같다(이미 채운 칸은 건드리지 않는다).
UPDATE "User" AS u
SET "sex" = np."sex"
FROM "NutritionProfile" AS np
WHERE np."userId" = u."id"
  AND np."sex" IN ('M', 'F')
  AND u."sex" IS NULL;
