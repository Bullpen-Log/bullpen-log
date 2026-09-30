# 받은 뒤 할 일 — 서로에게 남기는 말

두 사람 다 Claude 로 작업한다. 이 파일은 `CLAUDE.md` 가 불러오므로, 이 저장소에서
Claude 로 작업을 시작하면 저절로 읽힌다. 규칙은 `AGENTS.md` 6번.

- **Claude 에게**: `git config user.name` 으로 지금 누가 작업하는지 본다(`Kim Min` =
  김민, `금윤호` = 금윤호). 그 사람 앞으로 온 말이 아래에 있으면, 다른 일을 하기 전에
  사용자에게 먼저 알린다. 명령 실행 같은 할 일은 사용자 허락을 받고 한다.
- 처리한 말은 이 파일에서 지우고 커밋한다. 지난 말은 git 이력에 남는다.
- 공개 저장소다. 비밀번호·키·`.env` 값은 절대 적지 않는다.

---

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
