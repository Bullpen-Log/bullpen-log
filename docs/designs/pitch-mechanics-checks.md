# 3D 투구 분석에 메커니즘 점검 넣기 — 드리프트 · 착지 골반 수평 · 최대 분리 시점 · 리드레그 블록

2026-10-13 김민(사용자): "메커니즘 분석에서 중요하게 생각하는 넷 — 드리프트 · 골반이 수평으로 착지하나 · 최대 상하체 분리가 언제 나오나 ·
리드레그 블록. 드라이브라인 · 트레드 자료로 정리하고, 우리 분석에서 잘 나오는지 확인하고, 안 되면 우리 메커니즘 드릴과 잇는다."
맥북 세션에서 조사 · 정확도 확인까지 하고 데스크톱에서 잇는다(HANDOFF).

화면 글에는 두 코칭 기관 이름을 쓰지 않는다(2026-10-09 규칙). 이 문서 · 코드 주석의 근거로는 괜찮다.

## 1. 공개 자료 정리

| 항목 | 무엇 | 좋은 쪽 | 출처 |
| --- | --- | --- | --- |
| 드리프트 | 다리를 드는 동안 무게중심이 투구판에서 앞으로 나감(밀기가 아니라 옮기기). 균형점이 투구판 앞 15~20cm | 니업 때 이미 앞에 있음 — 니업에서 멈춰 버틸 수 있으면 드리프트가 없는 것. 너무 많거나 이르면 뒤 타이밍이 깨짐 | Tread "The Drift" |
| 착지 골반 수평 | 착지 때 골반 좌우(옆) 기울기 | 두 곳 모두 이 주제를 직접 다룬 글을 못 찾음. 드라이브라인 경기 생체역학 글은 내딛는 동안 골반 옆 기울기가 준 것을 뒷다리 싣기가 약한 신호로 봄. 숫자 기준 없음 | Driveline in-game biomechanics |
| 최대 분리 시점 | 골반 열림 − 어깨 열림이 가장 큰 때 | 착지 무렵 · 직후. 드라이브라인 기준은 골반 → 몸통 최고 회전 속도 사이 0.05초 이상(각속도 — 우리는 아직 못 잼) | Driveline assessments, Tread arm slot |
| 리드레그 블록 | 착지 뒤 앞다리가 버텨 몸(무게중심 · 골반)의 앞 움직임을 멈추고 회전으로 넘김 | 착지 → 릴리스 무릎 펴짐(상관 0.27) · 무게중심 감속(0.20)이 따로따로 구속과 관계. 착지 자세 · 골반 회전량은 관계 약함. 땅 미는 힘은 방향보다 크기 | Driveline lead leg block(2022), Efficient front leg(2015) |

### 블록에 대한 김민의 질문 — "무릎을 굽힌 채 잘 던지는 투수도 있다, 핵심은 골반이 계속 나가는 걸 막는 것 아닌가"
대체로 맞다. 근거:
- 무게중심 감속이 무릎 펴짐과 따로 구속과 관계(Driveline 2022).
- Dowling 2024(100명): 프로 많이 편 쪽 39.8 · 덜 편 쪽 39.3m/s(거의 같음), 고교 많이 편 쪽 34.1 · 계속 굽어 들어간 쪽 31.2m/s.
- 무릎을 굽힌 채 릴리스하는 방식(일본식)도 소개된다(Frontiers 2021).
- 단서: 나쁜 신호는 '안 펴짐'이 아니라 '착지보다 릴리스 때 더 굽어 들어가며(주저앉음) 골반도 계속 감'. 드라이브라인: 더 굽어 들어가는
  투수가 고칠 여지가 가장 크고, 펴짐이 아주 적은 쪽에서 구속이 급히 떨어진다(비선형).
→ **블록 판정의 주 지표 = 골반 앞 속도가 착지 → 릴리스에 줄어든 몫, 무릎은 보조(주저앉음만).** '부족'은 골반이 덜 멈추고 무릎도 무너질 때만.

## 2. 우리 엔진으로 잴 수 있나 — 마커 정답지 15구(투구 2~16), 엔진(옆 · 뒤 두 대) vs 정답

스크립트(맥북 세션 폴더 `~/bullpen-marker-lab/2026-10-12` 에서 `../.venv/bin/python <저장소>/scripts/pitch-lab/markers/selfcal/…`):
`mech_checks.py`(네 가지) · `sep_timing.py`(분리 시점 투구별) · `metric_score.py`(기존 지표 11개). 정답 = 네 대 교차(K4), 골반 수평은 골반 스티커
짝(PSIS · ASIS)도. 엔진 순간(니업 · 착지 · 릴리스)을 둘 다에 씀 — 순간 찾기 자체의 오차는 안 잰 것.

| 항목 | 계산 | 오차(가운데) | 상관 | 판정 |
| --- | --- | --- | --- | --- |
| 드리프트 | 니업 때 골반 가운데가 축발 발목보다 앞(cm) | 0.7cm | 0.95 | ✅ |
| 드리프트 | 준비 → 니업 앞으로 간 거리(cm) | 0.9cm | 0.98 | ✅ |
| 드리프트 | 니업 때 앞으로 가는 속도(m/s) | 0.05 | 0.85 | ✅ |
| 골반 수평 | 착지 때 엉덩이선 기울기 vs K4 | 1.2° | 0.66 | 🟡 |
| 골반 수평 | 착지 근처 엉덩이선 vs 골반 스티커 짝(8구) | 4.5°, 치우침 −3.9° | 0.43 | ❌ |
| 최대 분리 시점 | 니업~릴리스 중 최대의 착지 기준 ms vs K4 | 36ms(최대 672 — p12 다리 들 때 평평) | 0.87 | 🟡 구간을 착지 앞뒤로 좁히면 |
| 최대 분리 시점 | vs 스티커 정답 | 스티커 정답이 니업~릴리스의 12% 장면뿐 — 비교 못 함 | | |
| 블록 | 릴리스 때 앞무릎 굽힘 | 1.6° | 0.90 | ✅ |
| 블록 | 착지 → 릴리스 펴진 만큼 | 5.0°, 치우침 −5.6°(덜 펴지게) | 0.82 | 🟡 치우침 빼고 |
| 블록 | 착지 뒤 더 굽은 만큼 | 7.1°, 치우침 +7.2° | 0.77 | 🟡 |
| 블록 | 착지 때 앞무릎 | 6.6°, 치우침 −5.4° | 0.78 | 🟡 |
| 블록 | 골반 앞 속도 줄어든 몫(착지 전 최고 → 릴리스) | 9.8%p, 치우침 −7.5 | 0.81 | 🟡 |

기존 지표(같은 15구, `metric_score.py`): 보폭 1.1%키 · 디딤 방향 1.0% · 몸통 기울기 0.9~2.4° 는 ✅, 릴리스 분리 12.9° · 팔꿈치 6.8°(상관 0.42) ❌,
어깨 외회전은 팔 가속 손목 오차(상위 10% 17.6cm)로 못 잼, 골반 → 몸통 회전 속도 순서는 팔 가속 골반 오차 18~29° 로 못 잼.

주의: 투수 한 명 · 하루 · 네 대 보정이 된 좋은 조건. 화면 녹화 · 작게 찍힌 영상(실험실 샘플 1 · 10)은 더 나쁘다. 정답(K4)이 엔진과 같은
2D(RTMW)라 2D 버릇은 안 잡힌다. 한 구보다 3구 이상 평균으로.

마커 투수 참고(정답 기준): 니업 때 골반이 축발보다 14.8cm 앞(드리프트 있음) · 착지 뒤 앞무릎 11° 더 굽음(주저앉음) · 그래도 골반 앞 속도는
릴리스까지 97% 줄어듦 → 새 기준이면 블록 '괜찮음'. 전력 투구였는지는 모름.

## 3. 다음에 할 것(데스크톱)

1. **분리 시점 고치기** — 최대를 찾는 구간을 착지 앞뒤(예: 착지 −150ms ~ 릴리스)로 좁혀 p12 같은 다리 들 때 평평한 경우를 막고, 다시 `sep_timing.py`.
   가능하면 '최대'보다 덜 흔들리는 값(최대의 90% 에 처음 닿는 때)도 견줘 본다.
2. **점검 넷의 순수 계산** — `lib/pitch-3d/` 에(엔진 결과 joints · events → 드리프트 cm · 골반 수평 ° · 분리 시점 ms · 블록 골반 감속 % + 무릎 주저앉음 °).
   치우침(무릎 펴짐 −5.6° 등)은 마커로 잰 값으로 보정할지 결정. 시험(`pitch3d:v2-test`)에 합성 투수로.
3. **판정 기준** — 공개 자료에 숫자가 있는 것만 문턱으로(드리프트 15~20cm 앞, 분리 0.05초 · 착지 무렵), 없는 것(골반 수평)은 아직 화면에 안 냄.
   '부족'은 기준에서 벗어난 정도가 오차의 2배를 넘을 때만. 3구 평균.
4. **드릴 잇기** — `MechanicsGuide.focusPoints` 꼬리표가 이미 있다(`lib/exercise-meta.ts` FOCUS_POINTS): 드리프트 → '드리프트', 블록 → '브레이크',
   분리 시점 → '상하체 분리', 골반 수평 → '드롭'(뒷다리 싣기). 결과 화면 '개선할 점' 카드에서 그 꼬리표 드릴(쉬운 단계부터, `stage`)로.
   요소 설명 글은 `lib/mechanics/elements.ts`(두 곳 출처만 쓰는 규칙).
5. 두 번째 마커 촬영 때 골반 앞 스티커가 착지 ~ 릴리스에 보이게(골반 수평 · 분리 시점 정답이 지금 거의 없다).

맥북에서 못 한 것: 요소별 드릴 수 세기(DB 조회가 응답 없어 끊음 — 데스크톱에서 다시).

## 출처
- Tread · The "Drift": https://treadathletics.com/the-drift/
- Tread · "Using Your Legs": https://treadathletics.com/energy-flow/
- Tread · Arm slot differences: https://treadathletics.com/arm-slot-differences/
- Driveline · A Quantitative Analysis of the Lead Leg Block: https://drivelinebaseball.com/blogs/blog/a-quantitative-analysis-of-the-lead-leg-block-and-its-contributions-to-velocity
- Driveline · Efficient Front Leg Mechanics: https://drivelinebaseball.com/blogs/blog/efficient-front-leg-mechanics-that-lead-to-high-velocity
- Driveline · Pitching Assessments and Changing Mechanics: https://drivelinebaseball.com/blogs/blog/pitching-assessments-changing-mechanics
- Driveline · In-game biomechanics: https://drivelinebaseball.com/blogs/blog/breaking-new-ground-how-major-league-teams-are-leveraging-in-game-biomechanics-data
- Velo University · Lead knee extension isn't universal(Dowling 2024 요약): https://www.velouniversity.com/post/lead-knee-extension-isnt-universal-why-structure-and-readiness-matter-more-than-the-pattern
- Frontiers 2021 · 미국식 · 일본식 앞다리: https://www.frontiersin.org/articles/10.3389/fspor.2021.670395/full
