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

### 받은 뒤 할 일

1. `npm install` — Next.js 가 16.2.12 → 16.3.6 으로 바뀌었다. 치명 등급 보안 구멍 두 개를
   막는 업그레이드다(d6522ff).
2. `npx prisma generate` — 새 표 `UserExerciseNote`(운동별 내 메모)가 생겼다(baa306c,
   `prisma/migrations/20260925064629_add_user_exercise_note`). DB 에는 이미 적용해 두었으니
   `migrate deploy` 는 할 것 없다. 안 하면 개발 서버에서 운동 화면·라이브러리가
   `prisma.userExerciseNote` 를 몰라 오류가 난다. 표를 더하기만 했고 기존 표는 그대로라
   금윤호 쪽 코드에는 영향이 없다.
3. 개발 서버를 다시 켠다. 안 뜨면 `.next` 폴더를 지우고 다시 켠다.
4. `next.config.ts` 의 `experimental.viewTransition` 을 뺐다. 16.3 부터는 설정 없이 기본으로
   켜지고, 남겨 두면 모르는 설정이라며 빌드(타입 검사)가 멈춘다. 다시 넣지 말 것 — 화면 전환
   애니메이션은 그대로 돈다.

### 금윤호 쪽 파일을 고친 것

무엇을 왜 고쳤는지는 각 커밋 메시지(= 패치노트)에 자세히 있다.

- `app/globals.css` (5701777) — `dialog:not([open]) { display: none; }` 를 더했다. 창에 붙은
  `flex` 클래스가 닫힌 창을 숨기는 브라우저 기본값을 덮어써서, 닫힌 창이 투명한 채 제자리에
  남아 밑의 단추를 가로챘다(트레이닝의 [운동 시작]이 안 눌렸다). 앞으로 `flex` 를 단 창을
  새로 만들어도 이 규칙이 닫힌 창을 숨겨 준다. 여닫는 움직임은 그대로다.
- `app/(app)/profile/account-actions.tsx` (7dd51f7) — '내 정보' 창 계정 칸 맨 위에
  [로그아웃]. 하단 '더보기'가 사이드바를 열게 되면서 로그아웃 단추가 있던 /more 로 가는
  길이 없어져, 앱 안에서 로그아웃할 곳이 없었다.
- `app/(app)/today/pitch-log-panel.tsx` (b9c6c8f) — 서버가 준 `initialLogs` 를 state 로
  복사하지 않는다. 옛 달에서 따로 받은 기록만 state 에 두고 합친다. 홈에서 저장한 투구가
  바로 위 캘린더에 안 뜨던 것(새로고침해야 보였다).
- `components/video-upload.tsx` · `app/(app)/pitch-log/entry-form.tsx` (d81df19) — 영상을
  올리는 중에는 저장을 막는다(`onUploadingChange`). 올리기가 끝나면 끝날 때의 목록에 더한다
  — 시작할 때의 목록에 더했더니 올리는 동안 뺀 영상이 되살아났다.
- `components/use-playback-urls.ts` (d81df19) — 재생 주소를 10개씩 나눠 묻고(API 한도),
  실패하면 다시 묻고, 늦게 온 결과도 합친다. 한 달에 영상이 11개를 넘으면 썸네일이 전부 안
  뜨던 것. 돌려주는 모양(`urls`·`loading`·`ready`)은 그대로다.
- `app/(app)/videos/video-gallery.tsx` (4611991) — 2분할 비교 막대 `sm:bottom-4` →
  `lg:bottom-4`. 폭 640~1023px(아이폰 가로·아이패드 세로)에서 하단 탭바 밑에 깔렸다.
- `app/login/auth-form.tsx` (6ac350a) — 가입 문진 '평소 웨이트는 얼마나 하시나요?' 칸의
  '웨이트 횟수' 아래에 '웨이트 트레이닝 경력'(입문·초급·중급·상급, 필수)을 더했다. 트레이닝
  설정의 경력 칸과 같은 목록(`TRAINING_LEVELS`)·같은 부품(`RadioGroup`)이다. 서버
  (`app/actions/auth.ts`)가 목록 값인지 확인해 `User.trainingLevel` 에 저장한다. DB 변경
  없음. 그 칸 소제목을 '2문항'으로 고치고 `break-keep` 을 붙였다(낱말 중간에서 끊겨서).
- `app/(app)/today/page.tsx` (7767105 · 4abb79b) — 홈의 일정 만들기 폼(`PlanForm`)에
  `preferredWorkout={core.preferredWorkout}` 를 넘긴다. 목표를 처음 고르는 사람이 체크인에서
  '파워'를 골랐으면 폼이 파워 향상을 짚어 두게 하려는 것이다. 나머지는 목표 이름 주석 한 줄.

### 알아 두면 좋은 것 (김민 쪽 변경)

- 종료를 안 누르고 떠난 운동 판은 이제 자동으로 닫힌다 — 상태 `ABANDONED`, 그날 세트는
  운동 기록으로 접힌다(11626bd, `lib/workout/stale.ts` · `lib/workout/close-stale.ts`).
- 운동 화면 틀의 높이를 화면 높이에 고정했다(409b17d, `app/(session)/layout.tsx`).
- 운동 중에 완료한 세트를 고칠 수 있고, 운동마다 '내 메모'를 하나씩 남긴다(baa306c). 메모는
  운동 화면의 운동 이름 아래와 라이브러리 운동 상세에 보인다. 읽기는 `lib/exercise-notes.ts`.
- 훈련 목표가 셋이 됐다 — 근력 향상(기본) · 파워 향상 · 컨디셔닝. '부상 방지'는 '컨디셔닝'으로
  이름을 바꿨고(7767105), '균형 잡힌 관리'는 없앴다(4abb79b). DB 의 `User.trainingGoal` 이
  '균형 잡힌 관리'였던 1명은 '근력 향상'으로 옮겼다(구조 변경 아님). 목표 이름을 코드에 직접
  적어 쓸 일이 있으면 `lib/report/personalize.ts` 의 `TRAINING_GOALS` 를 본다.
- 운동 카테고리 '유산소' 영상은 이제 컨디셔닝 날에도 하나 들어간다(4abb79b).
