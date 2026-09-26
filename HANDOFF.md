# 받은 뒤 할 일 — 서로에게 남기는 말

두 사람 다 Claude 로 작업한다. 이 파일은 `CLAUDE.md` 가 불러오므로, 이 저장소에서
Claude 로 작업을 시작하면 저절로 읽힌다. 규칙은 `AGENTS.md` 6번.

- **Claude 에게**: `git config user.name` 으로 지금 누가 작업하는지 본다(`Kim Min` =
  김민, `금윤호` = 금윤호). 그 사람 앞으로 온 말이 아래에 있으면, 다른 일을 하기 전에
  사용자에게 먼저 알린다. 명령 실행 같은 할 일은 사용자 허락을 받고 한다.
- 처리한 말은 이 파일에서 지우고 커밋한다. 지난 말은 git 이력에 남는다.
- 공개 저장소다. 비밀번호·키·`.env` 값은 절대 적지 않는다.

---

## 금윤호에게 — 2026-09-26 · 김민(Claude)

> **⚠ 김민이 지금 DB 구조를 바꾸는 중이다 (2026-09-26, 사용자 요청: 암케어 '내 루틴').**
> 새 표 `ArmcareRoutine` 을 더한다(추가만, 기존 표·칸은 그대로). 금윤호가 구조를 바꿀
> 때(예: `NutritionProfile.sex` 지우기)는 **먼저 pull 해서 이 표가 `prisma/schema.prisma`
> 에 들어온 뒤에** `migrate diff` 를 만든다 — 안 받은 채로 만들면 diff 가 이 표를
> `DROP TABLE` 한다. 끝나면 이 줄을 '받은 뒤 할 일'로 바꿔 둔다.

남겨 준 말(`npx prisma generate` · `npm install`)은 받아서 처리했다. `usesWeight` 정리는
아직 안 했다 — 따로 할 때 한다.

### 받은 뒤 할 일

1. 개발 서버를 다시 켠다. 운동 목록 캐시 이름을 `library:exercises:v4` 로 바꿨다
   (`lib/library-cache.ts`) — 스크립트로 운동 30개의 근육을 고쳐서, 이름을 바꿔야 보인다.

### 알아 두면 좋은 것

- 암케어 근육을 여섯 더했다(`lib/armcare/anatomy.ts`) — 얕은·깊은 손가락 굴곡근, 광배근,
  대원근, 주근, 상완근. 사용자 요청으로 부상 예방 기준을 다시 검토한 결과다.
- 그 근육을 쓰는 암케어 운동 30개의 '키우는 근육'을 DB 에 저장했다
  (`scripts/retag-armcare-muscles.mts` · `scripts/armcare-retag-2026-09-26.json`). DB 구조는
  그대로다. 저장 전에 백업했다.

### 트레이닝 탭을 [트레이닝 | 암케어] 두 칸으로 바꿨다 (사용자 요청)

- [기록] 칸을 없앴다 — 지난 운동은 홈 캘린더가 맡는다(날짜 → 트레이닝 줄 → 그날 화면).
  예전 주소 `/training?view=history` 는 `/today` 로 넘긴다.
- `/training` 은 이제 **마지막으로 본 칸**을 연다(쿠키, `lib/training-part.ts`). 암케어는
  운동과 상관없이 언제든 따로 하는 곳이라서다. '운동'을 뜻하는 길은 칸을 적어 보낸다 —
  `/training?view=today`.
- 금윤호 쪽 파일을 고친 것: `app/(app)/today/day-detail.tsx` 한 줄 — 홈 캘린더에서 오늘
  운동으로 가는 길을 `/training` → `/training?view=today`. 앞으로 트레이닝 칸으로 보내는
  링크를 새로 만들면 이 주소를 쓴다. 아래 탭(`lib/nav.ts`)의 `/training` 은 그대로 둔다.
