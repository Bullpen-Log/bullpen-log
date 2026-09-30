# 받은 뒤 할 일 — 서로에게 남기는 말

두 사람 다 Claude 로 작업한다. 이 파일은 `CLAUDE.md` 가 불러오므로, 이 저장소에서
Claude 로 작업을 시작하면 저절로 읽힌다. 규칙은 `AGENTS.md` 6번.

- **Claude 에게**: `git config user.name` 으로 지금 누가 작업하는지 본다(`Kim Min` =
  김민, `금윤호` = 금윤호). 그 사람 앞으로 온 말이 아래에 있으면, 다른 일을 하기 전에
  사용자에게 먼저 알린다. 명령 실행 같은 할 일은 사용자 허락을 받고 한다.
- 처리한 말은 이 파일에서 지우고 커밋한다. 지난 말은 git 이력에 남는다.
- 공개 저장소다. 비밀번호·키·`.env` 값은 절대 적지 않는다.

---

## 금윤호에게 — 2026-09-30 · 김민(Claude) — 비밀번호 바꾸면 다른 기기 로그아웃 · 앱 진동

받은 뒤 할 일: `mobile/` 에 패키지가 늘었다 — 앱 폴더에서 작업할 때만 `cd mobile && npm ci`. 뿌리 패키지 · DB 는 그대로.

- **로그인 표에 비밀번호 지문**(`lib/jwt.ts` `pw`, `lib/session.ts` `passwordFingerprint`, `lib/dal.ts` getCurrentUser 가 견줌):
  비밀번호를 바꾸면 다른 기기의 로그인이 풀린다(예전엔 30일 동안 살아 있었다). 바꾼 기기는 새 지문으로 다시 만든다. 지문 없는
  옛 표는 기한까지 그대로 통해서 **이번 배포로 아무도 로그아웃되지 않는다**. `getCurrentUser` 는 password 를 읽지만 돌려주지 않는다.
- **앱 진동**(`@capacitor/haptics`, `lib/haptics.ts` `buzz`): 아이폰은 웹에서 진동이 안 돼 암케어 버티기 · 쉬기 끝에 신호가
  없었다. 이 커밋이 `mobile/` 을 바꿔 새 TestFlight 빌드가 올라간다(자동 배포). 구속 측정 화면의 `navigator.vibrate` 도
  `buzz` 로 바꾸면 앱에서 떨린다 — 네 파일이라 안 건드렸다.

## 금윤호에게 — 2026-09-30 · 김민(Claude) — 투구 기록 · 영상 버그 고침(네 영역)

받은 뒤 할 일 없음(DB · 패키지 그대로).

- `components/use-frame-duration.ts`: `mediaTime` 차이를 재생 속도로 나눠 기본 0.5배속에서 **프레임 넘기기가 두 장씩**(0.25배속 네 장),
  'fps' 도 절반으로 보였다 → 나누지 않고 가장 짧은 간격을 쓴다(영상 비교 화면도 같은 훅).
- `globals.css`: 열린 `<dialog>` 의 transform 을 `none` 으로(값이 있으면 fixed 자식의 기준 상자가 돼 투구 기록 팝업 안에서 영상
  '크게 보기'가 팝업 안에 갇혔다). 크게 보기 중 Esc 는 크게 보기만 닫는다(`pitch-video-player.tsx`).
- `components/modal.tsx`: 배경을 **눌렀다 뗀** 것만 닫는다 — 창 안에서 글자를 끌다 배경에서 놓아도 닫혀 적던 기록이 사라졌다.
- `use-playback-urls.ts`: 받은 재생 주소를 20분 지나면 앱 · 탭으로 돌아올 때 새로 받는다(만료돼 검게 뜨던 것).
- 기록 고치기: 폼이 열릴 때의 영상 목록(`baseVideoPaths`)을 같이 보내, 서버가 이 폼에서 뺀 것만 지운다(`app/api/pitch-log/route.ts`
  PATCH — 다른 기기에서 더한 영상이 지워지던 것). 쉰 날 기록을 던진 날로 바꾸면 강도 '0' 으로 저장이 막히던 것.
- 캘린더 그날 칸이 지운 영상을 계속 틀던 것 · 삭제가 신호 끊김에 조용히 멈추던 것 · 썸네일을 새 장면이 준비된 뒤에 뜬다(사파리).
- (뒤에 고침) 버린 업로드: 폼에서 새로 올린 영상을 빼거나 저장 없이 닫으면 `POST /api/pitch-log/discard` 가 지운다 —
  기록(videoPaths) · 구속 클립(clipPath)에 붙은 파일은 서버가 건드리지 않는다. 기록 두 줄: `POST /api/pitch-log` 가 2분 안에
  똑같은 값으로 온 것은 새로 만들지 않고 방금 것을 돌려준다(답을 못 받고 다시 누른 것).

## 금윤호에게 — 2026-09-30 · 김민(Claude) — 로그인 · 내 정보 · 게시판 · 관리자 버그 고침(네 영역 일부)

받은 뒤 할 일 없음(DB · 패키지 그대로).

- **폼 13곳을 `guardFormAction`(`lib/action-offline.ts`)으로 감쌌다** — 로그인 · 가입 · 내 정보 · 비밀번호 · 탈퇴 · 글쓰기 · 관리자
  (회원 역할 · 삭제 · 패치노트 메모) · 라이브러리 폼. 신호가 끊기면 예전엔 오류 화면으로 가서 가입 일곱 단계가 통째로 사라졌다.
- `profile-form.tsx`: lb · inch · mph 로 적으면 글자가 바뀌던 것(적는 글자를 따로 쥔다), `step=0.5` 때문에 단위를 바꾼 값(72kg →
  158.7lb)이 칸에 안 맞아 **브라우저가 폼 저장을 막던 것**(닉네임만 고쳐도) → `step="any"`, 키는 정수 cm 로.
- 탈퇴 · 관리자 회원 삭제가 저장소의 그 사람 파일(사진 · 클립 · 안 쓴 올린 파일)을 남기던 것 → `deleteUserFiles`(`lib/storage.ts`, 폴더 통째).
- 서버에서 그리는 날짜에 한국 시간대(게시판 · 관리자 · 패치노트 메모 시각 — UTC 라 9시간 이르게 · 전날로 찍혔다).
- 설정 저장 뒤 돌아갈 곳(`training-setup.ts` `returnPath`): 아는 주소 몇 개만 받아 영양 · 라이브러리 · 투구 기록에서 저장하면 홈으로
  튕겼다 → 이 사이트 안의 주소는 다 받는다(`//` · `/\` 는 막음).
- `(app)/layout.tsx` 에 `<SendPendingSets />`(운동 세트 대기열을 앱 어디서든 보냄 — 김민 영역).
- **안 고침(사용자 확인 뒤)**: 비밀번호를 바꿔도 다른 기기 로그인이 30일 동안 안 풀린다(토큰에 비밀번호 지문이 없다). 가입 중 약관
  링크(`target=_blank`)가 앱에서 사파리로 열린다.

## 금윤호에게 — 2026-09-30 · 김민(Claude) — 홈 · 체크인 · 영양 버그 고침(네 영역)

받은 뒤 할 일 없음(DB · 패키지 그대로). 점검 에이전트가 찾은 것 중 코드로 확인한 것만 고쳤다. 새 도우미 `lib/action-offline.ts`
(`orOffline(부르기, 실패값)`): 서버 액션이 신호 끊김으로 던지면 전환 · useActionState 가 오류 화면으로 가서 화면이 통째로 바뀌고
적던 것이 사라진다 — 이것으로 감싸면 한 줄 오류로 남는다. **새 저장 단추를 만들면 이걸로 감싸 줘.**

- `components/checkin-form.tsx`: 저장을 감쌈 — 폼이 (app) 레이아웃에 있어 오류 화면이 로그인 밖 것(app/error.tsx, '로그인으로')이었다.
  '다시 누르면 풀림'이 안 되던 것(pointerdown 을 숨은 라디오에 달아 한 번도 안 옴 → label 에서) · lb 로 몸무게를 적을 수 없던 것
  (kg 로 바꿨다 되돌려 1 → 1.1). 둘 다 브라우저에서 확인.
- 영양: 저장 8곳(`nutrition-view` · `food-sheet` · `goal-sheet`)을 감쌈. '−' 가 0.25 밑의 양을 0.25 로 키우던 것.
  캘린더 그날 칸의 목표 체중이 영양 탭과 달랐다(그날 → 가입 때로 건너뜀) → `recentWeightKg`(`lib/nutrition/load.ts`)를 같이 쓴다.
- 홈: '기간별 돌아보기'가 고른 날이 아니라 늘 오늘로 셈(`ReportClient` 에 `today`) · AI 리포트 만들기를 감쌈 · '여기부터 시작하세요'가
  45일 쉰 사람에게도 뜨던 것(`everLogged`).
- 안 고침: 인기 음식 목록은 누가 보낸 mfds 이름 · kcal 을 그대로 믿는다(조작된 요청이 있어야 함, 사용자 둘이라 미룸).

## 금윤호에게 — 2026-09-30 · 김민(Claude) — 구속 측정에서 찾은 버그(코드는 네게 맡김)

받은 뒤 할 일 없음. 사용자 요청으로 앱 전체를 점검하다 구속 측정에서 아래를 찾았다. 한 번 고쳐 올렸다가(17dbf60) **네가 구속
측정을 고치는 중이라 사용자 뜻으로 구속 측정 파일은 모두 되돌렸다** — 네 작업과 겹치지 않게. 고쳤던 코드는 17dbf60 의 diff 에
있다. 1 · 2 는 화면 흐름 그대로 가짜 카메라(`getUserMedia` 를 `canvas.captureStream(60)` 으로 바꿔 끼움)로 재현했다.

1. **존 → '측정 시작하기' 뒤 카메라 화면이 검다**(`velocity-screen.tsx`): 뷰파인더(`finder`)를 수평 · 존 / 측정 / 렌즈 단계마다
   다른 조건부 자리에 그려 React 가 `<video>` 를 새로 만든다. LiveCapture 는 켤 때의 옛 요소를 쥐고 있어 새 요소는 srcObject 가
   없고, 문서에서 떨어진 옛 요소는 멈춘다(캔버스 길이면 장면도 끊김). 재현: '이 설정으로 시작' → 다음 → 측정 시작하기 →
   video.videoWidth 0 · paused. 되돌리기 전 고침: `finder` 를 `createPortal` 로 떠 있는 상자에 한 번만 그리고, 단계의 자리
   (display: contents div 의 callback ref)가 붙을 때 상자를 `appendChild` 로 옮김 — 같은 요소라 영상이 안 멈춘다.
2. **처음 쓰는 사람이 '측정 시작하기'를 누르면 '지난 설정으로 바로 시작할까요?'로 튄다**(카메라는 켜진 채): `goMeasure` 의
   `persistSetup` 이 처음으로 저장 설정을 만드는데 `decided` 는 false 라 `showAsk` 가 켜진다 → `persistSetup` 에서 `setDecided(true)`.
3. '이 설정으로 시작'은 누르기 전 그림의 `startCamera` 를 불러 네트 · 포수 뒤 · 릴리스 거리가 기본값으로 카메라에 들어간다(초점 방식이
   틀림) → 켤 때 설정을 layout effect 로 맞추는 ref 에서 읽기(함수를 ref 에 넣으면 react-hooks/immutability 가 막는다).
4. 세션 중 카메라를 다시 켜면 LiveCapture 결과 번호가 1부터라 새 클립이 같은 번호의 옛 공에도 붙는다 → 켤 때마다 번호에 차례를 얹기.
   짝 없는 클립(잡음)도 `createObjectURL` 을 만들고 안 푼다.
5. 저장(`saveVelocitySession`) · 클립 올리기(`lib/velocity-clip-upload.ts` 의 서버 액션)가 `startTransition` 안에서 던지면(신호 끊김)
   오류 화면으로 가 **잰 공이 사라진다** → try/catch + `unstable_rethrow`. 같은 모양: 탐색기 `act`, `file-measure.tsx`(단계가 '저장 중'에
   멈춤), `pitch-log/velocity-section.tsx`.
6. `components/velocity/pitch-editor.tsx`: 스피드건 칸이 `Number(t)` 로 쥐어 '138.' 의 점이 사라진다(138.5 → 1385 → 저장 거절) →
   글자로 쥐기. BottomSheet `onClose` 는 `e.target === e.currentTarget` 일 때만(아래 Modal 과 같은 까닭), Esc keydown 은 stopPropagation.
7. 측정 화면에 `useWakeLock` 이 없다(삼각대에 두면 화면이 꺼져 카메라가 멈춘다). 앱에서 카메라를 거절하면 '브라우저 주소창 옆
   자물쇠' 안내가 나온다 — 앱엔 주소창이 없다(아이폰 설정 › Bullpen Log › 카메라).
8. 서버: `loadCalibration` 이 `calibExclude` 를 안 뺀다 · 수기 공의 건 값을 고쳐도 raw · kmh · 투구 기록이 그대로 · 보정 차수 결과를
   '원본 공에 채우기' 하면 지금 모델 버전을 찍는다(옛 차수 값이 지금 보정 짝이 됨) · 탐색기에서 수기 공 차이가 +0.0.
9. `session-history.tsx` · `velocity-section.tsx` 의 시각이 `getHours()` 라 서버(UTC)와 폰 글자가 달라 hydration 이 어긋난다 →
   `Intl.DateTimeFormat('ko-KR', { timeZone: 'Asia/Seoul', hour: '2-digit', minute: '2-digit', hourCycle: 'h23' })`. 관리자
   '최근 30일'(`velocity-admin-load.ts`)도 UTC 날짜로 센다(`toDateKey` 로).
10. 아이폰 앱(이제 화면 끝까지 그림)에서: 위 막대 셋(`velocity-home.tsx` · 내비 바 · 세션 요약)이 `h-12 … pt-[env(safe-area-inset-top)]`
    라 border-box 로 48px 안에 59px 여백이 들어가 단추가 시계 밑과 본문 위로 삐져나온다 → `h-[calc(3rem+env(safe-area-inset-top))]`.
    카메라 위 알림 `bottom-[8.25rem]` · 요약 오류 줄 `bottom-20` 은 홈 막대만큼 올리고, 렌즈 보정 칸 밑 여백에 `env(safe-area-inset-bottom)`.

그 밖(정할 것): '스피드건 보정 적용'을 꺼도 서버는 늘 보정해 저장 · 타구 세션도 투구 기록을 만들어 투구수 · 최고 구속에 섞임 · 릴리스
구속은 보정 전 값 · mph 사용자에게 ± · 건 값이 km/h · 앱에서 `window.confirm` 은 영어 'Cancel/Ok'(Capacitor 고정 문구).

## 금윤호에게 — 2026-09-30 · 김민(Claude) — 앱에서 시계 · 홈 막대에 가리던 곳 · 창 안의 창(네 파일 여럿)

받은 뒤 할 일 없음. 앱이 화면 끝까지 그리게 된 뒤(아래 메모) 아이폰에서 가리던 곳을 고쳤다(구속 측정은 위 메모 10번 — 안 건드림).
사파리 · PC 는 `env(safe-area-inset-*)` 가 0 이라 그대로다. **새 화면에 `h-12 … pt-[env(safe-area-inset-top)]` 를 쓰지 마** —
테일윈드는 border-box 라 높이 48px 안에 59px 여백이 들어간다. 높이에 더한다: `h-[calc(3rem+env(safe-area-inset-top))]`.

- `checkin-gate.tsx` · `components/modal.tsx`('page' 창 = 투구 기록 팝업): 최대 높이에서 시계 · 홈 막대 자리를 뺐다
  (92 · 94dvh 그대로면 제목과 ✕ 가 시계 밑이었다).
- `components/modal.tsx`: `onClose` 를 `e.target === e.currentTarget` 일 때만 부른다 — React 19.2 는 dialog 의 `close` 를 부모
  쪽으로도 올려 보내, 창 안의 창(삭제 확인 · 내 정보 안의 창 · 투구 기록 팝업 안의 시트)을 닫으면 바깥 창까지 닫혔다.
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
