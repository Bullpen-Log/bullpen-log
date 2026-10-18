# 4. 카테고리 간 인터페이스 명세 (초안 v0 · 2026-10-16)

각 카테고리가 **내놓는 것(제공)** 과 **가져다 쓰는 것(사용)**. 다른 카테고리는 제공 칸의 함수만 부른다 — 남의 표를 Prisma 로 직접 읽지 않는 것이 목표(지금은 아니다: 아래 '어긋남').

## 4-1. 계약 표

### 체크인
- **제공**: `lib/checkin.ts` — `sleepQualityOf` · `isShortSleep` · `armFatigueFromPain` · `pickCheckinParts` · `pickArmPain` · `nextOutingWindow` · `todayOutingRole` · `exactOutingDay` · `LOW_CONDITION_THRESHOLD` · `belowUsualCondition`.
- **사용**: 없음(입력만).
- **불변식(제안)**: ① 3판 저장 뒤 옛 칸(`soreness` · `sleepHours` · `armFatigue` · `preferred*`)이 그날 남지 않는다 ② 읽는 쪽은 옛 칸을 직접 안 읽는다 ③ `throwPlan` 답 글자를 `===` 로 견주지 않는다(자체 시험이 막음).

### 투구 기록
- **제공**: `PitchLog` 줄 + `lib/pitch-stats.ts`(`effortPctOf` · `intensityOf` · `toDateKey`) · `lib/report/arm-status.ts armStatusOf` · `facts.patterns`(gather 가 만든 hardOutings · lastThrowDate · loggedYesterday …).
- **사용**: User(`throwingHand` · `baselineMix` · `pitchSetupAt`) · 체크인 `throwPlan` · `gatherFactsAndPlan`(팔 상태) · `pitchNutritionLine`.
- **API**: `POST/PATCH/DELETE /api/pitch-log` — 본문 `effortPct`(새) 또는 `intensity`(옛), mph 거절, 미래 날짜 거절, 2분 같은 값 막기.

### 구속 측정
- **제공**: `PitchLog`(파생, `syncVelocitySession`) · `loadVelocityByDate` · `loadVelocityClipsDay` · `VelocityPitch.analysis`(`AnalysisJson`).
- **사용**: User(`throwingHand` · `role`) · 보정 짝(`loadCalibration` — `CALIBRATION_FAMILY` 묶음 · 믿음 높음).
- **불변식(제안)**: 저장은 멱등(클라이언트 세션 id) · 같은 날 같은 종류 손 기록과 겹쳐 세지 않는다(D2) · `engineVersion` 은 잰 쪽(클라이언트) 판.

### 3D 동작 분석
- **제공**: 화면만(다른 카테고리가 안 읽음).
- **사용**: User(`throwingHand` · `heightCm`) · 메커니즘 드릴(`drillPicksFor` · `trainingGuides`).
- **외부 계약**(웹 ↔ Modal): `POST {GPU}/jobs` `{jobId, engine, side, back, meta:{hand, slowmoFps, screenRecorded, heightCm}, result.uploadUrl}` → `{callId}`, `GET /jobs/{callId}` → 상태, `GET /engine` → `build.json`.
  결과 모양 = `contract.ts Pitch3dV2Result`. **판 번호**: 웹은 `PITCH3D_V2_VERSION`(수동 상수 '2.0.0'), 서버 정체는 `build.json` 해시 — 가드는 해시를 써야 한다(⚠6).
  ◻ `pipeline.py` 는 `meta.lens` · `distances` 를 읽는데 웹이 안 보낸다(늘 1배 기본).

### 트레이닝(엔진)
- **제공**: `gatherFactsAndPlan` · `loadTodayCore`/`loadTodayCoreCached` · `buildProgramDay` · `programTodayOf` · `trainingScreenOf` · `DailyPlan` JSON · `TrainingSession.activeSeconds` · 세트 분류(`burnMixesInRange` 가 읽음).
- **사용**: 체크인 신호 · 투구 facts · 트레이닝 카드 답 · `loadFuelState`(영양 — 무게 올림 멈춤) · `CalendarEvent` · 재활 facts · User(나이 · 장비 · 수준).
- **불변식(제안)**: ① 같은 하루의 운동 수는 한 함수(`trainingScreenOf` 결과)를 홈 · 달력 · 트레이닝이 같이 쓴다 ② 프로그램 날도 오늘 장비를 지킨다 ③ `finishWorkout` 은 ACTIVE 일 때만 한 번.

### 암케어 · 재활 · 메커니즘
- **제공**: `decideArmcare` · `mechanicsFoldOf` · `loadRehabFacts` · `loadRehabThrows`(PitchLog 메모 꼬리표).
- **사용**: `gatherFactsAndPlan` · `yesterdayArmLoadOf` · `DayState`.

### 영양
- **제공**: `loadAdvice`(홈) · `loadNutritionDay` · `loadFuelState`(트레이닝) · `recentWeightKg` · `pitchNutritionLine`/`nudge`(투구 · 운동 끝 화면).
- **사용**: 체크인(오늘 · 어제) · PitchLog(소모 · 가이드) · TrainingSession/Set(소모 · 조언) · User · DailyNutrition 답.
- **불변식(제안)**: 체중은 `getBodyWeight` 한 함수 · 나이 띠는 공용 표(D3).

### 홈 · 분석
- **제공**: 화면만.
- **사용**: 위 제공 함수 전부. 홈 · 분석은 쓰지 않는다.

### 계정 · 잠금
- **제공**: `getCurrentUser`/`requireUser`/`requireAdmin`(`lib/dal.ts`) · `featureLocks`.
- **불변식(제안)**: ① 관리자 확인은 `requireAdmin` 하나 ② 잠긴 기능의 **쓰기 동작**은 서버에서도 막는다(화면만 막으면 옛 탭 · 앱이 우회).

### 아이폰 앱(Expo) ↔ 서버(2026-10-18 더함)
- **입구**: `POST /api/rpc/<파일>.<함수>`(`app/api/rpc/[action]/route.ts`) — 허용 목록 `app/api/rpc/registry.ts` 의 서버 동작만. 몸은 JSON `{ args: [...] }`
  또는 폼(multipart, `__args`). 답 `{ ok, result }` · redirect 는 `{ ok, redirect }` · 404 unknown-action · 426 update(`x-bullpen-app` 이 `MIN_APP_API` 밑이거나 없음).
- **로그인**: 웹과 같은 `session` 쿠키(앱이 웹뷰 쿠키를 앱 요청 저장소로 옮김). 권한은 각 동작이 확인 — 허용 목록에 넣어도 열리는 면이 늘지 않는다.
- **약속**: ① 앱이 부르는 동작의 인자 · 답 모양은 `scripts/native-api-shapes.json` 에 적힌 대로 — 바꾸면 `native-api:test` 가 실패, 앱을 맞추고 `--update`,
  깔린 앱이 깨지면 `APP_API_LEVEL`(막아야 하면 `MIN_APP_API`) ② 서버 동작은 지우지 말고 더하기만(DB 규칙과 같은 원리) ③ 새 동작 파일은 허용 목록에 한 줄
  (통합 시험 [12] 가 빠뜨림을 잡음) ④ 앱이 쓰는 `@/lib` 파일에는 서버 · 브라우저 전용 코드를 넣지 않는다(`shared-lib:test`).
- **오프라인**: 앱 세트 · 암케어 체크 대기열(`native-outbox:test`) — 계정이 바뀌어도 앞사람 것을 안 보냄, 서버 오류 한 줄이 뒤를 막지 않음.

## 4-2. 이벤트 · 다시 그리기

서버 동작이 `revalidatePath` 를 하나라도 부르면 지금 경로가 다시 그려지고, 탭 넷이 한 레이아웃의 병렬 자리라 같이 새로 그려진다. 그래서 '다른 탭' 반영은 대체로 되지만,
**`revalidatePath` 를 안 부르는 쓰기**는 `staleTimes.dynamic: 30` 동안 다른 경로(`/coach`, 전체 화면 `/pitch-log/[date]`)가 옛 값을 보인다(⚠11).

**제안 규격 I1 — 쓰기마다 무효화 표**

| 쓰기 | 바뀌는 읽기 | 부를 것 |
|---|---|---|
| 체크인 · 탭 카드 | 트레이닝 · 홈 · 영양 · 관문 | `revalidatePath('/', 'layout')`(지금 checkin 은 함) |
| 투구 기록(API) | 투구 · 홈 · 트레이닝(부하) · 영양(소모) · 분석 | API 경로에서도 `revalidatePath('/', 'layout')` |
| 세트 · 운동 끝 · 힘듦 칩 | 트레이닝 · 홈 · 영양(소모) · 분석 | 운동 끝 · 힘듦에서 `revalidatePath('/', 'layout')`(세트마다는 비쌈 — 끝에서 한 번) |
| 영양 기록 · 체중 | 영양 · 홈 · 트레이닝(올림 멈춤) | 지금처럼 + 체중은 layout |
| 운동 라이브러리 스크립트 | 전체 | `library-cache.ts` 판 번호 올리기 |

## 4-3. 오류 · 빈 자료 · 중복 · 동기화

| 문제 | 지금 | 제안 |
|---|---|---|
| 빈 자료(체크인 없는 날) | 카드 답이 버려짐 ⚠2 · 옛 칸 null 이면 규칙 꺼짐 ⚠1 | 카드 답은 체크인과 따로 합침 · 각 신호 함수가 'unknown' 을 돌려주고 읽는 쪽이 기본값을 정함 |
| 중복 요청 | 투구 POST 는 findFirst→create(경합 ◻) · 구속 저장 멱등 없음 ◻ · `finishWorkout` 상태 조건 없음 ◻ · 3D 요청 read-then-write ◻ | 클라이언트 생성 id + 유일 제약/upsert · 상태 조건 갱신(`updateMany where status`) |
| 오프라인 | outbox 셋(localStorage 세트 · IndexedDB 촬영 · IndexedDB 구속) | 약속 하나: 클라이언트 id + 서버 멱등 + 받았다는 답이 와야 지움 |
| 네이티브 부품 | 판 번호 있음(2026-10-16): `BullpenNative.info` → `{ api, build, version }`(Swift `API`), 웹 `nativeApi()`(lib/native-bridge.ts) · 기능마다 필요한 판 `lib/native-api.ts`. `info` 없는 옛 앱은 예전 짐작(`isOldApp`) | 부품을 바꾸면 Swift `API` +1 · native-api.ts 에 한 줄 |
| 계정 바꿈 | 세트 대기열이 기기 단위 ◻ | 열쇠에 userId |
