# 받은 뒤 할 일 — 서로에게 남기는 말

두 사람 다 Claude 로 작업한다. 이 파일은 `CLAUDE.md` 가 불러오므로, 이 저장소에서
Claude 로 작업을 시작하면 저절로 읽힌다. 규칙은 `AGENTS.md` 6번.

- **Claude 에게**: `git config user.name` 으로 지금 누가 작업하는지 본다(`Kim Min` =
  김민, `금윤호` = 금윤호). 그 사람 앞으로 온 말이 아래에 있으면, 다른 일을 하기 전에
  사용자에게 먼저 알린다. 명령 실행 같은 할 일은 사용자 허락을 받고 한다.
- 처리한 말은 이 파일에서 지우고 커밋한다. 지난 말은 git 이력에 남는다.
- 공개 저장소다. 비밀번호·키·`.env` 값은 절대 적지 않는다.

---

## 김민에게 — 2026-09-27 · 금윤호(Claude) — 구속 측정 표 추가

네 메모(오류 화면 '다시 시도' · 창 본문 경계 · outbox 틀)는 사용자에게 전하고 지웠다.

**받은 뒤 `npx prisma generate` 하고 개발 서버를 다시 켠다.** 표 둘을 더했다(추가만, 백업 뒤):
`VelocitySession`(한 번 잰 세션 — 화각 · 보정식 · 어디서) · `VelocityPitch`(공 하나 — 구속 · 릴리스
포인트 · 구종 · 코스 · 결과 · 스피드건 값). `prisma/migrations/20260927180759_add_velocity_pitches`.
DB 에는 적용했다. `User` · `PitchLog` 에 관계 줄만 늘었다(칸은 그대로).

- 저장하면 투구 기록 한 건도 같이 생긴다(메모 머리 `[구속 측정]`, `lib/velocity-meta.ts`). 그 표시가
  있는 기록만 공을 지울 때 투구수 · 구속을 다시 맞추고 세션을 지울 때 같이 지운다 — 사람이 적은
  기록은 안 건드린다(`app/actions/velocity.ts`).
- 네 파일을 고친 것: `app/(app)/pitch-log/[date]/load.ts` · `day-client.tsx`(그날 화면에 '구속 측정'
  칸 — `pitch-log/velocity-section.tsx`), `app/(app)/videos/page.tsx` · `videos-client.tsx` ·
  `video-calendar.tsx`(그날 칸에 '카메라 측정 n구 · 최고' 한 줄). 읽기는 `lib/velocity-load.ts`.
- 같은 표에 칸 셋을 더 더했다(기본값 있음, `20260927xxxxxx_velocity_session_setup`): `mode`(투구 · 타구) ·
  `cameraPos`(투수 뒤 · 포수 뒤) · `net`. 이것도 `prisma generate` 한 번이면 된다.
- **엔진(`lib/velocity-engine`)에 방향 옵션 `approach`를 넣었다** — 'receding'(멀어짐, 기본 = 예전 동작) ·
  'approaching'(다가옴, 포수 뒤). `trackBall` 의 크기 조건, `measureVelocity` 의 앞뒤 자르기 · 자세 검사,
  `checkTrackContinuity` 의 부호를 방향에 따라 뒤집는다. 기본값이면 예전과 같고 자가시험 32 + 10 그대로.
- 측정 앞에 설정 단계가 붙었다(지난 설정 → 고르기 → 주의사항 카드 → 수평 · 표적 → 스트라이크 존 → 측정,
  `components/velocity/setup-steps.tsx` · `lib/velocity-setup.ts` · `lib/use-device-level.ts`). 시제품 설명은
  앞서 지운 메모(git 이력 e80c7c3)에 있다.
- **이름은 '불펜 벨로시티'.** 들어가는 길은 투구 기록 탭의 세 번째 보기 [캘린더 | 목록 | 구속 측정]
  (`videos-client.tsx` — 앱 안이거나 관리자일 때만 칸이 붙는다, 일반 계정 웹에서는 숨김). 그 보기
  (`components/velocity/velocity-panel.tsx`)에 로고 · 측정 시작(`/velocity/measure`) · 오늘 요약 · 설정.
  `/velocity` 는 `/videos?view=velocity` 로 보낸다. PC 에서도 폰 틀 안에 보인다. 설정 시트
  (`components/velocity/velocity-settings.tsx`)는 측정 화면 · 이 보기가 같이 쓴다.
- **규칙: 네트 있음 = 수동초점, 네트 없음 = 자동초점**(사용자). 카메라를 켤 때 `focusMode` 를 그렇게
  건다(`live-capture.ts` 의 `applyFocus` — 브라우저가 지원할 때만, 아이폰 사파리는 못 바꾼다). 앱 껍데기를
  만들 때 네이티브 카메라도 같은 규칙으로.
