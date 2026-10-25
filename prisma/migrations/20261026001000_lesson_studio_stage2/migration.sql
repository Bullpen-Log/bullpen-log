-- 싱커 팀 · 레슨장 2단계(2026-10-26, docs/designs/sinker-team-lesson-contract.md 3절) — 더하기만.
-- migrate diff 가 늘 내는 VelocityAttempt 외래키 지우기 셋은 우리 변경이 아니라 뺐다(예전부터 DB 에만 있는 것).

-- AlterTable
ALTER TABLE "LessonNote" ADD COLUMN     "editedById" TEXT,
ADD COLUMN     "eventId" TEXT,
ADD COLUMN     "updatedAt" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,
ADD COLUMN     "videoPaths" TEXT[] DEFAULT ARRAY[]::TEXT[];


-- AlterTable
ALTER TABLE "OrgEvent" ADD COLUMN     "doneAt" TIMESTAMP(3),
ADD COLUMN     "status" TEXT NOT NULL DEFAULT 'planned';


-- AlterTable
ALTER TABLE "PitchLog" ADD COLUMN     "clientKey" TEXT,
ADD COLUMN     "orgEventId" TEXT;


-- CreateTable
CREATE TABLE "OrgAssignment" (
    "id" TEXT NOT NULL,
    "orgId" TEXT NOT NULL,
    "memberId" TEXT NOT NULL,
    "noteId" TEXT,
    "assignedById" TEXT NOT NULL,
    "items" JSONB NOT NULL,
    "dueDate" DATE,
    "status" TEXT NOT NULL DEFAULT 'assigned',
    "doneSessionId" TEXT,
    "donePitchLogId" TEXT,
    "doneAt" TIMESTAMP(3),
    "createdAt" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,
    "updatedAt" TIMESTAMP(3) NOT NULL,

    CONSTRAINT "OrgAssignment_pkey" PRIMARY KEY ("id")
);


-- CreateTable
CREATE TABLE "OrgComment" (
    "id" TEXT NOT NULL,
    "orgId" TEXT NOT NULL,
    "memberId" TEXT NOT NULL,
    "noteId" TEXT,
    "assignmentId" TEXT,
    "authorId" TEXT NOT NULL,
    "kind" TEXT NOT NULL DEFAULT 'comment',
    "body" TEXT NOT NULL,
    "videoPath" TEXT,
    "atSec" DOUBLE PRECISION,
    "resolvedAt" TIMESTAMP(3),
    "createdAt" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,

    CONSTRAINT "OrgComment_pkey" PRIMARY KEY ("id")
);


-- CreateIndex
CREATE INDEX "OrgAssignment_memberId_status_idx" ON "OrgAssignment"("memberId", "status");


-- CreateIndex
CREATE INDEX "OrgAssignment_orgId_createdAt_idx" ON "OrgAssignment"("orgId", "createdAt");


-- CreateIndex
CREATE INDEX "OrgComment_noteId_idx" ON "OrgComment"("noteId");


-- CreateIndex
CREATE INDEX "OrgComment_assignmentId_idx" ON "OrgComment"("assignmentId");


-- CreateIndex
CREATE INDEX "OrgComment_orgId_resolvedAt_idx" ON "OrgComment"("orgId", "resolvedAt");


-- CreateIndex
CREATE INDEX "LessonNote_eventId_idx" ON "LessonNote"("eventId");


-- CreateIndex
CREATE INDEX "PitchLog_orgEventId_idx" ON "PitchLog"("orgEventId");


-- CreateIndex
CREATE UNIQUE INDEX "PitchLog_userId_clientKey_key" ON "PitchLog"("userId", "clientKey");
