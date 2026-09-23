-- CreateTable
CREATE TABLE "PatchNote" (
    "id" TEXT NOT NULL,
    "createdAt" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,
    "authorId" TEXT NOT NULL,
    "authorName" TEXT NOT NULL,
    "kind" TEXT NOT NULL,
    "action" TEXT NOT NULL,
    "subject" TEXT NOT NULL,
    "title" TEXT NOT NULL,
    "details" JSONB,
    "note" TEXT,
    "editedAt" TIMESTAMP(3),
    "editedBy" TEXT,

    CONSTRAINT "PatchNote_pkey" PRIMARY KEY ("id")
);

-- CreateIndex
CREATE INDEX "PatchNote_createdAt_idx" ON "PatchNote"("createdAt");

-- CreateIndex
CREATE INDEX "PatchNote_kind_idx" ON "PatchNote"("kind");

