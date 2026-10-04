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

`run.mjs --debug --json=…` 는 장면마다 찾은 덩어리(`blobFrames`) · 첫 어림 궤적(`seedTrack`) · 뺀 장면 까닭(`diameter`)까지 남긴다.
더 깊이 볼 때는 `cdp.mjs` 의 `open()` 으로 쪽을 열고 `window.__m['detect']` 같은 엔진 모듈과 `window.__open()`(영상 열기 ·
`luma(t)`)을 직접 부른다.

## 함정

- **크롬을 여러 개 같이 돌리면 값이 흔들린다.** 되감기가 앞 장면을 다시 내줘 장면이 겹친다(같은 엔진인데 실내 18개 중 7개가
  다르게 나왔다). 차례로 돌리고, 줄 끝에 `겹친 장면 N` 이 찍히면 그 값은 버리고 다시 돌린다. 꼭 같이 돌려야 하면 `--port` 를 달리.
- 노드 24 가 필요하다(타입 벗기기 `stripTypeScriptTypes`). 크롬 자리가 다르면 `CHROME_PATH`.
- 0.3km/h 아래 차이는 엔진 탓으로 단정하지 않는다 — 같은 엔진 · 같은 영상도 가끔 한 장 다르게 나온다.

## 지난 기록

- `docs/velocity/outdoor-2026-10-03.md` — 밖에서 찍은 13개: 1/13 만 재지는 까닭 둘과 처방(대비 길).
