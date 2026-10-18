# 3. 공통 데이터 모델 · 타입 (초안 v0 · 2026-10-16)

지금 상태(사실)와 **제안 규격**(승인 전)을 나눠 적는다. 제안은 새 코드부터 지키고, 옛 코드는 고칠 때 맞춘다(일괄 재작성 안 함).

## 3-1. 식별자 · 소유권

- 모든 단일 키 표는 `String @id @default(uuid())`. 복합 키 표 여섯(UserDrillLog · UserExerciseFavorite · UserExerciseNote · UserDrillFavorite · UserExerciseLog · WarmupRoutineItem).
- 소유 칸은 `userId`(예외: `PatchNote.authorKey`). `relationMode = "prisma"` 라 DB 외래키가 없고, 지우기 · 이어 지우기는 Prisma 가 흉내 낸다.
- **User 관계가 없는 표**: `VelocityRecording*` · `VelocityCalibRun` · `ShootCheck` — 탈퇴 때 남는다(⚠14).
- 같은 날 한 줄 표: `[userId, date]` 유일 — DailyCheckin · DailyTrainingSetup · DailyArmcare · DailyNutrition · TrainingSession · DailyTrainingNote · DailyFeaturedVideo · MealPlan.
  **PitchLog 는 하루 여러 줄**(유일 없음 · 색인 없음 ⚠18).

**제안 규격 M1 — 데이터 소유권**

| 데이터 | 쓰는 곳(주인) | 읽어도 되는 곳 |
|---|---|---|
| `User` 프로필 칸 | 계정 · 첫 설정 동작 | 모두(`lib/dal.ts` 를 거쳐) |
| `DailyCheckin` | `saveCheckin` · `setThrowPlan` 만 | 엔진 · 영양 · 암케어 · 홈 — **`lib/checkin.ts` 읽기 함수로만** |
| `PitchLog` | `/api/pitch-log` · `saveVelocitySession`/`syncVelocitySession` · `logRehabThrow` | 모두 — 강도는 `effortPctOf` · `intensityOf` 로만 |
| `Velocity*` | 구속 동작 | 투구 · 홈 · 관리자 |
| 트레이닝 표 | workout · training-setup · program · plan-edit · exercise-log · close-stale | 홈 · 영양(소모) · 분석 |
| 영양 표 | nutrition · day-cards(답) · auth(가입 체중) | 홈 · 트레이닝(`loadFuelState` 만) |
| 저장소 `pitch-lab/**` | pitch-lab 동작 · Modal(결과 PUT) | 3D 화면 |

## 3-2. 시간

**사실**: 날짜만 있는 칸은 모두 `DateTime @db.Date`, 값은 **한국 날짜의 UTC 자정**. 문자열 날짜는 `PatchNote.day` 하나, 시각 문자열은 `CalendarEvent.time 'HH:MM'`.
'오늘' = `toDateKey(appNow())`(Asia/Seoul, 시험 계정은 `simDate`). 날짜 키 함수가 10개 남짓 + 인라인 `toISOString().slice(0,10)` · `` new Date(`${key}T00:00:00.000Z`) `` 약 85곳.
`@db.Date` 칸에서는 둘이 같아서 지금은 맞지만, `DateTime` 칸이나 브라우저 `new Date()` 에 쓰면 한국 0~9시에 하루 어긋난다(✅ `rehab-start.tsx:393`).

**제안 규격 M2 — 시간**

```ts
// lib/date-key.ts (새로 만들 곳 — 지금 함수들을 옮겨 모음, 이름은 그대로 다시 내보냄)
export type DateKey = string;                    // 'YYYY-MM-DD', 한국 날짜
export const todayKey = (): DateKey => toDateKey(appNow());   // 서버 · 화면 모두 이것
export const keyOfDbDate = (d: Date): DateKey => d.toISOString().slice(0, 10); // @db.Date 칸 → 키
export const dbDateOf = (k: DateKey): Date => new Date(`${k}T00:00:00.000Z`);  // 키 → @db.Date 칸
export { shiftDateKey, dateKeyOf } from './pitch-stats';
```

- 규칙: ① 화면 · 서버의 '오늘'은 `todayKey()` 만(`new Date().toISOString()` 금지) ② `@db.Date` 읽기 · 쓰기는 `keyOfDbDate` · `dbDateOf` 만 ③ 시각이 필요한 칸은 `appNow()`.
- 날짜를 클라이언트에서 받는 동작은 서버가 `isFutureDateKey` 등으로 다시 본다(`saveVelocitySession` 은 안 봄 ◻).

## 3-3. 단위 · 눈금

**사실**: 저장은 kg · cm · km/h · m(릴리스 오프셋만 cm). 변환은 화면만(`lib/units.ts`), 예외 `lib/program/next-weight.ts:479` 의 2.20462.

| 칸 | 눈금 | 비고 |
|---|---|---|
| `PitchLog.effortPct` | 5~100 % | 주 값(2판 D2) |
| `PitchLog.intensity` | 1~10 | `round(pct/10)` 로 늘 같이 씀(✅). 옛 줄은 이것만 |
| `DailyTrainingNote.intensity` | 1~10 RPE | 투구 강도와 다른 뜻 |
| `ExerciseVideo.intensity` | '매우 낮음'…'매우 높음' 글자 | 또 다른 뜻 — 이름만 같음 |
| `DailyCheckin.condition` | 1~10 | 엔진 ≤4 = 낮은 날, 화면 4~7 = '보통' ⚠8 |
| `sleepQuality` · `appetite` | 1~5 | |
| `armPainLevel` | 1~3 | 재활 `pain` 은 0~10 |
| `rir` | 0~4 | |
| 믿음 `confidence` | 'high' · 'medium' · 'low' | |

**제안 규격 M3 — 단위**: ① 저장은 SI(kg · cm · km/h · m) 고정, 변환은 `lib/units.ts` 만 ② 새 강도 칸은 `…Pct`(0~100) 또는 `…Rpe`(1~10)로 이름에 눈금을 넣는다
③ 투구 강도는 `effortPctOf` / `intensityOf` 로만 읽는다(직접 `log.intensity` 금지 — 지금 영양 소모 두 곳은 정밀도만 손해라 낮은 차례).

## 3-4. 이름

지금 섞인 것: 날짜 칸(`date` · `asOf` · `day` · `lastSessionOn` · `lastDoneDate` · `stageStartedAt` — 마지막은 `@db.Date` 인데 `At`), 속도(`maxVelocity` vs `kmh`),
체중(`weightKg` · `bodyWeightKg` · `targetWeightKg`), 던지는 손(`throwingHand` '우투/좌투' · `throwingSide` · 실험실 'R/L').

**제안 규격 M4 — 새 칸 이름**: 날짜만 = `…Date`/`date`(`@db.Date`), 시각 = `…At`, 속도 = `…Kmh`, 체중 = `…Kg`, 손 = `throwingHand`('우투' | '좌투'). 옛 칸 이름은 바꾸지 않는다(두 사람 코드를 동시에 깨뜨림 — AGENTS 2번).

## 3-5. 한 사실이 여러 곳에

| 사실 | 저장 자리 | 진실 원천(제안) | 지금 위험 |
|---|---|---|---|
| 체중 | `User.weightKg` · `DailyNutrition.weightKg` · `DailyCheckin.bodyWeightKg`(옛) | **가장 최근 기록 하나**: `getBodyWeight(userId, dateKey)` 한 함수. 프로필 수정도 오늘 `DailyNutrition.weightKg` 에 같이 씀 | ⚠5 |
| 투구 수 · 구속(구속 세션 날) | `VelocityPitch` → `PitchLog`(파생) | VelocityPitch(PitchLog 는 sync 가 쓰는 요약) | 손 기록과 겹침 ⚠3, 사용자 PATCH 를 sync 가 덮음 ◻ |
| 운동 종류 · 부위 선호 | `DailyTrainingSetup.preferred*`(3판) · `DailyCheckin.preferred*`(옛) | DailyTrainingSetup | 체크인 없는 날 버림 ⚠2 |
| 식욕 · 끼니 | `DailyNutrition`(3판) · `DailyCheckin`(옛) | DailyNutrition(`answeredAt` 있으면) | 대체로 맞음(`nudge` 만 식욕 무시) |
| 근육통 · 잔 시간 · 팔 피로 | `DailyCheckin` 옛 칸만 | **결정 필요(D1)** | ⚠1 |
| 부위 다섯 칸 | `bodySpots` 에서 파생 | bodySpots | 맞음 |
| 평소 투구량 | `baselineMix` + 옛 세 칸(파생) | baselineMix | 맞음 |
| 운동 요약 | `UserExerciseLog`(UserExerciseSet 요약) | UserExerciseSet | 맞음 |

## 3-6. 죽은 · 옛 칸(지우기 후보 — 지우기는 두 사람 합의 + 2단계)

`AiReport`(0곳) · `PoseAnalysis`(deleteMany 만) · `DailyNutrition.photoCalls` · `DailyCheckin.stress/mood/restingHr/hydration/fatigue` · `VelocityPitch.wideClip*`(옛 줄 읽기만) ·
`VelocitySession.mode/autoMode/net`(고정값) · `User.competitionLevel`(묻지 않음). 스키마 주석 셋이 낡음(`NutritionProfile` 의 sex · 엉뚱한 자리의 DailyCheckin 주석 · PatchNote 주석 겹침).

## 3-7. 공통 타입(지금 있는 것 — 새로 만들지 말고 이것을 쓸 것)

| 개념 | 타입 · 함수 | 파일 |
|---|---|---|
| 하루 사실 | `Facts` · `buildFacts` | `lib/report/facts.ts` |
| 오늘 상태 한 장 | `DayState` · `buildDayState` | `lib/engine/day-state.ts` |
| 어제 팔 부담 | `yesterdayArmLoadOf` | `lib/engine/arm-load.ts` |
| 날 종류 | `dayKindOf` | `lib/engine/microcycle.ts` |
| 등판 창 | `nextOutingWindow` · `todayOutingRole` · `exactOutingDay` | `lib/checkin.ts` → `lib/engine/outing.ts` |
| 체크인 신호 | `sleepQualityOf` · `isShortSleep` · `armFatigueFromPain` · `pickCheckinParts` | `lib/checkin.ts`(`signalsOf` 는 아무도 안 씀) |
| 투구 강도 | `effortPctOf` · `intensityOf` · `readEffort` · `effortFields` | `lib/pitch-stats.ts` · `lib/pitch-effort.ts` |
| 매일 일정 JSON | `DailyPlan` · `readDailyPlan` | `lib/report/daily-plan.ts` |
| 얼린 세션 판 | `FrozenPlan` · `readFrozenPlan` | `lib/workout/session-plan.ts` |
| 기능 잠금 | `featureLocks` · `featureOfPath` | `lib/feature-locks.ts` |
| 3D 결과 · 작업 | `Pitch3dV2Result` · `Pitch3dV2Job` · `V2FailCode` | `lib/pitch-3d/v2/contract.ts` |
| 구속 분석 JSON | `AnalysisJson` | `lib/velocity-analysis.ts` |
