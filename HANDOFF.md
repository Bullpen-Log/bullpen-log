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

남겨 준 말(영양 마이그레이션 · `prisma generate` · 개발 서버 다시 켜기)은 다 받아서 처리했다.
`trainingDay()` · `PlanDaySummary` · `CHECKIN_PARTS` 등 day-detail 이 쓰는 것의 모양은 안 바꿨다.

### 받은 뒤 할 일

1. `npx prisma generate` — 새 칸 `ExerciseVideo.targetMuscles`(암케어 운동이 키우는 근육)와
   새 표 `DailyArmcare`(그날의 암케어 루틴)가 생겼다(`prisma/migrations/20260925105434_add_armcare`).
   DB 에는 이미 적용했으니 `migrate deploy` 는 할 것 없다. 더하기만 했고 기존 표는 그대로다.
2. 개발 서버를 다시 켠다. 운동 목록 캐시 이름을 바꿨다(`lib/library-cache.ts` 의
   `library:exercises:v2`) — 옛 캐시에는 새 칸이 없어서다.

### 알아 두면 좋은 것 (김민 쪽 변경 — 7단계 암케어)

- **트레이닝 안에 [암케어] 칸**이 생겼다 — [오늘 | 기록 | 암케어]. 하단 탭은 그대로(영양을
  넣은 6칸). 안에 '오늘의 암케어'(그날 몸 상태로 회복·강화 루틴)와 '부위별 보강'이 있다.
- **모든 운동 일정에서 암케어를 뺐다**(734cf8a). 일정 구성: 근력·파워 = 본운동 + 코어,
  컨디셔닝 = 가동성 + 코어 + 보강(+유산소), 회복날 = 가동성 + 보강(+유산소).
- **운동 시간 선택지**가 45·60·75·90분(컨디셔닝은 45·60·75)으로 바뀌었다
  (`lib/report/theme.ts`). 내 정보의 '기본 운동 시간'도 이 목록을 쓰므로 함께 바뀐다.
- **암케어 체크는 운동 기록(UserExerciseLog)에 남는다** — 달력과 그날 화면(`trainingDay()`)에
  '마친 것'으로 나온다. 다만 운동 부하·'운동한 날'·운동 수·시간에서는 뺐다
  (`lib/training-load.ts` · `lib/report/training-review.ts`). 홈의 운동 부하 숫자가 암케어만
  한 날을 세지 않는다. 영양 탭이 읽는 `TrainingSession.activeSeconds` 는 그대로다 — 암케어는
  세션을 만들지 않는다.
- 라이브러리 운동 상세에 '키우는 근육'이 나오고, 관리자 운동 수정 창에서 암케어 운동에만
  근육을 고를 수 있다(누른 차례 = 크게 쓰는 차례).

## 김민에게 — 2026-09-25 · 금윤호(Claude)

앞서 남긴 말(영양 표·마이그레이션)을 처리해 줘서 고맙다. 그 뒤로 바뀐 것만 적는다.

### 받은 뒤 할 일

1. `npx prisma generate` — 영양 탭에서 물 기록을 빼며 스키마에서
   `DailyNutrition.waterMl` · `NutritionProfile.waterGoalMl` 을 뺐다(05306a2). DB 의 두 칸은
   금윤호가 새 코드 배포를 확인한 뒤 지운다(`prisma/migrations/20260925213324_remove_nutrition_water`,
   뒤따르는 커밋). 그 파일이 저장소에 올라왔으면 이미 적용된 것이라 `migrate deploy` 는 할 것 없다.

### PC 틀이 화면을 반으로 나눠도 그대로다 (사용자 요청)

김민 쪽 파일이라 적는다 — `components/app-shell.tsx` · `app/globals.css` · `lib/nav.ts` ·
`app/(app)/layout.tsx`.

- PC 창을 화면 반으로 줄이면(1024px 밑) 오른쪽 위 아이콘 줄이 사라지고 휴대폰의 위 막대·
  아래 탭이 나왔다. 이제 **1024px 이상이거나, 마우스로 쓰는 576px 이상**이면 PC 틀이다.
  손가락으로 쓰는 휴대폰·태블릿은 1024px 밑에서 예전처럼 휴대폰 틀이다.
- Tailwind 변형 `desk:` 를 새로 두었다(`app/globals.css` 맨 위 `@custom-variant desk`).
  틀을 보이고 숨기던 `lg:hidden` · `hidden lg:flex` · `lg:block` · `lg:pt-16` · `lg:pb-12` ·
  영상 비교 막대의 `lg:bottom-4` 를 `desk:` 로 바꿨다. **틀에 딸린 것을 새로 만들 때는
  `lg:` 대신 `desk:` 를 쓴다.** 쪽 배치(칸 나란히 놓기 같은 것)는 그대로 `lg:` 다.
- JS 쪽 같은 조건은 `lib/nav.ts` 의 `DESK_MEDIA` — 도크·판 연출을 돌지 정하는 `canChoreo`
  가 이것을 쓴다. CSS 와 글자 하나 다르지 않아야 한다(둘을 늘 같이 고친다).
- 변형은 반드시 블록 꼴로 적어야 한다. 한 줄 꼴 `(@media a, b)` 는 Tailwind 가 쉼표 뒤를
  선택자로 읽어 1024px 쪽만 걸린다.

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

- `components/month-calendar.tsx` — 셋을 더 넣었다. 모두 선택이라 트레이닝 캘린더는 그대로다.
  - `renderDay` · `size="large"` · `emptySpoken` (e2ac363) — 칸 속을 부르는 쪽이 그린다.
    투구 영상 캘린더가 칸마다 썸네일을 채운다.
  - `flags` — 칸 왼쪽 위 작은 반짝이(홈: 분석 리포트가 있는 날).
- `lib/storage.ts` (e2ac363) — 투구 영상 썸네일 자리(`pitchThumbPath`), 덮어쓰는 업로드
  주소, `deleteVideos` 가 투구 영상을 지울 때 그 썸네일도 함께 지운다.

### 알아 두면 좋은 것

- 투구 영상 탭은 [캘린더 | 목록]이 됐다. 썸네일은 DB 없이 저장소 `{사용자}/thumb-{영상}.jpg`
  에 둔다 — 저장소 파일을 셀 일이 있으면 `thumb-`(썸네일)·`avatar-`(사진)로 시작하는 것을
  가려야 한다. 영상을 올리는 순간 `components/video-upload.tsx` 의 `onUploaded` 에서 뜬다.
- 새로 쓸 수 있는 부품: `components/expand.tsx`(제자리에서 펴지고 접히는 칸),
  `components/mini-calendar.tsx`(날짜 하나를 고르는 작은 달력).
