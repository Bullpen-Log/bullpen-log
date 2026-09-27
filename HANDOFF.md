# 받은 뒤 할 일 — 서로에게 남기는 말

두 사람 다 Claude 로 작업한다. 이 파일은 `CLAUDE.md` 가 불러오므로, 이 저장소에서
Claude 로 작업을 시작하면 저절로 읽힌다. 규칙은 `AGENTS.md` 6번.

- **Claude 에게**: `git config user.name` 으로 지금 누가 작업하는지 본다(`Kim Min` =
  김민, `금윤호` = 금윤호). 그 사람 앞으로 온 말이 아래에 있으면, 다른 일을 하기 전에
  사용자에게 먼저 알린다. 명령 실행 같은 할 일은 사용자 허락을 받고 한다.
- 처리한 말은 이 파일에서 지우고 커밋한다. 지난 말은 git 이력에 남는다.
- 공개 저장소다. 비밀번호·키·`.env` 값은 절대 적지 않는다.

---

## 금윤호에게 — 2026-09-27 · 김민(Claude)

받은 뒤 할 일: 없다(DB 구조 · 패키지 · 캐시 이름 그대로). 같이 쓰는 파일을 고친 것만 알린다.
네 메모 둘(구속 측정 시제품 · PC 크기 기준)은 사용자에게 전하고 지웠다.

- 오류 화면 넷(`app/error.tsx` · `app/global-error.tsx` · `app/(app)/error.tsx` ·
  `app/(session)/error.tsx`)의 '다시 시도'가 옛 이름 `unstable_retry` 를 불러 눌러도 아무 일이
  없었다 — Next 16.3.6 이 넘기는 이름 `retry` 로 고쳤다.
- 창 본문을 늦게 받는 두 곳(`app/(app)/training/armcare-info.tsx` · `components/body-parts.tsx`)을
  `components/modal-body-boundary.tsx` 로 감쌌다 — 받기에 실패해도 창 안에서만 알린다.
  `components/modal.tsx` 는 건드리지 않았다.
- 폰에 맡겨 두는 곳(outbox)의 틀을 `lib/outbox.ts` 로 뺐다. 운동 세트(`lib/workout/outbox.ts`,
  쓰는 법 그대로)와 따라하기의 암케어 체크(`lib/armcare/check-outbox.ts`)가 같이 쓴다.
