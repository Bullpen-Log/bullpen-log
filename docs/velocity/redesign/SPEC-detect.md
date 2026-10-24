# Spec: `detect` — 던짐 · 공 찾기

능력 지도 `map.md` 의 둘째 모듈(`capture` 와 나란히). 근거는 시험대 진단 `bench-findings.md` 5절, 설계안 `DESIGN.md` 4-3.

## Objective

**던진 공을 빠짐없이, 던진 직후에 알아채고, `speed` 에 장면마다 공 자리를 넘긴다.** PitchLab 처럼 폰 안의 학습 모델로.

지금(10-23 세션 녹화 19구, `node scripts/velocity-bench/detect.mjs`):

| 무엇 | 찾음 | 헛 알림(분당) | 결과까지 |
| --- | --- | --- | --- |
| 폰 공 알림(스위프트 휴리스틱 `MotionTrigger`) | 0/19 | 4.3 | — |
| 앱 실제(훑기 5초마다 · 헛 알림 뒤 4초 쉼) | 10/19 | 1.4 | 5~10초(훑기 창 5초 + 다시 재기 2~4.6초, 10-23 시도 기록) |
| 학습 모델 훑기(ball-v1, 창마다 빠짐없이) | 16/19 | 0.7 | — |

목표(확인용 묶음 — 10-23 + 앞으로의 현장):

| 잼 | 목표 |
| --- | --- |
| 던짐 알림 재현율 | 95% 이상(10-23 이면 18/19 이상) |
| 헛 알림(재기까지 가는 것) | 분당 1번 밑 |
| 알림 지연(손 떠난 때 → 알림) | 가운데 0.5초 · 90% 1초 안 |
| 공 길 장면 재현율(클립 안) | 90% 이상, 중심 차 1px(분석 px) 안 — `speed` 용 |
| 폰 부담 | 1080p60 녹화와 함께 30분: 열 상태 serious 밑 · 장면 버림 0 |

전체 1판 목표(결과 3초 안)의 시간 몫: 알림 0.5초 + 공이 받는 면에 닿을 때까지 클립 0.6초 + 재기 1.5초(`speed` 몫 — 지금 2~4.6초).

## 두 단계

1. **알림(폰 안 · 늘 켬)** — 카메라 장면 둘에 하나(30Hz)를 긴 변 736 으로 줄여 CoreML 공 모델에 넣는다(사이트 훑기 `locateThrow` 와 같은 입력 — 연속 세 장면 밝기). 공 후보가
   0.15초 안에 3번 넘게, 받는 면 쪽으로 가며 작아지는 길이면 `ball` 알림(처음 본 시각 · 확신 · 상자). `MotionTrigger` 를 대신한다.
   웹뷰 훑기는 알림이 조용할 때의 비상용으로 남기되 '헛 알림 뒤 4초 쉼'은 뺀다.
2. **클립 안 공 길** — 처음엔 지금 엔진의 공 찾기(밝기 덩어리)에 모델 알림을 씨앗으로 준다. 다음 판에서 모델 상자로 장면마다 공 자리를 낸다(`speed` 스펙과 같이).
   손 떠난 때는 손 감지 모델(라벨이 쌓인 뒤) — 그 전에는 공이 처음 보인 장면을 앞으로 늘인 때(지금 그대로).

## 경계(입출력)

```ts
/* 알림 — native/modules/dual-camera 의 ThrowEvent 를 넓힌다(kind 'ball' 은 그대로, via · conf · box 를 더함) */
type ThrowEvent = { kind: 'ball' | 'motion' | 'seed' | 'end'; atSec: number; via?: 'net' | 'heuristic'; conf?: number; box?: [cx: number, cy: number, d: number] };
/* 클립 안 공 길(2단계) */
type BallTrack = { t: number; cx: number; cy: number; d: number; conf: number }[];
```

## 모델

- 틀은 지금 공 감지(MobileNetV3-small 앞 넷 조각 + 작은 머리, 매개변수 10만 남짓, 연속 세 장면 밝기 → 열지도 · 지름). Ultralytics(AGPL)는 안 쓴다.
- 4판을 배운다: 지금 라벨(1 · 3판 — 엔진 · 스피드건으로 되짚음) + 세션 녹화 컷. **확인용 날짜(10-23 · 10-21 줄자)는 배우는 자료에 넣지 않는다.**
- 내보내기: PyTorch → CoreML(coremltools, mlprogram · fp16), 입력 고정 414×736(세로). 맥 시험대가 같은 `.mlpackage` 를 돌린다.

## Commands

```
npm run velocity:bench:detect                                     # 시험대 공 찾기(10-23) — '모델 알림' 칸이 더해진다
scripts/velocity-lab/ball-trigger/run.sh --concat --net=<.mlpackage> <영상@시각>…   # 맥에서 앱과 같은 스위프트 · 같은 모델로
modal run services/velocity-detector/train.py --dataset <폴더> --test-groups 2026-10-23,2026-10-21 --tag v4
~/bullpen-velocity-lab/.venv/bin/python services/velocity-detector/export_coreml.py --model <model.pt> --out <BallNet.mlpackage>
```

## Project Structure

```
native/modules/dual-camera/ios/DualCameraCore.swift   BallNetTrigger(BALL_TRIGGER 표시 사이 — 시험대가 떼어 감) · 알림 연결 · 설정 스위치
native/modules/dual-camera/ios/BallNet.mlpackage      모델(앱 안, 1MB 밑)
native/src/velocity/capture.ts                        알림 받기 · 훑기 규칙(쉼 빼기)
services/velocity-detector/export_coreml.py           내보내기
scripts/velocity-lab/ball-trigger/main.swift          --net (맥 시험대)
scripts/velocity-bench/detect.mjs                     문 — '모델 알림' 칸
```

## 단계(단계마다 시험대가 문)

| 단계 | 무엇 | 폰 필요 | 시간(Claude) |
| --- | --- | --- | --- |
| D1 | **끝(10-23)** CoreML 내보내기(`train.py::export_coreml`, 110KB) + 맥 시험대 `--net`(`ballnet.swift`) + detect.mjs 칸 — **19/19 · 헛 0.8/분 · 지연 0.08초** | 아니요 | 3~5시간 |
| D2 | 4판 모델(라벨 더함 · 확인용 뺌) — D1 숫자가 목표 밑일 때 → **미룸**(D1 통과) | 아니요 | 2~4시간 + Modal |
| D3 | 앱에 넣기 — **코드 끝(10-23)**: `DualCameraCore.swift` 의 `BALL_NET` 구간(`BallNetTrigger`, vImage 줄이기 · CoreML) · 앱 안 `BallNet.mlmodelc`(podspec resources) · 알림 'net' 은 **그림자**(capture.ts 가 시도 기록에만 — `kind 'net'`, why `net-shadow`) · 통계 `netMs`. 맥 시험대가 같은 구간을 떼어 씀. **10-24 김민 폰의 원래 앱(`com.bullpenlog.app`)에 정식 판으로 직접 깔음**(TestFlight 새 판이 오면 바뀜). 폰 확인: 맥에 연결해 `xcrun devicectl device process launch --console --terminate-existing --device <폰> com.bullpenlog.app -netLog YES` → `[net]` 줄(1초 통계 · 알림). 남은 것: 열 · 장면 버림 · 실제 알림 | 예(김민 폰) | 3~4시간 + 굽기 |
| D4 | **화면 코드 끝(10-24)**: `capture.ts` 가 모델 알림('net')을 'ball' 처럼 재고, 모델이 도는 동안(카메라 통계 netMs > 0, 3초 안) 옛 알림(ball · seed · motion · skip)은 버린다 — 헛 알림이 훑기를 쉬게 하지도 않는다. 모델 없는 앱 판 · 모델 못 읽은 폰은 옛 알림 그대로. 스위프트 MotionTrigger 걷기(장면당 계산 줄이기)는 다음 굽기 때. 폰 확인 아직 | 예 | 1~2시간 |
| D5 | 클립 안 공 길을 모델 상자로 · 손 감지 — `speed` 스펙과 같이 | — | 뒤에 |

## Testing Strategy

- 문: `detect.mjs` 확인용 묶음 — 재현율 · 헛 알림 · 지연(알림 시각 − 손 떠난 때). 지금 숫자(공 알림 0/19 · 앱 10/19)와 같은 표로.
- 앱과 시험대가 같은 코드: 스위프트는 BALL_TRIGGER 표시 사이를 떼어 맥에서 굽는다(지금 방식 그대로), 모델 파일도 같은 것.
- 폰: 시도 기록의 `analysis.camera`(fps · 장면 버림 · 열)로 30분 세션을 본다. 실제 현장 한 번에 세션 녹화를 같이 켜 시험대에 더한다.

## Boundaries

- Always: 확인용 날짜는 배우는 자료에 안 넣는다. 앱에 넣기 전에 시험대를 통과한다. 앱과 맥 시험대는 같은 스위프트 · 같은 모델.
- Ask first: 스위프트 · 앱 바닥 코드 변경은 폰에서 확인한 뒤 main 에(굽기 · TestFlight). 모델 파일 1MB 넘김. 카메라 형식 바꾸기.
- Never: AGPL 모델 · 코드. 시험대 없이 알림 바꾸기. 확인용 공을 보고 문턱 맞추기.

## Success Criteria

1. 맥 시험대에서 늘 켠 모델 알림이 10-23 확인용 18/19 이상 · 헛 알림 분당 1 밑 · 지연 가운데 0.5초.
2. 같은 모델 · 같은 스위프트가 폰에서 30분 동안 열 serious 밑 · 장면 버림 0.
3. 현장 한 번에서 앱 시도 기록이 던진 공의 95% 이상을 덮는다(세션 녹화로 셈).

## Open Questions

1. ~~임시 고침(웹 훑기만)~~ → 보류(10-23). 흉내로 9 → 13.6~15.3 이지만 폰 열을 더 내고 움직임 알림이 찾던 공(10-21)을 잃는다 — `bench-findings.md` 5절.
2. D3 폰 시험은 김민 폰(15 Pro Max)으로 — 다른 기종이 있으면 열 시험에 같이.
