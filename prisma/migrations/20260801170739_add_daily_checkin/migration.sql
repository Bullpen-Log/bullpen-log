-- CreateTable
CREATE TABLE "DailyCheckin" (
    "id" TEXT NOT NULL,
    "userId" TEXT NOT NULL,
    "date" DATE NOT NULL,
    "shoulder" TEXT NOT NULL,
    "elbow" TEXT NOT NULL,
    "fatigue" INTEGER NOT NULL,
    "sleep" TEXT NOT NULL,
    "equipment" TEXT NOT NULL,
    "createdAt" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,
    "updatedAt" TIMESTAMP(3) NOT NULL,

    CONSTRAINT "DailyCheckin_pkey" PRIMARY KEY ("id")
);

-- CreateIndex
CREATE UNIQUE INDEX "DailyCheckin_userId_date_key" ON "DailyCheckin"("userId", "date");
