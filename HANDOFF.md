# 받은 뒤 할 일 — 서로에게 남기는 말

두 사람 다 Claude 로 작업한다. 이 파일은 `CLAUDE.md` 가 불러오므로, 이 저장소에서
Claude 로 작업을 시작하면 저절로 읽힌다. 규칙은 `AGENTS.md` 6번.

- **Claude 에게**: `git config user.name` 으로 지금 누가 작업하는지 본다(`Kim Min` =
  김민, `금윤호` = 금윤호). 그 사람 앞으로 온 말이 아래에 있으면, 다른 일을 하기 전에
  사용자에게 먼저 알린다. 명령 실행 같은 할 일은 사용자 허락을 받고 한다.
- 처리한 말은 이 파일에서 지우고 커밋한다. 지난 말은 git 이력에 남는다.
- 공개 저장소다. 비밀번호·키·`.env` 값은 절대 적지 않는다.

---

## 금윤호에게 — 2026-09-25 · 김민(Claude)

### 받은 뒤 할 일

1. `npm install` — Next.js 가 16.2.12 → 16.3.6 으로 바뀌었다. 치명 등급 보안 구멍 두 개를
   막는 업그레이드다(d6522ff).
2. 개발 서버를 다시 켠다. 안 뜨면 `.next` 폴더를 지우고 다시 켠다.
3. `next.config.ts` 의 `experimental.viewTransition` 을 뺐다. 16.3 부터는 설정 없이 기본으로
   켜지고, 남겨 두면 모르는 설정이라며 빌드(타입 검사)가 멈춘다. 다시 넣지 말 것 — 화면 전환
   애니메이션은 그대로 돈다.

### 금윤호 쪽 파일을 고친 것

무엇을 왜 고쳤는지는 각 커밋 메시지(= 패치노트)에 자세히 있다.

- `app/globals.css` (5701777) — `dialog:not([open]) { display: none; }` 를 더했다. 창에 붙은
  `flex` 클래스가 닫힌 창을 숨기는 브라우저 기본값을 덮어써서, 닫힌 창이 투명한 채 제자리에
  남아 밑의 단추를 가로챘다(트레이닝의 [운동 시작]이 안 눌렸다). 앞으로 `flex` 를 단 창을
  새로 만들어도 이 규칙이 닫힌 창을 숨겨 준다. 여닫는 움직임은 그대로다.
- `app/(app)/profile/account-actions.tsx` (7dd51f7) — '내 정보' 창 계정 칸 맨 위에
  [로그아웃]. 하단 '더보기'가 사이드바를 열게 되면서 로그아웃 단추가 있던 /more 로 가는
  길이 없어져, 앱 안에서 로그아웃할 곳이 없었다.
- `app/(app)/today/pitch-log-panel.tsx` (b9c6c8f) — 서버가 준 `initialLogs` 를 state 로
  복사하지 않는다. 옛 달에서 따로 받은 기록만 state 에 두고 합친다. 홈에서 저장한 투구가
  바로 위 캘린더에 안 뜨던 것(새로고침해야 보였다).
- `components/video-upload.tsx` · `app/(app)/pitch-log/entry-form.tsx` (d81df19) — 영상을
  올리는 중에는 저장을 막는다(`onUploadingChange`). 올리기가 끝나면 끝날 때의 목록에 더한다
  — 시작할 때의 목록에 더했더니 올리는 동안 뺀 영상이 되살아났다.
- `components/use-playback-urls.ts` (d81df19) — 재생 주소를 10개씩 나눠 묻고(API 한도),
  실패하면 다시 묻고, 늦게 온 결과도 합친다. 한 달에 영상이 11개를 넘으면 썸네일이 전부 안
  뜨던 것. 돌려주는 모양(`urls`·`loading`·`ready`)은 그대로다.
- `app/(app)/videos/video-gallery.tsx` (4611991) — 2분할 비교 막대 `sm:bottom-4` →
  `lg:bottom-4`. 폭 640~1023px(아이폰 가로·아이패드 세로)에서 하단 탭바 밑에 깔렸다.

### 알아 두면 좋은 것 (김민 쪽 변경)

- 종료를 안 누르고 떠난 운동 판은 이제 자동으로 닫힌다 — 상태 `ABANDONED`, 그날 세트는
  운동 기록으로 접힌다(11626bd, `lib/workout/stale.ts` · `lib/workout/close-stale.ts`).
- 운동 화면 틀의 높이를 화면 높이에 고정했다(409b17d, `app/(session)/layout.tsx`).
