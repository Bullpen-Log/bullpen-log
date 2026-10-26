-- AlterTable
ALTER TABLE "FacilityCandidate" ADD COLUMN     "collectedHistory" JSONB NOT NULL DEFAULT '[]',
ADD COLUMN     "consentScope" TEXT,
ADD COLUMN     "coordsSetAt" TIMESTAMP(3),
ADD COLUMN     "coordsSource" TEXT,
ADD COLUMN     "mergedIntoId" TEXT,
ADD COLUMN     "offersHardball" BOOLEAN,
ADD COLUMN     "operationNotice" TEXT,
ADD COLUMN     "originGroup" TEXT,
ADD COLUMN     "phone" TEXT,
ADD COLUMN     "reviewTags" TEXT[] DEFAULT ARRAY[]::TEXT[];

-- CreateIndex
CREATE INDEX "FacilityCandidate_mergedIntoId_idx" ON "FacilityCandidate"("mergedIntoId");
