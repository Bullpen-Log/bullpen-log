# 받은 뒤 할 일 — 서로에게 남기는 말

두 사람 다 Claude 로 작업한다. 이 파일은 `CLAUDE.md` 가 불러오므로, 이 저장소에서
Claude 로 작업을 시작하면 저절로 읽힌다. 규칙은 `AGENTS.md` 6번.

- **Claude 에게**: `git config user.name` 으로 지금 누가 작업하는지 본다(`Kim Min` =
  김민, `금윤호` = 금윤호). 그 사람 앞으로 온 말이 아래에 있으면, 다른 일을 하기 전에
  사용자에게 먼저 알린다. 명령 실행 같은 할 일은 사용자 허락을 받고 한다.
- 처리한 말은 이 파일에서 지우고 커밋한다. 지난 말은 git 이력에 남는다.
- 공개 저장소다. 비밀번호·키·`.env` 값은 절대 적지 않는다.

---

## 금윤호에게 — 2026-09-30 · 김민(Claude) — 앱 시작 연출을 앱 안(Swift)으로

받은 뒤 할 일: `mobile/` 에서 작업할 때만 `cd mobile && npm ci`(로딩 그림 부품 `@capacitor/splash-screen` 을 뺐다).
이 커밋이 `mobile/` 을 바꿔 새 TestFlight 빌드가 올라간다.

- 사용자 요청: 넷플릭스 'N' 처럼 앱을 켜자마자 움직이게, 통통 튀는 움직임은 빼기. 지난 커밋(82df6c3)의 웹 연출
  (`components/app-intro.tsx` · globals.css · 뿌리 layout · `data-intro`)은 **지웠다** — 뿌리 레이아웃 · globals.css 는 그 전 그대로다.
- 앱 첫 화면 `mobile/ios/App/App/MainViewController.swift`(SceneDelegate 가 씀): 시작 화면 그림과 같은 큰 B 를 그려 이어 받고,
  B 가 작아지며 첫 글자 자리로 → 'ULLPEN LOG'(글자 그림 `IntroWord`, `npm run assets`)가 왼쪽부터 펼쳐짐 → 사이트가 알리면 걷힘.
- 사이트 쪽은 `lib/native-app.ts` 하나: 첫 화면을 그리면 `window.webkit.messageHandlers.bullpenIntro.postMessage('ready')`.
  이게 안 오면 판이 10초까지 사이트를 가린다 — 뿌리 레이아웃 · 첫 스크립트를 고칠 때 이 알림을 지키자.

## 금윤호에게 — 2026-09-30 · 김민(Claude) — 폰에서 누르기 쉽게(공용 부품 포함)

받은 뒤 할 일 없음. 네 메모 둘(DB 칸 추가 · 구속 측정 옮김)은 사용자에게 전하고 지웠다(`npx prisma generate` 했음).
사용자 요청 "스크롤 · 인터페이스 버그 찾아 개선"으로 점검해 고쳤다 — 폰에서만 커지고 PC(desk)는 예전 크기다.

- `components/modal.tsx` ✕: 폰 44px(`-mr-3 -mt-3 h-11 w-11`) — 모든 창의 닫기. 시트들(운동 목록 · 마치기 · 교체 · 라이브러리 수정)도 같게.
- `components/segmented.tsx`: 칸에 `min-h-10 desk:min-h-0` — 부르는 쪽 `py-1.5` 라 28px 짜리가 많았다(칩 40px 규칙).
- `components/ui.tsx` `FormError` → `components/error-line.tsx`: 새 오류가 뜨면 그 칸이 보이게 굴려 온다(role=alert). 투구 기록 ·
  내 정보처럼 오류 칸은 위, 저장 단추는 밑이라 실패를 못 봤다.
- `month-calendar.tsx` 화살표 40px, `notice-bell.tsx` 종은 모양 그대로 누르는 자리만 넓힘(before), 근육 · 부위 칩도 위아래로 넓힘.
- 다크 테마: 체크인 '통증' 칩 · 업로드 오류 · 영상 비교 'B' 표시를 테마 색(danger · surface)으로.
- 투구 기록 폼: 투구수 `inputMode="numeric"`, 구속 `decimal`(아이폰이 숫자판 대신 전체 자판을 열었다).

**스크롤** — 네 영역인 앱 틀 · globals.css 를 건드렸다:
- 창이 열린 동안 뒤 페이지 잠금: `html:has(dialog:modal){overflow:hidden}`(globals.css). 예전엔 바깥을 끌면 뒤가 굴러갔다.
  **body 가 아니라 html** — html 이 `overflow-x: clip` 이라 body 의 overflow 는 화면 스크롤에 안 먹는다. 영상 '크게 보기'
  (`pitch-video-player.tsx` · `compare-view.tsx`)의 body 잠금이 그래서 아무 일도 안 했다 → html 로 바꿈.
- `::view-transition-group(app-main | .page)` 애니메이션 없앰 — 멀리 내려간 화면에서 탭을 바꾸면 Next 가 전환 안에서 맨 위로
  굴려 틀이 위에서 날아 내려왔다. 옅어지기는 그대로.
- 위 막대 숨김: 화면이 바뀌면 다시 보이고, 사파리 끝 고무줄 튕김을 올림으로 안 읽는다(`useHideOnScroll`).
- 손가락 화면에서 글자 칸에 초점이 있으면 하단 탭을 숨긴다(`[data-mobile-tabs]`) — 자판 위에 떠서 칸을 가렸다.
- 홈 기간 설정 '끝' 달력이 줄바꿈되면 왼쪽으로 편다(화면 밖으로 잘렸다) · 영상 눌러 재생할 때 화면 튐(`focus({preventScroll})`).

## 금윤호에게 — 2026-09-30 · 김민(Claude) — 앱 틀 · 팝업 손질(네 영역)

받은 뒤 할 일 없음.

- **팝업을 여는 동안 페이지 뼈대가 끼던 것**: Next 는 레이아웃의 `loading.tsx` 를 그 레이아웃의 모든 슬롯에 쓴다(node_modules/next
  layout-router.js 의 TODO 주석). 그래서 투구 기록 팝업을 여는 1초 남짓 `(app)/loading.tsx` 뼈대가 `{modal}` 자리(위 막대와
  본문 사이)에 끼어 화면을 밀었다. `{modal}` 을 `<div className="popup-slot contents">` 로 감싸 뼈대(aria-busy)는 숨기고, 기다리는
  동안 화면 위에 가는 막대가 흐른다(globals.css `.popup-slot`). 알림 창 '기록하기'처럼 누른 단추가 사라지는 자리에서도 보인다.
- `app-shell.tsx`: 설정(톱니) 저장 뒤 돌아갈 주소에 `?` 뒤까지(`useSearchParams`) — 암케어 보기 · 목록 보기 · 고른 날이 풀리던 것.
  설정 저장 redirect 는 replace(같은 주소가 기록에 한 칸 더 쌓이던 것). 팝업의 '돌아가기' 기억(`lib/last-page.ts`)을 뒤로 · 앞으로
  가기와 틀을 떠날 때 잊는다(`forgetPage`). 알림 창을 새로 열 때 '오늘 안 던졌어요' 실패 알림을 지운다.
- `lib/theme.ts`: 다른 탭에서 테마를 바꾸면 이 탭의 `<html data-theme>` 도 칠한다.
- **안 고침(구속 측정 쪽)**: `/velocity` 의 최근 세션 줄에서 `/pitch-log/<날짜>` 로 가면 (app) 의 가로채는 경로가 잡혀, 빈 (app)
  화면 위에 팝업이 뜬다(`components/velocity/session-history.tsx`). 가로채지 않게 하려면 그 링크를 일반 `<a>`(전체 이동)로 하거나
  팝업 쪽에서 출발 화면을 가려야 한다.

## 금윤호에게 — 2026-09-30 · 김민(Claude) — 비밀번호 바꾸면 다른 기기 로그아웃 · 앱 진동

받은 뒤 할 일: `mobile/` 에 패키지가 늘었다 — 앱 폴더에서 작업할 때만 `cd mobile && npm ci`. 뿌리 패키지 · DB 는 그대로.

- **로그인 표에 비밀번호 지문**(`lib/jwt.ts` `pw`, `lib/session.ts` `passwordFingerprint`, `lib/dal.ts` getCurrentUser 가 견줌):
  비밀번호를 바꾸면 다른 기기의 로그인이 풀린다(예전엔 30일 동안 살아 있었다). 바꾼 기기는 새 지문으로 다시 만든다. 지문 없는
  옛 표는 기한까지 그대로 통해서 **이번 배포로 아무도 로그아웃되지 않는다**. `getCurrentUser` 는 password 를 읽지만 돌려주지 않는다.
- **새 공용 부품 `components/safe-form.tsx`(`SafeForm`)**: `<form action={서버 동작}>` 대신 쓰면 신호가 끊겨도 오류 화면 대신 폼 밑에
  한 줄로 알린다(성공하면 redirect 그대로). [운동 시작] · 일정 만들기 · 트레이닝 설정에 썼다. 즐겨찾기 별(`favorite-button.tsx`)도
  `orOffline` 으로 감쌌다.
- **앱 진동**(`@capacitor/haptics`, `lib/haptics.ts` `buzz`): 아이폰은 웹에서 진동이 안 돼 암케어 버티기 · 쉬기 끝에 신호가
  없었다. 이 커밋이 `mobile/` 을 바꿔 새 TestFlight 빌드가 올라간다(자동 배포). 구속 측정 화면의 `navigator.vibrate` 도
  `buzz` 로 바꾸면 앱에서 떨린다 — 네 파일이라 안 건드렸다.

## 금윤호에게 — 2026-09-30 · 김민(Claude) — 투구 기록: 버린 업로드 정리 · 두 번 저장 막기(네 영역)

받은 뒤 할 일 없음. 지난 메모에 '안 고침'이라 적었던 둘을 고쳤다(0b01944).

- 버린 업로드: 폼에서 새로 올린 영상을 빼거나 저장 없이 닫으면 `POST /api/pitch-log/discard` 가 지운다 — 기록(videoPaths) ·
  구속 클립(clipPath)에 붙은 파일은 서버가 건드리지 않는다.
- 기록 두 줄: `POST /api/pitch-log` 가 2분 안에 똑같은 값으로 온 것은 새로 만들지 않고 방금 것을 돌려준다(답을 못 받고 다시 누른 것).
