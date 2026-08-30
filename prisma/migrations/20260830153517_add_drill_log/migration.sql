-- CreateTable
CREATE TABLE "UserDrillLog" (
    "userId" TEXT NOT NULL,
    "guideId" TEXT NOT NULL,
    "date" DATE NOT NULL,
    "done" BOOLEAN NOT NULL DEFAULT false,

    CONSTRAINT "UserDrillLog_pkey" PRIMARY KEY ("userId","guideId","date")
);

-- CreateIndex
CREATE INDEX "UserDrillLog_userId_date_idx" ON "UserDrillLog"("userId", "date");
