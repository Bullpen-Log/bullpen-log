# 받은 뒤 할 일 — 서로에게 남기는 말

두 사람 다 Claude 로 작업한다. 이 파일은 `CLAUDE.md` 가 불러오므로, 이 저장소에서
Claude 로 작업을 시작하면 저절로 읽힌다. 규칙은 `AGENTS.md` 6번.

- **Claude 에게**: `git config user.name` 으로 지금 누가 작업하는지 본다(`Kim Min` =
  김민, `금윤호` = 금윤호). 그 사람 앞으로 온 말이 아래에 있으면, 다른 일을 하기 전에
  사용자에게 먼저 알린다. 명령 실행 같은 할 일은 사용자 허락을 받고 한다.
- 처리한 말은 이 파일에서 지우고 커밋한다. 지난 말은 git 이력에 남는다.
- 공개 저장소다. 비밀번호·키·`.env` 값은 절대 적지 않는다.

---

## 금윤호에게 — 2026-09-25 · 김민(Claude)

### 부탁 — 영양 기록 마이그레이션을 올려 주세요

`DailyNutrition` 표(`20260925084500_add_nutrition`)가 DB 에는 적용돼 있는데 저장소에는
아직 없다. 그 사이 김민 쪽에서 DB 구조를 바꾸면 `migrate diff` 가 이 표를 지우는 SQL
(`DROP TABLE "DailyNutrition"`)까지 만든다. 김민 쪽은 그 줄을 빼고 적용하겠지만, 코드가
올라오면 이런 위험이 없어진다.

### 금윤호 쪽 파일을 고친 것

무엇을 왜 고쳤는지는 각 커밋 메시지(= 패치노트)에 자세히 있다.

- `app/(app)/today/page.tsx` (7767105 · 4abb79b) — 홈의 일정 만들기 폼(`PlanForm`)에
  `preferredWorkout={core.preferredWorkout}` 를 넘긴다. 목표를 처음 고르는 사람이 체크인에서
  '파워'를 골랐으면 폼이 파워 향상을 짚어 두게 하려는 것이다. 나머지는 목표 이름 주석 한 줄.

### 알아 두면 좋은 것 (김민 쪽 변경)

- 훈련 목표가 셋이 됐다 — 근력 향상(기본) · 파워 향상 · 컨디셔닝. '부상 방지'는 '컨디셔닝'으로
  이름을 바꿨고(7767105), '균형 잡힌 관리'는 없앴다(4abb79b). DB 의 `User.trainingGoal` 이
  '균형 잡힌 관리'였던 1명은 '근력 향상'으로 옮겼다(구조 변경 아님). 목표 이름을 코드에 직접
  적어 쓸 일이 있으면 `lib/report/personalize.ts` 의 `TRAINING_GOALS` 를 본다.
- 운동 카테고리 '유산소' 영상은 이제 컨디셔닝 날에도 하나 들어간다(4abb79b).

## 김민에게 — 2026-09-25 · 금윤호(Claude)

### 받은 뒤 할 일

1. `npx prisma generate` — 영양 탭의 새 표 4개(`NutritionProfile`·`MealEntry`·`UserFood`·
   `DailyNutrition`)가 생겼다(`prisma/migrations/20260925084500_add_nutrition`). DB 에는 이미
   적용했으니 `migrate deploy` 는 할 것 없다. 표를 더하기만 했고 기존 표는 그대로다.
2. 개발 서버를 다시 켠다. 안 뜨면 `.next` 폴더를 지우고 다시 켠다.

### 알아 두면 좋은 것

- 새 탭 **영양**(`/nutrition`)을 트레이닝과 분석 사이에 넣었다. 휴대폰 하단 탭이 6칸이 됐다
  (`lib/nav.ts`). 메뉴 연출의 차례 딱지 `d8` 을 `app/globals.css` 에 더했다.
- 영양 탭의 '운동으로 쓴 칼로리'는 `TrainingSession.activeSeconds` 와 `PitchLog`(투구 수·
  강도)를 읽어서 셈한다(`lib/nutrition/burn.ts`). 이 칸들의 뜻을 바꾸게 되면 알려 달라.
- 식약처 음식 검색은 환경변수 `FOOD_API_KEY` 가 있어야 켜진다(`.env.example` 참고). 없어도
  탭은 기본 목록·내 음식·직접 입력으로 돈다.
- 계산이 맞는지는 `npm run nutrition:test` 로 본다.
