-- 영양 탭에서 물 기록을 뺐다 — 물 칸 둘을 지운다.
--
-- 이 파일은 새 코드(물 칸을 안 읽는 코드)가 배포된 뒤에 적용한다. 먼저 적용하면
-- 아직 떠 있는 옛 코드가 이 칸을 읽다가 영양 탭이 멈춘다.
--
-- migrate diff 에는 저장소에 없는 DB 의 다른 것(DailyArmcare 표,
-- ExerciseVideo.targetMuscles 칸)도 지우자고 나왔지만, 이 작업과 상관없는 것이라
-- 넣지 않았다.

-- AlterTable
ALTER TABLE "DailyNutrition" DROP COLUMN "waterMl";

-- AlterTable
ALTER TABLE "NutritionProfile" DROP COLUMN "waterGoalMl";
