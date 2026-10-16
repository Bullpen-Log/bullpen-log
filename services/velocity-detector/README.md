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

## 비용

T4 시간당 약 0.6달러 — 1판 학습 한 번 15분 = 150원쯤. 자료 올리기 · 보관은 무료 한도 안.
