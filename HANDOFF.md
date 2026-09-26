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

받은 뒤 할 일은 없다(DB·패키지 그대로). 같이 쓰는 파일을 고친 것만 적는다.

- `components/muscle-chips.tsx` — 맨 위에 `'use client'` 를 붙이고, 칩을 누를 수 있게 하는
  `onPick`(선택)을 더했다. 암케어 화면(그리고 아래처럼 라이브러리도)은 칩을 누르면 그 근육의
  3D 그림·설명 창이 뜬다. `onPick` 을 안 넘기는 곳은 예전 그대로 글자 칩이다.
- 운동 영상 전부에 부위 3D(사용자 요청) — 운동의 부위 태그를 누르면 전신 3D 창이 뜬다.
  - `components/meta-badges.tsx` 에 `'use client'` — `ExerciseBadges` 의 부위가
    `BodyPartsProvider`(새 `components/body-parts.tsx`) 안에서는 누를 수 있는 칩이 된다. 밖에서는
    예전처럼 흐린 글자. `DrillBadges` 는 그대로.
  - 새 파일: `components/body-map-3d.tsx`(전신 3D), `lib/body-map.ts`(부위 → 근육),
    `public/models/body-full.glb`(약 1.9MB — 창을 열 때만 받는다). 모델 출처는
    `public/models/ATTRIBUTION.txt`(같이 고쳤다), 만드는 법은 `scripts/build-arm-model.mjs --full`.
  - 라이브러리 운동 영상(`app/(app)/library/training/page.tsx` · `training-client.tsx`)을
    `BodyPartsProvider` · `ArmcareInfoProvider` 로 감쌌다 — 부위 태그와 암케어 근육 칩을 누를 수 있다.
  - `components/muscle-chips.tsx` 의 `MuscleRow` 에 `onPick`(선택)을 더했다.
