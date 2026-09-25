-- CreateTable
CREATE TABLE "NutritionProfile" (
    "id" TEXT NOT NULL,
    "userId" TEXT NOT NULL,
    "sex" TEXT,
    "goal" TEXT NOT NULL DEFAULT 'maintain',
    "activity" TEXT NOT NULL DEFAULT 'mid',
    "proteinPerKg" DOUBLE PRECISION NOT NULL DEFAULT 1.8,
    "kcalTarget" INTEGER,
    "waterGoalMl" INTEGER,
    "createdAt" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,
    "updatedAt" TIMESTAMP(3) NOT NULL,

    CONSTRAINT "NutritionProfile_pkey" PRIMARY KEY ("id")
);

-- CreateTable
CREATE TABLE "MealEntry" (
    "id" TEXT NOT NULL,
    "userId" TEXT NOT NULL,
    "date" DATE NOT NULL,
    "meal" TEXT NOT NULL,
    "name" TEXT NOT NULL,
    "source" TEXT NOT NULL,
    "sourceId" TEXT,
    "servingLabel" TEXT,
    "servingGrams" DOUBLE PRECISION,
    "amount" DOUBLE PRECISION NOT NULL DEFAULT 1,
    "kcal" DOUBLE PRECISION NOT NULL,
    "carbs" DOUBLE PRECISION,
    "protein" DOUBLE PRECISION,
    "fat" DOUBLE PRECISION,
    "createdAt" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,
    "updatedAt" TIMESTAMP(3) NOT NULL,

    CONSTRAINT "MealEntry_pkey" PRIMARY KEY ("id")
);

-- CreateTable
CREATE TABLE "UserFood" (
    "id" TEXT NOT NULL,
    "userId" TEXT NOT NULL,
    "name" TEXT NOT NULL,
    "source" TEXT NOT NULL DEFAULT 'mine',
    "sourceId" TEXT,
    "servingLabel" TEXT NOT NULL,
    "servingGrams" DOUBLE PRECISION,
    "kcal" DOUBLE PRECISION NOT NULL,
    "carbs" DOUBLE PRECISION,
    "protein" DOUBLE PRECISION,
    "fat" DOUBLE PRECISION,
    "createdAt" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,
    "updatedAt" TIMESTAMP(3) NOT NULL,

    CONSTRAINT "UserFood_pkey" PRIMARY KEY ("id")
);

-- CreateTable
CREATE TABLE "DailyNutrition" (
    "id" TEXT NOT NULL,
    "userId" TEXT NOT NULL,
    "date" DATE NOT NULL,
    "waterMl" INTEGER NOT NULL DEFAULT 0,
    "weightKg" DOUBLE PRECISION,
    "createdAt" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,
    "updatedAt" TIMESTAMP(3) NOT NULL,

    CONSTRAINT "DailyNutrition_pkey" PRIMARY KEY ("id")
);

-- CreateIndex
CREATE UNIQUE INDEX "NutritionProfile_userId_key" ON "NutritionProfile"("userId");

-- CreateIndex
CREATE INDEX "MealEntry_userId_date_idx" ON "MealEntry"("userId", "date");

-- CreateIndex
CREATE INDEX "UserFood_userId_idx" ON "UserFood"("userId");

-- CreateIndex
CREATE UNIQUE INDEX "DailyNutrition_userId_date_key" ON "DailyNutrition"("userId", "date");

