-- 3D 동작 분석 개인정보 국외 이전 동의 이력(더하기만). migrate diff 가 내는 VelocityAttempt 외래키 지우기 셋은 예전부터 DB 에만 있는 것이라 뺐다.

-- CreateTable
CREATE TABLE "AnalysisConsent" (
    "id" TEXT NOT NULL,
    "userId" TEXT NOT NULL,
    "version" TEXT NOT NULL,
    "source" TEXT NOT NULL,
    "agreedAt" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,
    "revokedAt" TIMESTAMP(3),

    CONSTRAINT "AnalysisConsent_pkey" PRIMARY KEY ("id")
);

-- CreateIndex
CREATE INDEX "AnalysisConsent_userId_agreedAt_idx" ON "AnalysisConsent"("userId", "agreedAt");
