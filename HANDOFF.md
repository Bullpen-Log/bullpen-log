# 받은 뒤 할 일 — 서로에게 남기는 말

두 사람 다 Claude 로 작업한다. 이 파일은 `CLAUDE.md` 가 불러오므로, 이 저장소에서
Claude 로 작업을 시작하면 저절로 읽힌다. 규칙은 `AGENTS.md` 6번.

- **Claude 에게**: `git config user.name` 으로 지금 누가 작업하는지 본다(`Kim Min` =
  김민, `금윤호` = 금윤호). 그 사람 앞으로 온 말이 아래에 있으면, 다른 일을 하기 전에
  사용자에게 먼저 알린다. 명령 실행 같은 할 일은 사용자 허락을 받고 한다.
- 처리한 말은 이 파일에서 지우고 커밋한다. 지난 말은 git 이력에 남는다.
- 공개 저장소다. 비밀번호·키·`.env` 값은 절대 적지 않는다.

---

## 금윤호에게 — 2026-10-01 · 김민(Claude) — 휴대폰 인터페이스를 둥글게(앱스토어처럼) · 네 메모 셋 처리

받은 뒤 할 일 없음. 네 메모 셋(영양 DB 칸 · 표)은 사용자에게 전하고 `npx prisma generate` · 개발 서버 다시 켜기를 했다.

사용자 요청 "애플 앱스토어의 하단 바처럼 앱 내부 인터페이스를 전체적으로 동글동글하게". **휴대폰만** 바꿨고 PC(desk)는 예전 그대로다.
네 영역(앱 틀 · 공용 부품)이라 적는다.

- **모서리 토큰**(`app/globals.css` '@layer base' 의 `:root`): 휴대폰에서 `--radius-sm`~`--radius-4xl` 를 약 1.5배(lg 8 → 14 ·
  xl 12 → 18 · 2xl 16 → 24 · 3xl 24 → 32px)로 키우고, 'PC 화면의 크기 기준' 블록에서 원래 값으로 되돌린다. rounded-* 를 쓰는 곳은
  화면 코드를 안 고쳐도 다 따라온다. 대괄호 값(`rounded-[…]`)은 안 따라온다.
- **하단 탭**(`app-shell.tsx` `MobileTabs`): 화면 끝에 붙은 막대 → 바닥에서 떠 있는 반투명 알약(양옆 16px, 밑 `--tab-bar-gap`,
  높이 64px). 지금 탭 표시는 위의 짧은 선 → 칸 전체를 감싸는 옅은 하늘색(`bg-sky/12`) 둥근 배경, 이름표 `tab-indicator` 그대로라
  탭을 옮기면 미끄러진다(옅어서 전환 중 아이콘을 안 가린다). 알약 양옆 빈 곳은 눌러도 본문으로 간다(pointer-events).
- **하단 탭 높이 변수** `--tab-bar-top`(화면 바닥 ~ 알약 윗변): `SiteFooter` 의 끝 여백, 하단 탭 위에 띄우는 셋(`routine-builder` ·
  `videos/compare-view` · `videos/video-gallery` — 예전 `3.5rem/4rem + env(safe-area-inset-bottom)`)이 이 값을 쓴다. 새로 하단 탭 위에
  띄우는 것도 `bottom-[calc(var(--tab-bar-top)+0.5rem)]` 처럼.
- **단추**(`components/ui.tsx` `buttonBase`): 휴대폰은 `rounded-full`(알약), PC 는 `rounded-xl`. **고르개**(`segmented.tsx`): 휴대폰은
  상자 `rounded-3xl` · 표시 · 칸 `rounded-2xl`(한 줄이면 알약), PC 는 예전 그대로.
