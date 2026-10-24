-- 덕아웃 지도(2026-10-24) — 연습장 · 레슨장 위도 · 경도, 레슨장 주소. 더하기만.
-- migrate diff 가 함께 낸 CommunityPost 칸 · Community* 표 지우기 · VelocityAttempt 외래키 지우기는 이 작업과 무관하고
-- 공유 DB 에 상대가 먼저 만든 것이라 넣지 않았다.

-- AlterTable
ALTER TABLE "Org" ADD COLUMN     "address" TEXT,
ADD COLUMN     "lat" DOUBLE PRECISION,
ADD COLUMN     "lng" DOUBLE PRECISION;

-- AlterTable
ALTER TABLE "Venue" ADD COLUMN     "lat" DOUBLE PRECISION,
ADD COLUMN     "lng" DOUBLE PRECISION;
