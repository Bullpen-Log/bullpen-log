-- 구속 측정은 투구 기록을 만들지 않는다(2026-10-16) — 측정 때 고른 종류 · 체감 강도를 세션에 둔다(더하기만, 비워 둘 수 있음)
ALTER TABLE "VelocitySession" ADD COLUMN     "effortPct" INTEGER,
ADD COLUMN     "sessionType" TEXT;
