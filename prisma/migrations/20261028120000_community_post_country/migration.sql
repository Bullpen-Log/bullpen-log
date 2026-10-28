-- 나라별 덕아웃(2026-10-28) — 기존 글은 모두 한국 글(기본값 'kr')
ALTER TABLE "CommunityPost" ADD COLUMN "country" TEXT NOT NULL DEFAULT 'kr';

CREATE INDEX "CommunityPost_country_createdAt_idx" ON "CommunityPost"("country", "createdAt");

CREATE INDEX "CommunityPost_country_category_createdAt_idx" ON "CommunityPost"("country", "category", "createdAt");
