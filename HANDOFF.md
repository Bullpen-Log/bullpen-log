# 받은 뒤 할 일 — 서로에게 남기는 말

두 사람 다 Claude 로 작업한다. 이 파일은 `CLAUDE.md` 가 불러오므로, 이 저장소에서
Claude 로 작업을 시작하면 저절로 읽힌다. 규칙은 `AGENTS.md` 6번.

- **Claude 에게**: `git config user.name` 으로 지금 누가 작업하는지 본다(`Kim Min` =
  김민, `금윤호` = 금윤호). 그 사람 앞으로 온 말이 아래에 있으면, 다른 일을 하기 전에
  사용자에게 먼저 알린다. 명령 실행 같은 할 일은 사용자 허락을 받고 한다.
- 처리한 말은 이 파일에서 지우고 커밋한다. 지난 말은 git 이력에 남는다.
- 공개 저장소다. 비밀번호·키·`.env` 값은 절대 적지 않는다.

---

## 김민에게 — 2026-09-28 · 금윤호(Claude) — 구속 측정 관리자 · 자동 측정 · 엔진 정확도

네 메모(운동 라이브러리 · 장비 · 캐시 v7 → 서버 다시 켜기)는 사용자에게 전하고 처리했다.

**받은 뒤 `npx prisma generate` 하고 개발 서버를 다시 켠다.** 표 둘에 칸을 더했다(추가만, 기본값
있음, 백업 뒤 적용 끝 — `20260927230500_velocity_clips_analysis`): `VelocitySession` 에
forCalibration · autoMode · focalPx · lensCal(Json) · releaseDistM · frameW/H, `VelocityPitch` 에
clipPath · clipBytes · clipSec · clipMime · clipEventSec · analysis(Json) · autoDetected · calibExclude.
패키지는 그대로.

- **구속 측정 관리자(웹)** `/admin/velocity`(종합 · 날짜별 · 공마다 스피드건 값 · 영상 클립 · 제외 · 삭제,
  영상 파일로 재기). 관리자 메뉴에 '구속 측정 관리자'가 생겼다(`lib/nav.ts` · `components/nav-icons.tsx`).
  웹 관리자가 투구 기록 탭에서 '구속 측정'을 고르면 여기로 온다(폰 틀 패널은 앱에서만).
- 네 영역 파일을 고친 것: `app/(app)/videos/page.tsx` · `videos-client.tsx`(관리자 웹 → /admin/velocity,
  webTest 경고 제거), `app/(app)/admin/page.tsx`(카드 하나), `lib/nav.ts` · `components/nav-icons.tsx`.
- 저장 액션 `app/actions/velocity.ts`: 입력에 analysis · autoDetected · forCalibration · autoMode · focalPx ·
  lensCal · releaseDistM · frameW/H, 반환에 pitchIds. 클립 업로드 `createClipUpload` · `attachClip`
  (투구 영상과 같은 서명 업로드, 버킷 `pitch-videos`, 경로 `<userId>/<uuid>.<ext>`). 세션 뒷정리는
  `lib/velocity-sync.ts` 로 옮겼다(관리자 액션 `app/actions/velocity-admin.ts` 와 같이 씀).
- 측정 화면은 카메라 앱 모양 + 자동/수동 세션 + 카메라 숨김 정보 판 + 공마다 클립 + 재초점 + 튜토리얼
  (`components/velocity/tutorial.tsx`). 엔진: 원근 타원 보정(`geometry.ts` perspectiveFactor), 분석 배율을
  짧은 변 720 기준으로(`analyzeScale`), 렌즈 보정 저장 형식 v2(`lib/velocity-lens.ts` — 옛 값은 버림).
- 자료를 다시 보는 스크립트 `npm run velocity:review`(`scripts/velocity-review.mts`, 읽기 전용).
- **휴대폰(사파리) 최적화 — 앱 전체에 걸리는 것 둘**(받은 뒤 할 일 없음):
  - `app/globals.css` 끝에 `@media (pointer: coarse)` 규칙 — 손가락 화면의 입력칸 글자를 16px 로 올린다.
    아이폰 사파리는 16px 밑의 입력칸(로그인 15px · 메모 14px)을 누르면 화면을 확대한 채 두어, 그 뒤
    모든 화면이 잘리고 비율이 틀어져 보였다. 새 입력칸은 `text-sm` 으로 만들어도 휴대폰에서는 16px 로 보인다.
  - `app/(app)/layout.tsx` · `app/(legal)/layout.tsx` · `app/page.tsx` 의 `min-h-screen` 을 `min-h-dvh` 로(한 줄씩).
    `app/(app)/videos/video-calendar.tsx` 의 그날 영상은 휴대폰에서 영상 제 비율(세로 영상이 16:9 칸에
    작게 들어가던 것), PC 는 그대로 16:9.

## 김민에게 — 2026-09-28 · 금윤호(Claude) — PC 크기 규격 통일(모든 탭)

받은 뒤 할 일 없음(패키지 · DB 그대로). 사용자 요청: "모든 탭의 상단에 여유가 없다 · 블록 비율을 훨씬 작게 ·
탭마다 중구난방이니 통일 · 규격화". PC(desk)에서만 바뀌고 휴대폰은 그대로다. 자세한 값은 `globals.css` 'PC 화면의 크기 기준'.

- 전역 값: `--spacing` 3.6 → 3.2px(단추 · 칸 · 여백이 모두 작아진다), 16px 넘는 글자 낮춤(text-2xl 20→18 · 3xl 24→22 ·
  4xl 28→24 · 5xl 36→30 · xl 18→17), 본문 14 · 작은 글 12 는 그대로.
- **위 여백은 모든 탭 · 모든 PC 가 100px**(`--page-top`, `app/(app)/layout.tsx` 의 main 이 준다). 노트북만 줄이던 것(desk-low:pt-3)은 뺐다.
- **블록(카드) 안쪽 여백은 모든 탭이 16px**(`--block-pad`, 휴대폰 20px). `Card` 는 이 값으로 그리고, 직접 만든 둥근
  블록은 `p-(--block-pad)` 를 쓴다. **새 블록에 className 으로 p-4 · px-5 py-4 같은 여백을 따로 주지 말아 줘** — 탭마다
  달라진다. 목록 줄 · 칩 · 떠 있는 창은 블록이 아니라 제 여백 그대로.
- 네 영역에서 바꾼 것(여백 클래스만 바꿈, 동작 그대로): `training/page.tsx` · `armcare-today.tsx` · `exercise-list.tsx` ·
  `training-note.tsx` · `day/[date]/page.tsx` · `routine/[id]/routine-builder.tsx`, `library/training/training-client.tsx` ·
  `library/mechanics/mechanics-client.tsx` · `library/warmup/warmup-client.tsx`, `today/page.tsx` · `today/summary-panel.tsx`,
  `coach/*`(overview · parts · report-client · training-review), `components/category-section.tsx` · `meta-filter.tsx`.

## 김민에게 — 2026-09-28 · 금윤호(Claude) — 메뉴에 '구속 측정' · 투구 기록 머리 부품

받은 뒤 할 일 없음. 사용자 요청: 구속 측정 관리자도 투구 기록의 한 기능처럼(돌아갈 고르개가 없었다), 메뉴에
구속 측정으로 곧장 가는 아이콘(웹은 관리자만, 앱은 누구나).

- `lib/nav.ts`: 새 항목 **구속 측정**(`/velocity/measure`, 아이콘 `radar`) — 영양 뒤 따로 한 묶음(도크 첫 줄 =
  막대의 넷을 지키려고). 새 표시 `appOrAdmin`, **`visibleGroups(isAdmin, isNative)` · `moreGroups(isAdmin, isNative)`
  에 둘째 인자가 생겼다**(기본 false). `NAV_ALSO['/videos']` 에 `/admin/velocity` 를 더했다.
- `app/(app)/layout.tsx` · `more/page.tsx`: User-Agent 로 앱 안인지 가려(`isNativeUserAgent`) 메뉴에 넘긴다.
- `components/app-shell.tsx` `useIsActive`: 하위 경로에 더 자세한 메뉴가 있으면 그 메뉴만 켜진다(구속 측정
  관리자에서 '관리자'까지 켜지던 것). `components/nav-icons.tsx` 에 `Radar`. `globals.css` 에 d8 · d9 · g4 · g5 딱지.
- 투구 기록 머리를 부품으로 뗐다: `app/(app)/videos/pitch-log-heading.tsx`(제목 + [캘린더 | 목록 | 구속 측정] 고르개).
  `videos-client.tsx` 와 `admin/velocity/overview-view.tsx` 가 같이 쓴다. `videos/page.tsx` 는 `?view=list` 로 목록을 연다.

## 김민에게 — 2026-09-28 · 금윤호(Claude) — 공 표에 칸 하나(수기) · 흰 그물 감지

**받은 뒤 `npx prisma generate` 하고 개발 서버를 다시 켠다.** `VelocityPitch` 에 칸 하나를 더했다(추가만, 기본값
있음, 백업 뒤 적용 끝 — `20260928123000_velocity_pitch_manual`): `manual Boolean @default(false)` — 카메라가 재지
못한 영상을 스피드건 값만 적어 올린 공(관리자 '영상 파일로 재기' › 수기 값으로 올리기). 패키지는 그대로.
흰 그물 너머 촬영을 위해 엔진의 공 감지에 닫힘(팽창 → 침식)을 넣었다 — 네 영역과는 무관.

## 김민에게 — 2026-09-28 · 금윤호(Claude) — 투구 기록의 '구속 측정' 단추 · 구속 측정 메인 화면

받은 뒤 할 일 없음. 사용자 요청: 투구 기록 ↔ 구속 측정 관리자 전환을 부드럽게(고르개가 사라지지 않게),
목록 옆에 '구속 측정' 단추(웹은 관리자만 · 앱은 누구나) → 구속 측정 메인 화면(/velocity, 지난 세션 구속 변화 ·
설정 · 측정 시작), 설정 단계를 그림 카드로, 주의사항은 팝업으로.

- `app/(app)/videos/videos-client.tsx`: 탭 안의 [구속 측정] 보기(VelocityPanel)를 뺐다 — 대신 고르개 옆 '구속 측정'
  단추가 `/velocity` 로 간다. **`velocity` prop 이 없어졌다**(page.tsx 도 그 자료를 더 읽지 않는다). 관리자 화면 ·
  `/velocity` 를 `router.prefetch` 로 미리 받는다. `components/velocity/velocity-panel.tsx` 는 지웠다.
- `app/(app)/videos/page.tsx`: `?view=velocity` 는 앱이면 `/velocity`, 관리자 웹이면 `/admin/velocity` 로 보낸다.
- `app/(app)/videos/pitch-log-heading.tsx`: 제목 줄 · 고르개 줄에 `ViewTransition name`(pitch-log-heading ·
  pitch-log-controls) — 화면이 바뀌어도 그 자리에 남는다. `app/(app)/admin/velocity/loading.tsx` 가 같은 머리를 단다.
- `lib/nav.ts`: '구속 측정' 메뉴가 `/velocity/measure` → `/velocity`(메인).
- `lib/velocity-setup.ts`: 설정에 `sessionType`(어떤 투구)이 생겼다(localStorage 값, DB 아님).
