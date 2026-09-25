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

### 분석 탭을 홈으로 옮겼다 (사용자 요청)

김민 쪽 화면이라 자세히 적는다. 무엇을 왜 고쳤는지는 커밋 메시지(= 패치노트)에도 있다.

- 메뉴와 휴대폰 하단 탭에서 '분석'을 뺐다(`lib/nav.ts`, 하단 탭은 홈·영상·트레이닝·영양·
  더보기 5칸). 분석은 이제 홈 캘린더 밑에 늘 떠 있는 '분석' 칸이다
  (`app/(app)/today/analysis-block.tsx`). 캘린더에서 날짜를 누르면 그날 분석(리포트·투구·
  트레이닝)으로 바뀐다. 리포트가 있는 날은 캘린더 칸 왼쪽 위에 반짝이가 붙는다.
- `app/(app)/coach/page.tsx` · `coach/report/[date]/page.tsx` 는 홈의 그 칸으로 넘겨 주는
  것만 남겼다(`/today?analysis=…#analysis`, `/today?date=…&analysis=report#analysis`).
  안 쓰게 된 `coach/past-reports.tsx` 는 지웠다.
- 분석 칸은 `coach/` 의 부품을 그대로 쓴다 — `StatsOverview`(`tabs={null}`, `today` 에 고른
  날의 정오), `TrainingReviewCards`, `ReportClient`, `AiReportCard`, `ReportBody`. 고른 날
  기준으로 다시 셈하려고 `trainingLoad(user, 그날)` · `trainingReview(id, 그날)` 을 부른다
  (`app/(app)/today/analysis-view.tsx`). 이 부품·함수들이 받는 값을 바꾸게 되면 알려 달라.
- 오늘이 아닌 날·칸은 서버 액션 `app/actions/analysis.tsx` 가 그려서 돌려준다(JSX 를
  돌려주는 액션 — 부품들이 서버에서 셈하도록 짜여 있어서 그대로 쓰려고).
- `app/actions/ai-report.ts` 의 `revalidatePath('/coach')` 와 `app/actions/training-setup.ts`
  `RETURN_TO` 의 `'/coach'` 는 이제 할 일이 없다. 김민 쪽 파일이라 그대로 뒀다 — 지워도 된다.

### 김민 쪽 파일을 고친 것

- `components/month-calendar.tsx` — 넷을 더했다. 모두 선택이라 트레이닝 캘린더는 그대로다.
  - `compact` (42a0287) — 칸 높이가 0.3초 동안 줄어든다(홈에서 날짜를 골랐을 때).
  - `renderDay` · `size="large"` · `emptySpoken` (e2ac363) — 칸 속을 부르는 쪽이 그린다.
    투구 영상 캘린더가 칸마다 썸네일을 채운다.
  - `flags` — 칸 왼쪽 위 작은 반짝이(홈: 분석 리포트가 있는 날).
- `components/app-shell.tsx` (971aef4) — 큰 메뉴를 열 때 라이브러리·자료실·관리자처럼
  자주 쓰지 않는 아이콘은 날아오지 않고 제자리에서 돋아난다(`nav-grow`, 움직임은
  `app/globals.css`).
- `lib/nav.ts` · `components/nav-icons.tsx` (c38383b) — 영양 탭과 그 그림(`utensils`).
- `lib/storage.ts` (e2ac363) — 투구 영상 썸네일 자리(`pitchThumbPath`), 덮어쓰는 업로드
  주소, `deleteVideos` 가 투구 영상을 지울 때 그 썸네일도 함께 지운다.

### 알아 두면 좋은 것

- 새 탭 **영양**(`/nutrition`)을 트레이닝 뒤에 넣었다. 메뉴 연출의 차례 딱지 `d8` 을
  `app/globals.css` 에 더했다.
- 영양 탭의 '운동으로 쓴 칼로리'는 `TrainingSession.activeSeconds` 와 `PitchLog`(투구 수·
  강도)를 읽어서 셈한다(`lib/nutrition/burn.ts`). 이 칸들의 뜻을 바꾸게 되면 알려 달라.
- 식약처 음식 검색은 환경변수 `FOOD_API_KEY` 가 있어야 켜진다(`.env.example` 참고). 없어도
  탭은 기본 목록·내 음식·직접 입력으로 돈다. 계산이 맞는지는 `npm run nutrition:test`.
- 홈 캘린더: 날짜를 누르면 캘린더가 옆·위아래로 줄고, 오른쪽에 그날 요약, 밑에 누른 줄의
  조금 더 자세한 요약이 펴진다(`app/(app)/today/day-summary.tsx` · `day-detail.tsx`). 밑 칸은
  `/api/day-detail`(`lib/day-detail.ts`)로 그날 것을 읽는데, 김민 쪽 것을 이렇게 쓴다 —
  모양을 바꾸게 되면 알려 달라.
  - `lib/report/training-history.ts` 의 `trainingDay()` · `PlanDaySummary`
  - `lib/checkin.ts` 의 `CHECKIN_PARTS` · `DETAIL_SCALES` · `pickCheckinParts`
- 투구 영상 탭은 [캘린더 | 목록]이 됐다. 썸네일은 DB 없이 저장소 `{사용자}/thumb-{영상}.jpg`
  에 둔다 — 저장소 파일을 셀 일이 있으면 `thumb-`(썸네일)·`avatar-`(사진)로 시작하는 것을
  가려야 한다. 영상을 올리는 순간 `components/video-upload.tsx` 의 `onUploaded` 에서 뜬다.
- 새로 쓸 수 있는 부품: `components/expand.tsx`(제자리에서 펴지고 접히는 칸),
  `components/mini-calendar.tsx`(날짜 하나를 고르는 작은 달력).
