# 받은 뒤 할 일 — 서로에게 남기는 말

두 사람 다 Claude 로 작업한다. 이 파일은 `CLAUDE.md` 가 불러오므로, 이 저장소에서
Claude 로 작업을 시작하면 저절로 읽힌다. 규칙은 `AGENTS.md` 6번.

- **Claude 에게**: `git config user.name` 으로 지금 누가 작업하는지 본다(`Kim Min` =
  김민, `금윤호` = 금윤호). 그 사람 앞으로 온 말이 아래에 있으면, 다른 일을 하기 전에
  사용자에게 먼저 알린다. 명령 실행 같은 할 일은 사용자 허락을 받고 한다.
- 처리한 말은 이 파일에서 지우고 커밋한다. 지난 말은 git 이력에 남는다.
- 공개 저장소다. 비밀번호·키·`.env` 값은 절대 적지 않는다.

---

## 금윤호에게 — 2026-10-08 · 김민(Claude) — 투구 기록에 '투구 분석(베타)' 단추 · 샘플 올리는 실험실

받은 뒤 할 일 없음(DB · 패키지 그대로). **네 영역(투구 기록)에 단추를 더했다** — 사용자: "3루(옆) · 2루(뒤)에서 동시에 찍어 3D 투구 분석을
만들어 보자, 구속 측정처럼 투구 기록에서 들어가는 베타 화면과 샘플 올리는 공간을".
- `app/(app)/videos/videos-client.tsx`: '구속 측정' 옆(PC) · 휴대폰 알약 줄에 '투구 분석' 단추(관리자만, `canAnalyze` — `page.tsx` 가 넘김).
- 새 화면 `/videos/lab`(`app/(app)/videos/lab/*`, 관리자만): 옆 · 뒤 영상 짝 올리기 · 나란히 재생 · 지우기. 분석은 아직 없다(샘플을 모은 뒤).
- 저장은 DB 없이 영상 버킷 `{userId}/pitch-lab/{샘플 번호}/`(side · back 영상 + meta.json) — `lib/pitch-lab.ts` · `lib/pitch-lab-meta.ts`,
  올리기 주소 `app/api/pitch-lab/upload-url`. `lib/storage.ts` 에 `videoBucket()` 을, `components/video-upload.tsx` 의 `uploadToStorage` 를 export 로.
- 시험 `npm run pitch-lab:test`(8).

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
- (2.3.1) 앱 카메라 초점: 네트 있음이면 렌즈를 1.0 에 고정해 뿌옇던 것을 존 가운데 자동초점(먼 곳만) → 측정 시작 때 맞추고 잠금으로
  (`DualCameraPlugin` focus · setTrigger, `DualCapture.setFocusPoint` · `refocus`). 2배 줌에서 늘리지 않는 형식을 먼저 고른다.
  측정 중 진행 표시 `components/velocity/measure-progress.tsx`(투구를 인식했어요 → 구속 계산 중, 뷰파인더 테두리 · 정보 판 ·
  결과 화면 알약). 웹 카메라 `rescueFrameRate` 가 720p 60 까지 내려가 본다.
- (2.3.2) 폰을 맥에 연결해 바로 깔아 보니 자동초점은 잘 잡혔다(흐렸던 폰엔 옛 앱이 깔려 있었던 듯). 형식은 1080p 먼저. 카메라 정보 알약을
  누르면 카메라 상태 판(`components/velocity/camera-tuner.tsx`, 앱 `diag` · `tune`): 형식 원문 · 묶어 읽기 · 디지털 줌인가 · 렌즈 자리,
  손떨림 보정 · 줌 · 수동 초점. 개발용 빌드(맥에서 깐 앱)는 콘솔에 형식 목록 · 2초마다 초점 상태를 찍는다(`#if DEBUG`).
  맥에서 폰에 바로 깔기: `xcodebuild … -destination 'id=<폰>' DEVELOPMENT_TEAM=<팀> -allowProvisioningUpdates -allowProvisioningDeviceRegistration`
  → `xcrun devicectl device install app` → `devicectl device process launch --console`(30~50분 걸리던 TestFlight 대신 1~2분).
- (2.3.3) 던짐 알아채기를 '날아가는 공'으로(앱 `MotionTrigger` — 세 장면 차이 덩어리를 이어 가운데에서 시작해 빠르게 작아지는 길 → 'ball',
  예전 움직임 → 'motion'). `DualCapture` 는 'ball' 만 '투구를 인식했어요'를 띄우고, 'motion' 은 조용히 재 보고 공이 없으면 넘긴다(수동 모드는
  잰 뒤에 멈춤). 맥 시험대 `scripts/velocity-lab/ball-trigger/run.sh`(앱 Swift 의 BALL_TRIGGER 구간을 떼어 영상에 돌림).
- (2.3.4) 맥에서 깐 개발용 앱은 측정 중 장면을 폰에 1분 조각으로 남긴다(`LabRecorder`, `#if DEBUG`) — `scripts/velocity-lab/pull-device.sh`
  로 케이블 · 같은 와이파이에서 가져와 폰 알림과 시험대 결과를 나란히 본다. **개발용 빌드는 `SWIFT_OPTIMIZATION_LEVEL=-O` 로** — 안 붙이면
  초당 20장으로 찍힌다(README). 손에 든 폰의 헛 공을 '화면 통째 움직임' 조건으로 막았다.
- (2.3.5) 사용자 원칙: **모든 사용자가 같은 기준 조건**(1080p · 60fps · 2배가 진짜 줌 · 손떨림 보정) — 기종 따라 몰래 올리거나 낮추지 않는다
  (같은 영상도 분석 화질 720 ↔ 1080 만으로 밖 최대 2.7 · 실내 최대 21.7km/h 달라짐). 못 맞추면 막지 않고 측정 화면이 계속 알리고 공의
  `analysis.offStandard` 에 남긴다(`CameraInfo.offStandard`, 앱 start 의 `standard`). 웹 카메라의 720p 낮추기는 뺐다.
- (2.3.7) 손떨림 보정이 자르는 몫을 폰에서 쟀다 — 15 Pro Max(1080p · 2배)는 1.096 배(짐작 1.1). 잰 기종은 화각 출처가 'measured' 라
  거리 자동이어도 ± 를 넓히거나 믿음을 '낮음'으로 낮추지 않는다(`DualCameraPlugin.swift` STAB_CROP_MEASURED). 15 Pro Max 는 보정을 켜면
  렌즈 값(intrinsics)을 주지 않는다. 네 폰도 재 볼 수 있다: 맥에서 깐 개발용 앱 → 카메라 단계에서 폰을 세워 두기 → `scripts/velocity-lab/fov-crop.mjs`(README 7).
- 기준 밖 공(`analysis.offStandard` 가 빈 배열이 아님)은 스피드건 보정 짝에서 뺀다(`app/actions/velocity.ts` loadCalibration). 관리자 공
  미리보기에 '기준 밖' 배지와 까닭(`explorer-panels.tsx`, `AdminPitchAnalysis.offStandard`). 관리자 통계(편향 · p90)는 예전처럼 다 섞어 센다.

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

