# 공 감지 모델로 녹화 훑기 — 정답 표 · 라벨 · 알림 맞대기(2026-10-22)

녹화(세션 녹화 · 기기 현장 기록 · 클립)에 공 감지 모델을 장면마다 돌려 실제로 던진 투구를 찾고, 장면마다 공 자리를 라벨로 만들고, 앱 시도(알림 ·
측정 결과)와 맞댄다. 맥(M1)에서 돈다. 자료는 저장소 밖 `~/bullpen-velocity-lab`, 파이썬은 거기의 `.venv`(onnxruntime · av · pillow · numpy · scipy).

```bash
cd ~/bullpen-velocity-lab
python3 -m venv .venv && .venv/bin/pip install onnxruntime av pillow numpy scipy modal   # 처음 한 번
T=~/Developer/bullpen-log/scripts/velocity-lab/model

# 1) 녹화 받기(저장소에서) · 시도 맞추기(녹화마다 attempts.json)
node --env-file=.env scripts/velocity-lab/download-recording.mjs --id=<녹화 id>
node --env-file=.env scripts/velocity-lab/model/recatt.mjs

# 2) 장면마다 모델(긴 변 960, 장면당 20ms — 녹화 30분이면 넷으로 나눠 1시간 남짓)
.venv/bin/python $T/scan.py --model ~/Developer/bullpen-log/public/velocity-detector/ball-v1.onnx --out scan/rec.jsonl rec-*/p*.mp4

# 3) 공 길 → 투구 후보 · 앱 시도 맞대기(후보에는 헛것 — 흰 양말 · 신발 · 손가락 — 이 섞인다. 4 의 그림으로 확인)
.venv/bin/python $T/throws.py --out scan/throws.json scan/rec.jsonl
.venv/bin/python $T/recall.py scan/throws.json

# 4) 라벨(모델 점을 원본 해상도 덩어리로 다듬고, 손 떠난 쪽 · 받는 쪽으로 원근 궤적을 따라 늘림) · 확인 그림(12개씩 한 쪽)
.venv/bin/python $T/refine.py --kinds throw,return --throws scan/throws.json --out scan/labels.json --sheet sheets/rec
.venv/bin/python $T/pages.py sheets/rec

# 4-1) 확인한 투구(scan/verified-rec.json — {ok: [라벨 번호]})를 엔진(또는 --engine=복사본)으로 앱과 같은 조건으로 다시 재기
node scripts/velocity-lab/model/rec27.mjs [--engine=<복사본>] --json=<결과>

# 5) 학습 자료 2판(train.py 꼴, --test 에 든 세션은 시험용으로 통째 뗌)
.venv/bin/python $T/build_v2.py --labels scan/labels.json --out detector-v2 --test <녹화 id,…>
```

- 영상의 회전 표시(아이폰 세로 −90°)를 돌려 브라우저 · 학습과 같은 방향으로 본다. 라벨 시각은 장면이 시작한 시각(컨테이너), 엔진의 장면 시각은
  한가운데라 반 장 뒤다.
- **실내 천장 조명이면 공이 위(밝음) · 가운데(배경과 같음) · 아래(어두움) 셋으로 갈린다** — 밝은 위쪽만 덩어리로 잡으면 지름이 반쯤이다.
  refine 은 반대 극성 조각을 한 공으로 합친다.
- **앱 카메라 녹화의 화각은 38.33°**(2배 · 손떨림 보정, 15 Pro Max) — 카메라 앱 파일 기준 32.1° 로 재면 공 크기 거리가 1.2배 크게 나와 '크기 불일치'가 생긴다.
- 10-21 결과: 진짜 투구 27구(헛것을 그림으로 거름) 중 앱 알림이 없던 것 2구 — 알아채기는 거의 되고, 못 잰 까닭은 측정이었다(엔진 2.7.8).
- 10-22 씨앗 고치기 시험(넣지 않음): ① 씨앗 문턱 1.5r → 3.5r ② 번진 공도 씨앗 ③ 실내 위 밝음 · 아래 어두움 반달을 둥근 공으로 받고 지름은 가로 폭 — 셋 다
  녹화 27구에서 '높음'이 늘지 않고(못 재던 공은 낮음 · 틀린 값으로만 잡힘) 잘 재던 공을 망가뜨리거나 스피드건 짝 MAE 가 나빠졌다. 그날 놓친 공은
  폰이 던지는 사람 바로 뒤라 공이 시선 방향으로만 가서 궤적이 속력을 못 정하는 것이 바탕이다 — 엔진보다 촬영 자리(1.5~2m 뒤)로 푼다.
