-- WarmupRoutineItem 에서 쓰지 않는 id 칸을 지운다.
--
-- 바로 앞 마이그레이션에서 기본키를 (routineId, exerciseId) 복합키로 잡아
-- 놓고 id 칸을 함께 만들어 버렸다. 스키마 쪽에는 id 가 없으므로 Prisma 는
-- 이 칸에 값을 넣지 않는데, NOT NULL 에 기본값도 없어서 담을 때마다
-- "Null constraint violation" 이 났다.
--
-- 지우는 시점에 0행이라 잃을 것이 없다.
ALTER TABLE "WarmupRoutineItem" DROP COLUMN IF EXISTS "id";
