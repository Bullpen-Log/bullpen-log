-- 성별을 계정으로 한 번 더 옮겨 적는다 — 데이터만 바꾼다(표·칸은 그대로).
--
-- 앞 마이그레이션(20260926004805_add_user_sex)은 코드보다 먼저 DB 에 적용됐다. 그 뒤
-- 새 코드가 배포되기 전까지는 옛 화면이 돌고 있어서, 영양 목표 창에서 성별을 고르면
-- NutritionProfile.sex 에만 적힌다. 새 코드는 User.sex 만 읽으므로 그 사이에 고른
-- 값이 사라진다.
--
-- 이 파일은 일부러 미리 적용하지 않는다. main 에 올리면 Vercel 빌드가 새 코드를 띄우기
-- 직전에 적용한다(package.json 의 build) — 그때까지 옛 화면에서 고른 것까지 옮긴다.
--
--   1) 계정이 비어 있으면 채운다(앞 마이그레이션과 같다).
--   2) 앞 마이그레이션 뒤에 영양 목표를 저장한 사람은 그 값이 가장 새 선택이다 —
--      그때는 성별을 고를 곳이 영양 목표 창뿐이었다. 다르면 그것으로 바꾼다.
-- 다시 돌려도 결과가 같다.

UPDATE "User" AS u
SET "sex" = np."sex"
FROM "NutritionProfile" AS np
WHERE np."userId" = u."id"
  AND np."sex" IN ('M', 'F')
  AND (
    u."sex" IS NULL
    OR (
      np."updatedAt" > COALESCE(
        (
          SELECT "finished_at"
          FROM "_prisma_migrations"
          WHERE "migration_name" = '20260926004805_add_user_sex'
        ),
        'infinity'::timestamptz
      )
      AND u."sex" IS DISTINCT FROM np."sex"
    )
  );
