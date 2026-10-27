-- 기존 HittingLog의 필수 숫자 계약과 기록을 보존한다.
CREATE TABLE "HittingSession" (
    "id" TEXT NOT NULL,
    "userId" TEXT NOT NULL,
    "date" DATE NOT NULL,
    "sessionType" TEXT NOT NULL,
    "swings" INTEGER,
    "effortPct" INTEGER,
    "memo" TEXT,
    "satisfaction" INTEGER,
    "createdAt" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,
    CONSTRAINT "HittingSession_pkey" PRIMARY KEY ("id")
);

CREATE INDEX "HittingSession_userId_date_idx" ON "HittingSession"("userId", "date");
