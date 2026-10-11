-- 트레이닝 추천 2판 D2(2026-10-12): 던진 강도를 체감 %로 받는 칸. 옛 기록은 NULL(읽을 땐 intensity×10)
-- AlterTable
ALTER TABLE "PitchLog" ADD COLUMN     "effortPct" INTEGER;
