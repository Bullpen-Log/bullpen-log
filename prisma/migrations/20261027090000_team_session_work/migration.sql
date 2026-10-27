-- AlterTable
ALTER TABLE "OrgComment" ADD COLUMN     "eventId" TEXT;

-- AlterTable
ALTER TABLE "OrgEvent" ADD COLUMN     "confirmedAt" TIMESTAMP(3),
ADD COLUMN     "confirmedById" TEXT,
ADD COLUMN     "rosterAt" TIMESTAMP(3);

-- AlterTable
ALTER TABLE "OrgEventAttendee" ADD COLUMN     "exception" JSONB,
ADD COLUMN     "values" JSONB,
ADD COLUMN     "workAt" TIMESTAMP(3),
ADD COLUMN     "workHash" TEXT,
ADD COLUMN     "workReason" TEXT,
ADD COLUMN     "workStatus" TEXT;

-- AlterTable
ALTER TABLE "OrgPlan" ADD COLUMN     "actualItems" JSONB,
ADD COLUMN     "groupName" TEXT,
ADD COLUMN     "position" INTEGER NOT NULL DEFAULT 0,
ADD COLUMN     "replacesPlanId" TEXT,
ADD COLUMN     "scope" TEXT NOT NULL DEFAULT 'all',
ADD COLUMN     "valueMode" TEXT NOT NULL DEFAULT 'shared';

-- CreateIndex
CREATE INDEX "OrgComment_eventId_idx" ON "OrgComment"("eventId");

