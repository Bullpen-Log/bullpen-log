-- 2026-10-16 통합 검토 — 날짜 범위 조회 색인 둘(PitchLog · UserExerciseLog [userId, date])과, relationMode prisma 라 DB 외래키가 없어 이어 지우기 · 비우기가 표 전체를 훑던 칸의 색인(더하기만)
CREATE INDEX "Article_userId_idx" ON "Article"("userId");
CREATE INDEX "PitchLog_userId_date_idx" ON "PitchLog"("userId", "date");
CREATE INDEX "UserDrillFavorite_guideId_idx" ON "UserDrillFavorite"("guideId");
CREATE INDEX "UserDrillLog_guideId_idx" ON "UserDrillLog"("guideId");
CREATE INDEX "UserExerciseFavorite_exerciseId_idx" ON "UserExerciseFavorite"("exerciseId");
CREATE INDEX "UserExerciseLog_userId_date_idx" ON "UserExerciseLog"("userId", "date");
CREATE INDEX "UserExerciseLog_exerciseId_idx" ON "UserExerciseLog"("exerciseId");
CREATE INDEX "VelocitySession_pitchLogId_idx" ON "VelocitySession"("pitchLogId");
