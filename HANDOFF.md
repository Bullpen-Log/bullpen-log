# 받은 뒤 할 일 — 서로에게 남기는 말

두 사람 다 Claude 로 작업한다. 이 파일은 `CLAUDE.md` 가 불러오므로, 이 저장소에서
Claude 로 작업을 시작하면 저절로 읽힌다. 규칙은 `AGENTS.md` 6번.

- **Claude 에게**: `git config user.name` 으로 지금 누가 작업하는지 본다(`Kim Min` =
  김민, `금윤호` = 금윤호). 그 사람 앞으로 온 말이 아래에 있으면, 다른 일을 하기 전에
  사용자에게 먼저 알린다. 명령 실행 같은 할 일은 사용자 허락을 받고 한다.
- 처리한 말은 이 파일에서 지우고 커밋한다. 지난 말은 git 이력에 남는다.
- 공개 저장소다. 비밀번호·키·`.env` 값은 절대 적지 않는다.

---

## 금윤호에게 — 2026-10-01 · 김민(Claude) — '애플처럼' C(화면별) 1차 + D 둘 — 홈 · 캘린더 · 체크인 · 설정 · 더보기 · 필터 · 영상 · 테마

받은 뒤 할 일 없음(DB 구조 그대로). 네 영역이 많아 적는다. **모양은 휴대폰만, 색은 PC 까지** 원칙 그대로, 영양 · 구속 측정은 안 건드렸다.

- **홈**(e50fb8a · 69821d1): 맨 위 새 `app/(app)/today/today-rings.tsx` — 오늘 체크인 · 투구 · 운동 · 영양 링 넷(`loadDayDetail` + 오늘 투구 기록,
  page.tsx 에 Suspense 하나 · loading.tsx 에 자리). 색 하나로: 그래프 여섯(`home-trends.tsx` tone) · 그날 아이콘 다섯(`day-summary.tsx` TONES) ·
  영양 막대 셋(`day-detail.tsx` MACROS) · 분석 아이콘 → 모두 sky. 경고색은 그대로.
- **캘린더**(`components/month-calendar.tsx`, 53c629e — 투구 기록 캘린더도 같이): 오늘 = 파란 동그라미 숫자, 빈 날은 휴대폰에서 칸 없이 숫자만,
  요일 빨강 · 파랑 → 회색, 달 넘기기는 테두리 없는 파란 화살표, 범례는 휴대폰에서 '표시 보기'로 접힘(PC 는 그대로).
- **체크인 관문**(0d5aed4): 휴대폰은 아래 시트(globals.css '휴대폰의 체크인 관문'), 저장은 폭 전체 알약, [간편 | 상세]는 아이폰 고르개, 칩 ·
  잔 시간 단추는 테두리 없는 알약(`checkin-form.tsx` chipBase · sleepStepButton). **원래 있던 버그 고침**: 접힌 상세의 숨긴 라디오가 잘라내기를
  빠져나가 창 밑에 빈 자리 500px → 상세 칸에 `relative overflow-hidden`.
- **설정 · 내 정보**(9fccfb8): 칸 아이콘 = 파랗게 칠한 둥근 네모, 칸 사이 선 대신 틈(휴대폰), 해요체.
- **더보기**(4aeb00f, `app-shell.tsx` DetailMenu + globals.css '휴대폰의 더보기'): 휴대폰은 오른쪽 서랍 대신 아래 시트(손잡이 · 메뉴만큼 높이 ·
  불투명). PC 판 · 연출은 그대로. 주의: 화면에 붙은 창의 높이는 `auto` 가 아니라 `fit-content`(auto 면 화면 높이로 늘어난다).
- **조건으로 찾기**(`components/meta-filter.tsx`, fa07a89 — 투구 드릴 · 운동 추가 창도 같이): 휴대폰은 [필터] 단추 → 아래 시트('12개 보기'),
  새 `leading` 칸(운동 영상은 [★ 즐겨찾기]를 거기 둔다). PC 는 늘 펴 둔 칸 그대로.
- **영상 크게 보기**(f9d3706, `pitch-video-player.tsx` · `videos/compare-view.tsx`): 라이트 테마에서 짙은 바탕 + 짙은 글자로 안 보이던 것 →
  새 `.theme-dark`(globals.css — 그 칸 안의 색 토큰을 다크 값으로) + `bg-black`. 늘 어두워야 하는 칸에 그대로 쓰면 된다.
- **테마 '자동'**(91fa904, `lib/theme.ts`): [라이트 | 다크 | 네이비 | 자동]. 고른 값은 `<html data-theme-choice>`, 칠한 값은 그대로 `data-theme`
  (light|dark|navy) — data-theme 를 보는 코드는 바꿀 것 없음. 기본은 그대로 라이트.

## 금윤호에게 — 2026-10-01 · 김민(Claude) — '애플처럼' B(감성) — 누름 표시 · 빈 상자 · 체크인 축하 (네 영역 몇 곳)

받은 뒤 할 일 없음(DB 구조 그대로). B 는 대부분 운동 화면(김민 영역 — f9dd43e)이고, 공용 · 네 영역은 아래만 바꿨다(ca34ba8 · fbb2408).
영양 파일은 네가 작업 중이라 안 건드렸고, 구속 측정도 그대로다.

- **누름 표시**(`app/globals.css` '손가락으로 눌렀을 때' + 새 `components/press-feedback.tsx`, 뿌리 `app/layout.tsx` 에 붙음): 하늘색
  `-webkit-tap-highlight-color` 를 끄고(누른 것을 파란 네모로 덮어 웹처럼 보였다), 손가락 화면에서 누른 링크 · 단추 · 칩을 옅게
  (`[data-pressed]` 0.55, 넓은 카드 링크 0.8). 0.06초 누르고 있어야 옅어지고 굴리기가 시작되면 취소. **새로 만드는 것은 할 일 없음** —
  옅어지면 안 되는 것(창 바깥 어둠 같은 것)만 `data-press-none`. 제 손으로 `opacity-*` 를 준 것은 그 값이 이긴다.
- **빈 상자**: 새 유틸리티 `empty-well`(휴대폰 = 옅은 회색 면 · 테두리 없음, PC = 예전 점선). 점선 빈 상자 25곳을 바꿨다 — 네 영역은
  coach(ai-report-card · load-panel · training-review) · pitch-log(day-record · log-list · [date]/day-client) · today(analysis-block ·
  analysis-view · home-trends) · videos(video-calendar · video-gallery) · `components/filming-guide.tsx` · `app/actions/analysis.tsx`.
  `rounded-… border border-dashed border-line` → `rounded-… empty-well` 한 단어만 바뀐 것. 달력의 점선 표시(쉬는 날 · 계획) · 비교 빈 칸은 뜻이
  있어 그대로. 공용 `EmptyState` 는 휴대폰에서 상자 없이 가운데에(아이폰 빈 화면), 새 `icon` 칸(lucide 아이콘 하나)을 받는다.
- **체크인 완료**(`components/checkin-gate.tsx`): 초록 아이콘 0.9초 → 링이 그려지고 체크가 톡 뜨며 떨림 → '3일 연속이에요'(이틀부터) →
  지난 이레 점, 1.8초. 연속을 세려고 `(app)/layout.tsx` 가 두 달치 체크인 **날짜만** 한 번 더 읽어 `streakDays` 로 넘긴다.
- 움직임 클래스 `done-ring` · `done-check` · `rise-in`(--rise-delay) 이 globals.css 에 있다(운동 끝 화면 · 체크인 완료가 같이 씀).
- 운동을 마치면 이제 `/workout/done?id=…`(축하 화면) → [완료] → 트레이닝이다(예전엔 곧장 트레이닝). 새 최고 판정 `lib/workout/bests.ts`.

## 금윤호에게 — 2026-10-01 · 김민(Claude) — '애플처럼 깔끔하고 감성있게' A(공통) — 색 · 면 · 글자 · 틀 · 시트

받은 뒤 할 일 없음. 사용자 방향: **"앱을 애플(iOS 26 · 앱스토어 · 피트니스)처럼 깔끔하고 감성있게."** 전체 점검(약 70가지)을
A 공통 → B 감성 → C 화면별 → D 작은 것 순서로 하기로 했고, A 를 마쳤다(01c2916 · 136ba06 · 5196252 · 98a20b1).
**모양(테두리 · 크기 · 시트)은 휴대폰만, 색은 PC 까지.** 구속 측정 파일은 안 건드렸다.

- **색 값**(globals.css @theme): 바탕 #f2f2f7 · 글자 #1d1d1f · 보조 #6e6e73 · 선 #e5e5ea(중립 회색, 예전 slate), 강조 `sky` #0a84d6
  (흰 글자 대비 2.8 → 4.0, 이름은 그대로 sky), 새 토큰 `--color-raised`(고르개의 흰 칸 · 다크 #636366), 다크 카드 #1c1c1e · 칸 #2c2c2e · 선 #38383a.
- **고르개**(`segmented.tsx`): 꽉 찬 파랑 + 흰 글자 → 회색 바탕(`bg-ink/8`) 위 흰 칸(raised) + 고른 글자만 굵게. `tone` 은 더 안 갈린다.
- **카드 테두리**: 휴대폰은 `.rounded-2xl.border-line.bg-surface` 를 globals.css 규칙 하나로 투명하게(Card + 손으로 만든 카드 60여 곳).
  보조 · 빨간 `Button` 과 `Badge` 는 휴대폰에서 테두리 대신 옅은 채움. 운동 종류 배지 7색 → 회색, 암케어 부위 색 점 → 뺌.
- **제목**: `PageHeading` 은 휴대폰에서 영어 머리글 · 밑줄 없이 `page-title` 32px(PC 24px 그대로), 새 `kicker`(홈 = 오늘 날짜).
  숫자는 `text-display`(Bebas) → 새 `text-numeric`(둥근 고정폭 숫자) 36곳 — 로고 · 소개 · 404 · 구속 측정은 Bebas 그대로.
- **틀**: 휴대폰 위 막대는 맨 위에서 바탕색 · 선 없음, 굴리면 흰 막대 + 선. 하위 화면의 돌아가기 → 새 `BackLink`(파란 '‹ 이전').
  `SiteFooter tabBar` 는 휴대폰에서 숨고(하단 탭 자리만), 약관 · 문의 · 의료 안내는 설정 창 맨 밑 '정보'로.
- **창**: `Modal` 은 휴대폰에서 아래에서 올라오는 시트(`data-sheet` · 손잡이 · 끌어내려 닫기, globals.css `dialog[data-sheet]`),
  PC 는 누른 단추에서 커지는 가운데 창 그대로. `ConfirmDelete` 는 휴대폰에서 동작 시트 모양(큰 알약 둘).
- 구속 측정 쪽에 같은 방향을 쓰려면: `window.confirm`(공 · 세션 지우기 · 측정 나가기 — 앱에서 영어 Cancel/OK) → `ConfirmDelete`,
  큰 숫자 `text-display` → `text-numeric`.

## 금윤호에게 — 2026-10-01 · 김민(Claude) — 휴대폰 인터페이스를 둥글게(앱스토어처럼) · 네 메모 셋 처리

받은 뒤 할 일 없음. 네 메모 셋(영양 DB 칸 · 표)은 사용자에게 전하고 `npx prisma generate` · 개발 서버 다시 켜기를 했다.

사용자 요청 "애플 앱스토어의 하단 바처럼 앱 내부 인터페이스를 전체적으로 동글동글하게"(앱스토어 화면을 보내 줘 재서 맞춤).
**휴대폰만** 바꿨고 PC(desk)는 예전 그대로다.
네 영역(앱 틀 · 공용 부품)이라 적는다.

- **모서리 토큰**(`app/globals.css` '@layer base' 의 `:root`): 휴대폰에서 `--radius-sm`~`--radius-4xl` 를 앱스토어 비율로(lg 8 → 12 ·
  xl 12 → 16 · 2xl 16 → 20(앱스토어 카드 약 20pt) · 3xl 24 → 28px) 키우고, 'PC 화면의 크기 기준' 블록에서 원래 값으로 되돌린다. rounded-* 를 쓰는 곳은
  화면 코드를 안 고쳐도 다 따라온다. 대괄호 값(`rounded-[…]`)은 안 따라온다.
- **하단 탭**(`app-shell.tsx` `MobileTabs`): 화면 끝에 붙은 막대 → 바닥에서 떠 있는 반투명 알약(양옆 20px, 밑 `--tab-bar-gap` —
  아이폰에서 21px, 높이 62px, 앱스토어 실측). 지금 탭 표시는 위의 짧은 선 → 칸 전체를 감싸는 옅은 회색(`bg-ink/8`) 둥근 배경 + 파란
  아이콘 · 이름, 다른 탭은 검은 아이콘 · 이름(`text-ink`). 이름표 `tab-indicator` 그대로라 탭을 옮기면 미끄러진다(옅어서 전환 중
  아이콘을 안 가린다). 알약 양옆 빈 곳은 눌러도 본문으로 간다(pointer-events).
- **하단 탭 높이 변수** `--tab-bar-top`(화면 바닥 ~ 알약 윗변): `SiteFooter` 의 끝 여백, 하단 탭 위에 띄우는 셋(`routine-builder` ·
  `videos/compare-view` · `videos/video-gallery` — 예전 `3.5rem/4rem + env(safe-area-inset-bottom)`)이 이 값을 쓴다. 새로 하단 탭 위에
  띄우는 것도 `bottom-[calc(var(--tab-bar-top)+0.5rem)]` 처럼.
- **단추**(`components/ui.tsx` `buttonBase`): 휴대폰은 `rounded-full`(알약), PC 는 `rounded-xl`. **고르개**(`segmented.tsx`): 휴대폰은
  상자 `rounded-3xl` · 표시 · 칸 `rounded-2xl`(한 줄이면 알약), PC 는 예전 그대로.
