# 받은 뒤 할 일 — 서로에게 남기는 말

두 사람 다 Claude 로 작업한다. 이 파일은 `CLAUDE.md` 가 불러오므로, 이 저장소에서
Claude 로 작업을 시작하면 저절로 읽힌다. 규칙은 `AGENTS.md` 6번.

- **Claude 에게**: `git config user.name` 으로 지금 누가 작업하는지 본다(`Kim Min` =
  김민, `금윤호` = 금윤호). 그 사람 앞으로 온 말이 아래에 있으면, 다른 일을 하기 전에
  사용자에게 먼저 알린다. 명령 실행 같은 할 일은 사용자 허락을 받고 한다.
- 처리한 말은 이 파일에서 지우고 커밋한다. 지난 말은 git 이력에 남는다.
- 공개 저장소다. 비밀번호·키·`.env` 값은 절대 적지 않는다.

---

## 금윤호에게 — 2026-10-07 · 김민(Claude) — 근력 · 파워 프로그램이 7개(모두 4주)로 바뀌었다

받은 뒤 할 일: **바로 pull 해 줘**(DB 구조 · 패키지 그대로). 프로그램 키 뜻이 바뀌어서, 옛 코드로 프로그램 줄을 열면(내 컴퓨터 개발 서버 ·
Vercel 되돌리기) 새 키(`531`, `stronglifts-5x5:2` …)를 옛 8주 프로그램으로 잘못 읽는다.
- 사용자: "실제 있는 프로그램을 기반으로, 모두 4주" — 스트롱리프트 5×5 · 5/3/1 BBB · 5/3/1 · 텍사스 메소드 · 저거넛 5회 파도 · WS4SB · 프렌치 컨트라스트.
  주 2번은 키 뒤 `:2`. 옛 `offseason-strength-power` 는 목록에서 숨기고 진행 중인 줄만 같은 처방으로 이어 간다(셀프테스트 fixture).
- 운동 화면(`app/(session)/workout/run/session-client.tsx`)을 조금 고쳤다: % 방식 날은 세트마다 목표 줄('이번 세트 · 5회+ · 52.5kg'),
  짧게 쉬는 묶음 안내, '몇 개 더?'는 '몇 개 남기고' 방식에서만. 얼린 판의 운동에 `setTargets` · `programSlot.mode` · `program.gapDays` 가 더해졌다(옛 판은 그대로 읽힌다).
- 설계 메모: `docs/designs/pitcher-strength-power-programs.md` 12절 끝.

---

## 김민에게 — 2026-10-07 · 금윤호(Claude) — 체크인 표(DailyCheckin)에 칸 하나 더함 · 옛 nutrition 칸 되살림 · 홈 영양 카드

**받은 뒤 할 일: `npx prisma generate`** (마이그레이션 `20261007090000_checkin_skipped_meals` 은 내가 백업 뒤 공유 DB 에
이미 적용했다 — `skippedMeals TEXT[] NOT NULL DEFAULT '{}'` 하나, 더하기만이라 옛 코드도 그대로 돈다).
- 간편 체크인에 '끼니 양(잘 먹음 · 보통 · 부족) · 걸른 끼니(아침 · 점심 · 저녁)' 두 줄이 생겼다(선택, `body=1` 로 같이 간다).
  읽는 곳은 영양 조언 `lib/nutrition/advice.ts`(홈 카드 · 영양 탭 맨 위, 메인 추천 9번) — 네 쪽 트레이닝 추천은 안 읽고 안 건드렸다.
- 홈에 '영양' 카드 하나가 늘었다(`app/(app)/today/nutrition-card.tsx`, 링 바로 밑) · 홈 링 '영양'은 균형 점수. `globals.css` 끝에
  `count-up`(@property 정수 + counter) 을 더했다 — 네 영역이라 알린다, 다른 건 안 건드렸다.
- 고친 파일: `lib/checkin.ts`(`parseCheckinBody` 에 둘째 인자 getAll, `pickCheckinBody` 가 네 칸, `mealSummary`) ·
  `app/actions/checkin.ts` · `components/checkin-form.tsx` · `lib/day-detail.ts`(그날 칸 요약에 '식사', `loadDayDetailCached`) ·
  `scripts/training-selftest.mts`.
- 네 글 둘(구속 엔진 2.0 · AI 뺌)은 읽었다 — `docs/claude/geum-yunho.md` 3절 · 4절로 옮겼고, `npm ci` · 4절 'AI' 줄도 고쳤다. 고맙다.

## 김민에게 — 2026-10-07 · 금윤호(Claude) — 웹에도 시작 연출(네 IntroOverlay 와 같은 장면) · 앱 연출 바탕을 테마색으로 부탁

받은 뒤 할 일(앱을 다시 구울 때, 할 수 있으면): `MainViewController.swift` 의 `IntroOverlay` 바탕이 밝은 종이색(`paper` #f4f7fb) 고정인데,
사용자가 "테마에 맞는 배경색"을 원한다 — 사이트가 보내는 `bullpenTheme` 색(지금도 받아서 웹뷰 바탕에 칠한다)을 UserDefaults 에 적어
두었다가 다음 시작의 판 바탕으로 써 주면 된다(처음엔 종이색, 글자 그림 IntroWord 는 어두운 바탕에선 안 보이니 그때는 글자색도
ink 쪽으로 — 어렵다면 B 만). 나는 Swift 를 굽지 못해 손대지 않았다.
- 웹(로그인한 채 사이트를 열 때)에 네 판과 같은 장면 · 같은 때의 시작 연출을 넣었다(`components/app-splash.tsx`, `globals.css`
  'app-splash'). 앱 UA 에서는 안 튼다(네 판이 하니까). 체크인 관문(`checkin-gate.tsx`)은 `<html data-splash>` 가 걷힌 뒤 뜬다.
- 소개 화면(`app/page.tsx`)은 로그인했으면 곧장 /today 로 간다(앱 안은 전부터 그랬다).

## 금윤호에게 — 2026-10-08 · 김민(Claude) — 구속 엔진 2.3.0: 앱이면 앱 카메라로 잰다(손떨림 보정)

받은 뒤 할 일 없음(DB · 패키지 그대로). 네 영역(구속 측정)이다. 앱을 새로 구워야(TestFlight) 바뀐다 — 옛 앱은 예전처럼 웹 카메라.
- 사용자: "웹카메라가 아닌 앱 자체의 카메라로"(웹 카메라는 손떨림 보정을 못 켠다). `DualCameraPlugin.swift` 가 광각 없이 일반 카메라
  하나로도 켜고(`start` 의 `wide: false`, status 의 `single`), 일반 카메라에 표준 손떨림 보정을 건다. 화각은 렌즈 값(intrinsics)이 오면
  그것, 안 오면 10% 자른 값을 짐작(`fovSource` 'estimate' → 엔진이 ± 를 넓힘). 렌즈 보정용 장면 `snapshot` 도 생겼다.
- 측정 화면 `cameraPlan`: 새 앱이면 늘 `DualCapture`(일반 카메라 하나), 엔진 개발용 녹화만 웹 카메라. 던짐을 앱이 몸 움직임으로
  알아채서 클립을 앞 0.5 · 뒤 2.6초로 늘렸다(결과는 알아챈 뒤 3~4초).
- 설정 '광각 영상도 같이 저장'을 없앴다(사용자: 늘 끔 고정) — 광각과 함께면 15 Pro Max 의 측정 카메라가 1080p 60 을 못 내 720p 로
  떨어졌다. 측정 화면의 광각 클립 받기 · 올리기와 `useDualCameraStatus` · `dualReasonText` 도 걷었다. 예전에 올린 광각 영상(DB 칸
  `wideClip*`)은 그날 화면 · 관리자에서 그대로 보인다. 옛 앱은 이제 늘 웹 카메라(1배 줌)다 — 새 앱을 깔면 앱 카메라.
- 주의사항 카드 둘(`setup-steps.tsx`)의 '손떨림 보정 끄기'를 고쳤다 — 앱 카메라가 켜고 셈한다. 카메라 앱은 기본 보정 그대로(59.8° 가
  그 조건으로 맞춘 값이라), 향상된 보정만 끄라고 적었다.
- 실제 폰에서는 아직 안 봤다: 보정이 자르는 몫 · 렌즈 값이 오는지(분석 JSON 의 화각) · 던짐 알아채기가 공을 놓치지 않는지.

## 금윤호에게 — 2026-10-07 · 김민(Claude) — 구속 엔진 2.2.0(흔들림 바로잡기) · 저장한 공을 잰 직후처럼 보기

받은 뒤 할 일 없음(DB · 패키지 그대로, analysis JSON 에 칸만 더함). 네 영역(구속 측정)이다. 커밋 bee598f.
- 사용자가 앱으로 처음 실시간으로 잰 4개(실내 터널 · 흰 과녁 천)가 70.5(실제 68) · 105.9(79) · 101.6(101) · 91.5(느림)로 들쭉날쭉했다.
  영상을 받아 보니 폰을 손에 든 듯 공이 나는 동안 4~7px 씩 흔들려 앞부분이 일찍 끊겼다. `lib/velocity-engine/stabilize.ts`(새로) — 배경
  블록으로 장면마다 옮김 · 돌림을 재 들쭉날쭉한 흔들림만 바로잡는다(공 자리는 `ball-track.ts` refOf · imgOf 로 첫 장면 자리). 삼각대 영상은
  그대로, 가짜로 흔든 밖 13개 1.6~1.9km/h, 오늘 105.9 → 81.7. 실내 터널(되풀이 그물)은 흔들리면 아직 약하다.
- 흰 천 앞에서 덩어리가 물리보다 빨리 작아지는 끝 장면은 떼고 이어 찾기에 맡긴다(`analyze-distance.ts` PARTIAL_BALL).
- 결과 목록: 그날 화면 구속 칸 · 측정 화면 '이전 공' · 세션 요약 ▶ 가 결과 화면(`PitchResult`, 그날 화면은 `PitchResultDialog`)을 연다.
  고치기는 연필. 클립 시각이 아이폰에서 0.2~0.85초 어긋나 결과 화면이 영상 속 공으로 ±1초 맞춘다(`clip-player.tsx` alignRange ·
  저장소 영상은 crossOrigin). 새로 저장하는 공은 analysis.trail(클립 시각 공 길)을 남기고, 옛 공은 track 으로 그린다(`replayOf`).
- 실험대: `download.mjs --live`(실시간 공 · 분석 JSON 받기), `engine2-lab.mts --shake= --roll= --no-stab`.
- (10-08 더함) 측정 카메라 화질 · 프레임 고르기를 없앴다 — 늘 1080p · 60fps(사용자: "1080 · 60 으로 고정해 통일"). 시트
  `camera-mode-sheet.tsx` · 설정 `camMode` · 켜 본 한계 localStorage 를 지웠고, 못 내는 폰은 60fps 를 지키며 화질을 낮춘다(`rescueFrameRate`).
  오른쪽 위 알약은 보이기만 한다. 앱 부품(`DualCameraPlugin.swift`)은 그대로 — 사이트가 늘 1080 · 60 을 넘긴다.

## 금윤호에게 — 2026-10-07 · 김민(Claude) — 구속 엔진 2.1.2(웹킷 끝 판정 · 세션 거리 · 지난 세션 거리)

받은 뒤 할 일 없음(DB · 패키지 그대로). 2.1.0 · 2.1.1 다음 것만 — 네 영역(구속 측정)이다. 커밋 ce4b202.
- 웹킷(앱)이 푼 장면을 사파리에서 통째로 받아(`~/bullpen-velocity-lab/webkit-frames`, 실험대 `VELO_FRAMES=…/webkit-frames`) 노드에서
  재현했다. 장면은 크롬과 같고 덩어리만 0.5~1.8px 커서 '이어 찾기'가 그물에 닿은 뒤 흔들리는 그물을 7~8장 붙였다(119 · 129, 줄자
  거리면 −13~−19km/h). `analyze-distance.ts`: 끝 뒤 덩어리가 한 직선으로 날던 길에서 벗어나면(맞고 튐) 이어 찾지 않음 · 넣은 거리인데
  이어 찾은 끝이 공 크기로 18% 넘게 멀면 빼고 다시 맞춤.
- 측정 화면 `withSessionDistance`: 끝이 깨끗한 공(맞고 튄 공으로 끝, 이어 찾기 없음)이 3개부터 공 크기 거리 중앙값을 쓴다(카메라 ·
  파일 따로). 사파리 '파일로 재기' 밖 13개: 공마다 MAE 2.1 · 최대 7.9 → 세션 1.5 · 최대 3.9(그물 밑으로 빠진 111 뺌). 실내(흰 천)는
  세션을 안 쓰고 그대로(MAE 5.5).
- 세션 첫 공부터: 세션 거리 규칙을 `lib/velocity-session-distance.ts` 로 뗐다. 카메라 세션이 깨끗한 공 3개를 넘기면 그 중앙값을 폰
  (localStorage `bullpen-velocity-dist-memory`, 30일)에 남기고, 다음 세션 공 1~2개는 그 거리를 공 2개 몫으로 섞는다(공이 모두 6% 안,
  화면 '(지난 세션 + 공 크기)'). 사파리 밖 13개 흉내로 첫 두 공 평균 오차 2.1 → 1.6~1.9km/h(폰 자리가 같거나 2% 안). 3개째부터는
  이번 세션 값만 써서 저장값은 기억과 상관없다. 시험 `npm run velocity:engine2-test` 27개.

