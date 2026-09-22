-- 쓰지 않는 표 둘을 지운다.
--
-- 운동을 "화요일 하체 루틴"처럼 묶으려다 표만 만들어 두고 화면은 만들지
-- 않았다. 지우는 시점에 Routine 0행, RoutineExercise 0행이었고 코드 어디
-- 에서도 읽거나 쓰지 않았다.
--
-- 지금 지우는 이유는, 곧 워밍업 루틴 표와 운동 프로그램 표를 새로 만들기
-- 때문이다. 이름이 겹친 채로 두면 어느 것이 진짜인지 헷갈린다.
--
-- relationMode = "prisma" 라 실제 외래키가 없다. 다른 표가 이 둘을 붙잡고
-- 있지 않으므로 그냥 지우면 된다.
DROP TABLE IF EXISTS "RoutineExercise";
DROP TABLE IF EXISTS "Routine";
