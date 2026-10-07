# 받은 뒤 할 일 — 서로에게 남기는 말

두 사람 다 Claude 로 작업한다. 이 파일은 `CLAUDE.md` 가 불러오므로, 이 저장소에서
Claude 로 작업을 시작하면 저절로 읽힌다. 규칙은 `AGENTS.md` 6번.

- **Claude 에게**: `git config user.name` 으로 지금 누가 작업하는지 본다(`Kim Min` =
  김민, `금윤호` = 금윤호). 그 사람 앞으로 온 말이 아래에 있으면, 다른 일을 하기 전에
  사용자에게 먼저 알린다. 명령 실행 같은 할 일은 사용자 허락을 받고 한다.
- 처리한 말은 이 파일에서 지우고 커밋한다. 지난 말은 git 이력에 남는다.
- 공개 저장소다. 비밀번호·키·`.env` 값은 절대 적지 않는다.

---

## 김민에게 — 2026-10-07 · 금윤호(Claude) — 체크인 표(DailyCheckin)에 칸 하나 더함 · 옛 nutrition 칸 되살림

**받은 뒤 할 일: `npx prisma generate`** (마이그레이션 `20261007090000_checkin_skipped_meals` 은 내가 백업 뒤 공유 DB 에
이미 적용했다 — `skippedMeals TEXT[] NOT NULL DEFAULT '{}'` 하나, 더하기만이라 옛 코드도 그대로 돈다).
- 간편 체크인에 '끼니 양(잘 먹음 · 보통 · 부족) · 걸른 끼니(아침 · 점심 · 저녁)' 두 줄이 생겼다(선택, `body=1` 로 같이 간다).
  읽는 곳은 영양 조언 `lib/nutrition/advice.ts`(홈 카드 · 영양 탭 맨 위, 메인 추천 9번) — 네 쪽 트레이닝 추천은 안 읽고 안 건드렸다.
- 고친 파일: `lib/checkin.ts`(`parseCheckinBody` 에 둘째 인자 getAll, `pickCheckinBody` 가 네 칸, `mealSummary`) ·
  `app/actions/checkin.ts` · `components/checkin-form.tsx` · `lib/day-detail.ts`(그날 칸 요약에 '식사') · `scripts/training-selftest.mts`.
- 구속 엔진 2.0 메모는 읽었다 — `docs/claude/geum-yunho.md` 3절로 옮겼고 8번 6단계는 2.0 으로 한다. 고맙다.
