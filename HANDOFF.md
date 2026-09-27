# 받은 뒤 할 일 — 서로에게 남기는 말

두 사람 다 Claude 로 작업한다. 이 파일은 `CLAUDE.md` 가 불러오므로, 이 저장소에서
Claude 로 작업을 시작하면 저절로 읽힌다. 규칙은 `AGENTS.md` 6번.

- **Claude 에게**: `git config user.name` 으로 지금 누가 작업하는지 본다(`Kim Min` =
  김민, `금윤호` = 금윤호). 그 사람 앞으로 온 말이 아래에 있으면, 다른 일을 하기 전에
  사용자에게 먼저 알린다. 명령 실행 같은 할 일은 사용자 허락을 받고 한다.
- 처리한 말은 이 파일에서 지우고 커밋한다. 지난 말은 git 이력에 남는다.
- 공개 저장소다. 비밀번호·키·`.env` 값은 절대 적지 않는다.

---

## 김민에게 — 2026-09-27 밤 · 금윤호(Claude) — 구속 측정 엔진 정확도

네 메모(운동 라이브러리 · 장비 · 캐시 v7 → 서버 다시 켜기)는 사용자에게 전하고 처리했다.

**받은 뒤 할 일 없음** — DB 구조 · 패키지 그대로(`package.json` 에 시험대 스크립트 한 줄만 늘었다).
구속 측정 파일만 고쳤다(`lib/velocity-engine/*`, `components/velocity/*`, `app/(session)/velocity/*`,
`lib/velocity-lens.ts` · `lib/velocity-setup.ts`).

- **정확도 시험대 `npm run velocity:accuracy`**(`scripts/velocity-accuracy.mts`) — 진짜 구속을 아는 공을 프레임으로
  그려(번짐 · 잡음 · 노출 변화 · 옆 흐름 · 공기저항 · 화각 오차 · 포수 뒤) 엔진 전체를 돌리고 오차를 잰다.
  `--only=글자` 로 일부만, `--seeds=N`, `--diag` 로 지름 치우침. 엔진을 손대면 이걸로 앞뒤를 견준다.
- 엔진에서 바뀐 것(부르는 쪽 영향): `analyzeFrames` 입력에 `focalPx`(렌즈 보정값) · `releaseDistanceM`(포수 뒤) 이
  늘었고, `ReleaseInfo.dxCm/dyCm/distanceM` 이 `number | null` 이 됐다(포수 뒤는 위치를 모른다). `MeasureSuccess.detail`
  에 `startKmh` · `endKmh`. `findMovedBlobs` 다섯째 인자 `exposureBias`. `simulatePitch` 의 `dragPerSec` → `dragPerM`.
- 속도 맞춤이 직선에서 공기저항 곡선(`geometry.ts` `fitDrag`)으로 바뀌었다. 지름은 문턱값 상자가 아니라 밝기 총량으로
  다시 잰다(`analyze-frames.ts` `refineTrack`). 시험대 기준 편향 −8~−23km/h → ±0.5km/h 안(자세한 건 커밋 본문).
