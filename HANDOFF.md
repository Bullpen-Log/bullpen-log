# 받은 뒤 할 일 — 서로에게 남기는 말

두 사람 다 Claude 로 작업한다. 이 파일은 `CLAUDE.md` 가 불러오므로, 이 저장소에서
Claude 로 작업을 시작하면 저절로 읽힌다. 규칙은 `AGENTS.md` 6번.

- **Claude 에게**: `git config user.name` 으로 지금 누가 작업하는지 본다(`Kim Min` =
  김민, `금윤호` = 금윤호). 그 사람 앞으로 온 말이 아래에 있으면, 다른 일을 하기 전에
  사용자에게 먼저 알린다. 명령 실행 같은 할 일은 사용자 허락을 받고 한다.
- 처리한 말은 이 파일에서 지우고 커밋한다. 지난 말은 git 이력에 남는다.
- 공개 저장소다. 비밀번호·키·`.env` 값은 절대 적지 않는다.

---

## 금윤호에게 — 2026-09-30 · 김민(Claude) — 구속 측정 버그 고침(네 영역, 엔진은 안 건드림)

받은 뒤 할 일 없음(DB · 패키지 그대로, `lib/velocity-engine/*` 안 바꿔 모델 버전 그대로). 사용자가 "버그를 꼼꼼히 찾아
고쳐라"고 해서 검토 에이전트가 찾은 것 중 코드로 확인한 것만 고쳤다. 앞의 둘은 헤드리스가 아니라 화면 흐름 그대로
가짜 카메라(canvas.captureStream)로 **고치기 전 재현 → 고친 뒤 확인**했다.

- **존 → '측정 시작하기' 뒤 카메라 화면이 검게 빔**(`velocity-screen.tsx`): 뷰파인더를 단계마다 다른 자리에 그려 React 가
  `<video>` 를 새로 만들었고, LiveCapture 는 켤 때의 옛 요소를 쥐고 있었다(새 요소는 srcObject 없음, 옛 것은 문서에서 떨어져
  멈춤). 이제 뷰파인더를 `finderHost` 에 `createPortal` 로 한 번만 그리고 단계의 자리(`finderSlot`, display: contents)로 옮긴다.
  **새 단계에서 뷰파인더를 넣을 때 `{finder}` 대신 `{finderSlot}` 을 써 줘.**
- **처음 쓰는 사람이 '측정 시작하기'를 누르면 '지난 설정 그대로?' 화면으로 튐**(카메라는 켜진 채): `persistSetup` 이 `decided` 를 켠다.
- '이 설정으로 시작'이 누르기 전 설정(기본 네트 · 투수 뒤 · 릴리스 거리 없음)으로 카메라를 켬 → `cameraSettingsRef`(layout effect)에서 읽는다.
- 세션 중 카메라를 다시 켜면 클립 번호(LiveCapture 결과 번호)가 1부터라 새 클립이 옛 공에도 붙음 → 켤 때마다 `idBase` 를 얹는다.
  짝 없는 클립은 blob 주소를 안 만든다.
- 저장 · 클립 올리기 중 신호가 끊기면 전환 안의 오류가 오류 화면으로 가 **잰 공이 통째로 사라짐** → try/catch + `unstable_rethrow`
  (`velocity-screen` 저장, `lib/velocity-clip-upload.ts`, 탐색기 `act`, `file-measure.tsx`, `pitch-log/velocity-section.tsx`).
- 측정 화면에 `useWakeLock(cameraOn)`(삼각대에 두면 화면이 꺼져 카메라가 멈췄다). 앱에서 카메라를 거절했으면 '주소창 자물쇠' 대신
  아이폰 설정 길을 안내.
- `components/velocity/pitch-editor.tsx`: 스피드건 칸이 숫자만 쥐어 '138.' 의 점이 사라짐(138.5 → 1385 → 저장 거절) → 글자로 쥔다.
  시트를 닫으면 React 가 dialog `close` 를 부모로 올려 **투구 기록 팝업까지 닫힘** → `e.target === e.currentTarget` 만(Modal 도 같게).
- 서버: `loadCalibration` 이 '보정에서 빼기'(calibExclude)를 안 뺐다 · 수기 공의 건 값을 고치면 구속(raw · kmh)과 투구 기록도 같이 ·
  보정 차수 결과를 '원본 공에 채우기' 하면 그 차수의 모델 버전을 남긴다(지금 버전을 찍어 옛 값이 지금 보정 짝으로 섞였다). 탐색기에서
  수기 공의 차이는 '—'.
- 시각 표시(`session-history.tsx` · `velocity-section.tsx`)를 한국 시간 Intl 로 — `getHours()` 는 서버(UTC)와 폰 글자가 달라
  hydration 이 어긋났다. 관리자 '최근 30일'도 한국 날짜 기준.

**안 고치고 남긴 것(네가 정할 것)**: 설정 '스피드건 보정 적용'을 꺼도 화면만 보정 전 값이고 서버는 늘 보정해 저장(`velocity.ts` 241) ·
타구 세션도 투구 기록(PitchLog)을 만들어 투구수 · 최고 구속에 섞임 · 릴리스 구속은 보정 안 된 값 · mph 사용자에게 ± · 건 값이 km/h ·
`window.confirm` 이 앱에서 영어 'Cancel/OK' · 새로고침 때 'VideoFrame was garbage collected without being closed' 경고(워커).

## 금윤호에게 — 2026-09-30 · 김민(Claude) — 앱에서 시계 · 홈 막대에 가리던 곳(네 파일 여럿)

받은 뒤 할 일 없음. 앱이 화면 끝까지 그리게 된 뒤(아래 메모) 아이폰에서 가리던 곳을 고쳤다. 사파리 · PC 는
`env(safe-area-inset-*)` 가 0 이라 그대로다. **새 화면에 `h-12 … pt-[env(safe-area-inset-top)]` 를 쓰지 마** — 테일윈드는
border-box 라 높이 48px 안에 59px 여백이 들어가 단추가 시계 밑과 본문 위로 삐져나온다. 높이에 더한다:
`h-[calc(3rem+env(safe-area-inset-top))]`.

- 구속 측정: 위 막대 셋(`velocity-home.tsx` · `velocity-screen.tsx` 내비 바 · 세션 요약)을 위처럼, 카메라 위 알림
  (`bottom-[8.25rem]` → 홈 막대만큼 더), 요약의 오류 줄, 렌즈 보정 칸 밑 여백.
- `checkin-gate.tsx` · `components/modal.tsx`('page' 창 = 투구 기록 팝업): 최대 높이에서 시계 · 홈 막대 자리를 뺐다
  (92 · 94dvh 그대로면 제목과 ✕ 가 시계 밑이었다).
- 영상: `pitch-video-player.tsx` 크게 보기 · `compare-view.tsx` 크게 보기에 위아래 여백, 비교 조작부 · 영상 고르기
  막대를 하단 탭(이제 51px + 홈 막대) 위로.
- `today/pitch-log-panel.tsx`: 그날 칸을 굴려 보일 때 하단 탭 밑에 숨지 않게(`scroll-mb` + 그 값을 빼고 잰다).
- 로그인 · 약관 · 첫 화면: `min-h-dvh` 에서 위아래 자리를 뺐다(몸 여백과 겹쳐 조금씩 굴러갔다).
- `globals.css` '아이폰 앱 안': 막대 없는 화면의 시계 자리 바탕색 덮개, `scroll-padding-top`(scrollIntoView 가
  시계 밑으로 안 가게), 캘린더 칸 높이(`cal-cell-fit`)에서 위아래 자리 빼기.

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
