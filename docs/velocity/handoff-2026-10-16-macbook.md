# 구속 측정 엔진 세션에게 — 2026-10-16 · 김민(Claude, 맥북)

데스크톱의 **구속 측정 엔진 세션 한 곳만** 읽는 인수인계다(HANDOFF.md 는 모든 세션이 읽어서 거기 두지 않았다).
다 읽고 이어받았으면 이 파일을 지우고 커밋한다.

## 한 줄 요약

10-16 밖에서 첫 세션은 거의 잡혔는데 저장하고 이어 재니 거의 안 잡혔다(김민). 원인은 엔진 값이 아니라 **앱의 공 알림**이었다 —
투수 1m 뒤 폰에서 제자리에 머문 채 작아지는 공을 세 장면 차이로는 테두리만 봐 놓쳤다. 공 알림 · 발열 · 시도 기록을 고쳐 **엔진 2.6.1**로
올렸다(값 규칙은 그대로). 자세한 표 · 근거: `docs/velocity/accuracy-2026-10-16.md` 의 '오후' 절.

## 커밋(모두 main 에 올림)

- `29fb2386` 구속 측정 인식률(엔진 2.6.1) — `mobile/ios/App/App/DualCameraPlugin.swift`(MotionTrigger) · `lib/velocity-engine/dual-capture.ts` ·
  `app/actions/velocity.ts`(recordVelocityAttempt) · `app/(session)/velocity/velocity-screen.tsx` · 관리자 시도 표(`explorer-panels.tsx` ·
  `lib/velocity-admin-load.ts`) · 실험대 `scripts/velocity-lab/cdp.mjs`
- `8a58b482` 투구 기록 영상: 관리자가 올리는 영상은 폰이 아니라 늘 서버(Supabase)
- 이 파일과 같은 커밋: 실험대 도구 둘(`download-recording.mjs` · `gun-table.mjs`)

**앱(Swift)이 바뀌었다 — TestFlight 로 새로 구워야 현장에 들어간다.** 사이트 쪽(dual-capture 등)은 배포로 들어가지만 옛 앱은 'seed' 를
안 보내므로 동작이 그대로다. 맥에서 `xcodebuild … generic/platform=iOS CODE_SIGNING_ALLOWED=NO` 로 컴파일은 확인했다.

## 바뀐 것

1. **공 알림 두 번째 길**(MotionTrigger `trackOld`): 0.2초 전 장면과 견준다 — 놓기 직전엔 그 자리에 공이 없어 원판 그대로 보인다.
2. **길 뒷부분도 문을 본다**(`ballHit(strict: false)` — 앞 3장까지 떼어, 길이 20장 넘으면 안 봄): 손 · 공 덩어리가 먼저 붙어 공을 가져간 길.
3. 1 · 2 에서 본 공은 **'공 후보'(kind seed)** — 처음 넓이 100칸 넘을 때만(`SEED_MIN_AREA`), 따로 쉰다(`lastSeed`, 움직임 알림을 막지 않음).
   사이트(dual-capture `onThrow`)는 화면에 안 띄우고 `ballAt` 으로 그 시각 둘레를 재 보고(BALL_CLIP · BALL_RANGE), 공 길이 나오면 보인다.
   작업이 비어 있을 때만 받는다(헛 후보가 확실한 공의 자리를 차지하지 않게). 확실한 '공'(첫 길 전체가 문 통과)은 예전과 같다.
4. **발열**: 움직임 알림을 '뜨거움(serious)'부터 끄던 것을 '아주 뜨거움(critical)'에서만. 쉰 것은 kind 'skip' 으로 사이트에 알린다.
5. **시도 기록**(VelocityAttempt): `analysis.thermal`(0~3), 공 못 찾은 움직임 · 후보(`why: 'no-ball'`, 클립 없음), 발열로 쉼(`why: 'heat-skip'`),
   `kind: 'seed'`. DB 구조는 그대로(Json · 문자열 칸).
6. **실험대가 앱과 같은 디코더 길로 잰다**(cdp.mjs 가 mediabunny 를 쪽에 올림). 예전엔 늘 되감기 길이라 공 크기 거리가 2% 남짓 짧았다
   (그 차이로 세션 거리 보정이 어긋나 보였다). 예전 길은 `LAB_FRAMES=seek`.

## 숫자

- 앱 공 알림(ball-trigger 시험대)을 IMG_7873(밖 · 7구)에: 공 4 → **공 4 + 후보 3(7/7)**. 받아 둔 영상 전부 · 10-08 현장 기록(`~/bullpen-velocity-lab/device`)에서
  새 '공' 알림 0. 헛 후보: IMG_7873 2분에 2개, 10-08 실내 현장 기록 24개 중 22개(실내 과녁 천 · 사람 — 화면에는 안 뜨고 계산만).
- 앱 조건 엔진: IMG_7873 '높음' 3 → 5(20m 원값 차이 −5.0 ~ +2.8).
- `gun-table.mjs` 전체(2배 줌 스피드건 짝 42): 기록 20/42(48%) · MAE 3.6 — 10-03 밖 11/13 · MAE 1.9(문서 2.6.0 표와 같음),
  녹화(IMG_7873) 6/7 · 세션 거리 21.2m 적용 · MAE 4.3(+4.3 — 20m 원값은 평균 −2.1 인데 공 크기 거리 보정이 넘침), 실내 3/22.

## 손대지 않고 남긴 것(이어서 볼 것)

1. **공 크기 자가 날마다 다르다** — 10-03 은 세션 보정이 맞고(MAE 1.9), 10-16 은 넘친다(+4~6). 줄자로 잰 2배 줌 영상(16 · 18 · 20 · 22m)이
   있어야 가른다. 김민이 찍어 주기로 한 것.
2. **이어 찾은 공 = '낮음'** 규칙 — IMG_7873 7번(113)은 이어 찾은 15장이 실제 비행이었고 값도 맞았다(−2.5). 하지만 실내 이어 찾은 공은
   건과 −14 ~ +14% 로 흩어져 그대로 뒀다.
3. **높이 떠 어두운 배경 앞으로 가는 공**(IMG_7873 1번 100) — 손과 붙은 첫 장면은 크게, 펜스 앞에서는 반쯤 묻혀 작게 잡혀 지름이 물리적으로
   불가능하게 준다(0.12초에 8m) → 공 길 못 찾음(no-flight).
4. 세션에 저장된 공의 실제 구속은 김민이 나중에 입력한다 — 들어오면 시도 기록의 발열 · no-ball · seed 와 함께 다시 본다.
5. 새 앱으로 밖에서 다시 재 보면 시도 기록에 thermal · no-ball · heat-skip · seed 가 남는다 — 저장하고 이어 잴 때 무엇이 빠지는지 그걸로 확인.

## 자료 · 다시 돌리기

- 영상: 관리자 › 구속 측정 › **엔진 개발용 녹화** `49def374…`(2026-10-16, IMG_7873 원본 2분 · 조각 6 · 공 표시 7, 스피드건 100 · 103 · 109 · 111 · 113 · 111 · 113,
  손에서 떠난 시각은 맥북에서 장면을 보고 0.1초 단위로 잡음). 같은 날 앱 세션 `22c76e80`(첫 세션 · 기록 6) · 시도 기록 11개.
- 받기 · 비교표:
  ```bash
  node --env-file=.env scripts/velocity-lab/download-recording.mjs --id=49def374
  node --env-file=.env scripts/velocity-lab/download.mjs --date=2026-10-03 --manual
  node scripts/velocity-lab/gun-table.mjs --files=2026-10-03,2026-10-06 --live=2026-10-07,2026-10-09 --rec=rec-49def374
  ```
- 앱 공 알림 시험대: `scripts/velocity-lab/ball-trigger/run.sh <영상>`(맥에서만 — Swift). 원본을 조각으로 받았으면 조각마다 돌리면 된다.
  10-08 현장 기록(`~/bullpen-velocity-lab/device`)은 맥북에만 있다.
