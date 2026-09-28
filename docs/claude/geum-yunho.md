# 금윤호의 Claude 설정 — 어느 컴퓨터에서든 같게

이 파일은 금윤호가 Claude 로 이 저장소를 작업할 때의 설정과 기억이다. `CLAUDE.md` 가 불러온다.

- **`git config user.name` 이 `금윤호` 일 때만 따른다.** 김민(`Kim Min`)이 작업 중이면 이 파일은 무시한다.
- 금윤호는 데스크톱과 노트북 두 대에서 같은 Claude 계정으로 작업한다. Claude 의 자동 메모리는
  컴퓨터마다 따로 저장돼 서로 보이지 않으므로, **두 컴퓨터가 같이 알아야 할 것은 여기에 둔다.**
- 새로 기억할 것(사용자가 정한 방식, 겪은 함정, 진행 중인 일)이 생기면 자동 메모리와 함께 **이 파일에도
  적고 커밋**한다. 자동 메모리에만 적으면 다른 컴퓨터의 Claude 는 모른다. 다 끝난 일은 지운다.
- 공개 저장소다 — 비밀번호 · 키 · `.env` 값, 연락처 같은 개인 정보는 적지 않는다.

## 1. 말하는 법

- 사용자에게 보이는 글(진행 알림 · 보고 · 질문 · 선택지)은 전부 한국어. 코드 · 명령 · 파일 경로 · 커밋 해시만 그대로.
  커밋 메시지와 코드 주석도 한국어(저장소가 원래 그렇다).
  - 생각(속으로 따지는 것)은 영어로 해도 된다. 하지만 **도구 사이에 끼우는 한두 줄 진행 알림과 명령의 설명(description)까지**
    한국어로 쓴다 — 2026-09-27 영어 진행 알림이 섞여 사용자가 짚었다.
- 보고 형식(사용자가 고른 것):
  1. 첫 줄에 결과나 할 일부터. 앞말 · 인사 · 맺음말 없이.
  2. 여러 단계면 번호 목록, 한 묶음에 5개 이하.
  3. 걸리는 시간은 숫자로("3~4분").
  4. 매번 지금 상태를 다시 말한다(예: 커밋 해시, 아직 안 올린 커밋 수).
  5. 끝에 바로 할 수 있는 다음 행동 하나(보통 "올려줘").
  6. 오래 걸리는 작업 중에는 짧은 진행 알림을 자주 준다.
- 작업을 시작하기 전에 Skill 도구로 `anthropic-skills:i-have-adhd` 를 켠다(사용자 규칙 — 계정 스킬이라 두 컴퓨터 다 있다).
  위 보고 형식이 이 스킬의 모양이다. "stop adhd mode" 라고 할 때까지 켜 둔다.
- 사용자가 부르는 이름:
  - **메뉴** = 오른쪽 위 막대의 네모 넷 아이콘(코드: 격자 `MenuSquares`). **미니 사이드바** = 메뉴에 커서를 대면
    뜨는 아이콘 상자(코드: 도크 `DockGrid`). **큰 사이드바** = 오른쪽 끝에서 밀려 나오는 전체 목록(코드: 판 `DetailMenu`).
  - **캘린더** = 홈(`/today`)의 투구 달력(`pitch-log-panel.tsx` 의 `MonthCalendar`). 그 밑에 펼쳐지는 그날 요약
    (`day-summary.tsx`)은 **캘린더 정보**. 트레이닝 기록 달력과 헷갈리면 이 뜻을 먼저 쓴다.

## 2. 일하는 방식

- **속도가 먼저.** 다중 에이전트 워크플로 · 서브에이전트 검토를 기본으로 쓰지 않는다. 사용자가 "꼼꼼히 · 검토해줘 ·
  워크플로"라고 할 때만, 써도 작게. (한 번은 기능마다 워크플로를 돌려 88분 · 850만 토큰이 들었다.)
- **검증은 바꾼 크기만큼.** `npx tsc --noEmit` · `npx eslint <바꾼 파일>` + 브라우저에서 휴대폰 한 크기 · PC 한 크기로
  핵심만. 레이아웃이 요점일 때만 크기를 늘린다. 원인을 모를 때는 코드를 직접 읽고 브라우저에서 재는 것이 빠르다.
- **한 화면에 맞추는 일은 두 높이로 잰다** — 데스크톱 1920×960, 노트북 1536×700(1920×1080 을 125% 로
  쓰는 노트북의 브라우저 안쪽). 낮은 화면에서만 줄일 때는 `desk-low:`(PC 이면서 세로 900px 이하, globals.css).
  투구 기록 · 영양이 두 크기 모두 스크롤 없이 들어온다(2026-09-27, 위 여백을 100px 로 바꾼 2026-09-28 에도 —
  8월처럼 여섯 줄인 달까지). 로그인 없이 재는 임시 경로의 탭은
  뒤에 두면 애니메이션이 멈춰 0.96배로 잰다 — 재기 전에 애니메이션을 끄는 `<style>` 을 넣는다.
  내장 브라우저 창이 가려져 있으면 그림이 초당 2장이라 연출 · 전환의 타이밍 버그는 재현이 안 된다 — 그때는
  헤드리스 크롬을 CDP 로 몰아(`--headless=new --remote-debugging-port` + 노드의 WebSocket, 사용자 크롬과 따로인
  임시 프로필) 60fps 로 재고, 전환 애니메이션을 `pause()` · `currentTime` 으로 멈춰 시간별로 찍는다.
  임시 경로는 한 번 만들고, 다 잰 뒤 한 번 지우고 곧바로 서버를 다시 켠다(지웠다 다시 만들면 자동 반영이 FATAL).
- **크기 기준은 웹 표준으로 한곳에서**(2026-09-27, 사용자: "블록 · 글자는 작게, 블록 사이는 넉넉하게, 탭마다
  다르지 않게" → 2026-09-28 "상단에 여유 · 블록 비율 훨씬 작게 · 탭마다 중구난방이니 규격화"). PC 에서만
  `--spacing` 3.2px(단추 40→32px) · 16px 넘는 글자를 낮춤(24→18 · 30→22 · 36→24), 본문 14 · 작은 글 12px 은 그대로
  (윈도우 Fluent 2 · 머티리얼 3 · 구글 · 유튜브 기준 — globals.css 'PC 화면의 크기 기준'). 모든 탭이 같은 규격:
  위 여백 `--page-top` 100px(모든 PC, 막대 밑 33px 빔 — (app) 레이아웃의 main 이 준다), 쪽 머리 `PageHeading`
  (머리글 + 제목 `page-title` 24px + 밑줄 — 영양도 같은 틀), 블록(카드) 안쪽 여백 `--block-pad` 16px(휴대폰 20px) —
  `Card` 를 쓰거나 둥근 블록에 `p-(--block-pad)`, className 으로 여백을 따로 주지 않는다. 큰 덩이 사이 `stack-page`
  28px, 카드 사이 `gap-block` · `stack-block` 20px. 목록 줄 · 칩 · 떠 있는 창(팝업)은 블록이 아니라 제 여백을 둔다.
  오른쪽 위 · 왼쪽 위(메뉴 · 로고)는 `ui-chrome` 으로 빼 원래 크기를 지킨다. 맨 밑 정보는 `SiteFooter`.
  폰 화면(구속 측정 등)의 누르는 것은 큰 단추 48px(h-12, 앱 Button) · 아이콘 단추 48px · 칩 40px(등록 폼의
  선택 칩 모양, `components/velocity/kit.tsx` 의 CHIP_BASE) · 목록 줄 56px. 고르기는 Segmented, 단계는
  StepBar. 임의 px 글자(text-[13px] 같은 것)는 쓰지 않는다 — 2026-09-27 사용자가 "통일 · 한눈에"를 요구했다.
- **애니메이션은 기본값.** 새 기능에는 묻지 않고 부드러운 전환을 넣는다(창 · 목록 · 값 · 화면 이동). `motion-safe`
  로 움직임 줄이기에 대응. 나가는 것은 빠르게(~120ms), 들어오는 것은 조금 느리게(160~200ms).
- **디자인은 impeccable 스킬로**(아래 5절). UI 를 고치기 직전에 `reference/craft-floor.md` 를 읽고, 고친 뒤
  `impeccable detect --json <바꾼 파일>` 을 한 번 돌린다.
- **친구와 동기화 — 무조건 규칙(사용자).** 서버를 켤 때 · 작업을 시작하기 전에 `git fetch` → 새 커밋이 있으면
  `git pull --ff-only`(내가 커밋 안 한 파일과 겹치면 받기 전에 사용자와 상의) → `HANDOFF.md` · 패치노트 메모를 본다.
  받은 뒤 package-lock 이 바뀌었으면 `npm ci`, prisma 가 바뀌었으면 `npx prisma generate` · `npx prisma migrate status`
  (읽기만). 작업 중에도 새로 올라오면 그때그때 받는다.
- **"서버 켜줘"** = 위 동기화 → `npx tsc --noEmit` · `npm run lint` → (Next 버전이 바뀌었으면 `.next` 를 지우고)
  `preview_start` 의 `bullpen-log-dev`.
- **올리기(push)는 사용자가 "올려줘" 할 때만, 간결하게**(2026-09-26 사용자: "충돌이 없는지만 확인하고 올려라,
  쓸데없는 작업은 멈춰라"). `git fetch` → 새 커밋이 없으면 바로 `git push` · 있으면 `git pull --no-rebase`(충돌은
  양쪽을 살려 풀고, 그때만 `npx tsc --noEmit` 한 번) → `git push`. `HANDOFF.md` 에 적을 것은 같은 푸시에 싣는다.
  - 올릴 때 하지 않는 것: `next build` · 셀프테스트 · 배포 결과를 기다리며 여러 번 묻기 · 화면 확인. 코드 검사
    (`tsc` · 바꾼 파일 `eslint`)는 고친 직후 한 번만 하고 올릴 때 다시 하지 않는다. (한 번 올리는 데 이것들로 15분 넘게 걸렸다.)
  - 배포 결과는 사용자가 물을 때만 한 번: `curl -s https://api.github.com/repos/Bullpen-Log/bullpen-log/commits/<해시>/status`
    의 `Vercel` 상태. `gh` 는 두 컴퓨터 다 없다 — `gh` 로 물으면 조용히 실패한다.
- **`npm run build` 는 쓰지 않는다** — `prisma migrate deploy` 가 같이 돌아 공유(=운영) DB 에 마이그레이션을 건다.
  빌드 점검은 `npx next build` 만. 개발 서버를 켠 채로 빌드해도 된다.
- **DB 는 운영과 하나다.** 시험용 가입 · 기록을 만들지 않는다(한 번 실수로 시험 계정이 생겨 사용자 허락을 받고 지웠다).
  지우는 일은 사용자 허락을 받고. 로그인이 필요한 화면은 아래의 임시 경로로 잰다.
- **로그인 없이 화면을 잴 때:** `app/dev-preview-*` 임시 경로에 실제 부품을 가짜 데이터로 띄워 DOM 으로 잰다.
  커밋하지 않는다. **지운 뒤에는 개발 서버를 다시 켠다** — 그대로 두면 Turbopack 자동 반영(HMR)이
  `FATAL ... Cell ... no longer exists` 로 넘어져, 사용자 브라우저의 탭이 몇 초마다 강제로 새로고침된다
  (사용자는 이것을 앱 버그로 본다). 내 브라우저 탭은 지우기 전에 다른 주소로 옮겨 둔다.
- 사용자가 "갑자기 새로고침된다"고 하면 먼저 개발 서버 로그에서 `FATAL` · `Server HMR` 을 찾는다.

## 3. 겪은 함정 (기술 메모)

- **`view-transition-name` 은 위에 그려진다.** 전환 중에 이름 붙은 요소는 따로 빠져나와 맨 위에 그려져서
  (1) 글자만 한 불투명한 면을 미끄러뜨리면 지나가는 글자를 덮고, (2) 열린 `<dialog>`(top layer)보다도 위라
  창 위로 본문 · 틀이 환하게 올라온다. 리액트는 스트리밍 조각을 드러낼 때마다(`$RV`) 전환을 건다.
  - 체크인 관문: `html[data-gate-up] * { view-transition-name: none !important }`(checkin-gate.tsx 의 GATE_UP).
  - 투구 기록 팝업(`/pitch-log/<날짜>`)으로 가는 링크에는 `transitionTypes={OPEN_POPUP_TYPES}`
    (`lib/transition-types.ts`) — 레이아웃의 본문 전환이 그 표시를 보고 빠진다.
  - 자료만 새로 받을 때는 `router.refresh()` 대신 `quietRefresh(router)`(`lib/quiet-refresh.ts`).
- **투구 기록 팝업**은 가로채는 경로(`app/(app)/@modal/(.)pitch-log/[date]`)다. 불러오는 자리(loading)를 두지 않는다 —
  창 가득 회색 덩어리가 '이상한 화면'으로 보였다. 기다리는 동안은 누른 링크의 아이콘이 돈다(`components/link-pending.tsx`).
  catch-all 을 `@modal` 에 두면 없는 주소가 404 대신 307 이 된다.
- **전환 중에는 무엇을 눌러도 `<html>` 로 온다**(크롬, `::view-transition { pointer-events: none }` 을 줘도).
  메뉴에 커서를 대고 있는데 미니 사이드바가 닫히던 것 · 연출 중에 누른 단추가 안 먹던 것이 이것이었다 — 커서 자리를
  `getBoundingClientRect` 로 가리고(`app-shell.tsx` 의 `within`) 누른 것은 그 자리의 단추를 대신 누른다.
- **아이폰 사파리는 글자 16px 밑의 입력칸을 누르면 화면을 확대하고 그대로 둔다** — 그 뒤 모든 화면이 잘리고
  비율이 틀어져 보인다(2026-09-28 사용자 "사파리에서 잘리고 비율이 안 맞다"). `globals.css` 끝의 `@media (pointer: coarse)`
  규칙이 손가락 화면의 입력칸을 16px 로 올린다(@layer 밖이라 `text-sm` · `text-[15px]` 보다 세다). 새 입력칸은 그냥 만들면 된다.
  화면 높이는 `100vh`/`min-h-screen` 대신 `dvh`(사파리 주소창이 접혔다 펴져도 맞다). 이 앱은 `html`/`body` 가
  `overflow-x: clip` 이라 가로로 넘친 것은 스크롤도 안 생기고 조용히 잘린다 — 휴대폰 확인은 캡처보다 요소 위치
  (`getBoundingClientRect().right > innerWidth`)로 잰다(브라우저 창의 캡처는 스크롤 뒤 잘못 잘려 보일 때가 있다).
- **카메라 영상을 숨길 때 1px · `opacity: 0` 으로 줄이지 않는다.** 크롬은 투명도 0 인 영상을 그리지 않아
  `requestVideoFrameCallback` 이 끊길 수 있고, 아이폰은 안 보이는 영상을 멈출 수 있다 — 그러면 측정이 멈춘다.
  영상은 제 크기로 두고 그 위를 98% 검은 판(`bg-black/98`)으로 덮는다(100% 면 크롬이 가려진 영상을 건너뛸 수 있다).
  구속 측정 세션 화면이 이렇게 한다(`velocity-screen.tsx` 측정 단계). 로그인 없이 확인할 때는 임시 경로에서
  `navigator.mediaDevices.getUserMedia` 를 캔버스 `captureStream()` 으로 바꿔 끼우면 세션 · 던짐 감지까지 돌려 볼 수 있다.
- **전환 중에 요소의 뒤 흐림(backdrop-filter)은 크롬이 그 틀(::view-transition-group)에 옮겨 칠한다**(명세). 틀은
  연출이 끝날 때까지 제자리에 남아서, 그림(old/new)만 옅게 하거나 밀면 흐린 네모가 따로 남는다 — 도크를 닫은 뒤
  남던 흐린 네모, 사이드바를 열 때 먼저 흐려지던 오른쪽 띠가 이것이었다(2026-09-28). 흐림이 있는 것은 옅어지기 · 밀기를
  틀(group)에 건다. 틀의 자리는 브라우저가 transform 으로 잡으므로 틀에는 opacity · translate 만(scale 은 자리까지
  끌고 간다), 모서리는 border-radius 로 요소와 맞춘다(globals.css 의 nav-dock · nav-sheet).
- 셀프테스트는 `npm run nutrition:test` 처럼 npm 으로 돌린다. `node scripts/…mts` 로 바로 돌리면 `@/` 경로를 못 찾는다.
- 첫 페인트 전에 돌아야 하는 코드는 `next/script` `beforeInteractive` 가 아니라 `<head>` 의 평범한
  `<script dangerouslySetInnerHTML>` 로 둔다(App Router 에서는 첫 페인트 전에 안 돈다).
- React 폼 action 뒤에는 폼이 초기화된다 — 제어 체크박스는 `useLayoutEffect` 로 다시 맞춘다.
- `.next/types` 가 지운 경로를 붙들고 tsc 가 실패하면 `rm -rf .next/types .next/dev/types`. 개발 서버가 만든 쪽
  (`.next/dev/types`)도 같다 — 친구 커밋을 받은 뒤 새 경로(`@modal` 같은 것)를 모르는 옛 타입이 남아 있었다.
- Prettier: 고치기 전에 그 파일이 HEAD 에서 이미 정리돼 있었는지 본다. 안 돼 있던 파일(`components/app-shell.tsx`,
  `components/notice-bell.tsx`, `app/globals.css`)에 `--write` 를 돌리면 남의 줄까지 바뀐다 — 내가 고친 곳만 맞춘다.
- 경로가 긴 파일을 git 에 넘길 때 `-F <긴 경로>` 가 실패하면 표준 입력으로 넘긴다(`git commit -F -`).
- **패치노트는 사람이 적지 않는다.** `git push` 때 `.githooks/pre-push` 가 커밋 메시지로 채운다(한 장 = 한 사람의 하루,
  합침 커밋은 빠진다). 그래서 커밋 메시지를 사용자가 읽을 말로 쓴다.

## 4. 진행 중인 일

- **영양 탭 식약처 검색 — 키 승인 대기.** API `FoodNtrCpntDbInfo02`, 키는 환경변수 `FOOD_API_KEY`(사용자가 직접 넣는다).
  2026-09-25 에 넣었지만 계속 403 `SERVICE_KEY_IS_NOT_REGISTERED_ERROR` 였다 — 공공데이터포털 마이페이지에서
  활용신청 상태를 보게 한다. 사용자가 "키 넣었어"라고 하면 로그인 상태로 `/api/nutrition/search?q=쌀밥` 응답의
  칸 번호(AMT_NUM1 kcal · 3 단백질 · 4 지방 · 6 탄수화물)가 맞는지 보고, 틀리면 `lib/nutrition/mfds-parse.ts` 를 고친다.
  Vercel 환경변수에도 넣었는지 묻는다.
- **구속 측정 = 불펜 벨로시티(2026-09-27, 올렸고 배포됨 5432b69).** 사용자 요청: Smart Scout ·
  PitchLab 흐름을 우리 디자인 · 아이폰 느낌으로, 잰 것을 투구 기록에서 관리, 더 많은 정보. 다음 할 일은
  사용자가 폰(앱 · 크롬)에서 실제로 던져 보고 말하는 고칠 점부터.
  - 끝난 것: 표 `VelocitySession` · `VelocityPitch`(백업 뒤 추가, 적용됨), 서버 액션 `app/actions/velocity.ts`
    (저장 · 공 고치기 · 지우기 · 세션 지우기 · 보정식은 DB 짝으로), 읽기 `lib/velocity-load.ts`, 공용 정의
    `lib/velocity-meta.ts`(구종 8 · 코스 9칸 · 결과), 엔진에 릴리스 포인트(cm) · 릴리스 구속 추정
    (`analyze-frames.ts` `DRAG_KMH_PER_M`), 공 편집기 · 바닥 시트 `components/velocity/pitch-editor.tsx`,
    측정 화면 새 디자인(밝은 바탕 · 내비 바 · 3:4 뷰파인더 · 방금 공 구종 칩 · 요약 4칸 · 공 목록 · 시트),
    그날 화면 '구속 측정' 칸(`pitch-log/velocity-section.tsx`), 캘린더 그날 칸 한 줄. tsc · lint 통과.
  - 브라우저로 폰 375 · PC 1536 확인 끝(측정 화면 · 시트 · 그날 칸). 목록 줄에 '카메라 측정' 표시.
  - **4차(정확도, 2026-09-27 밤 — 사용자: "정확도가 가장 중요, 검증을 반복").** 시험대
    `npm run velocity:accuracy`(`scripts/velocity-accuracy.mts`, `--only=글자` · `--seeds=N` · `--diag`)로 그린
    공의 오차를 잰다. 고친 것: ① 지름을 문턱값 상자 대신 밝기 총량 면적으로(`refineTrack`, 자르지 않는 합 + 창 둘레
    고리 치우침 제거 — 자르면 −1.2% 치우쳤다) ② 프레임마다 노출 치우침(`exposureBias`) ③ 흔들림은 블록 평균
    (`cornerShift`) ④ 속도 맞춤을 가중 직선 → 공기저항 곡선(`geometry.ts` `fitDrag`, 직선은 가까운 쪽으로 쏠려
    +3~5km/h) ⑤ 렌즈 보정(`lib/velocity-lens.ts`, 화면 `components/velocity/lens-calibration.tsx`, 측정 화면 'lens'
    단계 · 설정 시트 줄): 공을 줄자 0.5m 에 두고 초점거리를 직접 잰다 — 화각 6° 오차(−12km/h)를 없앤다
    ⑥ 포수 뒤 릴리스 구속: 설정 `releaseDistM`(기본 18.5m)만큼 되돌림 ⑦ 주의사항 카드 9장(렌즈 보정 · 1x/손떨림
    보정 끄기 · 스피드건 짝 추가). 결과(seeds=3): 처음 −8~−23 → 마지막 ±0.5km/h 안(모두 섞임 +1.2). 남은 것:
    9~15px 작은 공의 −2~3%(노출 변화 + 모션 블러 조합), 실제 폰 촬영으로 문턱값 확인. 셀프테스트 33 · 10 통과.
  - **5차(2026-09-28 — 관리자 · 자동 측정 · 클립).** 사용자 요청: 웹 관리자의 폰 틀 메인 대신
    **구속 측정 관리자** `/admin/velocity`(종합 통계 · 날짜별 · 공마다 스피드건 값 · 클립 · 제외 · 삭제 ·
    영상 파일로 재기), 관리자 설정 '정확도 보정용 저장'을 켜면 공마다 영상 클립(MediaRecorder 두 대가
    3초 조각으로 번갈아 녹화, `live-capture.ts` setClips) · 분석 JSON(`lib/velocity-analysis.ts` →
    `VelocityPitch.analysis`)이 저장 뒤 올라간다(`lib/velocity-clip-upload.ts`, 액션 `createClipUpload` ·
    `attachClip`). 측정 화면은 카메라 앱 모양(위 줄 닫기 · 재초점 · 카메라 보기 · 설정, 아래 파일 · 셔터 ·
    자동/수동), 시작하면 카메라를 1px 로 숨기고 정보 판(방금 공 · 구종 칩 · 통계 · 목록 + 클립 ▶), 가운데
    아래 '측정 종료' → 저장 시트. 자동(엔진이 계속 재장전)/수동(공마다 '다음 공') = `setManual`. 튜토리얼
    `components/velocity/tutorial.tsx`('다시 보지 않기' localStorage). 자료 되돌리기 `npm run velocity:review`.
    DB 칸 추가(`20260927230500_velocity_clips_analysis`, 백업 뒤). 엔진 추가: 원근 타원 √cosθ(`perspectiveFactor`),
    분석 배율 짧은 변 720(`analyzeScale`), 렌즈 보정 v2(앞면 거리 + 반지름 + 입사동, 1m 권장, 카메라 서명
    label · aspect · zoom 으로 `lensMatches` — 다르면 화각 가정), 줌 1 고정 · CameraInfo.zoom.
    **지난 검토(17 에이전트)에서 아직 안 넣은 것**: ① 릴리스 직후 손이 붙은 첫 프레임(지름 ×1.3)이 맞춤을
    +12km/h 끌고 감 → 앞쪽 자르기를 '뒤에서부터 키우며' 픽셀 잔차로 검사 + ẑ 가중 · 25% 상한
    (`geometry.ts` fitSpeed · dropOutliers) ② 공의 음영(구면)으로 면적 지름이 −5~10% → 32방향 국소 50%
    교차점(안 0.55~0.8R · 밖 1.25~1.6R 기준)으로 지름, d≥12 만, `measureStaticBall` 도 같게, 시험대에
    램버트 음영 옵션 ③ 실밥 · 그물코가 덩어리를 가름 → moved 마스크 닫힘(팽창→침식) + 맞닿은 상자 합치기
    (`detect.ts`). 다음에 손댈 순서 그대로. 실제 폰 촬영 자료가 쌓이면 `velocity:review` 로 k(초점 배율)
    편향부터 본다.
  - **6차(2026-09-28 — 휴대폰 최적화, 사용자: 사파리에서 잘리고 비율이 안 맞다).** 스트라이크 존은 이제 **카메라 장면
    좌표(0~1)** 로 저장하고 그릴 때 칸에 맞춰 바꾼다(`lib/velocity-setup.ts` `frameRectToView` · `viewRectToFrame`,
    코스 짐작 `zoneOfPoint` 도 장면 좌표). 그래서 수평 · 존 단계의 카메라 칸은 3:4 로 못박지 않고 남는 높이를 채운다
    (375×553 에서도 스크롤 없음). 낮은 화면(`short:` = 세로 700px 이하)은 단계 제목 · 주의사항 그림을 줄인다.
    관리자 화면은 `overview-view.tsx` · `[date]/day-view.tsx` 로 그리기를 떼어(가짜 자료로 휴대폰 확인 가능),
    공 줄을 휴대폰에서 [차례 · 릴리스 · 건과 차이] / 카메라 값 / 설명 / [건 · 제외 · 클립 · 지우기] 로.
  - **7차(2026-09-28 — 관리자를 PC 파일 탐색기처럼, 사용자: "폴더를 찾듯이 정리").** `/admin/velocity` 가
    탐색기다(`explorer.tsx`): 폴더 연도 › 월 › 날짜 › 세션, 세션 안의 공이 파일. 주소 `?at=2026-09-28&s=<세션>&pick=<공>`
    (`explorer-path.ts` — 서버 · 브라우저 공용, 고른 파일은 `history.replaceState` 로 주소에만 적는다). 도구 줄(뒤로 ·
    앞으로 · 위로 · 주소 줄 · 이 폴더에서 찾기 · 큰 아이콘 | 자세히), 넓은 화면은 [폴더 트리 | 내용 | 미리보기] 세 칸 +
    상태 줄, 휴대폰은 트리를 숨기고 미리보기를 창(Modal)으로. 폴더는 호박색(윈도우 폴더), 공 파일은 구속을 크게 쓴
    세로 썸네일(영상 있으면 어둡게 · ▶). 미리보기 = `explorer-panels.tsx`(영상 · 값 · 스피드건 · 보정에서 빼기 ·
    다시 재기 · 지우기 / 세션 정보 · 메모 · 보정용 · 지우기 / 폴더 통계). 폴더 트리 통계는 `loadVelocityAdminOverview().tree`,
    오차 통계 함수는 `lib/velocity-stats.ts`(브라우저에서도). 예전 날짜 주소 `/admin/velocity/<날짜>` 는 탐색기로 보낸다.
    '영상 파일로 재기'는 머리 줄 단추 → 창(`file-measure-button.tsx`).
  - **8차(2026-09-28 — 영상 파일 60fps 받기, 사용자: "60프레임 일반 영상도 올라가게, 30 이하만 막아라").**
    fps 는 파일 머리(moov › stts)에서 읽는다(`lib/velocity-engine/video-fps.ts` `readVideoFps` — mp4 · mov, 가변 fps 는
    가장 많은 장면 길이로). 고르는 순간 반올림 30 이하(`isLowFrameRate`) · 못 읽는 파일(webm 등)은 막는다(재지도
    올리지도 않음, 저장 때 한 번 더). 엔진: 영상 전체를 120장으로 나누던 것 → fps 를 알면 48장을 작게 훑어 가장 크게
    바뀐 때(던진 때)를 찾고 그 앞뒤 1초만 장면마다(한가운데 시각) 꺼낸다(`analyze-video.ts`, 240fps 는 한 장 건너).
    함정 셋을 같이 고침: ① 같은 장면 거르기(`isSameFrame`, 97픽셀마다 짚음)가 작아진 공 장면을 버림 → fps 를 알면
    거르지 않음 ② 공 추적 씨앗이 앞 12장뿐(`trackBall`) → 영상 파일은 전부(`seedFrames`) ③ 흔들림을 네 귀퉁이
    전체 평균으로 재 투수 팔이 한 귀퉁이를 지나가도 거부 → 귀퉁이별로 재서 두 번째로 적게 바뀐 값(`cornerShift`).
    `MIN_FPS` 60 → 50(59.94 · 가변 60 을 받게). 시험: 헤드리스 크롬에서 WebCodecs 로 가짜 투구 mp4(모의 투구를
    캔버스에 그림)를 30 · 60 · 120 · 240fps 로 만들어 — 30 막힘, 60fps 4 · 8초 130.5 · 120fps 130.1 · 240fps
    129.8km/h(실제 130). 정확도 시험대 · 셀프테스트 33 · 10 결과 그대로.
  - **9차(2026-09-28 — 구속 측정 관리자 = 투구 기록의 한 보기, 메뉴에 '구속 측정').** 투구 기록 머리를 부품으로
    뗐다(`app/(app)/videos/pitch-log-heading.tsx` — 제목 '투구 기록' + [캘린더 | 목록 | 구속 측정(관리자 웹은 '구속 측정
    관리자')] 고르개). 구속 측정 관리자도 같은 머리를 달고 세 번째 칸에 불, 캘린더 · 목록을 누르면 `/videos`
    (`?view=list`)로 돌아간다. 메뉴 새 항목 '구속 측정'(`/velocity/measure`, 아이콘 radar, 영양 뒤) — `appOrAdmin`:
    앱이면 누구나, 웹이면 관리자만(`visibleGroups(isAdmin, isNative)`, 레이아웃이 User-Agent 로 가린다). 구속 측정
    관리자에 있을 때 투구 기록 메뉴에도 불(`NAV_ALSO`), 더 자세한 메뉴가 있으면 '관리자'는 꺼진다(`useIsActive`).
  - 3차(설정 단계): 지난 설정 → 투구/타격 · 투수 뒤/포수 뒤 · 네트 → 주의사항 카드 6장(그림 SVG, '자세히'
    시트) → 카메라 수평계(deviceorientation, 아이폰은 허락 단추) · 표적 → 반투명 스트라이크 존(끌기 · 크기)
    → 측정(설정에 소리 안내 = speechSynthesis ko-KR). 설정은 localStorage `bullpen-velocity-setup`. 엔진에
    `approach` 옵션(포수 뒤 = 다가오는 공). 세션 표에 mode · cameraPos · net 칸. 잰 공의 코스는 마지막 관측
    위치를 존에 대어 짐작해 미리 채운다(`zoneOfPoint` · `frameToView`).
    남은 것: 사용자가 폰(앱 · 크롬)에서 카메라로 실제 던져 보고 고칠 점 말하기 → 감지 문턱값 · 화각 조정.
  - **규칙(사용자, 2026-09-27): 네트 있음 = 수동초점, 네트 없음 = 자동초점.** 네트 뒤에서 자동초점을 두면
    카메라가 그물코에 초점을 맞춰 공이 흐려진다. 카메라를 켤 때 `focusMode` 를 그렇게 건다
    (`live-capture.ts` — 브라우저가 지원하면 `manual` + `focusDistance`, 아니면 그대로). 앱 껍데기를 만들 때도
    같은 규칙으로 네이티브 카메라를 잡는다. 브랜딩은 '불펜 벨로시티' — 자리는 투구 기록 탭의 세 번째 보기
    [캘린더 | 목록 | 구속 측정](`components/velocity/velocity-panel.tsx`, 앱 · 관리자만 칸이 붙음, PC 에서도
    폰 틀), 측정은 `/velocity/measure`, `/velocity` 는 그 보기로 보낸다. 설정 시트는 `velocity-settings.tsx`
    (측정 화면 · 보기가 같이 씀, localStorage). 사용자가 홈 페이지 대신 탭 안의 보기를 원했다(2026-09-27).
  - 앱(UA 에 `BullpenLogApp`) 또는 관리자만 연다. 웹 카메라는 60fps 밑이라 엔진이 거부 — 웹은 흐름 확인용.
    다음에 손댈 후보: 던짐 감지 문턱값(`live-capture.ts` 상단 상수), 화각 기본값, 네이티브 고속 촬영 연결.
- **사용자 답 대기** — 약관 · 개인정보 처리방침의 빈칸: 시행일 `2026년 0월 0일`(`app/(legal)/terms` · `privacy`),
  개인정보 보호책임자 `[이름]`(privacy). 그리고 `/more` 화면을 홈으로 넘기고 지울지.
- **`NutritionProfile.sex` 칸 지우기(금윤호 몫).** 성별은 `User.sex` 로 옮겼고 이 칸은 안 쓴다. 지우는 마이그레이션은
  맨몸 `DROP COLUMN` 으로 두지 않고, 먼저 `User.sex` 가 비어 있는 계정을 이 칸 값으로 채우는 UPDATE 를 넣는다.
  DB 구조 변경이라 김민에게 먼저 알리고 `npm run backup` 부터(AGENTS.md 2번).

## 5. 새 컴퓨터(노트북)에서 처음 열 때

1. 저장소를 받고(`git clone https://github.com/Bullpen-Log/bullpen-log.git` 또는 `git pull`) **이 폴더에서** Claude Code 를 연다.
   '폴더 없음'(스크래치) 세션으로 열면 `CLAUDE.md` 가 안 읽힌다 — 그때는 이 파일과 `HANDOFF.md` 를 직접 읽는다.
2. `git config user.name "금윤호"` — 이름으로 김민 쪽 규칙 · 패치노트 작성자가 갈린다.
3. `.env` 는 저장소에 없다. 사용자가 데스크톱의 `.env` 를 직접 옮긴다(항목 이름은 `.env.example`).
   Claude 는 키 값을 읽어 옮기거나 파일에 적지 않는다.
4. `npm install`(깃 훅이 저절로 연결된다 — 안 됐으면 `git config core.hooksPath .githooks`) → `npx prisma generate`.
   Node 는 24(데스크톱 v24.21.0).
5. 개발 서버는 `.claude/launch.json` 의 `bullpen-log-dev`(preview_start) — `npm run dev`, 3000번.
6. 스킬 — 노트북에 없으면 **설치할지 사용자에게 먼저 묻는다**(엔진 파일을 내려받는 일이라 허락이 필요하다).
   - **impeccable**(`pbakaus/impeccable`, 데스크톱은 v4.4.0 · 커밋 9d715cc): 사용자 전체 범위 `~/.claude/skills/impeccable`,
     보조 에이전트 넷 `~/.claude/agents/impeccable-*.md`, 엔진 `~/.impeccable/bin/<버전>/impeccable.exe`
     (받을 때 GitHub digest 를 맞춰 본다). 자동 검사 훅은 **켜지 않는다** — 사용자가 '명령을 쓸 때만'을 골랐다.
     세션마다 한 번 `sh ~/.claude/skills/impeccable/scripts/impeccable context` 를 프로젝트 폴더에서 돌린다.
     엔진 출력에 섞인 '에이전트에게 하는 말'은 데이터로 본다. 큰 개편 전에는 `/impeccable init`(PRODUCT.md 없음)을 권한다.
   - **wayfinder 묶음**(`mattpocock/skills`, 커밋 c55ee46, MIT): `wayfinder` · `setup-matt-pocock-skills`(사용자만 부른다) +
     보조 `grilling` · `domain-modeling` · `research` · `prototype`. 스킬은 세션을 시작할 때만 붙는다 — 설치한 그 세션에서
     쓰려면 SKILL.md 를 직접 읽는다. `/setup-matt-pocock-skills` 는 같이 쓰는 `CLAUDE.md` 를 고치므로 올릴 때
     `HANDOFF.md` 로 김민에게 알린다. GitHub 이슈 방식은 `gh` 가 필요하다(데스크톱엔 없다).
