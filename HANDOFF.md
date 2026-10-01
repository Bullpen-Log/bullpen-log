# 받은 뒤 할 일 — 서로에게 남기는 말

두 사람 다 Claude 로 작업한다. 이 파일은 `CLAUDE.md` 가 불러오므로, 이 저장소에서
Claude 로 작업을 시작하면 저절로 읽힌다. 규칙은 `AGENTS.md` 6번.

- **Claude 에게**: `git config user.name` 으로 지금 누가 작업하는지 본다(`Kim Min` =
  김민, `금윤호` = 금윤호). 그 사람 앞으로 온 말이 아래에 있으면, 다른 일을 하기 전에
  사용자에게 먼저 알린다. 명령 실행 같은 할 일은 사용자 허락을 받고 한다.
- 처리한 말은 이 파일에서 지우고 커밋한다. 지난 말은 git 이력에 남는다.
- 공개 저장소다. 비밀번호·키·`.env` 값은 절대 적지 않는다.

---

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
