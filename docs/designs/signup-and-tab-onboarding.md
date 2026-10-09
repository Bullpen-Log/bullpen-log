# 가입 6화면 · 탭별 첫 설정 · 튜토리얼 — 설계 메모(2026-10-09)

**상태: 끝남 · main 에 올림(2026-10-10). 로그인 상태 · 아이폰 앱 확인은 남음(8절 3).** 가입이 25화면에서 6화면으로 줄었다. 투구 · 웨이트 · 영양 질문은 그 탭에 처음 들어갈 때
묻는 첫 설정으로 옮겼고, 그 전까지 세 탭은 잠긴다. 잠금 · 튜토리얼 상태는 `User` 칸 넷. 규칙은 `lib/feature-locks.ts` 한 곳.

앞 설계 `inout-onboarding.md` ④의 **가입 차례**(질문 19 + 끼움 6 = 25화면)는 이 문서가 대체한다. 영양 질문 화면 · 계산 · `/nutrition/setup` 은
그대로 쓰고, 영양 탭의 첫 설정이 된다.

## 사용자 지시(2026-10-09) — 요지

1. 가입은 이름 · 이메일(한 화면, 이름을 적으면 이메일 칸이 펴짐) → 생년월일 · 성별(생년월일을 고르면 성별이 펴짐) → 키 · 몸무게(키가 맞으면
   몸무게가 펴짐) → 비밀번호 · 확인(8자 이상이면 확인이 펴짐) → 어디서 야구하나요(소속) → 약관 동의 → '가입하고 시작하기'.
   투구 · 웨이트 · 영양 질문, 끼움 카드, 요약 화면은 가입에서 뺀다.
2. 투구 기록 · 트레이닝 · 영양은 처음 가입한 사람에게 잠겨 있다. 잠긴 탭으로 가면 그 탭의 첫 설정 화면으로 보낸다. 막대 · 탭에서는 흐리게 +
   자물쇠로 보이되 누르면 설정 화면으로 간다. 홈의 기능 링크도 같다. 설정 · 내 정보 · 체크인 · 알림 · 라이브러리 · 자료실 · 홈 · 분석(/coach)은
   늘 열려 있다.
3. 첫 설정은 영양 온보딩과 같은 꼴(한 화면 한 질문, 답은 상태로 쥐고 끝에 한 번에 저장, 서버가 막으면 그 칸으로). 끝나면 탭이 열리고 그 탭
   사용법 튜토리얼이 한 번 뜬다.
4. 가입 직후 첫 홈에서 앱 기본 사용법 투어가 한 번 뜬다. 웹과 앱(아이폰 웹뷰)은 따로. 차례는 시작 연출 → 투어 → 체크인 관문.

"묻지 말고 끝까지 진행"이라 세부는 Claude 가 정했다(아래 D1~D8). 바꾸려면 D 번호로 말해 주면 된다.

## 1. 새 가입 — 6화면

| # | 화면 제목 | 칸 | 펴지는 규칙 | 저장 | 검사(화면 `checkStep` · 서버 `trySignup`) |
|---|---|---|---|---|---|
| 1 | 이름과 이메일을 알려 주세요 | 이름 · 별명, 이메일 | 이름이 2자 이상이면 이메일 칸 | `nickname` · `email` | 이름 2자 이상(서버는 20자까지도) · 이메일 형식. '다음'에서 `checkSignupEmail` 로 이미 가입된 이메일을 미리 본다 |
| 2 | {이름} 님, 언제 태어나셨어요? | 생년월일(작은 달력) · 성별(칩 둘) | 생년월일을 고르면 성별 | `birthDate` · `sex` | 만 5~100세(`lib/profile.ts`) · 성별 필수(서버도 필수 — 옛 화면용 '칸이 없으면 비워 둠' 길은 뺐다) |
| 3 | 키와 몸무게를 알려 주세요 | 키 [cm｜in] · 몸무게 [kg｜lb](`NumberUnitField`) | 키가 범위 안 정수면 몸무게 | `heightCm` · `weightKg` + `DailyNutrition` 오늘 체중 | 둘 다 필수, 범위는 내 정보와 같다(`MIN/MAX_HEIGHT_CM` · `MIN/MAX_WEIGHT_KG`) |
| 4 | 비밀번호를 정해 주세요 | 비밀번호 · 확인 | 8자 이상이면 확인 칸 | `password`(bcrypt) | 8자 이상 · 일치 |
| 5 | 어디서 야구를 하고 있어요? | 소속 칩(`COMPETITION_LEVELS`, 나이에 안 맞는 것은 못 고름) | — | `competitionLevel` | 화면은 필수(`levelFit` 이 나이로 미리 골라 둠), 서버는 빈 값 허용 · 목록 안 · `levelAgeProblem` |
| 6 | 약관을 확인해 주세요 | 모두 동의 · 이용약관 · 개인정보 처리방침(눌러서 창으로) | — | `agreedAt` = 지금 | 둘 다 'on' |

[가입하고 시작하기] → `trySignup`: `$transaction`(User + DailyNutrition 오늘 체중) → 세션 → `/today`. **NutritionProfile 은 만들지 않는다**
(만들면 영양 탭이 열린 채로 시작한다).

- 펴짐은 `components/onboarding/reveal-field.tsx` RevealField — `Expand`(높이 300ms)를 감싸 한 번 펴지면 다시 접히지 않는다(위 칸을 지워도
  적던 것이 안 사라지게). 초점은 옮기지 않는다(위 칸을 치는 중이라). 안쪽은 160ms 옅어지며 들어온다.
- 화면 넘김은 `animate-step-next/back`, 차례 · 검사 · 되돌아가기는 `components/onboarding/use-step-wizard.ts`. 답에 따라 생기고 빠지는 화면이
  없어 늘 6.
- 서버가 막으면 `FIELD_STEP` 으로 그 칸의 화면으로 돌아가 칸을 빨갛게. 신호가 끊기면 약관 화면 단추 곁에 한 줄(`guardFormAction`).
- Enter 는 펴진 다음 칸 → 없으면 '다음'. 아직 안 펴진 칸은 그려져 있지 않아 건너뛰지 않는다.
- **뺀 것**: 던지는 손 · 투구 3문항(부하 count-up) · 웨이트 횟수 · 경력 · 영양 질문 11 · 계획 만드는 중 · 추천 계획 · 탄단지 g · 요약 + 약속
  체크 · 끼움 둘(투구 한도 · 운동 소모). 끼움 카드는 투구 · 트레이닝 첫 설정으로 갔다.

## 2. 잠금 상태 모델

| 기능 | 잠김 조건 | 푸는 곳 | 속한 주소(`featureOfPath`) |
|---|---|---|---|
| 투구 기록 | `User.pitchSetupAt` 이 빔 | `finishPitchSetup`(app/actions/pitch-setup.ts) | `/videos` · `/pitch-log` · `/velocity` |
| 트레이닝 | `User.trainingSetupAt` 이 빔 | `finishTrainingSetup`(app/actions/training-setup.ts) | `/training` · `/workout` · `/armcare` · `/mechanics` |
| 영양 | `NutritionProfile` 줄이 없음 | `finishNutritionSetup`(app/actions/nutrition.ts, upsert) | `/nutrition` |

- 그 밖의 칸: `tutorialsDone String[] @default([])` — 본 튜토리얼(`'tour:web' | 'tour:app' | 'pitch' | 'training' | 'nutrition'`, `TUTORIAL_KEYS`
  밖의 값은 `markTutorialDone` 이 받지 않는다). `agreedAt DateTime?` — 약관 · 개인정보 처리방침에 동의한 시각(가입 때).
- 읽기: `lib/dal.ts getCurrentUser` 가 매 요청 한 번에(`pitchSetupAt · trainingSetupAt · tutorialsDone · nutritionProfile{onboardedAt}`).
  계산은 순수 함수 `featureLocks(user)`.
- 쓰기: 설정 · 튜토리얼을 적은 뒤 `revalidatePath('/', 'layout')` — 막대의 흐림 · 자물쇠까지 새로 읽힌다. 설정을 마친 시각은 처음 것을 둔다
  (다시 와서 고쳐도 `?? new Date()`).
- 영양의 `onboardedAt` 은 잠금과 따로다 — 줄은 있는데 비어 있는 옛 계정은 탭이 열린 채 '다시 정해 볼까요' 배너만 본다.

**옛 계정** — 마이그레이션 `20261009170000_feature_setup` 의 UPDATE(빈 칸에만, 다시 돌려도 같다):

- `pitchSetupAt = createdAt` — `baselineFreq` · `throwingHand` 가 다 있거나(옛 가입이 받은 답) 투구 기록(`PitchLog`)이 하나라도 있으면.
- `trainingSetupAt = createdAt` — `trainingLevel` 이 있거나 `TrainingSession` · `DailyTrainingSetup` 이 하나라도 있으면.
- 영양은 UPDATE 가 없다 — 줄 유무가 곧 잠금이다(아래 '남은 것' 1).
- `tutorialsDone` 은 `[]` 로 시작 — 옛 계정도 투어와 탭 튜토리얼을 한 번씩 본다(D5).

**막는 자리** — 레이아웃은 주소를 모르니 각 목적지가 스스로 보낸다(`redirect(SETUP_PATH[key])`):

- 페이지: `app/(app)/videos/page.tsx` · `pitch-log/[date]/load.ts`(페이지와 팝업이 다 지남) · `(session)/velocity/access.ts`(→ page · measure) ·
  `training/page.tsx`(홈 · 암케어 · 메커니즘 · 운동 모든 분기 앞) · `workout/run` · `workout/warmup` · `armcare/play/[id]` · `mechanics/play` ·
  `nutrition/page.tsx`.
- 서버 동작: `startWorkout` · `startProgram` · `startProgramWorkout`(시작만 막고 진행 중인 판은 건드리지 않는다).
- 셸: `lib/nav.ts` 항목에 `lock`(투구 기록 · 구속 측정 = pitch, 트레이닝, 영양) → `applyLocks` 가 주소를 설정 화면으로 바꾸고 `locked` 를 단다.
  탭 첫 화면이 아닌 곁 항목(구속 측정)은 `?from=` 을 붙여 주소를 가른다(셸이 주소를 이름표로 써서, 같은 주소 둘이면 메뉴 연출이 멈춘다) ·
  `isLockSideHref` 는 '지금 여기'로 켜지 않는다. 셸은 `NavGlyph` 로 아이콘 칸을 `opacity-55` + 오른쪽 아래 `Lock`, 이름은 '…(설정 전)'.
- 설정 화면 자신(`isSetupPath`)은 잠금에 안 걸린다. `NAV_ALSO` 에 설정 주소를 넣어 그 탭으로 켜진다.
- 늘 열림: 홈 · 분석(`/coach`) · 체크인 · 알림 · 설정 · 내 정보 · 라이브러리 · 자료실.

## 3. 탭별 첫 설정

공통 꼴은 영양 온보딩 그대로: `StepCard brand={null}` · 한 화면 한 질문 · `useStepWizard` · 답은 상태로 쥐었다가 `[이름, 값]` 줄로 서버 동작
한 번 · 막히면 `field` 로 그 화면 · 신호 끊김은 `orOffline` · 저장 뒤 `router.push(FEATURE_HOME)`. 계정에 있는 값으로 미리 채운다(마친 사람이 다시
와 고칠 수 있게). 첫 화면 왼쪽 단추는 처음 온 사람이면 '홈으로'(`/today` — 탭은 잠겨 있어 되돌아오므로), 마친 사람이면 '그만두기'(탭).

### 투구 기록 — `/videos/setup` → `finishPitchSetup`(User 한 줄 update)

| 화면 | 칸 | 근거(읽는 곳) |
|---|---|---|
| 하루 투구 한도(끼움 `PitchCapInsert{age}`) | — | 왜 묻는지. 나이 한도 `dailyPitchCap` |
| 던지는 손은 어느 쪽이에요? | `throwingHand` | 폼 분석 · 암케어(`armcare-section`) · 메커니즘(`mechanics-section`) · 구속 측정(`velocity-screen`) |
| 평소 얼마나 던져요?(횟수 · 구수 · 강도 한 화면) | `baselineFreq` · `baselineVolume` · `baselineIntensity` | `estimateDailyLoad` → 부하 지수의 시작 기준선(`lib/report/gather.ts` · `today-data.ts` · `lib/armcare/today.ts`) |
| 목표 구속이 있어요?(비워도 됨) | `targetVelocity` | 분석(`coach/overview.tsx`) — 내 정보와 같은 칸 · `validateTargetVelocity` |
| 요약 | — | 저장 → `pitchSetupAt` |

검사는 `lib/pitching/setup-answers.ts`(화면) · `validatePitchBaseline`(서버, `lib/baseline.ts` 에서 갈라낸 것).

### 트레이닝 — `/training/setup` → `finishTrainingSetup`(User 한 줄 update)

| 화면 | 칸 | 근거(읽는 곳) |
|---|---|---|
| 웨이트는 얼마나 해 봤어요? | `trainingLevel` | 이른 운동 빼기(`lib/report/personalize.ts`) · 프로그램 자격(`lib/program` profileBlock) |
| 일주일에 몇 번 해요? | `baselineWorkoutFreq` | 운동 부하의 시작 기준선(`estimateTrainingDailyLoad`, `validateWorkoutBaseline`) |
| 어떤 장비가 있어요?(+ '맨몸뿐이에요') | `ownedEquipment` | 없는 장비 운동 빼기(`lib/report/equipment.ts`). 저장은 맨몸을 앞에 |
| 하루에 얼마나 할 수 있어요? | `dailyWorkoutMinutes` | 일정 길이(`lib/report/theme.ts`) |
| [어느 손으로 던져요?] — 계정에 손이 없을 때만 | `throwingHand` | 암케어 · 메커니즘 |
| [운동 소모 끼움 `BurnInsert`] — 체중을 알 때만 | — | 영양 목표와 이어진다는 것 |
| 요약 + 프로그램 안내(`programNote`) | — | 저장 → `trainingSetupAt` |

검사는 `lib/training/setup-answers.ts` 하나를 화면과 서버가 같이 쓴다.

### 영양 — `/nutrition/setup` → `finishNutritionSetup`(한 트랜잭션: User 키 · 체중 + NutritionProfile upsert + DailyNutrition)

이미 있던 화면(`inout-onboarding.md` ④ 8단계)을 첫 설정으로 쓴다: 키 → 체중 → [운동 소모] → 목표 카드 → [목표 체중] → [속도 · 언제까지] →
평소 움직임(소속으로 미리) → 시즌 → 탄단지 → 식사 → 못 먹는 것 → [만드는 중 → 추천 계획 → 탄단지 g] → 요약. 근거는 ④의 표 그대로.
바뀐 것: 줄이 없으면 빈 답(`EMPTY_ANSWERS`)으로 연다(기본값으로 채우면 목표 카드 · 식단 화면이 미리 골라져 첫 질문을 건너뛴다) · 키 · 체중은
가입 값으로 채워 '맞는지 확인해 주세요' · 첫 단추 '홈으로'.

## 4. 튜토리얼 두 종류

| | 기본 투어 | 탭 튜토리얼 |
|---|---|---|
| 열쇠 | `tour:web` · `tour:app`(`tourKeyFor(isNative)`) | `pitch` · `training` · `nutrition` |
| 부품 | `components/tutorial/tour-gate.tsx` TourGate — `(app)/layout.tsx` 에 하나 | `tab-tutorial.tsx` TabTutorial — 세 탭 페이지 |
| 언제 | 처음 홈(`/today`)에서 한 번. 다른 화면에서는 안 연다 | 첫 설정을 마친 뒤 그 탭에서 한 번(투어는 홈에서만 저절로 떠 겹치지 않는다) |
| 글(`slides.tsx`) | 웹 5장: 환영 · 오른쪽 위 막대 · 설정과 내 정보 · 체크인 · 잠긴 세 탭 / 앱 5장: 환영 · 아래 탭 · 당겨서 새로고침과 알림 · 체크인 · 잠긴 세 탭 | 투구 4 · 트레이닝 4 · 영양 4 |
| 닫기 | '시작하기' · X → 봤다고 적음(`markTutorialDone`). Esc → 안 적음(잘못 누른 것일 수 있어서) | 같다 |
| 다시 보기 | 설정 › 정보 '사용 안내 다시 보기'(`resetTutorial` → 설정 창을 닫고 지금 화면에서 연다) | 아직 자리 없음(미룬 것) |

- 웹 · 앱 가름: 서버는 `isNativeUserAgent`(lib/app-env.ts), 화면은 `html[data-app='native']`.
- 창은 `TutorialDialog`(`<dialog>` showModal, 맨 위 칸). 휴대폰은 화면 전체, PC 는 바깥을 어둡게 한 가운데 카드.
- **차례**: 시작 연출 `AppSplash`(웹만, `html[data-splash]`) → 투어(연출이 걷히고 그림 두 장 뒤, 열기로 정한 순간 `html[data-tour]` 를 붙든다 —
  `holdTour`) → 체크인 관문(`afterTour`: 표시가 걷히거나 `TOUR_END_EVENT` 를 받으면, 0.5초마다 다시 봐 신호를 놓쳐도 열린다). 탭 튜토리얼도
  같은 표시를 붙들어 관문이 그 뒤에 선다.
- 투어를 홈 페이지가 아니라 레이아웃에 둔 까닭: 관문과 같은 틀이어야 차례가 지켜지고(페이지면 loading 뼈대 때 관문이 먼저 열릴 수 있다),
  '다시 보기'가 어느 화면에서나 눌리며, 화면을 옮겨도 다시 뜨지 않는다.

## 5. 홈 링크 동작

| 자리 | 열려 있으면 | 잠겨 있으면 |
|---|---|---|
| 오늘 링 '투구' | `/pitch-log/{오늘}` 기록 창 · '남기기' | `/videos/setup` · '설정하기' |
| 오늘 링 '운동' | `/training` | `/training` → 서버가 `/training/setup` 으로 |
| 오늘 링 '영양' | `/nutrition` | `/nutrition` → `/nutrition/setup` |
| 첫날 카드 투구 줄 | 오늘 알맞은 투구 숫자 · '오늘 투구 남기기' · '오늘 안 던졌어요' | 숫자 없이 한 줄 + '투구 기록 설정하기'(`/videos/setup`) |
| 첫날 카드 '첫 운동 만들기' | `/training` | `/training` → `/training/setup` |
| 홈 영양 카드 | `/nutrition` | → `/nutrition/setup` |
| 그날 칸(달력 밑) 링크 | `/pitch-log/{날}` · `/training` · `/nutrition` · `/videos?date` | 각 목적지가 설정으로 보낸다 |
| 알림(종) 투구 할 일 | '기록하기' · '오늘 안 던졌어요' | '투구 기록 설정하기' 하나, 종의 점에는 안 센다 |
| 분석(`/coach`) | 열림 | 열림 |

투구는 홈이 곧장 설정 주소를 쓰고(기록 창이 어차피 보내므로 한 번 덜 튄다, 숫자도 손 · 투구량을 모르면 믿을 것이 못 된다),
운동 · 영양은 탭이 스스로 보낸다(서버 redirect 한 번).

## 6. 결정

| D | 결정 | 까닭 |
|---|---|---|
| D1 | 이름 · 이메일이 첫 화면 | 사용자 지시. 첫 화면 '다음'에서 중복 이메일을 미리 봐(`checkSignupEmail` 그대로) 끝에서 막히지 않는다. |
| D2 | 잠금 · 튜토리얼 상태는 `User` 칸 넷(`pitchSetupAt` · `trainingSetupAt` · `tutorialsDone` · `agreedAt`). 영양은 이미 있는 줄 유무 | 막대 · 홈 · 탭이 매 요청 보므로 `getCurrentUser` 한 번에 읽혀야 한다(따로 표면 join 하나 더). 답 칸이 차 있는지로 미루어 보면 '옛 가입이 받은 값'과 '설정을 마침'이 갈리지 않고, 내 정보에서 칸을 비우면 다시 잠긴다. 넷 다 비워 둘 수 있거나 기본값이라 상대방 코드를 안 깨뜨린다(AGENTS.md 2번). |
| D3 | 성별은 가입, 던지는 손은 투구 설정. 트레이닝 설정은 손이 비어 있을 때만 묻는다 | 성별은 단추 하나고 영양 설정이 묻지 않는데, 비면 목표가 하루 100kcal 넘게 어긋난다. 손은 투구 기록 · 구속 측정 · 암케어가 같이 읽어 탭 순서를 모르니, 트레이닝을 먼저 연 사람에게만 한 번 더 묻는다(투구 설정은 그 값으로 미리 채운다). |
| D4 | 키 · 몸무게는 가입에서 필수. 소속 화면도 필수, 서버는 빈 값을 받는다 | 키는 영상 길이 · 기초대사량, 몸무게는 오늘 첫 체중이자 영양 설정의 기준(설정에서는 확인만). 소속은 나이로 미리 골라 둬 한 번 누르면 되지만, 직접 셈에 안 들어가는 값(영양 평소 움직임을 미리 고르는 데만 쓴다)이라 오래 연 화면 · 손으로 만든 요청 때문에 가입이 막히면 잃는 쪽이 크다. |
| D5 | 옛 계정은 마이그레이션 UPDATE 로 열어 두고, 튜토리얼만 한 번 | 쓰던 탭이 갑자기 잠기면 안 된다. 옛 가입은 투구 · 웨이트 답을 받았으니 그 답이나 기록이 있으면 마친 것으로 본다. 사용법 안내는 새로 생긴 것이라 옛 사람도 한 번 본다. |
| D6 | 차례는 시작 연출 → 투어 → 체크인 관문. PC 는 StepCard 두 칸(왼쪽 제목 · 오른쪽 칸) 그대로 | 관문이 먼저 뜨면 처음 온 사람이 앱이 무엇인지 모르는 채 몸 상태부터 적는다. 투어는 읽는 시간을 몰라 관문이 시간 상한 없이 기다린다. 가입 · 세 첫 설정이 같은 카드라 새 모양을 만들지 않는다. |
| D7 | 투구 설정은 손 · 평소 투구량 3문항 · 목표 구속(선택). `/coach` 는 안 잠근다. 구속 측정의 설정은 `/velocity` 안 그대로 | 셋 다 이 탭이 읽는 값이다. 분석은 홈의 '더 보기'이고 기록이 없을 때의 빈 칸 안내가 이미 있다. 카메라 위치 · 화질 · 스피드건 보정은 측정하는 자리에서 정해야 해서 투구 설정에 넣지 않는다(`/velocity` 자체는 투구 기록과 같은 자물쇠). |
| D8 | `agreedAt` 에 동의 시각 저장 | 개인정보 처리방침(건강 정보 포함) 동의의 근거를 계정에 남긴다. 이 칸이 생기기 전 계정은 비어 있다. |

## 7. 미룬 것

- **약관 버전** — `agreedAt` 은 시각만 적는다. 어느 판에 동의했는지 · 약관이 바뀌면 다시 받을지는 정식 출시 전 처리방침 정리(보호책임자 등)와 같이.
- **스피드건 칸** — 투구 설정에 '스피드건이 있나요'를 두지 않았다. 스피드건 값은 구속 측정에서 공마다 받아 보정 짝을 만든다.
- **구속 측정 설정** — 카메라 위치 · 화질 · 처음 안내는 `/velocity` 안의 설정 흐름 그대로. 투구 설정과 묶지 않는다.
- **PullToRefresh 새 주소** — 당겨서 새로고침(`components/pull-to-refresh.tsx` PATHS)은 탭 첫 화면 넷뿐이다. 첫 설정 주소는 넣지 않았다(답을 쥔
  마법사 화면이라 당길 까닭이 적다). 필요하면 PATHS 에 더한다.
- **탭 튜토리얼 다시 보기** — 기본 투어만 설정 › 정보에 자리가 있다. 탭 튜토리얼은 열쇠를 지우는 함수(`resetTutorial`)는 있고 단추가 없다.

## 8. 남은 것(확인할 것)

1. ~~줄이 없는 옛 계정의 영양~~ → 고침: 영양 잠금은 '줄 없음 그리고 개편 뒤 가입'(`NUTRITION_LOCK_SINCE` = 한국 시각 2026-10-10 0시).
   그 전에 가입한 계정은 목표 줄이 없어도 예전처럼 열려 있고 배너가 목표 정하기를 권한다.
2. 잠금을 따로 안 보는 곁 화면: `/training/day/[date]`(지난날 보기) · `/training/routine/[id]`(내 루틴 만들기 — 라이브러리의 '루틴에 담기'로
   닿는다). 운동 시작은 서버 동작 · `armcare/play` 가 막으므로 큰 일은 아니다. `app/api/pitch-log` POST 도 잠금을 안 본다(화면 길은 모두 막힘).
3. 화면 확인(2026-10-10 sub1 개발 서버): 가입 6화면을 휴대폰 375 · PC 1536×700 에서 끝까지 넘김(칸이 펴짐 · 3화면 첫 초점이 키 칸 · 소속은
   생년월일로 거름 · 마지막 '가입하고 시작하기'는 안 누름). 투구 · 트레이닝 첫 설정과 투어(앱 · 웹)는 로그인 없는 임시 경로로 그려 확인(지움).
   로그인 뒤 페이지 9개(설정 셋 · 탭 셋 · 홈 · 구속 · 투구 날짜)는 컴파일 오류 없음. 남은 것: 실제 로그인 상태의 잠금 흐림 · 자물쇠 · 투어 →
   관문 차례 · 아이폰 앱 웹뷰 — 새 계정은 공유 DB 에 남으니 시험 계정으로.

## 바뀐 파일

- DB: `prisma/schema.prisma`(User 칸 넷) · `prisma/migrations/20261009170000_feature_setup/migration.sql`(ADD COLUMN 넷 + 옛 계정 UPDATE 둘,
  백업 `db-2026-10-09-14-26.json`).
- 규칙: `lib/feature-locks.ts`(새) · `lib/dal.ts` · `lib/baseline.ts`(`validatePitchBaseline` · `validateWorkoutBaseline` 로 가름, `validateBaseline`
  은 둘을 합친 그대로) · `lib/nav.ts`(`lock` · `applyLocks` · `isLockSideHref`) · `lib/pitching/setup-answers.ts`(새) · `lib/training/setup-answers.ts`(새).
- 서버 동작: `app/actions/auth.ts`(6화면 `trySignup` · `agreedAt`) · `pitch-setup.ts`(새) · `training-setup.ts`(`finishTrainingSetup`) ·
  `nutrition.ts`(`finishNutritionSetup` 주석 · 레이아웃 새로 읽기) · `onboarding-state.ts`(새, `markTutorialDone` · `resetTutorial`) · `workout.ts` ·
  `program.ts`(시작 막기).
- 가입: `app/login/auth-form.tsx` · `components/onboarding/reveal-field.tsx`(새) · `components/onboarding/use-step-wizard.ts`(새).
- 첫 설정: `app/(app)/videos/setup/{page,pitch-setup-wizard}.tsx`(새) · `app/(app)/training/setup/{page,training-setup-wizard}.tsx`(새) ·
  `app/(app)/nutrition/setup/{page,setup-wizard}.tsx`.
- 잠금 막기 · 탭 튜토리얼: `app/(app)/videos/page.tsx` · `training/page.tsx` · `nutrition/page.tsx` · `nutrition/nutrition-view.tsx`(주석) ·
  `pitch-log/[date]/load.ts` · `app/(session)/velocity/{access.ts,page.tsx,measure/page.tsx}` · `workout/{run,warmup}/page.tsx` ·
  `armcare/play/[id]/page.tsx` · `mechanics/play/page.tsx`.
- 셸 · 홈: `app/(app)/layout.tsx`(잠금 · TourGate) · `components/app-shell.tsx` · `components/checkin-gate.tsx` · `components/notice-bell.tsx` ·
  `components/settings-info.tsx` · `app/(app)/today/{page,first-day-card,today-rings}.tsx`.
- 튜토리얼: `components/tutorial/{tutorial-dialog,tour-gate,tab-tutorial,slides}.tsx`(새).
- 문서: 이 문서 · `docs/claude/geum-yunho.md` 4절 15번 · `HANDOFF.md`(김민에게).
