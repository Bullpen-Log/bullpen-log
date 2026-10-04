# 받은 뒤 할 일 — 서로에게 남기는 말

두 사람 다 Claude 로 작업한다. 이 파일은 `CLAUDE.md` 가 불러오므로, 이 저장소에서
Claude 로 작업을 시작하면 저절로 읽힌다. 규칙은 `AGENTS.md` 6번.

- **Claude 에게**: `git config user.name` 으로 지금 누가 작업하는지 본다(`Kim Min` =
  김민, `금윤호` = 금윤호). 그 사람 앞으로 온 말이 아래에 있으면, 다른 일을 하기 전에
  사용자에게 먼저 알린다. 명령 실행 같은 할 일은 사용자 허락을 받고 한다.
- 처리한 말은 이 파일에서 지우고 커밋한다. 지난 말은 git 이력에 남는다.
- 공개 저장소다. 비밀번호·키·`.env` 값은 절대 적지 않는다.

---

## 금윤호에게 — 2026-10-04 · 김민(Claude) — 앱 틀을 네이티브처럼: 위 막대 · 화면 이동 방향 · 진짜 뒤로 · 탭 · 글자 선택

받은 뒤 할 일 없음(DB · 패키지 그대로). 사용자 요청 "웹사이트 같은 요소를 전부 완전한 앱 느낌으로" — 점검 뒤 1단계(앱 틀)다.
**네 영역(앱 틀 · 공용 부품)을 꽤 건드려서 적는다.** 휴대폰만 바뀌고 PC 는 그대로다.

- **휴대폰 위 막대**(`app-shell.tsx` MobileTopBar): 로고를 빼고 아이폰 내비 막대로 — 왼쪽 '‹ 뒤로', 가운데 화면 제목(큰 제목이
  스크롤로 가려지면 나타남), 오른쪽 종 · 설정 · 내 정보. **스크롤해도 숨지 않는다**(useHideOnScroll 지움). 제목 · 뒤로는 화면이
  적어 둔 것을 읽는다(`lib/nav-state.ts`): `PageHeading` 이 `NavTitle`(components/nav-title.tsx)로 제목을, `BackLink` 가 뒤로를 적는다.
  막대에 `data-mobile-topbar` 표시.
- **`BackLink` 가 진짜 뒤로**(components/back-link.tsx, ui.tsx 는 다시 내보내기만): 바로 앞 화면이 목적지면 router.back(), 아니면
  router.replace(목적지). 휴대폰에서는 본문의 줄을 숨기고 위 막대에 선다(PC 는 본문 줄 그대로). 새 하위 화면에도 그대로 쓰면 된다.
- **화면 이동 방향**(components/nav-motion.tsx, 뿌리 layout): 본문(main) 안의 링크로 들어가면 `<html data-nav="push">` → 밀려
  들어오기, '‹ 뒤로'는 pop → 밀려 나가기, 손가락 밀기 · 브라우저 뒤로는 none(아이폰이 이미 움직였으니 그냥 갈아 끼움), 하단 탭 ·
  메뉴는 표시 없음 → 예전 옅어지기. CSS 는 globals.css '앱처럼 화면 이동'. 링크가 방향을 스스로 정하려면 `data-nav` 를 단다.
- **하단 탭**: 지금 탭을 다시 누르면(그 탭 첫 화면일 때) 맨 위로. `next.config.ts` 에 `experimental.staleTimes.dynamic: 30` —
  30초 안에 돌아온 탭은 서버를 다시 안 다녀온다(저장은 revalidatePath, 새로 받기는 quietRefresh 라 상관없음).
- **앱 안 글자 선택 끔**(globals.css): `html[data-app=native] body` 에 user-select:none, 입력칸과 `.selectable`(자료실 글)만 선택된다.

