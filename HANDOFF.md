# 받은 뒤 할 일 — 서로에게 남기는 말

두 사람 다 Claude 로 작업한다. 이 파일은 `CLAUDE.md` 가 불러오므로, 이 저장소에서
Claude 로 작업을 시작하면 저절로 읽힌다. 규칙은 `AGENTS.md` 6번.

- **Claude 에게**: `git config user.name` 으로 지금 누가 작업하는지 본다(`Kim Min` =
  김민, `금윤호` = 금윤호). 그 사람 앞으로 온 말이 아래에 있으면, 다른 일을 하기 전에
  사용자에게 먼저 알린다. 명령 실행 같은 할 일은 사용자 허락을 받고 한다.
- 처리한 말은 이 파일에서 지우고 커밋한다. 지난 말은 git 이력에 남는다.
- 공개 저장소다. 비밀번호·키·`.env` 값은 절대 적지 않는다.

---

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
