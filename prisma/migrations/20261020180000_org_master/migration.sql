-- 팀 · 레슨장 마스터 1단계(2026-10-20, docs/designs/team-lesson-build-prompt.md) — 더하기만 한다.
-- 계정 종류(User.accountType) · 조직(Org) · 구성원(OrgMember) · 초대 코드(OrgInvite) · 공유 동의(ShareConsent) · 조직 일정(OrgEvent) ·
-- 조직 공지(OrgNotice) · 레슨 노트(LessonNote). 투구 기록 · 구속 세션에는 코치가 대신 적은 표시(enteredById · orgId)만 더한다.
-- relationMode = "prisma" 라 외래키는 없고 찾는 칸마다 색인을 둔다. 공유 DB 에 적용하는 것은 배포(migrate deploy)의 일.

-- CreateEnum
CREATE TYPE "AccountType" AS ENUM ('PLAYER', 'MASTER');

-- CreateEnum
CREATE TYPE "OrgKind" AS ENUM ('LESSON', 'TEAM');

-- CreateEnum
CREATE TYPE "OrgRole" AS ENUM ('MASTER', 'STAFF', 'PLAYER');

-- CreateEnum
CREATE TYPE "OrgMemberStatus" AS ENUM ('INVITED', 'ACTIVE', 'LEFT');

-- AlterTable
ALTER TABLE "PitchLog" ADD COLUMN     "enteredById" TEXT,
ADD COLUMN     "orgId" TEXT;

-- AlterTable
ALTER TABLE "User" ADD COLUMN     "accountType" "AccountType" NOT NULL DEFAULT 'PLAYER';

-- AlterTable
ALTER TABLE "VelocitySession" ADD COLUMN     "enteredById" TEXT,
ADD COLUMN     "orgId" TEXT;

-- CreateTable
CREATE TABLE "Org" (
    "id" TEXT NOT NULL,
    "kind" "OrgKind" NOT NULL,
    "name" TEXT NOT NULL,
    "region" TEXT,
    "note" TEXT,
    "ownerId" TEXT NOT NULL,
    "plan" TEXT,
    "seats" INTEGER,
    "planNote" TEXT,
    "createdAt" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,
    "updatedAt" TIMESTAMP(3) NOT NULL,

    CONSTRAINT "Org_pkey" PRIMARY KEY ("id")
);

-- CreateTable
CREATE TABLE "OrgMember" (
    "id" TEXT NOT NULL,
    "orgId" TEXT NOT NULL,
    "userId" TEXT,
    "role" "OrgRole" NOT NULL,
    "status" "OrgMemberStatus" NOT NULL DEFAULT 'ACTIVE',
    "nickname" TEXT NOT NULL,
    "tags" TEXT[] DEFAULT ARRAY[]::TEXT[],
    "memo" TEXT,
    "joinedAt" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,
    "leftAt" TIMESTAMP(3),

    CONSTRAINT "OrgMember_pkey" PRIMARY KEY ("id")
);

-- CreateTable
CREATE TABLE "OrgInvite" (
    "id" TEXT NOT NULL,
    "orgId" TEXT NOT NULL,
    "code" TEXT NOT NULL,
    "role" "OrgRole" NOT NULL DEFAULT 'PLAYER',
    "memberId" TEXT,
    "expiresAt" TIMESTAMP(3) NOT NULL,
    "usedById" TEXT,
    "usedAt" TIMESTAMP(3),
    "createdAt" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,

    CONSTRAINT "OrgInvite_pkey" PRIMARY KEY ("id")
);

-- CreateTable
CREATE TABLE "ShareConsent" (
    "memberId" TEXT NOT NULL,
    "pitch" BOOLEAN NOT NULL DEFAULT true,
    "training" BOOLEAN NOT NULL DEFAULT true,
    "checkin" BOOLEAN NOT NULL DEFAULT true,
    "video" BOOLEAN NOT NULL DEFAULT true,
    "nutrition" BOOLEAN NOT NULL DEFAULT false,
    "weight" BOOLEAN NOT NULL DEFAULT false,
    "byUserId" TEXT NOT NULL,
    "updatedAt" TIMESTAMP(3) NOT NULL,

    CONSTRAINT "ShareConsent_pkey" PRIMARY KEY ("memberId")
);

-- CreateTable
CREATE TABLE "OrgEvent" (
    "id" TEXT NOT NULL,
    "orgId" TEXT NOT NULL,
    "date" DATE NOT NULL,
    "time" TEXT,
    "kind" TEXT NOT NULL,
    "title" TEXT NOT NULL,
    "memo" TEXT,
    "memberId" TEXT,
    "createdById" TEXT NOT NULL,
    "createdAt" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,
    "updatedAt" TIMESTAMP(3) NOT NULL,

    CONSTRAINT "OrgEvent_pkey" PRIMARY KEY ("id")
);

-- CreateTable
CREATE TABLE "OrgNotice" (
    "id" TEXT NOT NULL,
    "orgId" TEXT NOT NULL,
    "title" TEXT NOT NULL,
    "body" TEXT NOT NULL,
    "pinned" BOOLEAN NOT NULL DEFAULT false,
    "authorId" TEXT,
    "createdAt" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,
    "updatedAt" TIMESTAMP(3) NOT NULL,

    CONSTRAINT "OrgNotice_pkey" PRIMARY KEY ("id")
);

-- CreateTable
CREATE TABLE "LessonNote" (
    "id" TEXT NOT NULL,
    "memberId" TEXT NOT NULL,
    "date" DATE NOT NULL,
    "body" TEXT NOT NULL,
    "homework" TEXT,
    "authorId" TEXT NOT NULL,
    "createdAt" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,

    CONSTRAINT "LessonNote_pkey" PRIMARY KEY ("id")
);

-- CreateTable
CREATE TABLE "LessonPass" (
    "id" TEXT NOT NULL,
    "memberId" TEXT NOT NULL,
    "total" INTEGER NOT NULL,
    "used" INTEGER NOT NULL DEFAULT 0,
    "expiresAt" DATE,
    "memo" TEXT,
    "createdAt" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,
    "updatedAt" TIMESTAMP(3) NOT NULL,

    CONSTRAINT "LessonPass_pkey" PRIMARY KEY ("id")
);

-- CreateTable
CREATE TABLE "GuardianReport" (
    "id" TEXT NOT NULL,
    "token" TEXT NOT NULL,
    "memberId" TEXT NOT NULL,
    "codeHash" TEXT NOT NULL,
    "expiresAt" TIMESTAMP(3) NOT NULL,
    "createdById" TEXT NOT NULL,
    "lastOpenedAt" TIMESTAMP(3),
    "createdAt" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,

    CONSTRAINT "GuardianReport_pkey" PRIMARY KEY ("id")
);

-- CreateIndex
CREATE INDEX "Org_ownerId_idx" ON "Org"("ownerId");

-- CreateIndex
CREATE INDEX "OrgMember_orgId_status_idx" ON "OrgMember"("orgId", "status");

-- CreateIndex
CREATE INDEX "OrgMember_userId_idx" ON "OrgMember"("userId");

-- CreateIndex
CREATE UNIQUE INDEX "OrgMember_orgId_userId_key" ON "OrgMember"("orgId", "userId");

-- CreateIndex
CREATE UNIQUE INDEX "OrgInvite_code_key" ON "OrgInvite"("code");

-- CreateIndex
CREATE INDEX "OrgInvite_orgId_idx" ON "OrgInvite"("orgId");

-- CreateIndex
CREATE INDEX "OrgEvent_orgId_date_idx" ON "OrgEvent"("orgId", "date");

-- CreateIndex
CREATE INDEX "OrgEvent_memberId_idx" ON "OrgEvent"("memberId");

-- CreateIndex
CREATE INDEX "OrgNotice_orgId_pinned_createdAt_idx" ON "OrgNotice"("orgId", "pinned", "createdAt");

-- CreateIndex
CREATE INDEX "LessonNote_memberId_date_idx" ON "LessonNote"("memberId", "date");

-- CreateIndex
CREATE INDEX "LessonPass_memberId_idx" ON "LessonPass"("memberId");

-- CreateIndex
CREATE UNIQUE INDEX "GuardianReport_token_key" ON "GuardianReport"("token");

-- CreateIndex
CREATE INDEX "GuardianReport_memberId_idx" ON "GuardianReport"("memberId");

-- CreateIndex
CREATE INDEX "PitchLog_orgId_idx" ON "PitchLog"("orgId");

-- CreateIndex
CREATE INDEX "VelocitySession_orgId_idx" ON "VelocitySession"("orgId");
