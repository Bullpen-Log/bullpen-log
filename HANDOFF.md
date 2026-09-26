# 받은 뒤 할 일 — 서로에게 남기는 말

두 사람 다 Claude 로 작업한다. 이 파일은 `CLAUDE.md` 가 불러오므로, 이 저장소에서
Claude 로 작업을 시작하면 저절로 읽힌다. 규칙은 `AGENTS.md` 6번.

- **Claude 에게**: `git config user.name` 으로 지금 누가 작업하는지 본다(`Kim Min` =
  김민, `금윤호` = 금윤호). 그 사람 앞으로 온 말이 아래에 있으면, 다른 일을 하기 전에
  사용자에게 먼저 알린다. 명령 실행 같은 할 일은 사용자 허락을 받고 한다.
- 처리한 말은 이 파일에서 지우고 커밋한다. 지난 말은 git 이력에 남는다.
- 공개 저장소다. 비밀번호·키·`.env` 값은 절대 적지 않는다.

---

## 김민에게 — 2026-09-26 · 금윤호(Claude)

받은 뒤 할 일은 없다(DB·패키지 그대로). 같이 쓰는 파일과 트레이닝 쪽을 고친 것만 적는다.

- `components/modal.tsx` — `size="page"` 창은 안의 높이가 바뀌면 부드럽게 늘고 준다
  (ResizeObserver). 그래서 모든 창의 본문(children)이 스크롤 칸 안에서 `<div>` 한 겹에 싸인다.
  창 안 내용이 스크롤 칸의 바로 자식이라고 보고 짠 것(`h-full`, sticky 등)이 있으면 봐 줘.
  병합 때 네 `modalOrigin` · `useModalState` 와 합쳤다 — 둘 다 그대로다.
- 투구 기록 팝업(`/pitch-log/<날짜>`)으로 가는 링크에는 `transitionTypes={OPEN_POPUP_TYPES}`
  (`lib/transition-types.ts`)를 붙인다. 안 붙이면 팝업이 뜰 때 본문 전환이 창 위로 번쩍인다.
  트레이닝 탭의 '오늘 투구 기록하기'에도 붙였다(`app/(app)/training/page.tsx` — 병합 때 네
  들여쓰기에 한 줄만 넣었다). 팝업은 이제 불러오는 자리 없이 내용이 다 온 뒤 한 번에 뜬다.
- 트레이닝 창의 한 줄 설명(제목을 되풀이하던 것)을 뺐다: `add-exercise.tsx`(운동 추가) ·
  `settings-button.tsx`(트레이닝 설정) · `day/[date]/day-exercises.tsx`(운동 기록).
- `components/app-shell.tsx` — 오른쪽 위 막대의 옮겨 다니는 단추를 48px 로 키웠다(막대 높이
  56px). 메뉴를 도크가 다 뜨기 전에 누르면 끊지 않고 빨리 감아 판으로 잇는다(bar-sheet 는 안 쓴다).
- `app/globals.css` — 홈 그래프용 `trend-rise` · `trend-draw` · `trend-fade` 를 더했다. 네
  `.finish-pop` 은 그대로 두었다.
- 홈 분석 칸이 `@container` 다 — `app/(app)/coach/overview.tsx` · `parts.tsx` · `report-client.tsx`
  의 칸 나누기가 화면 폭 대신 칸 폭(`@md` · `@xl`)을 본다. 분석 칸이 넓은 화면에서 그래프 옆에
  반쪽으로 서기 때문이다.
- `CLAUDE.md` 에 `@docs/claude/geum-yunho.md` 를 더했다 — 금윤호의 Claude 설정(데스크톱 · 노트북이 같이
  보려고). 첫머리에 '금윤호일 때만 따른다'고 적어 두어 네 Claude 는 무시한다. 원하면 같은 식으로
  `docs/claude/kim-min.md` 를 만들어 불러오면 된다.
