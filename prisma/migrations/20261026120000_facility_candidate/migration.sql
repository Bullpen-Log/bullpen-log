-- CreateTable
CREATE TABLE "FacilityCandidate" (
    "id" TEXT NOT NULL,
    "name" TEXT NOT NULL,
    "typeHint" TEXT NOT NULL,
    "region" TEXT NOT NULL,
    "district" TEXT,
    "roadAddress" TEXT,
    "address" TEXT,
    "lat" DOUBLE PRECISION,
    "lng" DOUBLE PRECISION,
    "coordsEdited" BOOLEAN NOT NULL DEFAULT false,
    "mapStatus" TEXT,
    "lessonNotice" TEXT,
    "rentalNotice" TEXT,
    "hardballNotice" TEXT,
    "sharedPlaceGroup" TEXT,
    "duplicateGroup" TEXT,
    "collected" JSONB NOT NULL,
    "collectedAt" DATE NOT NULL,
    "collectionStatus" TEXT NOT NULL DEFAULT 'UNVERIFIED',
    "businessStatus" TEXT NOT NULL DEFAULT 'UNKNOWN',
    "contactStatus" TEXT NOT NULL DEFAULT 'NOT_CONTACTED',
    "consentStatus" TEXT NOT NULL DEFAULT 'NOT_REQUESTED',
    "offersLessons" BOOLEAN,
    "offersRental" BOOLEAN,
    "verifiedAt" TIMESTAMP(3),
    "lastContactedAt" TIMESTAMP(3),
    "adminNote" TEXT,
    "approvedAt" TIMESTAMP(3),
    "approvedById" TEXT,
    "createdAt" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,
    "updatedAt" TIMESTAMP(3) NOT NULL,

    CONSTRAINT "FacilityCandidate_pkey" PRIMARY KEY ("id")
);

-- CreateIndex
CREATE INDEX "FacilityCandidate_region_idx" ON "FacilityCandidate"("region");
