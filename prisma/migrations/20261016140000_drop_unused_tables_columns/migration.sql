-- 2026-10-16 통합 세션 — 안 쓰는 표 둘 · 칸 여섯 지우기 2단계(1단계 776fcbbc 가 스키마 · 코드에서 빼고 배포됨). 지우기 전 값은 ~/bullpen-log-backups/dropped-2026-10-16.json
ALTER TABLE "DailyCheckin" DROP COLUMN "fatigue",
DROP COLUMN "hydration",
DROP COLUMN "mood",
DROP COLUMN "restingHr",
DROP COLUMN "stress";
ALTER TABLE "DailyNutrition" DROP COLUMN "photoCalls";
DROP TABLE "AiReport";
DROP TABLE "PoseAnalysis";
