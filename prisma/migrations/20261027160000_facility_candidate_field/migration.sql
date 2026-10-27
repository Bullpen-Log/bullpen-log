-- 야구장 수집 후보(2026-10-27): 이용 경로 근거 · 장소(면) 대응 — 더하기만, 비워 둘 수 있음.
-- (migrate diff 가 함께 내는 VelocityAttempt 외래키 지우기 셋은 예전부터 DB 에만 있는 것이라 넣지 않는다)

-- AlterTable
ALTER TABLE "FacilityCandidate" ADD COLUMN     "accessNotice" TEXT,
ADD COLUMN     "identityNotice" TEXT;
