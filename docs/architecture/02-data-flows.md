# 2. 카테고리별 데이터 흐름도 (초안 v0 · 2026-10-16)

굵은 화살표 = 쓰기, 가는 화살표 = 읽기. ⚠ 는 [README](README.md) 위험 번호.

## 2-0. 전체 — 누가 누구를 읽나

```mermaid
flowchart LR
  subgraph IN[입력]
    CK[체크인<br/>DailyCheckin]
    PL[투구 기록<br/>PitchLog]
    VS[구속 측정<br/>VelocitySession/Pitch]
    TR[운동 기록<br/>TrainingSession · Set · Log · Note]
    NU[영양 기록<br/>MealEntry · DailyNutrition]
    PR[프로필 · 첫 설정<br/>User]
    CARD[탭 카드<br/>DailyTrainingSetup.preferred* · DailyNutrition 답 · throwPlan]
  end
  GA[gatherFactsAndPlan<br/>lib/report/gather.ts] --> FA[facts · pitchPlan · dayState]
  CK --> GA
  PL --> GA
  TR --> GA
  CARD --> GA
  PR --> GA
  VS ==>|syncVelocitySession| PL
  FA --> DP[매일 일정 · 프로그램 · 중재]
  FA --> AC[암케어 · 재활]
  FA --> ME[메커니즘 접기]
  FA --> AS[팔 상태 armStatusOf · 투구 탭]
  FA --> HO[홈 · 분석]
  NU --> NA[영양 조언 · 가이드 · 목표]
  CK --> NA
  PL --> NA
  TR --> NA
  NA -->|loadFuelState 올림 멈춤| DP
  NA --> HO
```

## 2-1. 체크인 3판 → 엔진

```mermaid
flowchart TD
  F[체크인 흐름<br/>컨디션 1~10 · 수면의 질 1~5 · 불편한 곳 · 메모] ==>|saveCheckin upsert| C[(DailyCheckin)]
  C -->|condition · sleepQuality · 부위 다섯 · armPain| G[gather.ts]
  C -.->|soreness · sleepHours · armFatigue<br/>3판은 안 씀 ⚠1| G
  T[트레이닝 카드] ==>|saveTrainingPrefs| S[(DailyTrainingSetup.preferred*)]
  S -->|그날 체크인 줄이 있을 때만 합침 ⚠2| G
  P[투구 카드] ==>|setThrowPlan<br/>체크인 없으면 거절| C
  N[영양 카드] ==>|saveNutritionCheckin| D[(DailyNutrition 답)]
  D --> NA[영양 조언 advice-load]
  C --> NA
```

## 2-2. 투구 · 구속 · 3D

```mermaid
flowchart TD
  EF[투구 기록 폼] ==>|POST /api/pitch-log<br/>2분 같은 값 막기 findFirst→create| PL[(PitchLog)]
  RH[재활 투구] ==>|logRehabThrow 메모 꼬리표| PL
  VM[구속 측정 화면] ==>|recordVelocityAttempt| VA[(VelocityAttempt)]
  VM ==>|saveVelocitySession — 늘 새 PitchLog ⚠3| TX{{트랜잭션}}
  TX ==> PL
  TX ==> VS[(VelocitySession · VelocityPitch)]
  VS -->|공 고침 · 지움 → syncVelocitySession<br/>count · max · avg · memo 다시 씀| PL
  CAL[보정 짝 loadCalibration<br/>CALIBRATION_FAMILY · 믿음 높음] --> VM
  LAB[3D 올리기] ==>|서명 PUT| ST[(버킷 pitch-lab/id/side · back · meta.json)]
  LAB ==>|requestPitch3dV2 → job.json queued| ST
  ST -->|서명 GET| GPU[Modal: RTMW → segment → fit]
  GPU ==>|PUT analysis-v2-jobId.json| ST
  VIEW[결과 화면 5초 묻기] -->|checkPitch3dV2 → job.json · _guard.json| ST
  PL --> FACTS[facts · 부하 · ACWR · 영양 소모 · 홈 · 분석]
```

## 2-3. 트레이닝 하루

```mermaid
flowchart TD
  G[gatherFactsAndPlan] --> BF[buildFacts → buildPitchPlan → buildDayState]
  BF --> GEN[generateTodayPlan<br/>buildProgramDay+arbitrate · buildDailyPlan · fingerprint]
  GEN ==> DS[(DailyTrainingSetup.plan)]
  DS --> VIEW[loadTodayCore<br/>다시 안 만듦 · safeIds 로 거름 · 지문 차이 띠]
  VIEW --> START[startWorkout]
  START ==> TS[(TrainingSession.plan = FrozenPlan)]
  SET[세트 대기열 localStorage] ==>|logSet upsert 세션·운동·세트번호| US[(UserExerciseSet)]
  FIN[finishWorkout ⚠12] ==> TS
  FIN ==> UL[(UserExerciseLog · DailyTrainingNote)]
  CLOSE[closeAbandonedSessions<br/>gather 와 같이 돎] ==> TS
  CLOSE ==>|advanceProgramDay| UP[(UserTrainingProgram)]
  FUEL[영양 loadFuelState] -->|무게 올림 멈춤| GEN
```

## 2-4. 영양 하루

```mermaid
flowchart TD
  W1[프로필 수정] ==>|User.weightKg 만 ⚠5| U[(User)]
  W2[영양 탭 체중] ==>|DailyNutrition.weightKg 만| DN[(DailyNutrition)]
  RW[recentWeightKg<br/>30일 안 기록 → 없으면 User] --> T[목표 computeTargets]
  DN --> RW
  U --> RW
  TRN[TrainingSession.activeSeconds · 세트 분류 MET] --> BURN[운동 소모]
  PLG[PitchLog.intensity 1~10] --> BURN
  BURN --> T
  CK[DailyCheckin 오늘·어제] --> ADV[loadAdvice · guide · nudge]
  DN --> ADV
  PLG --> ADV
  T --> ADV
  ADV --> HOME[홈 링 · 피드 · 영양 탭 카드]
```

## 2-5. 홈

홈은 쓰지 않고 읽기만 한다: `loadTodayCoreCached`(트레이닝) · `loadHighlights`(PitchLog.maxVelocity · 수면의 질 · 운동) · `loadAdvice`(영양) ·
`loadPitchHistory`(달력) · `loadDayDetail`(그날 칸, `/api/day-detail` 로 클립까지). 홈 링 · 달력 · 트레이닝 화면이 같은 하루의 운동 수를 각자 센다
(달력 = 저장된 `picks.length`, 홈 = 거른 `shownPicks`, 트레이닝 = `trainingScreenOf` 규칙) — 프로그램 날 · 묵은 일정에서 어긋날 수 있다(◻).
