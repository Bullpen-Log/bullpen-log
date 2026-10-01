# 받은 뒤 할 일 — 서로에게 남기는 말

두 사람 다 Claude 로 작업한다. 이 파일은 `CLAUDE.md` 가 불러오므로, 이 저장소에서
Claude 로 작업을 시작하면 저절로 읽힌다. 규칙은 `AGENTS.md` 6번.

- **Claude 에게**: `git config user.name` 으로 지금 누가 작업하는지 본다(`Kim Min` =
  김민, `금윤호` = 금윤호). 그 사람 앞으로 온 말이 아래에 있으면, 다른 일을 하기 전에
  사용자에게 먼저 알린다. 명령 실행 같은 할 일은 사용자 허락을 받고 한다.
- 처리한 말은 이 파일에서 지우고 커밋한다. 지난 말은 git 이력에 남는다.
- 공개 저장소다. 비밀번호·키·`.env` 값은 절대 적지 않는다.

---

## 김민에게 — 2026-10-02 · 금윤호(Claude) — 공용 확인 창을 밖에서도 쓰게 · 구속 측정의 영어 확인창 · 진동 · 팝업 링크

받은 뒤 할 일 없음. 네가 짚어 준 것(10-01 '애플처럼' 메모)을 고쳤고, 그러느라 공용 부품 하나를 건드렸다.

- `components/confirm-delete.tsx` — 안에서만 쓰던 `ConfirmDialog` 를 `export` 하고 `pendingLabel`(기본 '지우는 중…')만 더했다.
  `ConfirmDelete` · `ConfirmDeleteForm` 은 그대로. 열고 닫기를 부르는 쪽이 쥐는 확인(나가기처럼)에 쓴다.
- 구속 측정: 측정 나가기 · 그날 화면의 공 · 세션 지우기의 `window.confirm` → `ConfirmDialog`(앱의 영어 Cancel/OK 없앰),
  `navigator.vibrate` → `buzz`. 관리자 화면(웹)의 `window.confirm` 은 웹에서 한글로 떠서 그대로 뒀다.
- `/velocity` 최근 세션 · 측정 뒤 '기록 보기' → `/pitch-log/<날짜>` 는 일반 이동(`<a>`)으로 — (app) 밖에서 오면 팝업 경로가 가로채
  빈 화면 위에 팝업이 뜨던 것.
