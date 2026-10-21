-- 싱커 · 덕아웃 개편 3단계(2026-10-21, docs/designs/sinker-dugout.md 11절 3-1) — 더하기만.
-- 덕아웃만 쓰는 회원(MEMBER) · 가입 출처 · 싱커 시작일 · 공개 범위 · 레슨 노트의 '한 일'.

-- AlterEnum
ALTER TYPE "AccountType" ADD VALUE 'MEMBER';

-- AlterTable
ALTER TABLE "LessonNote" ADD COLUMN     "exercises" JSONB,
ADD COLUMN     "intensity" INTEGER,
ADD COLUMN     "pitchCount" INTEGER;

-- AlterTable
ALTER TABLE "User" ADD COLUMN     "publicSinker" TEXT[] DEFAULT ARRAY[]::TEXT[],
ADD COLUMN     "signupSource" TEXT NOT NULL DEFAULT 'web',
ADD COLUMN     "sinkerStartedAt" TIMESTAMP(3);

-- 지금까지의 선수는 가입 때부터 싱커를 썼다
UPDATE "User" SET "sinkerStartedAt" = "createdAt" WHERE "accountType" = 'PLAYER' AND "sinkerStartedAt" IS NULL;
