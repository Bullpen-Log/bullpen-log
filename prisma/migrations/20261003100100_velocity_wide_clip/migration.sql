-- 구속 측정 공의 광각 카메라 영상 칸(아이폰 앱이 일반 · 광각을 함께 찍을 때) — 추가만.
-- AlterTable
ALTER TABLE "VelocityPitch" ADD COLUMN     "wideClipBytes" INTEGER,
ADD COLUMN     "wideClipEventSec" DOUBLE PRECISION,
ADD COLUMN     "wideClipMime" TEXT,
ADD COLUMN     "wideClipPath" TEXT,
ADD COLUMN     "wideClipSec" DOUBLE PRECISION;
