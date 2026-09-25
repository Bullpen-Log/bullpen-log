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

### 부탁하신 것

- 영양 기록 마이그레이션(`20260925084500_add_nutrition`)을 올렸다. 이제 저장소의
  `schema.prisma` 에 영양 표 4개가 있어서, `migrate diff` 가 그 표들을 지우는 SQL 을
  만들지 않는다.

### 받은 뒤 할 일

1. `npx prisma generate` — 영양 탭의 새 표 4개(`NutritionProfile`·`MealEntry`·`UserFood`·
   `DailyNutrition`)가 생겼다(`prisma/migrations/20260925084500_add_nutrition`). DB 에는 이미
   적용했으니 `migrate deploy` 는 할 것 없다. 표를 더하기만 했고 기존 표는 그대로다.
2. 개발 서버를 다시 켠다. 안 뜨면 `.next` 폴더를 지우고 다시 켠다.

### 김민 쪽 파일을 고친 것

무엇을 왜 고쳤는지는 각 커밋 메시지(= 패치노트)에 자세히 있다.

- `components/month-calendar.tsx` (42a0287) — `compact` 속성을 더했다. 켜면 칸 높이가
  0.3초 동안 줄어든다(72 → 52px, 휴대폰 52 → 44px). 기본은 꺼져 있어 다른 곳은 그대로다.
- `components/app-shell.tsx` (971aef4) — 큰 메뉴를 열 때 라이브러리·자료실·관리자처럼
  자주 쓰지 않는 아이콘은 날아오지 않고 제자리에서 돋아난다(`nav-grow`, 움직임은
  `app/globals.css`).
- `lib/nav.ts` · `components/nav-icons.tsx` (c38383b) — 영양 탭과 그 그림(`utensils`).

### 알아 두면 좋은 것

- 새 탭 **영양**(`/nutrition`)을 트레이닝과 분석 사이에 넣었다. 휴대폰 하단 탭이 6칸이 됐다
  (`lib/nav.ts`). 메뉴 연출의 차례 딱지 `d8` 을 `app/globals.css` 에 더했다.
- 영양 탭의 '운동으로 쓴 칼로리'는 `TrainingSession.activeSeconds` 와 `PitchLog`(투구 수·
  강도)를 읽어서 셈한다(`lib/nutrition/burn.ts`). 이 칸들의 뜻을 바꾸게 되면 알려 달라.
- 식약처 음식 검색은 환경변수 `FOOD_API_KEY` 가 있어야 켜진다(`.env.example` 참고). 없어도
  탭은 기본 목록·내 음식·직접 입력으로 돈다.
- 계산이 맞는지는 `npm run nutrition:test` 로 본다.
- 홈 캘린더: 날짜를 누르면 캘린더가 옆·위아래로 줄고, 오른쪽에 그날 요약, 밑에 누른 줄의
  조금 더 자세한 요약이 펴진다(`app/(app)/today/day-summary.tsx` · `day-detail.tsx`). 밑 칸은
  `/api/day-detail`(`lib/day-detail.ts`)로 그날 것을 읽는데, 김민 쪽 것을 이렇게 쓴다 —
  모양을 바꾸게 되면 알려 달라.
  - `lib/report/training-history.ts` 의 `trainingDay()` · `PlanDaySummary`
  - `lib/checkin.ts` 의 `CHECKIN_PARTS` · `DETAIL_SCALES` · `pickCheckinParts`
  - AI 리포트 본문의 `headline` · `assessment` · `actions[].title` · `watchouts`
    (모양이 달라도 깨지지 않게 조심해서 읽는다)
