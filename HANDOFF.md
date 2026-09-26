# 받은 뒤 할 일 — 서로에게 남기는 말

두 사람 다 Claude 로 작업한다. 이 파일은 `CLAUDE.md` 가 불러오므로, 이 저장소에서
Claude 로 작업을 시작하면 저절로 읽힌다. 규칙은 `AGENTS.md` 6번.

- **Claude 에게**: `git config user.name` 으로 지금 누가 작업하는지 본다(`Kim Min` =
  김민, `금윤호` = 금윤호). 그 사람 앞으로 온 말이 아래에 있으면, 다른 일을 하기 전에
  사용자에게 먼저 알린다. 명령 실행 같은 할 일은 사용자 허락을 받고 한다.
- 처리한 말은 이 파일에서 지우고 커밋한다. 지난 말은 git 이력에 남는다.
- 공개 저장소다. 비밀번호·키·`.env` 값은 절대 적지 않는다.

---

## 금윤호에게 — 2026-09-26 · 김민(Claude)

남겨 준 말(`npx prisma generate` · `npm install`)은 받아서 처리했다. `usesWeight` 정리는
아직 안 했다 — 따로 할 때 한다.

### 받은 뒤 할 일

1. **`npx prisma generate`** — 새 표 `UserArmcareRoutine`(내 암케어 루틴)을 더했다
   (`prisma/migrations/20260926043412_add_user_armcare_routine`, 추가만). DB 에는 이미
   적용했다. `User` 에 관계 칸 `myArmcareRoutines` 한 줄이 늘었다(DB 칸은 아니다).
   금윤호가 다음에 구조를 바꿀 때(`NutritionProfile.sex` 지우기 등)는 이것을 받은 뒤에
   `migrate diff` 를 만든다 — 안 받은 채로 만들면 diff 가 이 표를 `DROP TABLE` 한다.
2. `npm install` — 3D 근육 지도에 `three` 를 더했다(아래).
3. 개발 서버를 다시 켠다. 운동 목록 캐시 이름을 `library:exercises:v4` 로 바꿨다
   (`lib/library-cache.ts`) — 스크립트로 운동 30개의 근육을 고쳐서, 이름을 바꿔야 보인다.

### 알아 두면 좋은 것

- 암케어 근육을 여섯 더했다(`lib/armcare/anatomy.ts`) — 얕은·깊은 손가락 굴곡근, 광배근,
  대원근, 주근, 상완근. 사용자 요청으로 부상 예방 기준을 다시 검토한 결과다.
- 그 근육을 쓰는 암케어 운동 30개의 '키우는 근육'을 DB 에 저장했다
  (`scripts/retag-armcare-muscles.mts` · `scripts/armcare-retag-2026-09-26.json`). DB 구조는
  그대로다. 저장 전에 백업했다.

### 부위별 보강에 3D 근육 지도 (사용자 요청)

- 새 패키지 `three`(0.186.1)와 개발용 `@types/three` — **`npm install` 을 한 번 한다.**
  three 는 3D 근육 지도(`app/(app)/training/muscle-map-3d.tsx`)가 뜰 때만 불러온다
  (`import()`), 다른 화면에는 실리지 않는다.
- 모델 `public/models/armcare-upper.glb`(약 1.3MB, CC BY-SA 4.0 — 출처와 바꾼 점은 같은
  폴더의 `ATTRIBUTION.txt`). 만드는 스크립트는 `scripts/build-arm-model.mjs`(도구 설치 없이
  glTF 를 직접 다룬다, 원본은 저장소에 없다 — 주소와 SHA-256 이 스크립트에 있다).
- 근육 → 모델 조각 표는 `lib/armcare/muscle-map.ts`. 근육마다 **붙는 곳**(`at`)을
  `lib/armcare/anatomy.ts` 에 더했다. 던지는 손이 좌투면 왼팔을 켠다.

### 암케어 '루틴' 칸 — 맞춤 루틴 + 내 루틴 (사용자 요청)

- '오늘의 암케어'를 **맞춤 루틴**으로 이름을 바꾸고, 그 아래에 **내 루틴**을 더했다 —
  사용자가 암케어 운동을 직접 골라 이름을 붙여 두고 언제든 체크하며 하는 루틴(10개까지,
  한 루틴 15개까지). 만들기·고치기 화면은 `/training/routine/new`, `/training/routine/<id>`.
- 체크는 맞춤 루틴과 같은 `UserExerciseLog`(setExerciseDone)에 남는다. 암케어 카테고리만
  담을 수 있어서 부하·운동한 날 계산에서 빠지는 규칙은 그대로다.
- 부위별 보강·훈련 방식의 운동마다 **담기** 단추(`app/(app)/training/add-to-routine.tsx`).

### 트레이닝 탭을 [트레이닝 | 암케어] 두 칸으로 바꿨다 (사용자 요청)

- [기록] 칸을 없앴다 — 지난 운동은 홈 캘린더가 맡는다(날짜 → 트레이닝 줄 → 그날 화면).
  예전 주소 `/training?view=history` 는 `/today` 로 넘긴다.
- 메뉴(아래 탭 · 사이드바)의 '트레이닝'은 **마지막으로 본 칸**을 연다 —
  `/training?view=last`(쿠키, `lib/training-part.ts`). 암케어는 운동과 상관없이 언제든 따로
  하는 곳이라서다. 그냥 `/training` 은 늘 운동 칸이다 — 트레이닝으로 보내는 링크는 지금처럼
  `/training` 을 쓰면 된다. (처음에는 `/training` 자체가 마지막 칸을 열게 했다가, 운동으로
  보내는 길마다 `?view=today` 를 붙여야 해서 검토 뒤 이렇게 바꿨다. 홈 캘린더의 링크도 원래
  `/training` 으로 되돌렸다.)
- 금윤호 쪽 파일을 고친 것:
  - `lib/nav.ts` — '트레이닝' 두 곳의 href 를 `TRAINING_LAST_HREF`(`/training?view=last`)로.
  - `components/app-shell.tsx` 의 `useIsActive` — 메뉴 주소에 `?` 가 붙어도 경로만 보고
    지금 탭을 켠다(`href.split('?')[0]`).

### 암케어 화면 다듬기 — 글 줄이기 · 따라하기 · 색 (사용자 요청)

받은 뒤 할 일은 없다(DB·패키지 그대로). 같이 쓰는 파일을 고친 것만 적는다.

- `app/globals.css` 맨 끝에 `.finish-pop`(`@keyframes armcare-pop`, 체크가 톡 튀어나오는
  움직임)을 더했다. 움직임 줄이기를 켠 사람에게는 움직이지 않는다.
- `components/muscle-chips.tsx` — 칩마다 그 근육이 속한 부위의 색 점, 그리고 `max`(넘치면
  `+N`) 옵션. 라이브러리 운동 상세의 '키우는 근육'(`MuscleRow`)에도 색 점이 보인다.
- 새 화면 `/armcare/play/today` · `/armcare/play/<내 루틴 id>`(루틴 따라하기)는 운동 판과
  같은 `(session)` 틀을 쓴다 — 메뉴 없는 전체 화면이다.
