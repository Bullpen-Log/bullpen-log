# 새 앱(Expo) 구속 측정 · 세션 녹화 복구 — 분석과 작업 프롬프트(영어)

2026-10-20 13:22~13:30 KST, 금윤호가 새 앱(Expo)으로 실내에서 잰 세션: 구속이 거의 안 잡혔고(완료된 시도 11 중 2만 성공, 나머지는 30초 시한 초과),
세션 녹화는 조각이 띄엄띄엄 올라갔다. 같은 자리 · 같은 조건에서 옛 앱(웹 포장)은 잘 쟀다. 아이폰 화면 녹화 셋(1:33 · 0:51 · 0:25)과
DB(시도 기록 · 녹화 표)를 읽어 원인을 좁혔다. 아래는 그 분석을 바탕으로 **다음 세션(또는 다른 Claude)이 그대로 따라 할 수 있는 작업 프롬프트**다.
사용자 규칙(2026-10-14): 프롬프트는 영어로.

---

# PROMPT — Recover velocity measurement and session recording in the new Expo app

## 0. Role and ground rules

You are the velocity-engine engineer for Bullpen Log. Repo: `/Users/yuno/Developer/bullpen-log`. The new iPhone app lives in `native/` (Expo SDK 58,
Expo Router, path alias `~/` = `native/src`, `@/` = repo root). The old app is `mobile/` (Capacitor, web wrapped). Read `AGENTS.md` and `HANDOFF.md`
first (two developers share one production DB — never run `prisma migrate dev`/`db push`, push only when the user says "올려줘", commit messages and
UI text in Korean, HANDOFF memo to 김민 for anything touching `native/src/velocity/*`, `native/modules/dual-camera/*`, `app/velocity-engine/*`).

Do NOT change the pure engine (`lib/velocity-engine/*`, `lib/abs/*`) — its numbers are validated by tests and speed-gun pairs. The problem is in
the **app-side data path and runtime load**, not in the engine math.

Work in phases below. After each phase: `cd native && npx tsc --noEmit && npx expo lint`, root `npx tsc --noEmit`, `npm run velocity:engine2-test`,
commit, and ask the user before moving on (Korean rule: 단계마다 커밋하고 다음을 물어봐). Phone verification is the user's job — give them a
concrete checklist each time.

## 1. What happened (evidence, do not re-derive)

Session 2026-10-20 13:22–13:30 KST, user `cdeb1a…`, new Expo app, indoor tunnel, phone on tripod behind the pitcher, 2× zoom, LTE.
Three iPhone screen recordings (`~/Downloads/ScreenRecording_10-20-2026 13-2{5,7,9}-*.MP4`) show:

1. The camera status pill (top-right, `InfoPill` in `native/src/app/velocity.tsx`, fed by the `fps` event of `native/modules/dual-camera`) read
   **`1080p · 16~41fps · 2배 · 버림 19~55`** for the whole session — including after the session ended and nothing else was running
   (`1080p · 31fps · 2배 · 버림 29` at 13:29:45). `fps` = frames delivered to `captureOutput(didOutput:)`, `버림` = frames discarded by
   `alwaysDiscardsLateVideoFrames` (`DualCameraCore.swift:937–953`). So the capture delegate (`mainQueue`) kept up with only ~half of the 60 fps
   stream. **Dropped frames never reach `SegmentRecorder.append`, so every clip the engine received had ~20–30 real frames per second with
   irregular gaps while being labelled 60 fps.**
2. Result notices cycled between `계산이 밀려 공 하나를 건너뛰었어요` (`AppCapture` queue full, `capture.ts:149`) and
   `계산이 너무 오래 걸려 이번 공은 재지 못했어요` (engine `TIMEOUT_MS` 30 s, `native/src/velocity/engine.tsx:72`).
3. Session-recording chip went `녹화 중 · 올림 0/2` → … → `올림 6/9 · 실패 14` (recording 1) and `올림 9/9 · 실패 16` (recording 2).

DB (read-only, `VelocityAttempt` / `VelocityRecording` for 2026-10-20):

- 11 attempts **completed** (timeouts are not recorded — see §4.1): 2 ok (`sweep` 75.8 km/h high, `motion` 58.8 km/h low), 9 failed —
  7× `NOT_ENOUGH_FRAMES` (`trackFrames 0`, why `no-ball`/`no-flight`), 2× `UNSTABLE_TRACK`, 1× `LOW_CONFIDENCE` (110.3 km/h, 34 frames).
  Yesterday with the old web-wrapped app the same user had 12 ok attempts (8 `ball`, 3 `seed`, 1 `motion`).
- Two recordings exist and are `done`: #1 40.7 s with 7 parts (0–28 s contiguous), #2 145.8 s with **9 parts covering only ~40 s**
  (offsets 0, 3.6, 7.6, 15.6, 39.6, 47.6, 59.6, 71.6, 83.6 — gaps of 4–20 s). Each part is 7–10 MB for 4.5 s (= 14 Mbps). So the files are
  there (admin → 구속 측정 → 세션 녹화 `?kind=session`), but with holes. The user believed nothing was saved.
- One session was saved with 1 pitch (engine 2.7.2).

## 2. Root-cause analysis (ranked; confirm in Phase A before fixing)

**R1 — The capture pipeline is starved: half the frames are dropped before they are recorded.** This alone explains `NOT_ENOUGH_FRAMES`,
`trackFrames 0`, and `LOW_CONFIDENCE`. The engine's flight detection needs ≥20 consecutive frames at the nominal fps; a 60 fps clip that really
holds 25 fps with gaps looks like a ball that keeps vanishing. Candidate causes, most likely first:

- **R1a — Debug (unoptimized Swift) build on the phone.** `scripts/velocity-lab/README.md:65` already documents this exact symptom from
  2026-10-08: "개발용(Debug)은 최적화 없이 구워져 공 찾기가 장면마다 수십 ms 걸리고 … 초당 20장으로 찍혔다 (최적화하니 60장 · 장면당 2ms)".
  `MotionTrigger.feed` runs synchronously on the capture queue per frame (`DualCameraCore.swift:698–760`). In addition the `#if DEBUG`
  `LabRecorder` (`lab.append`, 30 Mbps one-minute files, `DualCameraCore.swift:706, 1254`) writes every frame to disk. The GitHub workflow
  (`.github/workflows/ios-native.yml`) builds `-configuration Release`, but on 2026-10-19/20 김민 was building to phones from Xcode after
  `expo prebuild` + `pod install` (HANDOFF 10-20) — `npx expo run:ios --device` defaults to **Debug**. The old app the user compared against
  came from TestFlight (Release). Nothing in the recordings tells us which build was installed.
- **R1b — CPU contention from the new app's JS data path** (only matters if R1a is excluded). Every clip crosses two string bridges:
  `DualCamera.read` → base64 (1 MB chunks) → Hermes → `JSON.stringify` → `WebView.postMessage` → escaped into JS source →
  WebKit parses a ~1.3 MB string literal → `atob` → bytes (`native/src/velocity/engine.tsx:139–147`, `app/velocity-engine/engine-client.tsx:120–139`).
  The sweep (`capture.ts sweep()`, every 5 s, 6 s window ≈ 10 MB at 14 Mbps → 13 MB of base64 every 5 s) runs the whole time the shutter is
  armed, on top of ball/motion clips (1.7–3.1 s ≈ 3–5 MB) and session-recording cuts (4 s ≈ 8 MB every 4 s, native upload). The old app had
  one hop (Capacitor plugin → the same WKWebView). The Hermes JS thread also re-renders the 968-line screen at 10 Hz from `level` events
  (`DualCameraModule.swift:167 deviceMotionUpdateInterval = 0.1` → `setTilt` → whole `VelocityScreen` + `useAbs` memo chain).
- **R1c — iOS screen recording** (ReplayKit encoder) was on during the test; it adds load but did not exist in the old-app comparison either, so it is
  a multiplier, not the cause.

**R2 — The hidden engine WebView can take >30 s per clip under load.** Timeouts are consistent with R1b plus WebKit giving a 1 pt, 0.01-opacity
`WKWebView` low priority. Note `ask()` only records an attempt when a result comes back (`capture.ts:230–248`), so every timeout is invisible in
the DB — we cannot tell how many balls were lost to timeouts vs. to frame drops. Fix the telemetry first (Phase A).

**R3 — Session recording: uploads cannot keep up on LTE, and backlog is dropped instead of spooled.** 4 s cuts at 14 Mbps = 8 MB every 4 s
= 16 Mbps upstream; LTE gives 5–15. `native/src/velocity/session-recorder.ts` keeps `MAX_PENDING = 3` and **skips** the segment when the queue
is full (`'올리기가 밀려 조각 하나를 건너뛰었어요'`, line 83) and also skips when the cut falls behind the 8 s buffer (`'카메라가 밀려 몇 초를
건너뛰었어요'`, line 73). The web recorder (`lib/velocity-dual-recorder.ts`) was already fixed on 2026-10-19 for the same problem:
`RECORD_MAX_PENDING` 3 → 6 and spill-to-phone (`saveBlobToPhone` → upload after stop → delete). The app recorder was not ported. The same
backlog also happens when frames are dropped (R1) because `DualCamera.clip` fails more often.

## 3. Phase A — Diagnose before touching behaviour (≈2 h)

Goal: make the next field test self-explaining. All of this is additive and safe to ship.

A1. **Build identity in the UI.** In `native/src/app/velocity.tsx` show build configuration in the camera-info pill tooltip / admin
    diagnostics: `__DEV__`, `Constants.expoConfig?.version`, `Application.nativeBuildVersion`, and from Swift a new `StartInfo.debugBuild: Bool`
    (`#if DEBUG true #else false`) plus `optimized: Bool` (compile-time: `#if swift(>=5) && !DEBUG`… simplest is `debugBuild`). Also expose
    `ProcessInfo.thermalState` in the `fps` event (`thermal: Int`). Pill text when degraded: `1080p · 24fps · 버림 36 · DEBUG` so the user sees it.

A2. **Per-stage timing in the app console and in the attempt record.** In `native/src/velocity/capture.ts measure()` and `engine.tsx ask()`
    measure: `clipMs` (DualCamera.clip), `readMs` (all chunks), `bridgeBytes`, `engineMs` (`ms` already returned by the engine page),
    `decodeMs/analyzeMs` (engine-client already has `timing` from `analyzeVideo` — forward it), `queueWaitMs`. Log one `[velo] …` line per job.
    Add optional JSON columns is NOT allowed without 김민 (DB rule) — instead put the numbers into the existing `VelocityAttempt.why`-adjacent
    field? No: keep DB shape; send them as `memo`-free console logs and, for admins, show the last 5 lines in the admin diagnostics sheet.

A3. **Record timeouts as attempts.** In `capture.ts enqueue()`'s `.catch`, call `onAttempt` with `ok:false, code:'TIMEOUT'` (or `'ENGINE'` for
    non-timeout errors), `why: err.message`, `trackFrames: null`. Server `velocity.recordVelocityAttempt` accepts arbitrary code strings — verify in
    `app/actions/velocity.ts`. This makes the DB show lost balls.

A4. **Frame-drop guard on the clip itself.** When `DualCamera.clip` returns, Swift knows the real frame count of the cut (count sample buffers
    appended between `start` and `end`). Return `frames` and `fpsActual` in `Clip`; pass `fpsActual` to `MeasureOpts.fps` only if the engine is
    happy with variable fps — otherwise pass nominal fps but add a note `프레임 N% 빠짐` to `offStandard` (`session.ts offStandardOf`) so the saved
    analysis says why. If `fpsActual < 0.8 × nominal`, show the notice `카메라가 장면을 버리고 있어요(초당 N장)` once per 10 s.

A5. **Field checklist for the user (print it in the final report):** open the camera screen, wait 5 s idle, read the pill. Healthy Release build:
    `1080p · 60fps · 2배` with no `버림`. If `버림` > 5 at idle → R1a/R1 confirmed, stop and rebuild Release (or `SWIFT_OPTIMIZATION_LEVEL=-O`).

## 4. Phase B — Fix session recording (≈2 h, independent of Phase A results)

Port the web recorder's 2026-10-19 behaviour to `native/src/velocity/session-recorder.ts`:

B1. `MAX_PENDING` 3 → 6; above that **spool instead of skip**: keep the cut file in the app's tmp dir (it already is — `main.path` from
    `DualCamera.clip`), push `{index, path, bytes, offsetSec, durationSec}` to a `spooled[]` list, and after `stop()` upload them in order
    (reuse `upload()`), then `DualCamera.discard`. Cap the spool by free disk (`DualCameraCore.swift minFreeBytes` already guards the recorder;
    mirror a 1 GB cap here) — beyond the cap, drop oldest and count `failed`.
B2. `stop()` must wait for the in-flight cut (`cutJob`, already done 2026-10-19), then the final tick, then spooled uploads, then `finish`.
    Time-box: cut 15 s, each RPC 20 s, each upload 90 s (same as web), so `stop` always returns.
B3. The "behind the 8 s buffer" skip is correct, but count how often it happens and surface `실패` reasons separately in the chip:
    `올림 6/9 · 밀림 3 · 대기 2`. Add `spooled` to `RecState`.
B4. Admin list (`app/(app)/admin/velocity/recordings`) already shows `영상 0:07만 올라감`; make sure a recording whose parts have gaps shows the
    covered seconds (sum of part durations) vs `durationSec` — it does via `uploadedSec`; verify it reads the app's `offsetSec` correctly
    (parts above show offsets like 39.6 s → should render as a gap, not as 9×4.5 s contiguous).
B5. Tell the user where the files are: 관리자 → 구속 측정 → 세션 녹화(`?kind=session`) → today's two rows.

## 5. Phase C — Remove the frame drops (≈3 h, after Phase A confirms R1)

C1. If R1a: ship a **Release** build (GitHub `ios-native.yml` already is Release). For local device installs document in `native/README.md`:
    `npx expo run:ios --device --configuration Release` (and keep `SWIFT_OPTIMIZATION_LEVEL=-O` for Debug lab builds as in
    `scripts/velocity-lab/README.md`). Guard the `#if DEBUG` `LabRecorder` behind an explicit launch flag (`-labRecord YES`) so a Debug build
    does not write 30 Mbps to disk by default.
C2. Regardless of R1a, move per-frame work off the capture callback where it can be:
    - `MotionTrigger.feed` must stay synchronous (it decides the throw time), but measure its cost in Release (`feedMs` is DEBUG-only — add a
      lightweight EMA exposed in the `fps` event as `feedMs`). Target < 4 ms/frame at 60 fps.
    - `serveSnapshots` (ABS plate detection) copies a full luma plane on the capture queue every 0.6 s; move the 2×2 downscale to `clipQueue`
      via a `CVPixelBuffer` retain (it is only active in ABS mode, not today — low priority).
C3. If frames still drop in Release at idle on the user's phone model, raise `mainQueue` QoS to `.userInteractive` and lower the `wideRecorder`
    (unused when `wide:false`) — confirm `wideOutput` is not even added when `wide` is false.

## 6. Phase D — Shrink the bridge data path (≈1 day; do after C, only if R1b/R2 remain)

Pick D1 first; D2 is the structural fix if D1 is not enough.

D1. **Cut bytes.** (a) Sweep: lower `SWEEP_MAX_SEC` for the app from 6 to 4 and only sweep when `jobs.length === 0` for ≥ 2 s (already gated) —
    halves the 5-second base64 load; (b) `BALL_CLIP` for ball events is `[0.6, 1.6]` but the web measures `BALL_RANGE` `[0.25, 1.45]` — cut the
    app clip to the measured range (saves ~25 %); (c) do not send the clip to the engine when the recorder reports `frames < 0.8 × nominal`
    (Phase A4) — it will fail anyway; (d) keep 14 Mbps (engine edge measurement depends on it).
D2. **Stop passing bytes through JavaScript.** Give the engine page direct file access instead of base64 over two bridges. Two options, choose
    after a 1-hour spike:
    - *Custom URL scheme served by our own module*: create an Expo module `engine-webview` that hosts a `WKWebView` with a
      `WKURLSchemeHandler` for `bpclip://<name>` serving files from the DualCamera tmp dir with `Access-Control-Allow-Origin: *` and Range
      support; the page (still loaded from `${SITE_URL}/velocity-engine`) does `fetch('bpclip://…')`. Messages back via `WKScriptMessageHandler`.
      Removes RN WebView from the path entirely.
    - *Local file origin*: bundle a static export of `/velocity-engine` in the app, load it with `source={{uri:'file://…'}}` +
      `allowingReadAccessToURL` = the clip directory, and `fetch('file://…/clip.mp4')`. Keeps `react-native-webview` but ties the engine version to
      the app build (loses "deploy the site = update the engine", which 김민 relies on).
    Measure with Phase A2 telemetry: target `readMs + bridge` < 300 ms for a 3 MB clip, engine round trip < 4 s (web app baseline 3–4 s).
D3. **JS-thread hygiene.** Throttle `level` to 4 Hz in Swift (`deviceMotionUpdateInterval 0.25`) and keep `tilt` in a ref for the engine,
    re-rendering only the `LevelBubble` (`React.memo` + separate state) — the whole screen re-rendering at 10 Hz is unnecessary.

## 7. Acceptance criteria (field test, same tunnel, 20 throws)

- Pill at idle: `60fps`, `버림` ≤ 2. During measurement: `fps` ≥ 55.
- ≥ 16 of 20 throws measured (`ok`), none lost to `TIMEOUT`; `VelocityAttempt` rows exist for every throw (including timeouts).
- Session recording: parts cover ≥ 95 % of `durationSec` on LTE; chip never shows `실패` from `올리기가 밀려`; spooled parts finish uploading
  within 2 minutes after `세션 종료` and the admin row shows no gaps.
- Engine numbers unchanged: `npm run velocity:engine2-test` and `velocity:accuracy` identical before/after.

## 8. Deliverables and handoff

- Commits per phase (Korean messages, numbers before/after). HANDOFF memo to 김민 listing: new `fps` event fields (`thermal`, `feedMs`),
  new `Clip.frames/fpsActual`, attempt code `TIMEOUT`, recorder spool, and the build-configuration finding (Debug = 20 fps) so it never recurs.
- Update `docs/velocity/engine-2.7-plan.md` 인계 절 with a short "앱 측정 복구" entry pointing here.
- Do not bump `VELOCITY_ENGINE_VERSION` — the engine did not change.

---

## 부록 — 2026-10-20 자료 요약(한국어)

| 항목 | 값 |
| --- | --- |
| 화면 녹화 | 13:25:42(93초) · 13:27:35(51초) · 13:29:21(25초), 1126×2436 |
| 카메라 알약 | 1080p · **16~41fps · 버림 19~55** — 세션 끝난 뒤(13:29:45)도 31fps · 버림 29 |
| 화면 알림 | '계산이 밀려 공 하나를 건너뛰었어요' ↔ '계산이 너무 오래 걸려 이번 공은 재지 못했어요'(30초 시한) |
| 시도 기록 | 완료 11: ok 2(훑기 75.8 높음 · 움직임 58.8 낮음), 실패 9(NOT_ENOUGH_FRAMES 7 · 장면 0 / UNSTABLE 2 / LOW_CONF 1) — 시한 초과는 기록 안 됨 |
| 세션 녹화 | #1 40.7초 조각 7(0~28초 연속) · #2 145.8초 조각 9(0 · 3.6 · 7.6 · 15.6 · 39.6 · 47.6 · 59.6 · 71.6 · 83.6초 — 구멍) · 조각 7~10MB/4.5초 |
| 저장 세션 | 1(공 1개, 2.7.2) |
| 전날(옛 앱) | ok 12(공 8 · 후보 3 · 움직임 1) |

---

## 진행

- **Phase A 끝(2026-10-20, 윤호 맥북 — 앱을 다시 구워야 들어간다)**: ① Swift `start` 답에 `debugBuild · appVersion · appBuild`, 'fps' 알림에 `thermal`(0~3) ·
  `feedMs`(장면당 공 찾기 시간, Release 에서도 잼) — 카메라 알약이 `… · 버림 N · DEBUG · 뜨거움` 을 보이고(Debug · 버림 5 넘으면 주황), 관리자는 알약을 눌러
  진단(빌드 · 카메라 · 최근 작업 6줄). ② 작업마다 단계별 시간(`capture.ts JobTiming` — 큐 · 자르기 · 읽기(MB · 실제 fps) · 계산(장면 · 분석) · 합)을 콘솔 `[velo] …` 한 줄 +
  진단에. ③ 시한 초과 · 계산기 죽음 · 클립 없음도 시도 기록에 남는다(`engine.tsx EngineError` → rejectCode `TIMEOUT · ENGINE_DOWN · ENGINE_GONE · ENGINE_FAIL`, 카메라 모듈은
  `NO_CLIP · CAMERA_OFF · CLIP_…`, why 는 소문자). ④ 클립마다 실제 담긴 장면 수(`Clip.frames · fpsActual`, `SegmentRecorder` 가 넣은 장면 시각을 셈) — 20% 넘게 빠지면
  10초에 한 번 '카메라가 장면을 버리고 있어요(초당 N장)', 잰 공의 `analysis.offStandard` · 메모에 '장면 N% 빠짐'(`clip-health.ts`). 엔진 · DB 모양은 그대로.
- **폰에서 볼 것(A5)**: 카메라 화면을 열고 5초 쉰 뒤 알약 — Release 면 `1080p · 60fps · 2배`(버림 없음 · DEBUG 없음). `DEBUG` 가 보이거나 쉬는 중에도 `버림` 이 5를 넘으면
  R1a 확정 → Release 로 다시 굽는다. 관리자 진단의 '공 찾기 ms/장' 이 Release 에서도 8 을 넘으면 Phase C2 로.
- **Phase B 끝(2026-10-20)**: 앱 `session-recorder.ts` 가 웹 10-19 와 같은 규칙 — 자를 구간은 `sweep.ts nextRecordCut`(한 번에 4초 · 8초 밖으로 밀리면 건너뛰고 `skipped` 로 셈),
  올리기가 `RECORD_MAX_PENDING`(6) 넘게 밀리면 조각을 버리지 않고 폰(앱 tmp 의 클립 파일 그대로)에 둔 채 `spooled` 로 세고, 끝낼 때 차례로 올린 뒤 지운다(1GB 넘으면 버림).
  자르기 15초 · 서버 동작 20초 · 올리기 90초 상한. 칩 `녹화 중 · 올림 6/9 · 대기 3 · 밀림 1 · 실패 2`, 세션을 끝내면 `마무리 중 · 올림 N/M · 남음 K`(측정을 끈 뒤에도 보인다).
  B4(관리자 목록 '영상 0:40만 올라감')는 이미 조각 길이 합(`uploadedSec`)으로 세고 있어 구멍 난 녹화를 그대로 드러낸다 — 고칠 것 없음.
- **Phase C · D1 끝(2026-10-20 — 폰 확인 없이 코드로 할 수 있는 것)**: ① **공 찾기(MotionTrigger.feed)를 카메라 장면 줄에서 떼어 제 줄(`triggerQueue`)로** — 녹화기는
  늘 모든 장면을 받고, 공 찾기가 밀리면 그 장면의 공 찾기만 건너뛴다(`feedSkipped`, fps 알림 · 진단에). Debug 빌드 · 뜨거운 폰에서도 클립은 온전하다(원인 1 의 구조적 고침).
  장면 줄 QoS `userInteractive`. ② 개발용 현장 기록(LabRecorder 30Mbps) · 화각 재기는 `-labRecord YES` · `-fovProbe YES` 로 켤 때만(Debug 가 기본으로 디스크에 쓰던 것).
  ③ 기울기 알림 10Hz → 5Hz, 0.1° 안 움직였으면 화면을 다시 그리지 않음. ④ 공 알림 클립 앞 0.6 · 뒤 1.6 → 0.4 · 1.55(재는 범위보다 0.1~0.15초만 넉넉히, 다리 바이트 1할).
  ⑤ `native/README.md`: 폰에 깔 때 `--configuration Release`.
  **아직 안 한 것**: D2(클립을 base64 로 두 번 건너지 않고 파일로 계산기에 넘기기 — 새 WKURLSchemeHandler 모듈, 하루). Release 에서 진단 알약의 '읽기' 가 계산보다 크면 그때.
- **화면 녹화 다시 보기(2026-10-20 밤, 김민 구속 세션)**: 세 녹화에서 던진 공 11개(터널 전광판 68 · 65 · 74 · 65 · 65 · 71 / 73 · 71 · 66 / 71 · 69km/h) — 잰 공 0.
  위 분석에 없던 것 넷을 고쳤다. ① 첫 투구부터 '계산이 밀려 건너뛰었어요' — 사람이 화면 앞을 오가며 낸 움직임 작업이 줄(2칸)을 채워 진짜 공이 버려졌다 →
  확실한 공은 아직 시작 안 한 안 보이는 작업을 빼고 선다(`capture.ts` enqueue). ② 세션을 끝낸 뒤 새로 켠 두 세션 내내 칩이 '녹화 중 · 올림 9/9 · 실패 16'
  그대로 — 끝낸 녹화기가 마저 올리며 같은 칩을 덮었고, 끝난(done) 녹화도 '녹화 중'으로 보였다(그 두 세션은 녹화가 꺼져 있었다) → 칩은 지금 녹화기 것만, done 은 숨김.
  ③ 녹화 #2 의 145.8초는 다 올린 뒤에 잰 길이(실제 약 95초) → 멈춘 때로(앱 · 웹 녹화기 둘 다). ④ 알림 하나가 80초 넘게 남음 → 새 투구를 알아채면 걷는다.
  **남은 것**: 쉬는 때도 16~30fps · 버림 30~55 는 이 판(Phase C 전)이라 다시 재 봐야 한다 — 다음 현장은 **화면 기록 없이**, 알약의 늦음/버퍼 · 공 찾기 건너뜀을 본다.
- **코드 전체 검토 뒤 고침(2026-10-20 밤, 김민 구속 세션 — 엔진 2.7.3)**: 네 갈래 검토(카메라 · 재기 줄 · 세션 녹화 · 숨은 웹뷰 계산기)에서 나온 것.
  ① 알림을 받자마자 클립을 자른다(예전엔 차례가 와서야 잘라 앞 계산이 길면 공이 8초 버퍼 밖으로) ② 계산 줄은 공(보이는 작업)이 먼저, 안 보이는 작업은 클립을 받은 뒤
  공이 기다리면 차례를 내준다 ③ 공이 오면 돌던 훑기도 끊는다(`locateThrow` signal — 모델 · 거친 훑기 둘 다) ④ 훑기가 찾은 공을 재는 구간 2.8 → 2초(120장 상한에 걸려
  30fps 로 쟀다) ⑤ 움직임 클립에 다 안 드는 공은 따로 세우고 그 작업은 비킨다(거절 검사를 다 넘은 뒤에만) ⑥ '구속 계산 중' 뒤 못 잰 공에 알림 ⑦ 포기한 일의 조각을 그만 보내고
  계산기도 버린다 ⑧ 모델을 아직 못 받았으면 거친 훑기(받기를 기다리며 줄을 막지 않게) ⑨ 계산기 웹뷰에 화면 안 재생 허용(디코더를 못 열 때 30초 기다리던 것).
  세션 녹화(현장은 와이파이 없이 LTE · 5G — 김민): 올리기 상한을 스위프트로(120초, 같은 조각 두 번 올림 막음) · 올리던 조각은 앱을 잠깐 내려도 끝냄 · 폰에 둘 한도 2GB ·
  켜자마자 끈 녹화를 끝내 둠. **스위프트가 바뀌어 새 TestFlight 를 깔아야 한다.** 남은 것: 측정 전에도 공 찾기가 도는 것(열) · 쓰개가 깨지면 8초 조각을 다 버리는 것.
- **현장 전 확인(2026-10-21 새벽)**: 10-20 세션 녹화 조각 16개(새 앱 카메라 영상 그대로)를 엔진 2.7.3 으로 크롬에서 다시 돌렸다(`download-recording.mjs` + cdp).
  풀기 · 훑기는 모두 돌았고(조각당 1.3~2.1초), 끊기는 0.3초에 청해 0.5~0.7초에 멈췄다. 공 후보 9곳은 모두 NOT_ENOUGH_FRAMES · UNSTABLE_TRACK(공 길 0장) —
  2초 구간 120장 가운데 44~74장이 같은 장면(되풀이)이라 **카메라가 장면을 버린 영상**이다. 엔진 탓이 아니라 그날 판의 장면 버림 탓을 다시 확인.
  사이트 `/velocity-engine` · `/velocity-detector/ball-v1.onnx` · jsDelivr 런타임 모두 200(앱 UA). 현장 뒤 읽기: `scripts/velocity-lab/attempts-report.mjs --date=…`.
- **10-21 밖 캐치볼 20m(김민, 엔진 2.7.4)**: 카메라는 내내 60fps · 버림 0 — 장면 문제는 풀렸다. 못 잰 까닭 셋: ① 측정 화면이 화면 꺼짐을 안 막아 30초 자동 잠금에
  카메라가 멈춤(세션 녹화 26~52초 빔, 그사이 공 알아채기도 없음) → `keepAwake` ② 잔차 0.84~0.94px 공 셋(95~102km/h)이 높음 문턱 0.8px 에 걸려 측정 불가 → `HIGH_RMS`
  1.2 → 1.5σ, 엉뚱한 안내('닿는 곳이 안 보였어요' — 포수가 받으면 늘 impact 'end')를 까닭별로(`DistanceReport.soft` → why) ③ 세션 거리 보정이 깨끗한 공 하나의 공 크기
  거리 18.1m 로 세션을 −10% 옮김(다른 공 19.5~21m) — 거리를 알면 '줄자로 쟀어요'. 저장된 두 공은 20m 값(100.5 · 98.4)으로 고침(백업 `~/bullpen-log-backups`).
  같이: 못 잰 공 안내에 까닭 한 줄 · 소리 안내(DualCamera.speak, 위 오른쪽 스피커 — 스위프트라 새 TestFlight).
- **10-21 스피드건 짝 10구로 다시 잼(김민 캐치볼 녹화 ba9c20e8 · 91c0c0da, 건 100~121)**: 앱과 같은 조건(20m)으로 원값 −8km/h(−7%). 공마다 '맞으려면 필요한
  거리'가 20.7~22.2m(평균 21.4, 흩어짐 2%) — 엔진 상대값은 고르고 거리가 틀렸다(20m 는 측정 앱으로 잼). 장면을 세도 A3(109) 비행 0.727초 = 21.4m. 공 크기 거리 22.5m.
  지난 짝 55개: 공 크기 거리 ÷ 필요 거리 가운데 1.020(날마다 0.98~1.04). 받는 곳 21.4m 로 셈하면 MAE 1.9 · 기록 4 → 7/10.
  고친 것: 새 앱에도 줄자 · 공 크기 7% 어긋남 알림(웹과 같게). **해 보고 안 넣은 것**: ① 고르기 단계 크기 기울기 검사 — 던지는 팔(폰 1m 앞)을 공으로 먼저 고르는 것은
  막지만(A5 · A6 살아남) 새로 고른 줄이 받는 순간을 일찍 잡아 A6 123.8(건 114) · 10-06 119 가 155 로 틀어져 되돌림 ② 공 크기 ÷1.02 — 10-03 밖 13개 평균이 +0.3 → −2 로 나빠짐.
  다음 차례: 던지는 사람이 화면 안일 때 공 고르기 + 끝(받는 순간) 판정을 같이 고친다. 재는 도구 `scripts/velocity-lab/probe-track.mjs`(장면별 공 길), 묶음 `~/bullpen-velocity-lab/rec-gA · rec-gB`.
- **셔터 상한 1/500 → 1/2000(2026-10-21, 김민 "셔터 상한 왜 안 높여?")**: 2.7 계획 3 · 5번에 있던 일 — 어두운 실내에서 ISO 가 끝까지 올라도 어두워질까 미뤘다.
  이제 1/2000 에서 시작해, 노출이 목표보다 0.6EV 넘게 모자라고 ISO 가 그 모양 끝의 90% 넘으면 2초 뒤 1/1000 · 1/500 으로 한 단계씩 풀고 밝아지면(ISO 35% 밑 3초) 다시 조인다
  (`DualCameraCore.swift adaptShutter`). 셔터(분모) · ISO · 상한을 시도 기록 camera 에 남긴다 — 10-21 까지는 앱이 받고도 버려 그날 셔터를 모른다. `attempts-report.mjs` 에 칸.
  SmartScout 은 1/6289. 스위프트라 새 TestFlight 부터. 현장에서 볼 것: 밖 셔터가 1/2000 인지 · 실내에서 풀리는지(진단 창) · 빠른 공 비율이 나아지는지.

## 10-21 오후 — 팔 거르기 · 모델로 끝 다듬기 해 봄(둘 다 안 넣음)

스피드건 짝 52구(+09-28 실내 18구)로 견줌, 기준 2.7.5 = 기록 24/52 · MAE 4.4.
- **공 길 고르기에서 팔 거르기**(크기 기울기 −1.6~−0.6 밖 줄은 고르기 단계에서 건너뜀): 기록 27/52 로 늘지만 새로 잡힌 공 둘이 크게 틀렸다 —
  오늘 A 6번째 114 → 123.8(높음), 10-06 119 → 155.1(보통 · 흔들림 바로잡음, 기록됨). 둘 다 공은 맞게 골랐는데 끝을 일찍 정했다(미트 · 포수
  덩어리가 공보다 먼저 와 '맞고 튐'). 끝 판정을 같이 고치지 않으면 넣으면 안 된다. 잡힘 문턱(endO ≤ 1.6 · dAtD → 1.3)만 좁혀서는 안 바뀐다 —
  가짜 튐은 impactTime 의 끝 뒤 덩어리 3장에서 온다.
- **공 감지 모델(ball-v1.onnx)로 끝 다듬기**(마지막 덩어리 장면부터 예상 길 둘레 192px 를 모델에): 모델은 공이 그물 · 미트에 들어간 뒤에도
  공 크기 그대로 3~6장을 길 위에서 본다(그물이 늘어나고 미트가 밀려서) — '닿은 순간'을 못 가른다. 가짜 튐(A 6번째)은 고치지만 진짜 튐
  (오늘 A 1번째 · 49def 셋)은 4~7km/h 낮춘다. 이어 찾기가 맞던 실내(10-09 실제 18.5m — 이어 찾기 값은 18.5m 로 옮기면 MAE 약 2)는 모델이
  2~3장만 봐 끝을 앞당겨 훨씬 틀렸다. 흰 천 앞(오늘 B 1번째)은 점수가 낮아 공을 못 본다.
- 다음에 해 볼 것: 2판 학습에 '그물 · 미트에 닿은 장면' 표시를 넣어 모델이 닿음을 가르게(지금 라벨은 공 자리뿐), 또는 끝 둘레 공의 깊이 감속
  (그물 · 미트에서 급히 느려짐)을 덩어리 크기 흐름으로 잡기. 공 길 덤프 `probe-track.mjs` · 견주기 `gun-table.mjs`.
- **이어서(같은 날) — 팔 거르기를 넣었다(엔진 2.7.6)**: 가짜 튐 공은 공 크기 거리가 세션 거리보다 11~13% 짧게 나온다(끝을 일찍 정하면 짧아짐).
  그래서 ① 팔 거르기 ② 기준이 믿을 만할 때(세션 거리 · 줄자) 튕긴 공도 공 크기 10% 안이어야 '높음'(기준 20m 에는 15% 그대로 — 실제 22.6m
  자리가 첫 공부터 빠지지 않게) ③ 건너뛰고 고른 공이 손에 든 폰이면 '보통'으로 안 받음. 앱 규칙(세션 공 크기 튐 거르기 포함)으로 스피드건 짝
  70구: 기록 25 → 25, MAE 4.50 → 3.52km/h. 오늘 A 는 4/6 · MAE 8.4 → 5/6 · 2.2. 잃은 것: 10-06 손에 든 102(+7.6)가 '보통'에서 빠짐.

## 10-21 밤 실내 18 · 16m(130~140km/h) — 원인 · 고친 것(엔진 2.7.7 · 2.7.8, 셔터, 자리 안내)

스피드건 짝 여섯(L122 · L123 · L130 · L134 · L139 · L178) + 세션 녹화 7개. 도구는 `scripts/velocity-lab/model/`(README).
- **촬영**: 폰이 던지는 사람 바로 뒤(손이 렌즈 앞 0.5m — 옛 안내 '투수 뒤 1m 안'을 따름)라 머리 · 글러브 · 팔이 화면을 덮고 공이 4~5m 에서야 보였다.
  공이 시선 방향으로만 가 속력이 흔들렸다(표준오차 7 · 12% → −17 · −14%). 안내를 1.5~2m 로(가장 잘 잰 09-28 · 10-03 은 2~2.5m).
- **화질**: 1/2000 에 ISO 3,000~4,500 — 잡음 지우기가 공을 뭉갰다. ISO 1600 넘게 2초면 1/1000 · 1/500 으로 푼다(`DualCameraCore.swift`, 굽기).
- **실내 천장 조명이면 공이 위(밝음) · 가운데(배경과 같음) · 아래(어두움) 셋으로 갈린다** — 밝은 위만 덩어리라 지름이 반쯤. 속력은 중심의 원근 모임으로
  내서(중심 치우침은 3차원 고정 이동이라 속력에 안 듦) 큰 탈은 없다. 양쪽(밝음 · 어두움)을 다 세는 지름은 해 보고 안 넣음(날마다 공 크기 거리 비율이 안 바뀜).
- **엔진 2.7.7**: 속력 표준오차 3% 넘음 → '낮음'(speed-unsure) · 'end' 끝 덩어리가 D 공의 1.3배 넘음 → '낮음'(end-early) · 보정 비율은 줄자 세션이고 공 크기 거리가
  줄자와 5% 안인 공만 짝으로(아침 20m 기본 세션이 실제 21.4m 라 비율 1.065 가 밤 줄자 세션까지 올림) · 줄자 칸 '폰에서 받는 곳까지'(18m 세션 공 크기가 모두 19.5m).
- **엔진 2.7.8**: 투수 뒤에서 공이 4.2m 넘어서야 처음 잡히면 '낮음'(late-start) — 녹화에서 4.6m 에서 잡힌 공이 158 '높음'. 스피드건 짝은 그대로(그런 공은 이미 낮음).
- **녹화 21개를 공 감지 모델로 훑어 진짜 투구 27구를 골라 맞대니 앱 알림이 없던 것은 2구** — 알아채기는 거의 된다. 못 잰 16구: 확신 낮음(속력 흔들림 · 끝 일찍 ·
  공 크기) · 공 길 못 찾음(손 떠난 공이 화면 가장자리에서 옆으로 빠르게 · 몸 앞). 앞서 '크기 불일치가 많다'고 본 것은 실험에 화각을 32.1°(카메라 앱 파일)로 넣은
  탓이었다 — 앱 카메라는 38.33°.
- **해 보고 안 넣은 것**: ① 씨앗 문턱 1.5r → 3.5r(옆으로 빠른 공) — 짝 30 → 28 · MAE 4.15 → 4.43 ② 번진 공도 씨앗 — 지름이 흔들려 164km/h ③ 공 감지 모델 공 길을
  엔진에 넣기(모델이 자리, 지름은 엔진) — 같은 공이면 값이 같고 갈리는 공은 반반, 살린 공(09-28 1배 파일)은 +8 ~ +25% ④ 공 감지 모델 2판 학습 — 알아채기가 거의
  되므로 미룸(학습 코드 · 자료 만드는 도구는 준비됨).
- 남은 큰 일(새 촬영이 있어야): 소리로 받는 순간 잡기(지금 앱 클립에 소리 없음) · 4K60 · 1080p240 견주기 · 앱 안 원본 장면에서 모델(CoreML).
- **10-22 씨앗 · 끝 판정 고치기 해 봄(둘 다 안 넣음)**: 씨앗 셋(문턱 3.5r · 번진 공 · 실내 반달 공)은 녹화 27구에서 '높음'을 못 늘림. 끝을 일찍 잡은 공(endSizeRatio > 1.3)을
  끊긴 순간의 공 크기 거리로 다시 셈하면 반은 ±3% 안(L076 · L101 · L068 · L066), 반은 +12 ~ +16%(L178 · L069 · L071 둘) — 미리 가를 단서가 없어 '측정 불가 + 까닭' 그대로.
  L178 은 공이 미트 앞에서 화면 앞쪽의 흐릿한 기둥(가까운 그물대) 뒤로 가려졌다. 지금 자료로 엔진이 더 나아질 곳은 거의 다 봤다 — 다음은 새 촬영(줄자 거리 · 1.5~2m 뒤 ·
  손 떠나는 자리가 화면 가운데 쪽 · 받는 곳 앞이 가리지 않게)으로 다시 재 본다.
- **10-22 마지막 검토 — 엔진 2.7.9**: 측정 불가로 빠진 스피드건 짝 공을 까닭별로, 묶음 거리(그 공을 뺀 높음 공들의 '맞는 거리' 가운데)를 맞춘 뒤 오차를 셌다.
  이어 찾은 공(extended) 9구가 가운데 2.3% · 최대 6.6% 로 '높음'(2.2% · 17%)과 같아, 이어 찾기만으로 '낮음'에 두던 것(엔진 2.0 첫 판의 조심용 기본값)을 뺐다 —
  기록 30 → 38/62, 09-28 · 10-08 2 → 11/18, 녹화 27구 높음 그대로. end-unseen · size-mismatch 는 기준 거리(20m)가 틀린 탓(2배 앱 영상은 실제 거리로 −4 ~ +0.5%) —
  줄자 거리를 넣으면 기록된다. 남은 못 잼 8구는 씨앗 실패(고치기 셋 시험, 안전한 것 없음).
- **10-22 엔진 2.8.0 — 줄자 없이 공마다 공 크기로 거리**(김민: "공을 던질 때마다 거리를 재면서 던지는 사람은 없어 · SmartScout 처럼 간편하지만 정확하게"). 앱의 거리 고르기
  '자동'(옛 '18~22m')이면 공마다 공 크기로 거리를 어림하고, 화각을 모르는 폰은 엔진이 기준 20m + 세션 보정으로 잰다. 앱 카메라 스피드건 짝 43구를 앱 규칙 그대로:
  평균 오차 5.8 → 3.0km/h · 90% 10.2 → 6.2km/h(기록 25 → 22). 덩어리 배율은 영상 출처를 따른다(앱 카메라 1.129 · 10-03 카메라 앱 파일 1.163 — 지름은 어느 묶음이나
  13~15px). 캐치볼은 받는 자리가 공마다 달라 세션 거리로 옮기는 문턱을 5% 로 줄였다. 남은 큰 것은 16m 자리 빠른 공 둘(L130 −8% · L178 +9%) — 공 크기가 12px 안팎이라 1px 이 8%. 첫 공은 이 흩어짐이 그대로고, 같은 세션에
  공이 셋 넘으면 9% 넘게 튀는 공을 거른다(sizeOutlier). 다른 기종은 화각(손떨림 보정이 자르는 몫)을 재야 자동이 켜진다 — `scripts/velocity-lab/fov-crop.mjs`.
