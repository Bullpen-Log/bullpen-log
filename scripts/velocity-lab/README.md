# 구속 측정 실험실 (scripts/velocity-lab)

올려 둔 영상을 엔진으로 다시 재 보는 도구다 — 엔진을 고칠 때 "이 영상들이 몇 개 재지고 스피드건과 얼마나 다른가"를 본다.
헤드리스 크롬에 저장소 엔진(`lib/velocity-engine`)을 그대로 올려 재므로 앱의 '다시 재기'와 값이 같다. 개발 서버 · 임시 경로가
필요 없고, **DB 에는 아무것도 쓰지 않는다**(내려받기는 읽기만).

작업 폴더는 저장소 밖 `~/bullpen-velocity-lab`(환경변수 `VELOCITY_LAB` 로 바꿀 수 있다). **영상은 개인 것이다 — 저장소에 넣지 않는다.**

## 쓰는 법

```bash
# 1) 영상 받기(.env 의 DB · 저장소 키를 쓴다)
node --env-file=.env scripts/velocity-lab/download.mjs --date=2026-10-03 --manual   # 밖 13개(수기로 올린 것)
node --env-file=.env scripts/velocity-lab/download.mjs --date=2026-09-28            # 실내 보정 18개

# 2) 재기 — 저장소의 지금 엔진으로
node scripts/velocity-lab/run.mjs --date=2026-10-03
node scripts/velocity-lab/run.mjs --date=2026-09-28 --json=indoor.json

# 3) 엔진을 바꿔 보기 — 복사본을 만들어 그것만 고친다(저장소 엔진은 그대로)
cp -r lib/velocity-engine ~/bullpen-velocity-lab/eng-try
node scripts/velocity-lab/run.mjs --date=2026-10-03 --engine="$HOME/bullpen-velocity-lab/eng-try"

# 4) 장면 모아 보기 — 공이 실제로 어디를 날아가는지
node scripts/velocity-lab/sheet.mjs ~/bullpen-velocity-lab/2026-10-03/clips/132_6a345288.mov \
  --from=0.1083 --to=0.6083 --n=31 --cols=8 --w=170 --crop=0.15,0.1,0.7,0.5
```

```bash
# 5) 앱의 던짐 알아채기(공 찾기)를 영상에 — 앱 Swift 의 BALL_TRIGGER 구간을 그대로 떼어 맥에서 돌린다(V=1 이면 이은 길까지)
scripts/velocity-lab/ball-trigger/run.sh ~/bullpen-velocity-lab/2026-10-03/clips/*.mov

# 6) 폰의 현장 기록 가져오기 — 맥에서 깐 개발용 앱이 측정 중 장면을 1분 조각(30Mbps)으로 폰에 남긴다.
#    케이블 또는 같은 와이파이로 짝 맺은 아이폰에서 받아(~/bullpen-velocity-lab/device/<세션>/) 폰 알림과 5) 결과를 나란히 보인다
scripts/velocity-lab/pull-device.sh
# 7) 손떨림 보정이 화면을 자르는 몫(새 기종) — 개발용 앱을 켜고 카메라 단계에서 폰을 세워 두면(1초 멈춤) 보정 켬 · 끔 · 다시 켬을
#    찍어 Documents/lab/fov-<시각>/ 에 남긴다. 6) 으로 받은 뒤 배율을 재 DualCameraPlugin.swift 의 STAB_CROP_MEASURED 에 기종 이름으로 넣는다
node scripts/velocity-lab/fov-crop.mjs ~/bullpen-velocity-lab/device/fov-<시각>
```

맥에서 폰에 바로 깔기(개발용 빌드, 1~2분 — TestFlight 30~50분 대신):

```bash
cd mobile && xcodebuild build -project ios/App/App.xcodeproj -scheme App -configuration Debug \
  -destination 'id=<폰 UDID>' -derivedDataPath /tmp/bpl-dev DEVELOPMENT_TEAM=<팀 ID> SWIFT_OPTIMIZATION_LEVEL=-O \
  -allowProvisioningUpdates -allowProvisioningDeviceRegistration
xcrun devicectl device install app --device <폰 UDID> /tmp/bpl-dev/Build/Products/Debug-iphoneos/App.app
xcrun devicectl device process launch --device <폰 UDID> --console --terminate-existing com.bullpenlog.app   # 콘솔 [cam] 줄
```

**`SWIFT_OPTIMIZATION_LEVEL=-O` 를 꼭 붙인다** — 개발용(Debug)은 최적화 없이 구워져 공 찾기가 장면마다 수십 ms 걸리고, 카메라가 늦은
장면을 버려 초당 20장으로 찍혔다(2026-10-08, 최적화하니 60장 · 장면당 2ms). 폰을 처음 한 번 케이블로 짝 맺으면 그 뒤로는 같은
와이파이에서 깔기 · 콘솔 · 가져오기가 다 된다.

`run.mjs --debug --json=…` 는 장면마다 찾은 덩어리(`blobFrames`) · 첫 어림 궤적(`seedTrack`) · 뺀 장면 까닭(`diameter`)까지 남긴다.
더 깊이 볼 때는 `cdp.mjs` 의 `open()` 으로 쪽을 열고 `window.__m['detect']` 같은 엔진 모듈과 `window.__open()`(영상 열기 ·
`luma(t)`)을 직접 부른다.

## 함정

- **크롬을 여러 개 같이 돌리면 값이 흔들린다.** 되감기가 앞 장면을 다시 내줘 장면이 겹친다(같은 엔진인데 실내 18개 중 7개가
  다르게 나왔다). 차례로 돌리고, 줄 끝에 `겹친 장면 N` 이 찍히면 그 값은 버리고 다시 돌린다. 꼭 같이 돌려야 하면 `--port` 를 달리.
- 노드 24 가 필요하다(타입 벗기기 `stripTypeScriptTypes`). 크롬 자리가 다르면 `CHROME_PATH`.
- 0.3km/h 아래 차이는 엔진 탓으로 단정하지 않는다 — 같은 엔진 · 같은 영상도 가끔 한 장 다르게 나온다.

## 지난 기록

- `docs/velocity/outdoor-2026-10-03.md` — 밖에서 찍은 13개: 1/13 만 재지는 까닭 둘과 처방(대비 길). 1.9.0(2026-10-06)이 처방을
  넣어 13/13 — 결과 줄 끝에 `대비 close` · `대비 center` 가 찍히면 그 길로 잰 것이다(보정 짝에서 빠진다).
