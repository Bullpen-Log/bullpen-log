-- 고정 워밍업 루틴.
--
-- 일정을 만들 때 뽑는 것이 아니라 미리 짜 두고 그대로 쓴다. 운동을 시작하면
-- 본운동 앞에 '오늘 목적에 맞는 것'과 '전신' 둘이 뜬다.
--
-- relationMode = "prisma" 라 외래키를 만들지 않는다. 지우기는 코드에서 챙긴다.

CREATE TABLE "WarmupRoutine" (
    "id"          TEXT NOT NULL,
    "kind"        TEXT NOT NULL,
    "name"        TEXT NOT NULL,
    "description" TEXT NOT NULL DEFAULT '',
    "sortOrder"   INTEGER NOT NULL DEFAULT 0,
    "hiddenAt"    TIMESTAMP(3),
    "createdAt"   TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,
    "updatedAt"   TIMESTAMP(3) NOT NULL,
    CONSTRAINT "WarmupRoutine_pkey" PRIMARY KEY ("id")
);

CREATE UNIQUE INDEX "WarmupRoutine_kind_key" ON "WarmupRoutine"("kind");

CREATE TABLE "WarmupRoutineItem" (
    "id"         TEXT NOT NULL,
    "routineId"  TEXT NOT NULL,
    "exerciseId" TEXT NOT NULL,
    "sortOrder"  INTEGER NOT NULL DEFAULT 0,
    "note"       TEXT,
    CONSTRAINT "WarmupRoutineItem_pkey" PRIMARY KEY ("routineId","exerciseId")
);

CREATE INDEX "WarmupRoutineItem_routineId_idx" ON "WarmupRoutineItem"("routineId");
CREATE INDEX "WarmupRoutineItem_exerciseId_idx" ON "WarmupRoutineItem"("exerciseId");

-- 넷을 미리 넣어 둔다. 담긴 운동은 아직 없고, 영상을 올리는 대로 채운다.
INSERT INTO "WarmupRoutine" ("id", "kind", "name", "description", "sortOrder", "updatedAt")
VALUES
  (gen_random_uuid(), 'COMMON',     '전신 워밍업',        '어느 날이든 먼저 하는 준비',        0, CURRENT_TIMESTAMP),
  (gen_random_uuid(), 'LOWER',      '하체 워밍업',        '고관절·무릎·발목을 열고 시작',      1, CURRENT_TIMESTAMP),
  (gen_random_uuid(), 'UPPER_PUSH', '상체 밀기 워밍업',   '어깨·가슴·삼두를 미는 준비',        2, CURRENT_TIMESTAMP),
  (gen_random_uuid(), 'UPPER_PULL', '상체 당기기 워밍업', '견갑·등·이두를 당기는 준비',        3, CURRENT_TIMESTAMP);
