-- CreateTable
CREATE TABLE "IntakeInvitation" (
    "id" TEXT NOT NULL,
    "tokenHash" TEXT NOT NULL,
    "status" TEXT NOT NULL DEFAULT 'active',
    "note" TEXT,
    "createdByAdminId" TEXT,
    "uploadExpiresAt" TIMESTAMP(3) NOT NULL,
    "resultExpiresAt" TIMESTAMP(3),
    "accessCodeHash" TEXT,
    "accessCodeFailures" INTEGER NOT NULL DEFAULT 0,
    "accessCodeLockedAt" TIMESTAMP(3),
    "maxFileBytes" BIGINT,
    "maxTotalBytes" BIGINT,
    "revokedAt" TIMESTAMP(3),
    "revokedByAdminId" TEXT,
    "createRequestKey" TEXT,
    "tokenReissuedAt" TIMESTAMP(3),
    "tokenReissueCount" INTEGER NOT NULL DEFAULT 0,
    "adminReissuedAt" TIMESTAMP(3),
    "createdAt" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,
    "updatedAt" TIMESTAMP(3) NOT NULL,

    CONSTRAINT "IntakeInvitation_pkey" PRIMARY KEY ("id")
);

-- CreateTable
CREATE TABLE "IntakeSubmission" (
    "id" TEXT NOT NULL,
    "invitationId" TEXT NOT NULL,
    "status" TEXT NOT NULL DEFAULT 'draft',
    "version" INTEGER NOT NULL DEFAULT 0,
    "receiptCode" TEXT,
    "athleteName" TEXT,
    "athleteAgeBand" TEXT,
    "throwingHand" TEXT,
    "submitterRelation" TEXT NOT NULL DEFAULT 'self',
    "submitterName" TEXT,
    "samePitchConfirmed" BOOLEAN NOT NULL DEFAULT false,
    "sideAssetId" TEXT,
    "rearAssetId" TEXT,
    "currentRevisionId" TEXT,
    "analysisStatus" TEXT NOT NULL DEFAULT 'none',
    "publicationStatus" TEXT NOT NULL DEFAULT 'unpublished',
    "correction" JSONB,
    "correctionRequestedAt" TIMESTAMP(3),
    "assigneeAdminId" TEXT,
    "receivedAt" TIMESTAMP(3),
    "lastFinalizedAt" TIMESTAMP(3),
    "withdrawnAt" TIMESTAMP(3),
    "createdAt" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,
    "updatedAt" TIMESTAMP(3) NOT NULL,

    CONSTRAINT "IntakeSubmission_pkey" PRIMARY KEY ("id")
);

-- CreateTable
CREATE TABLE "IntakeRevision" (
    "id" TEXT NOT NULL,
    "submissionId" TEXT NOT NULL,
    "number" INTEGER NOT NULL,
    "sideAssetId" TEXT NOT NULL,
    "rearAssetId" TEXT NOT NULL,
    "athleteName" TEXT NOT NULL,
    "throwingHand" TEXT,
    "submitterRelation" TEXT NOT NULL,
    "submitterName" TEXT,
    "consentSnapshot" JSONB NOT NULL,
    "finalizeKey" TEXT NOT NULL,
    "status" TEXT NOT NULL DEFAULT 'pending',
    "failureCode" TEXT,
    "finalizedAt" TIMESTAMP(3) NOT NULL,
    "settledAt" TIMESTAMP(3),
    "createdAt" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,

    CONSTRAINT "IntakeRevision_pkey" PRIMARY KEY ("id")
);

-- CreateTable
CREATE TABLE "IntakeAsset" (
    "id" TEXT NOT NULL,
    "submissionId" TEXT NOT NULL,
    "view" TEXT NOT NULL,
    "objectPath" TEXT NOT NULL,
    "status" TEXT NOT NULL DEFAULT 'reserved',
    "originalName" TEXT NOT NULL,
    "declaredType" TEXT,
    "declaredSize" BIGINT NOT NULL,
    "clientSha256" TEXT NOT NULL,
    "serverSha256" TEXT,
    "storedBytes" BIGINT,
    "mediaFacts" JSONB,
    "captureAt" TIMESTAMP(3),
    "captureAtSource" TEXT,
    "rejectCode" TEXT,
    "uploadUrl" TEXT,
    "transportExpiresAt" TIMESTAMP(3),
    "tokenIssuedAt" TIMESTAMP(3),
    "tokenCount" INTEGER NOT NULL DEFAULT 0,
    "uploadedAt" TIMESTAMP(3),
    "verifiedAt" TIMESTAMP(3),
    "purgedAt" TIMESTAMP(3),
    "createdAt" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,
    "updatedAt" TIMESTAMP(3) NOT NULL,

    CONSTRAINT "IntakeAsset_pkey" PRIMARY KEY ("id")
);

-- CreateTable
CREATE TABLE "IntakeConsent" (
    "id" TEXT NOT NULL,
    "submissionId" TEXT NOT NULL,
    "kind" TEXT NOT NULL,
    "docVersion" TEXT NOT NULL,
    "textHash" TEXT NOT NULL,
    "granted" BOOLEAN NOT NULL,
    "proxy" BOOLEAN NOT NULL DEFAULT false,
    "relation" TEXT NOT NULL,
    "agreedAt" TIMESTAMP(3) NOT NULL,
    "withdrawnAt" TIMESTAMP(3),
    "createdAt" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,

    CONSTRAINT "IntakeConsent_pkey" PRIMARY KEY ("id")
);

-- CreateTable
CREATE TABLE "IntakeAnalysisRun" (
    "id" TEXT NOT NULL,
    "submissionId" TEXT NOT NULL,
    "revisionId" TEXT NOT NULL,
    "engineKey" TEXT NOT NULL,
    "dedupeKey" TEXT,
    "status" TEXT NOT NULL DEFAULT 'requested',
    "gpuCallId" TEXT,
    "requestedByAdminId" TEXT,
    "resultPath" TEXT,
    "resultMeta" JSONB,
    "failureCode" TEXT,
    "failureDetail" TEXT,
    "requestedAt" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,
    "startedAt" TIMESTAMP(3),
    "finishedAt" TIMESTAMP(3),

    CONSTRAINT "IntakeAnalysisRun_pkey" PRIMARY KEY ("id")
);

-- CreateTable
CREATE TABLE "IntakePublication" (
    "id" TEXT NOT NULL,
    "submissionId" TEXT NOT NULL,
    "runId" TEXT NOT NULL,
    "number" INTEGER NOT NULL,
    "activeFor" TEXT,
    "explanation" TEXT,
    "publishedByAdminId" TEXT NOT NULL,
    "publishedAt" TIMESTAMP(3) NOT NULL,
    "unpublishedAt" TIMESTAMP(3),
    "unpublishedByAdminId" TEXT,
    "createdAt" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,

    CONSTRAINT "IntakePublication_pkey" PRIMARY KEY ("id")
);

-- CreateTable
CREATE TABLE "IntakeAudit" (
    "id" TEXT NOT NULL,
    "submissionId" TEXT,
    "invitationId" TEXT,
    "actorKind" TEXT NOT NULL,
    "actorId" TEXT,
    "action" TEXT NOT NULL,
    "detail" JSONB,
    "createdAt" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,

    CONSTRAINT "IntakeAudit_pkey" PRIMARY KEY ("id")
);

-- CreateTable
CREATE TABLE "IntakeAdminNote" (
    "id" TEXT NOT NULL,
    "submissionId" TEXT NOT NULL,
    "adminId" TEXT NOT NULL,
    "body" TEXT NOT NULL,
    "createdAt" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,
    "deletedAt" TIMESTAMP(3),

    CONSTRAINT "IntakeAdminNote_pkey" PRIMARY KEY ("id")
);

-- CreateTable
CREATE TABLE "IntakeAdminRead" (
    "id" TEXT NOT NULL,
    "submissionId" TEXT NOT NULL,
    "adminId" TEXT NOT NULL,
    "readAt" TIMESTAMP(3) NOT NULL,

    CONSTRAINT "IntakeAdminRead_pkey" PRIMARY KEY ("id")
);

-- CreateTable
CREATE TABLE "IntakeJob" (
    "id" TEXT NOT NULL,
    "kind" TEXT NOT NULL,
    "dedupeKey" TEXT,
    "payload" JSONB NOT NULL,
    "status" TEXT NOT NULL DEFAULT 'queued',
    "attempts" INTEGER NOT NULL DEFAULT 0,
    "maxAttempts" INTEGER NOT NULL DEFAULT 8,
    "autoRequeues" INTEGER NOT NULL DEFAULT 0,
    "runAfter" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,
    "leaseOwner" TEXT,
    "leaseUntil" TIMESTAMP(3),
    "lastError" TEXT,
    "finishedAt" TIMESTAMP(3),
    "createdAt" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,
    "updatedAt" TIMESTAMP(3) NOT NULL,

    CONSTRAINT "IntakeJob_pkey" PRIMARY KEY ("id")
);

-- CreateTable
CREATE TABLE "IntakeRateLimit" (
    "key" TEXT NOT NULL,
    "windowStart" TIMESTAMP(3) NOT NULL,
    "count" INTEGER NOT NULL DEFAULT 0,

    CONSTRAINT "IntakeRateLimit_pkey" PRIMARY KEY ("key","windowStart")
);

-- CreateIndex
CREATE UNIQUE INDEX "IntakeInvitation_tokenHash_key" ON "IntakeInvitation"("tokenHash");

-- CreateIndex
CREATE UNIQUE INDEX "IntakeInvitation_createRequestKey_key" ON "IntakeInvitation"("createRequestKey");

-- CreateIndex
CREATE INDEX "IntakeInvitation_status_createdAt_idx" ON "IntakeInvitation"("status", "createdAt");

-- CreateIndex
CREATE UNIQUE INDEX "IntakeSubmission_invitationId_key" ON "IntakeSubmission"("invitationId");

-- CreateIndex
CREATE UNIQUE INDEX "IntakeSubmission_receiptCode_key" ON "IntakeSubmission"("receiptCode");

-- CreateIndex
CREATE INDEX "IntakeSubmission_status_receivedAt_idx" ON "IntakeSubmission"("status", "receivedAt");

-- CreateIndex
CREATE INDEX "IntakeSubmission_analysisStatus_idx" ON "IntakeSubmission"("analysisStatus");

-- CreateIndex
CREATE INDEX "IntakeSubmission_publicationStatus_idx" ON "IntakeSubmission"("publicationStatus");

-- CreateIndex
CREATE INDEX "IntakeSubmission_athleteName_idx" ON "IntakeSubmission"("athleteName");

-- CreateIndex
CREATE INDEX "IntakeSubmission_assigneeAdminId_idx" ON "IntakeSubmission"("assigneeAdminId");

-- CreateIndex
CREATE UNIQUE INDEX "IntakeRevision_submissionId_number_key" ON "IntakeRevision"("submissionId", "number");

-- CreateIndex
CREATE UNIQUE INDEX "IntakeRevision_submissionId_finalizeKey_key" ON "IntakeRevision"("submissionId", "finalizeKey");

-- CreateIndex
CREATE UNIQUE INDEX "IntakeAsset_objectPath_key" ON "IntakeAsset"("objectPath");

-- CreateIndex
CREATE INDEX "IntakeAsset_submissionId_view_idx" ON "IntakeAsset"("submissionId", "view");

-- CreateIndex
CREATE INDEX "IntakeAsset_status_updatedAt_idx" ON "IntakeAsset"("status", "updatedAt");

-- CreateIndex
CREATE INDEX "IntakeConsent_submissionId_kind_idx" ON "IntakeConsent"("submissionId", "kind");

-- CreateIndex
CREATE UNIQUE INDEX "IntakeAnalysisRun_dedupeKey_key" ON "IntakeAnalysisRun"("dedupeKey");

-- CreateIndex
CREATE INDEX "IntakeAnalysisRun_submissionId_requestedAt_idx" ON "IntakeAnalysisRun"("submissionId", "requestedAt");

-- CreateIndex
CREATE INDEX "IntakeAnalysisRun_revisionId_idx" ON "IntakeAnalysisRun"("revisionId");

-- CreateIndex
CREATE INDEX "IntakeAnalysisRun_status_idx" ON "IntakeAnalysisRun"("status");

-- CreateIndex
CREATE UNIQUE INDEX "IntakePublication_activeFor_key" ON "IntakePublication"("activeFor");

-- CreateIndex
CREATE INDEX "IntakePublication_runId_idx" ON "IntakePublication"("runId");

-- CreateIndex
CREATE UNIQUE INDEX "IntakePublication_submissionId_number_key" ON "IntakePublication"("submissionId", "number");

-- CreateIndex
CREATE INDEX "IntakeAudit_submissionId_createdAt_idx" ON "IntakeAudit"("submissionId", "createdAt");

-- CreateIndex
CREATE INDEX "IntakeAudit_invitationId_createdAt_idx" ON "IntakeAudit"("invitationId", "createdAt");

-- CreateIndex
CREATE INDEX "IntakeAdminNote_submissionId_createdAt_idx" ON "IntakeAdminNote"("submissionId", "createdAt");

-- CreateIndex
CREATE INDEX "IntakeAdminRead_adminId_idx" ON "IntakeAdminRead"("adminId");

-- CreateIndex
CREATE UNIQUE INDEX "IntakeAdminRead_submissionId_adminId_key" ON "IntakeAdminRead"("submissionId", "adminId");

-- CreateIndex
CREATE UNIQUE INDEX "IntakeJob_dedupeKey_key" ON "IntakeJob"("dedupeKey");

-- CreateIndex
CREATE INDEX "IntakeJob_status_runAfter_idx" ON "IntakeJob"("status", "runAfter");

-- CreateIndex
CREATE INDEX "IntakeJob_kind_status_idx" ON "IntakeJob"("kind", "status");

-- CreateIndex
CREATE INDEX "IntakeRateLimit_windowStart_idx" ON "IntakeRateLimit"("windowStart");

