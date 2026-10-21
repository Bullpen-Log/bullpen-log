-- 코드 로그인 표(2026-10-21 개편 7단계 7-3) — 더하기만.

-- CreateTable
CREATE TABLE "LoginTicket" (
    "code" TEXT NOT NULL,
    "userId" TEXT,
    "createdAt" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,
    "expiresAt" TIMESTAMP(3) NOT NULL,
    "claimedAt" TIMESTAMP(3),

    CONSTRAINT "LoginTicket_pkey" PRIMARY KEY ("code")
);

-- CreateIndex
CREATE INDEX "LoginTicket_expiresAt_idx" ON "LoginTicket"("expiresAt");
