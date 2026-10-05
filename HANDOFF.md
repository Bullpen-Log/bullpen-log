# 받은 뒤 할 일 — 서로에게 남기는 말

두 사람 다 Claude 로 작업한다. 이 파일은 `CLAUDE.md` 가 불러오므로, 이 저장소에서
Claude 로 작업을 시작하면 저절로 읽힌다. 규칙은 `AGENTS.md` 6번.

- **Claude 에게**: `git config user.name` 으로 지금 누가 작업하는지 본다(`Kim Min` =
  김민, `금윤호` = 금윤호). 그 사람 앞으로 온 말이 아래에 있으면, 다른 일을 하기 전에
  사용자에게 먼저 알린다. 명령 실행 같은 할 일은 사용자 허락을 받고 한다.
- 처리한 말은 이 파일에서 지우고 커밋한다. 지난 말은 git 이력에 남는다.
- 공개 저장소다. 비밀번호·키·`.env` 값은 절대 적지 않는다.

---

## 금윤호에게 — 2026-10-05 · 김민(Claude) — 홈 캘린더 밑 정리(하이라이트) · 분석 · 그래프는 /coach 로

받은 뒤 할 일 없음(DB · 패키지 그대로). 네 영역(홈)을 크게 바꿨다 — 사용자: "분석이랑 돌아보기가 주구절절 작은 글씨로 잡다한
정보가 많다 · 너무 길어지는 건 싫다", 김민이 "내가 만들어도 되니까 바꿔줘".
- **홈**(`app/(app)/today/page.tsx`): 위는 '오늘', 캘린더 밑은 '달라진 것'. 링 카드 밑에 오늘(이미 던졌으면 내일) 알맞은 투구 한 줄
  (투구 계획 `plan.today` · 누르면 `/coach?view=pitch`), 캘린더 밑에 **하이라이트** 최대 3장(`highlights.tsx`, 규칙은 순수 함수
  `lib/report/highlights.ts` — 안전(부하 주의·위험 · 컨디션 며칠째 낮음 · 투구 기록 3일+ 빔) → 성장(구속 새 기록 · 오름) → 꾸준함(운동
  지난주보다 늘음 · 체크인 7의 배수 연속), 없으면 '크게 달라진 건 없어요' 한 장, 시험 `npm run highlights:test`) + '분석 · 그래프 더 보기'.
- **돌아보기**(`summary-panel.tsx`)는 지웠다 — 부하 두 줄은 분석 칸에, 이번 주 숫자는 그래프 · 하이라이트에, 최근 기록은 캘린더 '목록'에 있다.
- **분석 칸 + 그래프**는 지운 것 없이 `/coach`(예전 분석 탭 주소)로 옮겼다 — `coach/page.tsx` · `coach/analysis-body.tsx`(날짜를 이 화면이 쥔다).
  처음 칸은 투구(AI 리포트를 꺼 둔 동안 '멈췄어요'가 첫 칸이던 것). 옛 주소 `/today?analysis=` · `/coach/report/<날짜>` 도 여기로.
  메뉴는 `/coach` 에서도 '홈'에 불(`lib/nav.ts` NAV_ALSO).
- 캘린더 판(`pitch-log-panel.tsx`)에서 분석 · 그래프 · `jumpTo` · `weightByDay` 를 뺐다. 그날 칸 머리에 '그날 분석'(리포트 있는 날은
  '그날 리포트') 한 줄 → `/coach?date=`. 열세 달 기록 읽기는 `today/history.ts`(`loadPitchHistory`)로 떼어 홈 · `/coach` 가 같이 쓴다.

## 금윤호에게 — 2026-10-05 · 김민(Claude) — 홈 '여기부터 시작하세요' 카드를 단추로

받은 뒤 할 일 없음(DB · 패키지 그대로). 네 영역(홈)을 한 곳 건드렸다 — 사용자: 앱 방향 검토의 'A4 첫날 보상'.
- `app/(app)/today/page.tsx` 의 첫 기록 전 카드(`!core.everLogged`)를 새 부품 `first-day-card.tsx` 로 바꿨다. '알림(종)을 눌러 …' 글 대신
  오늘 알맞은 투구(투구 계획 `plan.today` 그대로 · `pitchRangeText`) + [오늘 투구 남기기] [오늘 안 던졌어요] 단추 + '첫 운동 만들기'.
  '오늘 안 던졌어요'는 종과 같은 길(`/api/pitch-log` 에 '휴식' 한 줄).
- 가입의 '소속'은 건드리지 않았다(네가 9-30 에 필수로 정한 것).

## 금윤호에게 — 2026-10-04 밤 · 김민(Claude) — 근력 · 파워 프로그램(DB 표 · 칸 추가)

**받은 뒤 할 일: `npx prisma generate`** (켜 둔 개발 서버는 다시 켜기). 마이그레이션 `20261004170000_training_programs` 는 이미
공유 DB 에 적용했다(백업 `db-2026-10-04-07-37.json` 뒤). 더하기만 했다 — 새 표 `UserTrainingProgram`, 새 칸 `UserExerciseSet.rir`(비울 수 있음).
설계는 `docs/designs/pitcher-strength-power-programs.md`, 규칙은 `lib/program/*`(셀프테스트 `npm run program:test`).

같이 쓰는 곳을 건드린 것(네 영역은 아님):
- `lib/report/prescription.ts` 의 `selectCandidates` 에 `partsOnly` 옵션(기본 false — 지금 동작 그대로). 프로그램이 부위 규칙만 쓴다.
- `lib/report/theme.ts` 의 `LOW_CONDITION_THRESHOLD` · `hardOuting` 을 export 만 했다.
- 운동 시작의 판 열기를 `lib/workout/open-session.ts` 로 옮겼다(startWorkout 동작은 같다). 다시 열기 병합은 `mergeReopened`(session-plan.ts).
- 세트 대기열(`lib/workout/outbox.ts` PendingSet)에 `rir?` 칸, `logSet` 이 받는다. 저절로 닫기(`close-stale.ts`)가 끝에 `advanceProgramDay` 를 부른다.
- `package.json` 의 `outbox:test` 에 `--import ./scripts/alias-register.mjs` 를 붙였다 — 전부터 `@/` 경로를 못 찾아 시작도 못 했다.

## 금윤호에게 — 2026-10-04 저녁 · 김민(Claude) — AI 티 줄이기 1~4단계(화면 글 · 모양 · 첫인상 · 실밥 무늬)

받은 뒤 할 일 없음(DB · 패키지 그대로). 사용자: "AI 가 만든 앱 같은 느낌이 안 나게 — 인테리어(화면 · 구성)". 네 영역도 글 · 모양만 바뀌었다.

- **글**: 화면 글의 줄표(—) 170여 곳을 마침표 · 쉼표로, 긴 설명을 한두 줄로, 문장 속 굵게를 뺐다. 서버 동작 · API 오류 메시지는 해요체
  ('로그인이 필요해요.'). 영양 화면 · `lib/nutrition` 가이드 · 식단 까닭도 글만 바뀌고 값 · 키는 그대로(nutrition:test 387 통과).
  **새 글은 줄표 없이, 짧게, 해요체로.** 메커니즘 '흔한 실수' 칩은 이제 첫 마침표로 자른다(`lib/mechanics/elements.ts` · `mechanics-guide.tsx`).
- **모양**: 메커니즘 앱 색 보라 → 깊은 파랑(`--color-app-mechanics` #1f5fa8), 반짝이(✨) 그림 뺌('AI 맞춤' 글자는 그대로), 트레이닝 홈 앱
  아이콘은 칠한 네모 + 흰 그림, 제목 앞 아이콘 · 빛 그라데이션(`bg-spotlight`) · PC 영어 머리글(`PageHeading` 의 `eyebrow` 는 이제 안
  보인다 — 영양 머리의 'Nutrition' 도 뺐다)을 걷었다. `animate-fade-in` 은 옅어지기만(커지며 튀어나오지 않음).
- **첫인상**: 소개 화면(`app/page.tsx`)을 새로 짰다 — 구체적인 제목 · 앱 모양 예시 카드 · 숫자로 쓴 세 줄. 로그인 화면 빛 그라데이션 걷음.
- **불펜로그다움 = 실밥 무늬**(사용자가 고름): `seam-corner`(EmptyState 귀퉁이) · `seam-hero`(소개 · 로그인) · `stitch-rule`(PC 쪽 머리 밑줄,
  실선 대신 바느질 땀 — 영양 머리도) — globals.css 의 `--seam` · `--stitch`(다크 · 네이비는 흰빛). 낮은 글 상자(`empty-well`)에는 안 깐다.

## 금윤호에게 — 2026-10-04 · 김민(Claude) — 메커닉 프로그램 손질(74ac438 ~ 56bdd3f)

받은 뒤 할 일 없음(DB · 패키지 그대로). 네 영역은 투구 기록 한 곳만 건드렸다.
- **투구 기록 `/videos?compare=1`**(videos/page.tsx · videos-client.tsx `initialCompare`): 목록에서 비교할 둘을 고르는 자리로 바로 연다.
  메커닉 프로그램이 세션 6번마다 '찍어서 2분할 비교로 견줘 보세요'에서 여기로 보낸다.
- 메커닉 화면은 드릴 이름 앞의 P1~P5 를 떼고 보인다(`lib/mechanics/drills.ts` familyTitle) — 라이브러리 DB 이름은 그대로.

## 금윤호에게 — 2026-10-04 · 김민(Claude) — 투구 드릴 자세 설명 121개를 드라이브라인 · 트레드 기준으로 다시 씀(운영 DB)

받은 뒤 할 일 없음. **같이 쓰는 라이브러리(투구 드릴 설명)를 운영 DB 에서 바꿨다** — 사용자: "자세 설명도 모두 트레드,
드라이브라인 기반으로". 쓰기 전에 `npm run backup`(`db-2026-10-04-06-14.json`, 옛 글은 여기 있다).
- 새 글은 `scripts/mechanics-descriptions-2026-10-04.mts`(미리 보기 · `--apply`). 동작 차례는 영상에 맞춰 두고, 목적 · 세기 ·
  근거와 부딪히던 손질점만 두 곳 기준으로. 틀은 '■ 어떤 운동인가 / ■ 이렇게 하세요 / ■ 왜 하나요 / ■ 세기'(합니다체).
- 드릴 캐시 이름을 `library:guides:v4` 로 올렸다. 관리자 화면에서 드릴 설명을 고칠 때도 두 곳에 있는 것만 쓴다(근거 목록은
  `lib/mechanics/elements.ts` 머리).
- **이어서 투구 드릴 13개를 새로 넣었다(운영 DB, 백업 `db-2026-10-04-06-48.json` 뒤)** — 사용자: "13개 다 넣어줘". 메커닉 프로그램의
  빈칸(몸통 회전 · 스로잉 통합, 상하체 분리 연결 · 통합 등)을 트레드 · 드라이브라인이 쓰는 드릴로 채웠다: 턴 앤 번 · 로테이셔널 스텝백 ·
  바우어 · 스텝 비하인드 · 8자 리듬 로커 · 롤인 · 리듬 로커 · KBO 로커 · 훅엠 · 재니터 · 풋다운 로커 · 메디신볼 앞다리 블록 회전 · 라소.
  넣은 것과 근거는 `scripts/mechanics-new-drills-2026-10-04.mts`. 보이는 드릴 121 → 134개, 캐시 이름 `library:guides:v5`.
- **같은 날 5개 더(백업 `db-2026-10-04-06-57.json` 뒤)** — 사용자: "남은 빈칸영상도 찾아서 넣어줘". 허들 착지 스로우 · 메디신볼 턴 앤 번 숏풋
  (브레이크 통합) · 메디신볼 회전 숏풋 · 스텝 비하인드 회전 메디신볼 숏풋 · 좌우 메디신볼 슬램(상하체 분리 메디신볼). 턴 앤 번 스로우 설명의
  시작 자세를 영상대로 고쳤다(목표를 등지고 시작). 보이는 드릴 139개, 캐시 이름 `library:guides:v6`.
