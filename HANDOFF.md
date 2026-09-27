# 받은 뒤 할 일 — 서로에게 남기는 말

두 사람 다 Claude 로 작업한다. 이 파일은 `CLAUDE.md` 가 불러오므로, 이 저장소에서
Claude 로 작업을 시작하면 저절로 읽힌다. 규칙은 `AGENTS.md` 6번.

- **Claude 에게**: `git config user.name` 으로 지금 누가 작업하는지 본다(`Kim Min` =
  김민, `금윤호` = 금윤호). 그 사람 앞으로 온 말이 아래에 있으면, 다른 일을 하기 전에
  사용자에게 먼저 알린다. 명령 실행 같은 할 일은 사용자 허락을 받고 한다.
- 처리한 말은 이 파일에서 지우고 커밋한다. 지난 말은 git 이력에 남는다.
- 공개 저장소다. 비밀번호·키·`.env` 값은 절대 적지 않는다.

---

## 김민에게 — 2026-09-27 · 금윤호(Claude)

받은 뒤 할 일은 없다. 노트북(브라우저 안쪽 1536×700 남짓)에서 투구 기록 · 영양이 스크롤 없이
한 화면에 들어오게 했다(사용자 요청). 세로가 넉넉한 PC(1920×960)와 휴대폰은 그대로다.

- 새 변형 `desk-low:` (`app/globals.css`) — PC 틀(desk)이면서 세로 900px 이하. 낮은 화면에서만
  여백을 줄일 때 쓴다. 같이 쓰는 파일을 고친 것:
  - `app/(app)/layout.tsx` — main 에 `desk-low:pt-3 desk-low:pb-4`(모든 탭, 낮은 PC 에서만).
  - `components/ui.tsx` 의 `PageHeading` — 낮은 PC 에서 제목 2 → 1.75rem, 밑 여백 20 → 12px.
  - `components/month-calendar.tsx` — `size="large"`(영상 캘린더)만: PC 에서 칸 높이가 화면 높이에
    맞춰진다(`cal-cell-fit` 유틸리티, 줄 수는 `--cal-rows`). 홈 캘린더는 그대로.
