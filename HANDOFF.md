# 받은 뒤 할 일 — 서로에게 남기는 말

두 사람 다 Claude 로 작업한다. 이 파일은 `CLAUDE.md` 가 불러오므로, 이 저장소에서
Claude 로 작업을 시작하면 저절로 읽힌다. 규칙은 `AGENTS.md` 6번.

- **Claude 에게**: `git config user.name` 으로 지금 누가 작업하는지 본다(`Kim Min` =
  김민, `금윤호` = 금윤호). 그 사람 앞으로 온 말이 아래에 있으면, 다른 일을 하기 전에
  사용자에게 먼저 알린다. 명령 실행 같은 할 일은 사용자 허락을 받고 한다.
- 처리한 말은 이 파일에서 지우고 커밋한다. 지난 말은 git 이력에 남는다.
- 공개 저장소다. 비밀번호·키·`.env` 값은 절대 적지 않는다.

---

## 김민에게 — 2026-10-01 · 금윤호(Claude) — DB 칸 · 표 추가(영양 목표 구체화 · 식단 계획)

받은 뒤 할 일: `npx prisma generate` 하고 개발 서버를 다시 켠다. `NutritionProfile` 에 칸 7개(`proteinTargetG` · `goalEndDate` ·
`seasonPhase` · `dietStyle` · `mealPattern` · `avoidFoods`(빈 배열 기본) · `allowSupplements`(true 기본)), 새 표 `MealPlan`
(마이그레이션 `20261001140000_nutrition_diet_plan`, 백업 뒤 DB 에 이미 적용 — 모두 추가만이라 네 코드는 그대로 돈다).

- 지금 쓰는 것은 `proteinTargetG`(영양 목표 창 '하루 단백질을 직접 정하기')뿐이다. 나머지는 이어서 만드는 '목표 구체화 · 식단 짜기'용.
- `ProfileSettings` 에 `proteinTargetG` 가 생겼다 — 캘린더 그날 칸(`lib/day-detail.ts`)은 `toProfile` 을 거쳐 고칠 것 없이 같은 목표가 나온다.

## 김민에게 — 2026-10-01 · 금윤호(Claude) — DB 표 추가(MealCombo) · 영양 탭 자주 먹는 조합

받은 뒤 할 일: `npx prisma generate` 하고 개발 서버를 다시 켠다. 새 표 `MealCombo` 하나를 더했다(마이그레이션
`20261001130000_nutrition_meal_combo`, 백업 뒤 DB 에 이미 적용 — 추가만이라 네 코드는 그대로 돈다). `User` 에는 관계 줄
`mealCombos` 만 붙었다(DB 칸은 안 바뀜).

- 영양 로드맵 6번 — 끼니를 조합으로 저장해 음식 창에서 한 번에 담는다. 계산은 `lib/nutrition/combos.ts`(순수),
  저장은 `app/actions/nutrition.ts` 의 `saveMealCombo` · `deleteMealCombo` · `markComboUsed`. 네 영역은 안 건드렸다.

## 김민에게 — 2026-10-01 · 금윤호(Claude) — DB 칸 추가(영양 목표 4칸) · 영양 탭 체중 목표

받은 뒤 할 일: `npx prisma generate`. `NutritionProfile` 에 빈 칸 4개(`targetWeightKg` · `weeklyRateKg` · `kcalAdjust` · `planSince`)를
더했다(마이그레이션 `20261001120000_nutrition_weight_goal`, 백업 뒤 DB 에 이미 적용 — 추가만이라 네 코드는 그대로 돈다).

- 영양 로드맵 4번 — 목표 창에 일주일 속도 · 목표 체중, 체중 카드에 흐름 판정과 하루 ±100kcal 단추, 8주 그래프. 계산은
  `lib/nutrition/weight-goal.ts`(순수, `npm run nutrition:test` 255개). 넷 다 비면 목표 숫자는 예전과 같다.
- 네 영역은 안 건드렸다. 캘린더의 그날 칸(`lib/day-detail.ts`)은 `toProfile` 에 줄 전체를 넘겨서 고칠 것 없이 같은 목표가 나온다.
