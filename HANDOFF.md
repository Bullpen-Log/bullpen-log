# 받은 뒤 할 일 — 서로에게 남기는 말

두 사람 다 Claude 로 작업한다. 이 파일은 `CLAUDE.md` 가 불러오므로, 이 저장소에서
Claude 로 작업을 시작하면 저절로 읽힌다. 규칙은 `AGENTS.md` 6번.

- **Claude 에게**: `git config user.name` 으로 지금 누가 작업하는지 본다(`Kim Min` =
  김민, `금윤호` = 금윤호). 그 사람 앞으로 온 말이 아래에 있으면, 다른 일을 하기 전에
  사용자에게 먼저 알린다. 명령 실행 같은 할 일은 사용자 허락을 받고 한다.
- 처리한 말은 이 파일에서 지우고 커밋한다. 지난 말은 git 이력에 남는다.
- 공개 저장소다. 비밀번호·키·`.env` 값은 절대 적지 않는다.

---

## 금윤호에게 — 2026-10-04 · 김민(Claude) — 앱 안에 머물기(2단계): 약관 창 · 오류 화면 · 참고 영상 표시

받은 뒤 할 일 없음(DB · 패키지 그대로). '앱 느낌' 2단계 — 앱 안에서 웹페이지로 튕기거나 웹 같은 글이 보이던 것.

- **약관 · 개인정보 창이 공용**(`components/legal-sheet.tsx`): 가입 화면(auth-form)에 있던 것을 뗐다. 설정 › 정보의 줄도 넘어가지
  않고 창으로 연다(`components/settings-info.tsx` — 이용약관 · 개인정보 · **3D 모델 출처** · 문의). 약관 화면(app/(legal))은 웹용으로
  남고, 앱에서는 로고 링크 · 바닥글을 안 보인다.
- **3D 출처 줄(`ModelCredit`)은 휴대폰에서 숨김** — 출처는 설정 › 정보 › 3D 모델 출처에 원문 문구 그대로. PC 는 지도 밑 그대로.
- **'참고 영상' · '촬영 전' 표시와 '유튜브에서 열기'는 관리자에게만**(`LibraryVideo` 의 isAdmin, 라이브러리 두 곳). 트레이닝 · 암케어 ·
  메커니즘 목록의 '참고 영상' 글은 뺐다(운동 목록 단추는 늘 '영상 보기').
- **오류 · 404 화면**: 오프라인이면 '인터넷 연결이 없어요'(`components/use-online.ts`), 오류 번호는 PC 에서만(`ErrorDigest`), 단추는
  휴대폰 알약. (app) 안의 notFound() 는 새 `app/(app)/not-found.tsx` 가 앱 틀 안에서 받는다. 앱에서 `/`(소개)를 열면 홈 · 로그인으로 보낸다.
- 자료실 글의 첨부는 주소 전체 대신 '원문 보기 + 사이트 이름' 줄.

## 금윤호에게 — 2026-10-04 · 김민(Claude) — 손맛(3단계): 떨림 · 토스트 · 스위치 · 당겨서 새로고침 · 자판 막대

받은 뒤 할 일 없음(DB · 패키지 그대로). 새 화면을 만들 때 쓰면 되는 공용 부품이 생겼다.

- **떨림은 저절로**(`components/haptic-feedback.tsx`, 뿌리 layout): 체크 상자 · 라디오 · select 의 change, role radio/tab/switch 단추를
  누르면 가벼운 '톡'. 따로 달 필요 없다 — 빼려면 `data-haptic="none"`. 뜻으로 부를 때는 `haptic('success' | 'medium' …)`(`lib/haptics.ts`,
  `buzz` 는 그대로). 지우기 확정(ConfirmDialog)은 'medium'.
- **토스트** `toast('저장했어요')`(`components/toast.tsx`, 뿌리 layout 에 `<Toaster />`): popover 라 창 위에도 뜬다. `SafeForm` 에
  `doneToast` — redirect 로 끝나는 저장도 뜬다(설정의 경력 · 장비). 내 정보 · 사진 저장의 하늘색 상자는 토스트로 바꿨다.
- **스위치** `Switch` · `SwitchRow`(`components/switch.tsx`): 영양 음식 창의 '내 음식에 저장' 체크 상자를 이것으로 바꿨다(food-sheet.tsx 한 곳).
- **당겨서 새로고침**(`components/pull-to-refresh.tsx`, (app) layout · `<main data-ptr-target>`): 아이폰 앱에서만, /today · /videos ·
  /training · /nutrition 맨 위에서. 조용한 새로고침(QUIET_REFRESH). 끼면 안 되는 칸은 `data-no-ptr`.
- **자판**: 앱에서 자판 위 '⌃ ⌄ 완료' 막대를 숨기고(`MainViewController.swift` 의 `KeyboardAccessoryBar` — **앱을 새로 구워야** 들어간다),
  자판이 떠 있을 때 화면을 끌면 자판이 내려간다(`components/viewport-vars.tsx`, 앱만). 입력칸 안에서 시작한 손가락은 그대로.

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

