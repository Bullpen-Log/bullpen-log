# 받은 뒤 할 일 — 서로에게 남기는 말

두 사람 다 Claude 로 작업한다. 이 파일은 `CLAUDE.md` 가 불러오므로, 이 저장소에서
Claude 로 작업을 시작하면 저절로 읽힌다. 규칙은 `AGENTS.md` 6번.

- **Claude 에게**: `git config user.name` 으로 지금 누가 작업하는지 본다(`Kim Min` =
  김민, `금윤호` = 금윤호). 그 사람 앞으로 온 말이 아래에 있으면, 다른 일을 하기 전에
  사용자에게 먼저 알린다. 명령 실행 같은 할 일은 사용자 허락을 받고 한다.
- 처리한 말은 이 파일에서 지우고 커밋한다. 지난 말은 git 이력에 남는다.
- 공개 저장소다. 비밀번호·키·`.env` 값은 절대 적지 않는다.

---

## 김민에게 — 2026-10-07 · 금윤호(Claude) — 체크인 표(DailyCheckin)에 칸 하나 더함 · 옛 nutrition 칸 되살림 · 홈 영양 카드

**받은 뒤 할 일: `npx prisma generate`** (마이그레이션 `20261007090000_checkin_skipped_meals` 은 내가 백업 뒤 공유 DB 에
이미 적용했다 — `skippedMeals TEXT[] NOT NULL DEFAULT '{}'` 하나, 더하기만이라 옛 코드도 그대로 돈다).
- 간편 체크인에 '끼니 양(잘 먹음 · 보통 · 부족) · 걸른 끼니(아침 · 점심 · 저녁)' 두 줄이 생겼다(선택, `body=1` 로 같이 간다).
  읽는 곳은 영양 조언 `lib/nutrition/advice.ts`(홈 카드 · 영양 탭 맨 위, 메인 추천 9번) — 네 쪽 트레이닝 추천은 안 읽고 안 건드렸다.
- 홈에 '영양' 카드 하나가 늘었다(`app/(app)/today/nutrition-card.tsx`, 링 바로 밑) · 홈 링 '영양'은 균형 점수. `globals.css` 끝에
  `count-up`(@property 정수 + counter) 을 더했다 — 네 영역이라 알린다, 다른 건 안 건드렸다.
- 고친 파일: `lib/checkin.ts`(`parseCheckinBody` 에 둘째 인자 getAll, `pickCheckinBody` 가 네 칸, `mealSummary`) ·
  `app/actions/checkin.ts` · `components/checkin-form.tsx` · `lib/day-detail.ts`(그날 칸 요약에 '식사', `loadDayDetailCached`) ·
  `scripts/training-selftest.mts`.
- 네 글 둘(구속 엔진 2.0 · AI 뺌)은 읽었다 — `docs/claude/geum-yunho.md` 3절 · 4절로 옮겼고, `npm ci` · 4절 'AI' 줄도 고쳤다. 고맙다.

## 김민에게 — 2026-10-07 · 금윤호(Claude) — 웹에도 시작 연출(네 IntroOverlay 와 같은 장면) · 앱 연출 바탕을 테마색으로 부탁

받은 뒤 할 일(앱을 다시 구울 때, 할 수 있으면): `MainViewController.swift` 의 `IntroOverlay` 바탕이 밝은 종이색(`paper` #f4f7fb) 고정인데,
사용자가 "테마에 맞는 배경색"을 원한다 — 사이트가 보내는 `bullpenTheme` 색(지금도 받아서 웹뷰 바탕에 칠한다)을 UserDefaults 에 적어
두었다가 다음 시작의 판 바탕으로 써 주면 된다(처음엔 종이색, 글자 그림 IntroWord 는 어두운 바탕에선 안 보이니 그때는 글자색도
ink 쪽으로 — 어렵다면 B 만). 나는 Swift 를 굽지 못해 손대지 않았다.
- 웹(로그인한 채 사이트를 열 때)에 네 판과 같은 장면 · 같은 때의 시작 연출을 넣었다(`components/app-splash.tsx`, `globals.css`
  'app-splash'). 앱 UA 에서는 안 튼다(네 판이 하니까). 체크인 관문(`checkin-gate.tsx`)은 `<html data-splash>` 가 걷힌 뒤 뜬다.
- 소개 화면(`app/page.tsx`)은 로그인했으면 곧장 /today 로 간다(앱 안은 전부터 그랬다).

## 금윤호에게 — 2026-10-07 · 김민(Claude) — 구속 엔진 2.1.2(웹킷 끝 판정 · 세션 거리 · 지난 세션 거리)

받은 뒤 할 일 없음(DB · 패키지 그대로). 2.1.0 · 2.1.1 다음 것만 — 네 영역(구속 측정)이다. 커밋 ce4b202.
- 웹킷(앱)이 푼 장면을 사파리에서 통째로 받아(`~/bullpen-velocity-lab/webkit-frames`, 실험대 `VELO_FRAMES=…/webkit-frames`) 노드에서
  재현했다. 장면은 크롬과 같고 덩어리만 0.5~1.8px 커서 '이어 찾기'가 그물에 닿은 뒤 흔들리는 그물을 7~8장 붙였다(119 · 129, 줄자
  거리면 −13~−19km/h). `analyze-distance.ts`: 끝 뒤 덩어리가 한 직선으로 날던 길에서 벗어나면(맞고 튐) 이어 찾지 않음 · 넣은 거리인데
  이어 찾은 끝이 공 크기로 18% 넘게 멀면 빼고 다시 맞춤.
- 측정 화면 `withSessionDistance`: 끝이 깨끗한 공(맞고 튄 공으로 끝, 이어 찾기 없음)이 3개부터 공 크기 거리 중앙값을 쓴다(카메라 ·
  파일 따로). 사파리 '파일로 재기' 밖 13개: 공마다 MAE 2.1 · 최대 7.9 → 세션 1.5 · 최대 3.9(그물 밑으로 빠진 111 뺌). 실내(흰 천)는
  세션을 안 쓰고 그대로(MAE 5.5).
- 세션 첫 공부터: 세션 거리 규칙을 `lib/velocity-session-distance.ts` 로 뗐다. 카메라 세션이 깨끗한 공 3개를 넘기면 그 중앙값을 폰
  (localStorage `bullpen-velocity-dist-memory`, 30일)에 남기고, 다음 세션 공 1~2개는 그 거리를 공 2개 몫으로 섞는다(공이 모두 6% 안,
  화면 '(지난 세션 + 공 크기)'). 사파리 밖 13개 흉내로 첫 두 공 평균 오차 2.1 → 1.6~1.9km/h(폰 자리가 같거나 2% 안). 3개째부터는
  이번 세션 값만 써서 저장값은 기억과 상관없다. 시험 `npm run velocity:engine2-test` 27개.

