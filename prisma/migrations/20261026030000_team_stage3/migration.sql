-- 싱커 팀 · 레슨장 3단계(2026-10-26, docs/designs/sinker-team-lesson-contract.md 4절) — 새 표 넷, 더하기만.
-- migrate diff 가 늘 내는 VelocityAttempt 외래키 지우기 셋은 우리 변경이 아니라 뺐다.

-- CreateTable
CREATE TABLE "OrgEventAttendee" (
    "eventId" TEXT NOT NULL,
    "memberId" TEXT NOT NULL,
    "reply" TEXT,
    "note" TEXT,
    "attended" BOOLEAN,
    "updatedAt" TIMESTAMP(3) NOT NULL,

    CONSTRAINT "OrgEventAttendee_pkey" PRIMARY KEY ("eventId","memberId")
);


-- CreateTable
CREATE TABLE "OrgPlan" (
    "id" TEXT NOT NULL,
    "orgId" TEXT NOT NULL,
    "eventId" TEXT NOT NULL,
    "title" TEXT NOT NULL,
    "items" JSONB NOT NULL,
    "memberIds" TEXT[] DEFAULT ARRAY[]::TEXT[],
    "createdById" TEXT NOT NULL,
    "createdAt" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,
    "updatedAt" TIMESTAMP(3) NOT NULL,

    CONSTRAINT "OrgPlan_pkey" PRIMARY KEY ("id")
);


-- CreateTable
CREATE TABLE "OrgOuting" (
    "id" TEXT NOT NULL,
    "orgId" TEXT NOT NULL,
    "eventId" TEXT NOT NULL,
    "memberId" TEXT NOT NULL,
    "role" TEXT NOT NULL,
    "pitchLimit" INTEGER,
    "status" TEXT NOT NULL DEFAULT 'draft',
    "updatedById" TEXT NOT NULL,
    "createdAt" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,
    "updatedAt" TIMESTAMP(3) NOT NULL,

    CONSTRAINT "OrgOuting_pkey" PRIMARY KEY ("id")
);


-- CreateTable
CREATE TABLE "OrgNoticeRead" (
    "noticeId" TEXT NOT NULL,
    "memberId" TEXT NOT NULL,
    "readAt" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,

    CONSTRAINT "OrgNoticeRead_pkey" PRIMARY KEY ("noticeId","memberId")
);


-- CreateIndex
CREATE INDEX "OrgEventAttendee_memberId_idx" ON "OrgEventAttendee"("memberId");


-- CreateIndex
CREATE INDEX "OrgPlan_eventId_idx" ON "OrgPlan"("eventId");


-- CreateIndex
CREATE INDEX "OrgPlan_orgId_idx" ON "OrgPlan"("orgId");


-- CreateIndex
CREATE INDEX "OrgOuting_memberId_status_idx" ON "OrgOuting"("memberId", "status");


-- CreateIndex
CREATE INDEX "OrgOuting_orgId_idx" ON "OrgOuting"("orgId");


-- CreateIndex
CREATE UNIQUE INDEX "OrgOuting_eventId_memberId_key" ON "OrgOuting"("eventId", "memberId");


-- CreateIndex
CREATE INDEX "OrgNoticeRead_memberId_idx" ON "OrgNoticeRead"("memberId");
