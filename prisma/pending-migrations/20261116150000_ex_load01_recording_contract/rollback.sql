-- EX-LOAD01 되돌리기 — **데이터를 잃는다**: 세트 스냅샷(밴드 · 섞인 무게 · 서로 다른 무게 · 기구 이름), 관리자 뜻 설정, 원래 요청 복구 기록.
-- 먼저 WORKOUT_LOAD_SCHEMA 를 끄고(새 칸을 읽고 쓰지 않게) 배포가 끝난 뒤에만. 백업(npm run backup)이 먼저다.
-- 끄기만으로 충분한 경우가 대부분이다(꺼지면 앱은 예전 길로 돈다 · 칸은 남아도 해가 없다). 이 파일은 정말 칸을 지워야 할 때만.
DROP TABLE IF EXISTS "WorkoutLoadRecovery";
ALTER TABLE "ExerciseVideo" DROP COLUMN IF EXISTS "loadSemantics";
ALTER TABLE "UserExerciseSet" DROP COLUMN IF EXISTS "load";
