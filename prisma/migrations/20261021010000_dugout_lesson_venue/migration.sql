-- 덕아웃 2판 레슨 예약 · 3판 장소 예약(2026-10-21, docs/designs/baseball-hub.md) — 더하기만.
-- Org 에 코치 공개 프로필 칸, 표 LessonBooking · LessonReview · Venue · VenueBooking.

-- AlterTable
ALTER TABLE "Org" ADD COLUMN     "coachCareer" TEXT,
ADD COLUMN     "coachIntro" TEXT,
ADD COLUMN     "lessonHours" TEXT,
ADD COLUMN     "priceFrom" INTEGER,
ADD COLUMN     "priceNote" TEXT,
ADD COLUMN     "publicProfile" BOOLEAN NOT NULL DEFAULT false,
ADD COLUMN     "specialties" TEXT[] DEFAULT ARRAY[]::TEXT[];

-- CreateTable
CREATE TABLE "LessonBooking" (
    "id" TEXT NOT NULL,
    "orgId" TEXT NOT NULL,
    "userId" TEXT NOT NULL,
    "memberId" TEXT,
    "status" TEXT NOT NULL DEFAULT 'REQUESTED',
    "slot1" TIMESTAMP(3) NOT NULL,
    "slot2" TIMESTAMP(3),
    "chosen" TIMESTAMP(3),
    "note" TEXT,
    "reply" TEXT,
    "eventId" TEXT,
    "createdAt" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,
    "updatedAt" TIMESTAMP(3) NOT NULL,

    CONSTRAINT "LessonBooking_pkey" PRIMARY KEY ("id")
);

-- CreateTable
CREATE TABLE "LessonReview" (
    "id" TEXT NOT NULL,
    "orgId" TEXT NOT NULL,
    "userId" TEXT NOT NULL,
    "bookingId" TEXT NOT NULL,
    "rating" INTEGER NOT NULL,
    "body" TEXT NOT NULL,
    "createdAt" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,

    CONSTRAINT "LessonReview_pkey" PRIMARY KEY ("id")
);

-- CreateTable
CREATE TABLE "Venue" (
    "id" TEXT NOT NULL,
    "ownerId" TEXT NOT NULL,
    "name" TEXT NOT NULL,
    "kind" TEXT NOT NULL,
    "region" TEXT NOT NULL,
    "address" TEXT,
    "intro" TEXT,
    "slotMin" INTEGER NOT NULL DEFAULT 60,
    "pricePerSlot" INTEGER,
    "priceNote" TEXT,
    "hours" JSONB NOT NULL DEFAULT '{}',
    "approval" BOOLEAN NOT NULL DEFAULT true,
    "images" TEXT[] DEFAULT ARRAY[]::TEXT[],
    "publicProfile" BOOLEAN NOT NULL DEFAULT true,
    "hiddenAt" TIMESTAMP(3),
    "createdAt" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,
    "updatedAt" TIMESTAMP(3) NOT NULL,

    CONSTRAINT "Venue_pkey" PRIMARY KEY ("id")
);

-- CreateTable
CREATE TABLE "VenueBooking" (
    "id" TEXT NOT NULL,
    "venueId" TEXT NOT NULL,
    "userId" TEXT NOT NULL,
    "date" DATE NOT NULL,
    "startMin" INTEGER NOT NULL,
    "endMin" INTEGER NOT NULL,
    "status" TEXT NOT NULL DEFAULT 'REQUESTED',
    "note" TEXT,
    "reply" TEXT,
    "createdAt" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,
    "updatedAt" TIMESTAMP(3) NOT NULL,

    CONSTRAINT "VenueBooking_pkey" PRIMARY KEY ("id")
);

-- CreateIndex
CREATE INDEX "LessonBooking_orgId_status_slot1_idx" ON "LessonBooking"("orgId", "status", "slot1");

-- CreateIndex
CREATE INDEX "LessonBooking_userId_createdAt_idx" ON "LessonBooking"("userId", "createdAt");

-- CreateIndex
CREATE UNIQUE INDEX "LessonReview_bookingId_key" ON "LessonReview"("bookingId");

-- CreateIndex
CREATE INDEX "LessonReview_orgId_createdAt_idx" ON "LessonReview"("orgId", "createdAt");

-- CreateIndex
CREATE INDEX "Venue_ownerId_idx" ON "Venue"("ownerId");

-- CreateIndex
CREATE INDEX "Venue_region_kind_publicProfile_idx" ON "Venue"("region", "kind", "publicProfile");

-- CreateIndex
CREATE INDEX "VenueBooking_venueId_date_status_idx" ON "VenueBooking"("venueId", "date", "status");

-- CreateIndex
CREATE INDEX "VenueBooking_userId_date_idx" ON "VenueBooking"("userId", "date");
