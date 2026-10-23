# 공 감지 학습 모델(구속 엔진 2.7 계획 5단계)

SmartScout · PitchLab 처럼 **학습한 모델로 공을 찾는다.** 지금 엔진은 밝기 차 덩어리로 공을 찾아(detect.ts) 그물코 · 흰 기둥 · 몸에 잘 속고, 앱의
공 알림(MotionTrigger)도 같은 셈이라 10-16 현장에서 공을 거의 못 알아챘다. 계획 · 결정은 `docs/velocity/engine-2.7-plan.md`.

1판(2026-10-16): 지금 자료(스피드건 짝 2배 줌 클립)만으로 '되는지'를 본다. 라벨은 엔진이 믿은 공 자리(자동), 학습은 Modal GPU(이 PC 엔 GPU 가 없다).
폰(CoreML) · 사이트(onnxruntime-web)에 넣는 것은 1판 결과를 보고 — Swift 는 맥 빌드가 필요하다.

## 흐름

```
~/bullpen-velocity-lab/<날짜>/…(스피드건 짝 클립 · 녹화 컷)
  │ node services/velocity-detector/build-dataset.mjs        엔진으로 재서 공 자리 → 라벨, 장면 JPEG(긴 변 960, 공 앞 0.6초 ~ 끝 뒤 0.4초)
  ▼
~/bullpen-velocity-lab/detector-v1/{images/<클립>/NNN.jpg, labels.json}
  │ modal volume put bullpen-ball-detector-data ~/bullpen-velocity-lab/detector-v1 /detector-v1
  │ modal run services/velocity-detector/train.py            T4 · 30 epoch · 15분쯤 · 클립 20% 떼어 평가
  ▼
볼륨 /out/v1/{model.pt, model.onnx, eval.json}               modal volume get bullpen-ball-detector-data /out/v1 <폴더>
```

- 자료는 저장소 밖(`~/bullpen-velocity-lab`, 1GB 넘음). 깃에는 스크립트만.
- 모양: MobileNetV3-small 앞 넷 조각(걸음 8, ImageNet 무게) + 작은 머리 → 걸음 4 열지도(공 중심) · 지름. 입력은 연속 세 장면의 밝기(t−2 · t−1 · t)를
  세 채널로 — 움직이는 것만 '색'을 띠어 그물코 · 기둥과 갈린다. 매개변수 10만 남짓(폰 실시간 가능한 크기).
- 평가: 떼어 둔 클립의 장면마다 가장 센 봉우리 하나. 공 장면은 라벨 지름(바닥 6px) 안이면 맞음(재현율), 공 없는 장면은 문턱을 넘으면 헛 알림.
  크기 구간(지름 <8 · 8~15 · 15+ px)별 재현율도.
- 라벨의 한계: 엔진이 잰 클립만(엔진이 못 잰 클립 — 진짜 어려운 장면 — 은 1판에 없다). 2판은 세션 녹화(2.7.0)가 모은 영상에서 사람이 라벨.

## 사이트에 붙인 것(2026-10-16, 엔진 2.7.1)

`modal run train.py::export_onnx` 가 만드는 크기 자유 ONNX(`/out/v1/model-dyn.onnx`)를 `public/velocity-detector/ball-v1.onnx` 로 복사해 두었다.
`lib/velocity-engine/ball-net.ts` 가 onnxruntime-web(WASM, jsDelivr 판 고정)으로 돌리고, 조용할 때 훑기(`analyze-video.ts locateThrow`)가 이것으로 날아간 공을
찾는다(긴 변 736 · 0.2초마다 세 장면 · 데스크톱 59ms/장면). 모델을 새로 학습하면 ONNX 를 다시 내보내 같은 자리에 덮고 `ball-net.ts` 머리말의 수치를 고친다.

## 2판 자료 — 사람이 찍은 공 자리(2026-10-16)

1판 라벨은 '엔진이 이미 잰 클립'뿐이라 진짜 어려운 장면(엔진이 못 잰 클립 · 실내 · 흔들림)이 자료에 없다. 2판은 관리자가 직접 찍는다.

```
관리자 구속 측정 › 엔진 개발용 녹화 › 녹화 편집기 › 공마다 [공 자리 찍기]      (측정 클립은 관리자 탐색기 › 공 미리보기 › [공 자리 찍기])
  장면을 하나씩 넘기며 공 가운데 → 가장자리를 눌러 저장 → 서버 VelocityBallLabel(컷 · 클립마다 한 줄, 장면 시각 t · 공 [x, y, 지름] 원본 px)
  │ node --env-file=.env services/velocity-detector/pull-labels.mjs      영상을 받아 디코더로 장면 JPEG(긴 변 960) + labels.json(1판과 같은 꼴)
  ▼
~/bullpen-velocity-lab/detector-v2/{videos/, images/<클립>/NNN.jpg, labels.json}
  │ modal volume put bullpen-ball-detector-data ~/bullpen-velocity-lab/detector-v2 /detector-v2
  │ modal run services/velocity-detector/train.py --dataset detector-v2 [--tag v2]
```

- 찍는 화면 `app/(app)/admin/velocity/ball-labeler.tsx`: ←/→ 장면, 가운데 누르고 가장자리 한 번 더(또는 끌기), 가운데만 찍고 넘기면 지난 지름, N 공 없음, S 저장.
  한 컷에 10~15 장면이면 된다. 공 없는 장면도 찍어 두면(N) 헛 알림 자료가 된다.
- 모델 입력이 연속 세 장면이라 장면이 이어져야 한다 — pull-labels 가 안 찍은 장면(3장 안, 양쪽이 공)은 선으로 이어 채우고, 더 긴 빈틈에서는 클립을 가른다.
  클립 앞의 두 장면은 안 찍은 것(ball null)인데 train.py 가 i ≥ 2 만 표본으로 쓰니 상관없다.
- 1판 · 2판 자료를 합쳐 학습하려면 두 labels.json 의 clips 를 이어 붙인 폴더를 하나 더 만들면 된다(images 는 클립 id 가 달라 겹치지 않는다).

## 3판 자료 — 스피드건으로 되짚은 진짜 지름(2026-10-22)

1 · 2판 지름 라벨은 엔진 덩어리라 진짜보다 1.08~1.18배 부풀었다. 3판은 스피드건 짝의 궤적을 스피드건 값으로 되짚어 장면마다 진짜 지름을 만든다
(`build-truth-dataset.mjs` → `align-truth.py` → `train.py --test-groups … --max-engine-err 0.08` → `truth-eval.mjs`). 결과 · 명령은
`docs/velocity/size-model-2026-10-22.md`. 아직 앱 · 사이트에는 안 붙였다.

## 비용

T4 시간당 약 0.6달러 — 1판 학습 한 번 15분 = 150원쯤. 자료 올리기 · 보관은 무료 한도 안.
