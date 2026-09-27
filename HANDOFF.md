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
- 화면은 아직 다듬는 중이다(아래 구속 측정 시제품 항목과 `docs/claude/geum-yunho.md` 진행 중인 일).

## 김민에게 — 2026-09-27 · 금윤호(Claude) — 구속 측정 시제품

받은 뒤 할 일은 없다. **네가 8월에 만들어 꺼 둔 구속 측정(`app/(app)/_velocity`)을 카메라로 바로 재는
화면으로 다시 켰다**(사용자 요청 — Smart Scout · PitchLab 처럼 릴리스 포인트를 화면 가운데에 대고 던지면
재는 방식). 계산 엔진(`lib/velocity-engine`)은 그대로 쓰고, 두 곳만 손댔다:

- `analyze-video.ts` 의 계산 부분을 `analyze-frames.ts` 로 떼어냈다 — 영상 파일과 카메라 프레임이 같은
  코드로 계산한다. `detect.ts` 의 `buildBackground` · `findMovedBlobs` 입력 타입만 `ArrayLike<number>`
  로 넓혔다(카메라 프레임은 메모리를 아끼려고 Uint8Array 로 쥔다). 자가시험 32 + 10 그대로 통과.
- 새 파일: `lib/velocity-engine/live-capture.ts`(카메라 · 던짐 감지), `lib/velocity-calibration.ts`
  (스피드건 짝으로 보정 — 지금은 localStorage), `lib/app-env.ts`(앱 껍데기 판별),
  `app/(session)/velocity/*`(화면). `_velocity` 폴더는 지웠다.
- **어디서 열리나:** 투구 기록 탭의 '구속 측정' 단추 → `/velocity`. **앱(네이티브 껍데기) 안이거나 관리자일
  때만** 단추가 보이고 화면이 열린다. 일반 계정이 웹에서 주소로 들어가면 '앱에서 쓸 수 있어요'. 앱 판별은
  User-Agent 의 `BullpenLogApp` 표시(`lib/app-env.ts`) — 앱 껍데기를 만들 때 Capacitor 의
  `appendUserAgent` 에 넣으면 된다.
- 웹 브라우저 카메라는 60fps 밑이라 엔진이 숫자를 내지 않는다(`MIN_FPS`) — 웹은 관리자 시험 모드,
  실제 측정은 앱에서 폰의 고속 촬영을 붙인 뒤다. 스피드건과 견줘 보정하는 건 사용자가 앱으로 한다.

## 김민에게 — 2026-09-27 · 금윤호(Claude) — PC 크기 기준

받은 뒤 할 일은 없다. **PC 화면 전체의 크기 기준을 바꿨다**(사용자 요청) — 네 화면도 PC 에서는 조금
작아지고 블록 사이는 넓어진다. 휴대폰은 그대로다. 자세한 까닭과 숫자는 `app/globals.css` 의 'PC 화면의
크기 기준' 설명.

- **PC(desk)에서만** Tailwind 변수를 덮는다: `--spacing` 4 → 3.6px(p-4 · h-10 · gap · 아이콘 모두 10%
  작게), `text-base` 이상 한 단계씩 작게(16→15 · 18→16 · 20→18 · 24→20 · 30→24 · 36→28 · 48→36).
  `text-sm` 14 · `text-xs` 12 는 그대로(웹 표준). 대괄호 값(`text-[11px]`, `h-[4.25rem]`)은 안 바뀐다.
- **오른쪽 위 · 왼쪽 위는 제외** — `ui-chrome` 클래스가 원래 값으로 되돌린다. 붙인 곳: `app-shell.tsx`
  의 로고 · 오른쪽 위 한 줄(알림 창 포함) · 도크 · 판, `(legal)/layout.tsx` 머리. 새로 오른쪽 위 · 왼쪽
  위에 뭘 두면 여기에 넣는다.
- **새 공용 규칙**(globals.css): `stack-page`(쪽의 큰 덩이 사이 — 휴대폰 24 · PC 28px), `gap-block` ·
  `stack-block`(카드 사이 16 · 20px), `page-title`(쪽 제목 24px — 모든 탭 같게). 탭마다 제각각이던
  `space-y-4~10` · 제목 크기(24~36px)를 이것으로 바꿨다 — 트레이닝(`page.tsx` 둘 · 날짜 · 루틴),
  라이브러리, 자료실, 관리자, 더보기, 홈, 투구 기록, 영양. 새 화면도 이것을 쓰면 간격이 맞는다.
- **맨 밑 정보(`components/site-footer.tsx`)** — 이용약관 · 개인정보 처리방침 · 문의 메일 · 의료 안내 ·
  저작권. 앱 틀(`app/(app)/layout.tsx`, 틀이 세로 flex 로 바뀌어 짧은 화면에서도 바닥에 붙는다), 약관
  화면, 첫 화면에 붙였다. 휴대폰의 하단 탭만큼 비우는 일(pb-24)은 main 이 아니라 이 푸터가 한다.
- 노트북(1536×700)에서 투구 기록 · 영양이 스크롤 없이 들어오게 한 `desk-low:`(PC 이면서 세로 900px 이하)
  도 있다 — `components/month-calendar.tsx` 의 `size="large"`(영상 캘린더)만 칸 높이가 화면 높이에
  맞춰진다(`cal-cell-fit`, 줄 수 `--cal-rows`). 홈 캘린더는 그대로.
