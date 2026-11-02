# 유료 AI 코치 — 데스크톱 → 맥 인계(2026-11-02, 김민)

데스크톱(윈도우)의 Claude 가 만든 것을 맥에서 이어 하려고 남긴다. **코드는 모두 GitHub main 에 있다**(마지막 코치 커밋 `5052aa59`).
설계 전체 · 결정(U1~U45) · 단계마다 '진행' 메모는 `docs/designs/ai-coach.md` 10절 — 이 문서는 그것을 찾아 읽는 길잡이다.

## 0. 맥에서 처음 할 일(차례대로)

1. `git pull`
2. `npm ci` — `@anthropic-ai/sdk` · `zod` 를 다시 넣었다(유료 코치 대화에만).
3. `npx prisma generate` — 코치 표 다섯 · 동의 칸 · `DailyTrainingNote.discomfort` 가 늘었다. **마이그레이션은 공유 DB 에 이미 걸려 있다**(Vercel 빌드가 걸었다). `migrate dev` · `db push` 는 쓰지 않는다(AGENTS.md 1번).
4. `npm run coach:test`(20,800) · `npm run coach:ai-test`(21, API 안 부름)가 통과하는지.
5. 실제 AI 를 맥 개발 서버에서 부르려면 맥 `.env` 에 `ANTHROPIC_API_KEY`(값은 채팅에 붙여 넣지 않는다). 없어도 코치는 정해진 문장으로 돈다.

## 1. 사용자(김민) 몫 — 아직 확인 못 함

- Vercel 환경변수 **`ANTHROPIC_API_KEY`** · **`CRON_SECRET`**(아무 긴 글자) → Redeploy. 11-01 밤에 "지금 넣을게"라고 했다 — 넣었는지 먼저 물어본다.
  `CRON_SECRET` 이 없으면 매일 18시 작업(`/api/cron/daily`)이 401 로 아무것도 안 한다(주간 리뷰 알림 · 30일 지난 대화 지우기).
- 선택: `COACH_AI_MONTHLY_USD`(기본 30, 0 이면 AI 끔) · `COACH_MODEL_CHAT`(기본 claude-opus-5-5).
- Anthropic 콘솔 지출 한도(예: 월 $40) — 코드가 틀려도 거기서 막히게.
- 출시 전: Anthropic 쪽 보관 기간 · 학습 미사용 조건을 확인해 `lib/coach/ai-consent.ts` 의 `retention` 자리(지금 '확인 중')를 채우고 `version` 을 올린다.
- **폰 · 시뮬레이터에서 아직 한 번도 안 봤다**(데스크톱이라 못 굽는다). 맥에서 먼저 보면 좋은 것: 아래 3절 '폰에서 볼 것'.

## 2. 된 것(커밋 · 설계 절)

| 단계 | 커밋 | 무엇 |
|---|---|---|
| A1 탭 | `08ac889a` | 하단 탭 홈 · 코치 · 투구 · 트레이닝 · 덕아웃(앱 판 14), 기록은 투구 탭 고르개 |
| C1 계획기 | `d66e40dd` | `lib/coach/week.ts planWeek` — 7칸에 무엇 · 몇 분 · 큰 하체, 엔진 규칙표를 읽음 |
| C2 표 | `9590b1a5` | Entitlement · CoachProfile · CoachWeek · CoachLog · CoachMessage, 관리자 '코치 켬/끔' |
| B1 동의 판정 | `f108dd36` | 건강정보 동의(purpose 'health') · 보호자 동의 판정 |
| C3 처음 질문 | `c37bcf1d` `cec12377` | 앱 `/coach-start`(소개 → 내 정보 → [건강 동의] → 질문 6 → 첫 주 미리보기 → 시작), PC `/coach` 이번 주 카드(읽기만) |
| C4 코치 메인 | `a0accb30` `59f368da` `f9581d5a` `00e10c09` | 오늘 카드 · 7칸 ✓/못 함 · 조정 단추(시간 · 쉬기 · 옮기기 · 바쁜 주) · 오늘 운동 만들기가 코치 분을 기본 시간으로 · 쉬는 날에 만들면 그날은 내 것 · 홈 카드 |
| C5 되먹임 · 리뷰 | `a8120e42` `ccffde8f` `5f5538ee` | 운동 끝 '불편했던 동작' → 다음 7일 뒤로 미룸 · 일요일 18시 ~ 월요일 주간 리뷰 카드 · 크론 · 일요일 알림 |
| 6단계 AI 대화 | `5052aa59` | 앱 [코치에게 말하기] 시트 · 국외 이전 동의 · 막는 판정(동의 → 만 14세 → 열쇠 → 월 $30 → 하루 30마디) · 바꿀 거리 [미리보기] → [적용] · 처리방침에 Anthropic |

각 단계의 '설계와 다르게 한 것'은 `docs/designs/ai-coach.md` 10-4 · 10-5 · 10-6 의 **진행** 메모에 다 있다.

## 3. 남은 것(추천 차례)

1. **실제 AI 호출 시험** — 열쇠가 들어간 뒤, 사용자 허락을 받고(돈이 든다, 10번에 50센트 안쪽). 한국어 말 10개: 팀 훈련 생김 · 바쁨 · 30분만 · '아파요' · '무게 알려 줘' · 엉뚱한 말 · 규칙 무시하라는 말 …
   → 바꿀 거리 · 거절 · 안내가 맞는지, `CoachLog` 의 `cacheTok`(캐시 읽기)이 둘째 마디부터 0 이 아닌지. 부르는 곳은 `lib/coach/ai.ts chatTurn`.
2. **코치 설정 화면** — 'AI 끄기'(`coach-chat.revokeCoachAi`) · '대화 지우기'(`clearCoachChat`) 단추. 서버는 있고 화면이 없다. 코치 탭 맨 밑 '코치 답 고치기' 옆이 자리.
3. **6-⑤ 설명 문장** — 오늘 칸 까닭 · 주간 리뷰를 Haiku 5.5(`claude-haiku-5-5`)가 한두 문장으로. 하루 한 번만 부르고 저장(사용자 · 날짜 · 칸 지문이 같으면 다시 안 부름 — 저장 자리는 아직 안 정함).
   글 속 숫자가 넘긴 숫자 안에 있어야 쓰고, 아니면 정해진 문장. 판정은 `aiGate('explain', …)`.
4. 폰에서 볼 것(대표 계정): 코치 탭 → [코치 시작하기] → 미리보기 → 시작 → 7칸 · 조정 단추 미리보기 → 적용 · 오늘 운동 만들기 까닭 줄 맨 앞 '코치 계획 N분' ·
   운동 끝 '불편했던 동작' · 홈 '오늘의 코치 계획' · [코치에게 말하기] 동의 → 대화 → 카드 적용.
5. 미룬 것(사용자가 정해야 함): B2 · B3 만 14세 미만 보호자 동의(메일 업체 Q8 필요) · B4 건강 동의 철회 화면(철회 때 `discomfort` 지우기) · C1-2 레슨 '한 일' → 운동량(엔진 판정이 바뀌어 먼저 묻기) · C1-3 체크인 등판 화면.

## 4. 파일 지도

- 순수(시험 있음): `lib/coach/week.ts`(계획기) · `answers.ts`(답 · 칸 글) · `status.ts`(칸 상태) · `adjust.ts`(조정 · AI 바꿀 거리 거르기) · `review.ts`(주간 리뷰) · `ai-gate.ts` · `ai-price.ts` · `ai-prompt.ts` · `ai-consent.ts`
- 서버만: `lib/coach/today.ts`(그날 칸 · 불편 동작 미루기 · `coachWeekBase`) · `lib/coach/notices.ts`(일요일 알림) · `lib/coach/ai.ts`(Anthropic 부르기) · `lib/coach-access.ts coachPaid`
- 서버 동작: `app/actions/coach.ts`(시작 · 이번 주 · 조정 · 리뷰 · 불편 동작 · 하루의 주인) · `app/actions/coach-chat.ts`(AI 대화) — 둘 다 `lib/release-ops.ts` 'analysis'(베타엔 대표관리자만)
- 트레이닝에 닿은 곳: `app/actions/training-setup.ts generateTodayPlan`(코치 분 · 하루의 주인 · 불편 동작) — `scripts/training-selftest.mts` 원문 검사 한 줄을 그에 맞게 고쳤다(1821 통과 · 실패 2 는 전부터)
- 앱: `native/src/coach/tab.tsx`(코치 탭) · `adjust.tsx` · `discomfort.tsx` · `note.tsx`(운동 화면 한 줄) · `home-card.tsx` · `native/src/app/coach-start.tsx` · `coach-chat.tsx`
- 웹: `app/(app)/coach/week-card.tsx` · 크론 `app/api/cron/daily/route.ts` + `vercel.json` crons

## 5. 지킨 규칙(맥에서도 같게)

- 엔진 파일(`lib/report/*` · `lib/engine/*` · `lib/program/*`)의 판정은 안 바꿨다 — 입력(기본 시간 · '바꿔서 뺀 횟수')에만 얹었다. 판정을 바꿀 일이면 먼저 묻는다.
- AI 는 유료 코치의 대화 · 설명에만(2026-11-01 예외). AI 가 일정을 직접 바꾸지 않는다 — 바꿀 거리 → 서버 거르기 → 사용자 [적용].
- DB 구조를 바꾸면 백업(`npm run backup`) → `migrate diff --from-schema <옛 스키마> --to-schema` 로 SQL(옛 VelocityAttempt 외래키 셋이 안 섞이게) → 금윤호에게 HANDOFF.
- 금윤호 영역(앱 틀 · 운동 화면 등)을 고치면 HANDOFF 에 적는다. 이번 코치 작업의 HANDOFF 글은 이미 올라가 있다.
- 새 서버 동작을 앱이 부르면 `npm run native-api:test -- --update`, 새 모듈은 registry · `lib/release-ops.ts` 줄.
