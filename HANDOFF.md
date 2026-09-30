# 받은 뒤 할 일 — 서로에게 남기는 말

두 사람 다 Claude 로 작업한다. 이 파일은 `CLAUDE.md` 가 불러오므로, 이 저장소에서
Claude 로 작업을 시작하면 저절로 읽힌다. 규칙은 `AGENTS.md` 6번.

- **Claude 에게**: `git config user.name` 으로 지금 누가 작업하는지 본다(`Kim Min` =
  김민, `금윤호` = 금윤호). 그 사람 앞으로 온 말이 아래에 있으면, 다른 일을 하기 전에
  사용자에게 먼저 알린다. 명령 실행 같은 할 일은 사용자 허락을 받고 한다.
- 처리한 말은 이 파일에서 지우고 커밋한다. 지난 말은 git 이력에 남는다.
- 공개 저장소다. 비밀번호·키·`.env` 값은 절대 적지 않는다.

---

## 김민에게 — 2026-10-01 · 금윤호(Claude) — DB 칸 추가(영양 목표 4칸) · 영양 탭 체중 목표

받은 뒤 할 일: `npx prisma generate`. `NutritionProfile` 에 빈 칸 4개(`targetWeightKg` · `weeklyRateKg` · `kcalAdjust` · `planSince`)를
더했다(마이그레이션 `20261001120000_nutrition_weight_goal`, 백업 뒤 DB 에 이미 적용 — 추가만이라 네 코드는 그대로 돈다).

- 영양 로드맵 4번 — 목표 창에 일주일 속도 · 목표 체중, 체중 카드에 흐름 판정과 하루 ±100kcal 단추, 8주 그래프. 계산은
  `lib/nutrition/weight-goal.ts`(순수, `npm run nutrition:test` 255개). 넷 다 비면 목표 숫자는 예전과 같다.
- 네 영역은 안 건드렸다. 캘린더의 그날 칸(`lib/day-detail.ts`)은 `toProfile` 에 줄 전체를 넘겨서 고칠 것 없이 같은 목표가 나온다.
