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

받은 뒤 할 일: **개발 서버를 다시 켠다** — 운동 목록 캐시 이름을 `library:exercises:v5` 로
바꿨다(`lib/library-cache.ts`). DB 구조·패키지는 그대로다. 같이 쓰는 파일을 고친 것도 적는다 —
지우거나 되돌리기 전에 한 번 봐 주면 된다.

- **운동 라이브러리 내용을 바꿨다(구조가 아니라 줄).** 백업 뒤에 했다.
  - 암케어 근육 넷을 더했다(`lib/armcare/anatomy.ts`) — 전면 삼각근·대흉근·상부 승모근·손가락
    신전근. 3D 에서 이 근육들만 회색이라 빠진 것처럼 보였다(사용자 요청).
  - 암케어 운동 23개의 '키우는 근육'에 그 이름을 보탰다(`scripts/retag-armcare-muscles.mts
    scripts/armcare-retag-2026-09-26b.json`). 프론트 레이즈 둘 · 크로스바디 인만 주 근육이 바뀐다.
  - 암케어 참고 영상 운동 넷을 더했다(`scripts/add-armcare-reference.mts`) — 고무줄 손가락 펴기 ·
    싱글암 덤벨 오버헤드 슈러그 · 푸쉬업 플러스 · 밴드 프론트 레이즈.

- `app/globals.css` 맨 끝의 `.finish-pop`(`@keyframes armcare-pop`) — 체크가 톡 튀어나오는
  움직임(3457324). 암케어 체크·따라하기 완료, 그리고 이번에 트레이닝 목록의 체크 동그라미도
  쓴다. 움직임 줄이기를 켠 사람에게는 움직이지 않는다. (이 메모가 병합 때 빠졌어서 다시 적는다.)
- `components/modal.tsx` — 도우미 둘을 더했다. `Modal` 자체는 그대로다.
  - `modalOrigin(e)` — 누른 단추의 한가운데(`origin` 으로 넘기는 값). `app/(app)/nutrition/shared.ts`
    의 `originOf` 와 같은 일이다 — 그쪽은 건드리지 않았다.
  - `useModalState<T>()` — 창의 내용·열림·날아올 자리를 함께 쥔다. 닫아도 닫히는 움직임(0.2초)
    동안 내용을 붙들어 둔다 — 바로 비우면 빈 창이 제목도 없이 줄어들며 번쩍였다.
- `components/muscle-chips.tsx` — 칩을 누르게 하던 `onPick` 을 뺐다. 이제 `ArmcareInfoProvider`
  안에서는 칩이 저절로 눌려 3D 그림·설명 창이 뜨고, 밖에서는 글자 칩이다(여는 함수는 새
  `components/armcare-info-context.ts`). `max` 로 자를 때 진하게 칠할 근육부터 남긴다
  (`lib/armcare/chips.ts`). `MuscleRow` 도 `onPick` 없이 `muscles` 만 받는다.
- `components/meta-badges.tsx` — `ExerciseBadges` 의 부위는 `BodyPartsProvider` 안에서만 누르는
  칩이 된다(여는 함수는 새 `components/body-parts-context.ts`). `DrillBadges` 는 그대로.
- 운동 영상 전부에 부위 3D(70fce1a) — 부위 태그를 누르면 전신 3D 창. `components/body-parts.tsx`
  (창) · `body-parts-view.tsx`(본문 — 창을 처음 열 때 받는다) · `body-map-3d.tsx`(전신 3D),
  `lib/body-map.ts`(부위 → 근육), `public/models/body-full.glb`(약 1.9MB, 창을 열 때만 받는다 —
  출처는 `public/models/ATTRIBUTION.txt`, 만드는 법은 `scripts/build-arm-model.mjs --full`).
  `lib/body-map.ts` 의 `isMappedBodyPart` 는 없애고 `isBodyPart`(body-parts-context)로 옮겼다.
- 두 3D(암케어 근육 지도 · 전신)가 같이 쓰는 새 파일: `components/three-stage.ts`(무대 —
  모델은 한 번만 받는다), `components/stage-overlay.tsx`(앞·옆·뒤 단추), `components/model-credit.tsx`
  (3D 출처 줄 — 모델이 CC BY-SA 라 3D 가 보이는 곳마다 적는다).
- 라이브러리 운동 영상(`app/(app)/library/training/page.tsx` · `training-client.tsx`)은
  `BodyPartsProvider` · `ArmcareInfoProvider` 로 감싸 두었다. 이번에 `training-client.tsx` 에서
  `MuscleRow` 로 넘기던 `onPick` 만 뺐다(칩이 스스로 연다).
