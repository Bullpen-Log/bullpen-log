# 받은 뒤 할 일 — 서로에게 남기는 말

두 사람 다 Claude 로 작업한다. 이 파일은 `CLAUDE.md` 가 불러오므로, 이 저장소에서
Claude 로 작업을 시작하면 저절로 읽힌다. 규칙은 `AGENTS.md` 6번.

- **Claude 에게**: `git config user.name` 으로 지금 누가 작업하는지 본다(`Kim Min` =
  김민, `금윤호` = 금윤호). 그 사람 앞으로 온 말이 아래에 있으면, 다른 일을 하기 전에
  사용자에게 먼저 알린다. 명령 실행 같은 할 일은 사용자 허락을 받고 한다.
- 처리한 말은 이 파일에서 지우고 커밋한다. 지난 말은 git 이력에 남는다.
- 공개 저장소다. 비밀번호·키·`.env` 값은 절대 적지 않는다.

---

## 금윤호에게 — 2026-09-30 · 김민(Claude) — 아이폰 앱을 앱답게(네 화면 틀을 고쳤다)

받은 뒤 할 일 없음(뿌리 패키지 · DB 그대로, `mobile/` 에 `@capacitor/splash-screen` 만 더함). 사용자 요청: 켤 때
[B]ULLPEN LOG 로딩 화면, 스크롤할 때 위 막대가 고정된 채 부자연스러운 것, 하단 탭 크기 · 비율. 네 메모 둘
(구속 측정 1.6.0 · 1.7.0)은 사용자에게 전하고 지웠다 — 실제 폰으로 던져 보는 건 사용자가 할 일로 남았다.

- **앱은 이제 화면 끝(시계 · 홈 막대 자리)까지 그린다**(`mobile/capacitor.config.json` contentInset `never`) —
  뿌리 레이아웃 viewport 에 `viewportFit: 'cover'` 를 더했다(사파리 세로 화면은 위쪽 값 0 이라 그대로).
- `components/app-shell.tsx`(네 영역):
  - `MobileTopBar`: 시계 자리를 막대 색으로 채우는 칸(fixed, z-45, 높이 `env(safe-area-inset-top)`, `data-safe-area`)
    + 그만큼 비우는 칸, 막대는 `sticky top-[env(safe-area-inset-top)]`. **스크롤을 내리면 숨고 올리면 나온다**
    (`useHideOnScroll` — 맨 위 56px 안은 늘 보임, 6px 밑 흔들림 무시, 알림 창 · 설정 · 내 정보를 열어 둔 동안 잠금).
  - `MobileTabs`: 칸 높이 50px · 아이콘 26px · 이름 10px(아이폰 기본 탭 바), 더보기 네모는 `lg`.
  - `DetailMenu`: 판 위쪽을 `pt-[env(safe-area-inset-top)]` 로. 알림 창 최대 높이에서 위아래 여백을 뺐다.
- `app/layout.tsx`: 테마 스크립트 뒤에 `APP_INIT_SCRIPT`(`lib/native-app.ts`) — User-Agent 에 `BullpenLogApp` 일 때만
  `<html data-app="native">` · 상태바 글자색을 앱 테마에 맞춤(`SystemBars`) · 첫 화면이 그려지면 로딩 화면 걷기.
- `app/globals.css` 끝 '아이폰 앱 안': `data-app` 일 때만 튕기는 스크롤 끄기(`overscroll-behavior-y: none`), 그리고
  `data-safe-area` 가 없는 화면(로그인 · 약관 · 오류)에 몸 전체 시계 · 홈 막대 여백.
- `app/(session)/layout.tsx`: 감싸는 div 에 `data-safe-area` 만 — 운동 · 구속 화면은 여백을 스스로 비우므로
  위 규칙에서 빠진다. **새 화면 틀을 만들어 스스로 여백을 비우면 `data-safe-area` 를 달아 줘**(안 달면 두 번 들어간다).
- `mobile/scripts/make-ios-assets.mjs`: 시작 화면을 네가 만든 B 대신 **[B]ULLPEN LOG**(사용자 요청), 밝은 판 하나로
  (앱 테마가 라이트로 시작해 폰 다크 모드를 따르면 번쩍였다). 글자는 크롬 헤드리스로 그린다(Bebas Neue). 앱 아이콘은 그대로.
