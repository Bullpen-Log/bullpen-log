-- 패치노트를 '코드를 고친 기록'으로 다시 짠다.
--
-- 처음에는 운동·드릴을 고친 것을 남기는 표로 만들었는데, 필요한 것은 그것이
-- 아니라 프로그램 자체를 언제 누가 어떻게 고쳤는지였다. 담는 것이 통째로
-- 달라져서 칸을 하나씩 고치는 대신 표를 다시 만든다.
--
-- 다시 만들어도 잃을 것이 없다: 이 표는 만든 뒤로 한 줄도 쌓이지 않았다
-- (백업 db-2026-09-23-19-44.json 에 patchNote 0건).

DROP TABLE IF EXISTS "PatchNote";

CREATE TABLE "PatchNote" (
    "id" TEXT NOT NULL,
    "day" TEXT NOT NULL,
    "authorKey" TEXT NOT NULL,
    "authorName" TEXT NOT NULL,
    "commits" JSONB NOT NULL,
    "commitCount" INTEGER NOT NULL DEFAULT 0,
    "filesChanged" INTEGER NOT NULL DEFAULT 0,
    "insertions" INTEGER NOT NULL DEFAULT 0,
    "deletions" INTEGER NOT NULL DEFAULT 0,
    "areas" TEXT[],
    "note" TEXT,
    "editedAt" TIMESTAMP(3),
    "editedBy" TEXT,
    "syncedAt" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,

    CONSTRAINT "PatchNote_pkey" PRIMARY KEY ("id")
);

-- 한 사람의 하루는 한 장. 다시 맞출 때 이 짝으로 찾아 덮어쓴다.
CREATE UNIQUE INDEX "PatchNote_authorKey_day_key" ON "PatchNote"("authorKey", "day");

-- 목록은 늘 날짜 내림차순으로 읽는다.
CREATE INDEX "PatchNote_day_idx" ON "PatchNote"("day");
