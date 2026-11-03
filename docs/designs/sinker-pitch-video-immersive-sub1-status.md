# 싱커 몰입 비교 — 서브1 진행 · 통합 보고

작업 식별자: `sinker-immersive-2026-11-03-im01-im12`. 인계 문서 `sinker-pitch-video-single-screen-main-ready.md`(상태 ready-for-sub1-integration)를 받은 뒤 앱에 이었다.

## 지금 상태: 앱 통합 끝 · 기기 미확인(2026-11-03)

- 시작점은 MAIN 의 마지막 SS 판이다 — `sinker-pitch-video-ss-before-im-baseline.json` 의 사본과 견주면 바뀐 줄은 이 작업의 줄뿐(workspace-parts · note-editor · panels · timeline 은 팔레트 훅 이름만).
  fit · note-drafts · tool-bar · side-playback · transport-hook · store · timing · workspace-context · compare-picker · screen-test 는 해시가 그대로다.
- 커밋 · 푸시 · OTA · 배포 · 네이티브 굽기 · 시뮬레이터 · Metro · DB 쓰기 없음. `.env` 안 읽음. 새 패키지 없음(`expo-status-bar` 는 이미 있던 것).
- **어떤 IM 도 기기에서 보지 않았다.** 아래 '확인'은 실제 소스를 가짜 훅 · 가짜 재생기로 돌린 회귀 시험과 순수 계산이다.

## 무엇이 바뀌었나(파일)

| 파일 | 바뀐 것 |
| --- | --- |
| `native/src/compare/immersive/geometry.ts` | (새, 서브1) 칸 · 채움/전체 · LayerMap · 겹침 위 영상 변환 · 자동 배치 + 통합 때 더함: `panLimit` · `clampPanFor` · `panByFor` · `zoomAtFor` · `isFramed`(채움은 확대 1 이어도 잘린 만큼 밀어 볼 수 있게, 저장 한계 (6−1)/2 안) |
| `native/src/compare/immersive/presentation.ts` · `visibility.ts` · `palette.ts` | (새, 서브1) 보기 상태 · 도구 숨김 상태 기계 · 검은 팔레트 — 주석만 '통합됨'으로 |
| `native/src/compare/ui/compare-palette.ts` | (새) `useComparePalette()` — 비교 부품만 쓰는 검은 판(대비 높이기면 더 밝은 보조 글자) |
| `native/src/compare/doc.ts` | 짝에 선택 칸 `present`(새 짝은 `newPresentation()`, 예전 문서는 `presentOf` 가 overlay 칸에서 옮겨 읽음) · `setPresent`(예전 overlay 칸도 옛 앱이 읽는 0.1~0.9 로 같이 맞춤) · `transport.display`(한 영상 보기, 선택 칸 — 없으면 안 생김). SCHEMA_VERSION 그대로 |
| `native/src/compare/ui/pane.tsx` | 칸 = 무대를 나눈 자리. 영상 · 썸네일 · 돋보기가 같은 LayerMap 사각형에(원본 비율, contain 이라 비율을 아직 모를 때도 안 찌그러짐) · 반전 scaleX · 모서리 10 · 테두리 2 · 남색 바탕 걷고 검정 + 고른 칸은 안쪽 2pt 테두리 · 채움에서 잘리면 '일부 잘림' 표 · 확대나 이동이 있으면 '맞춤' · 겹침 겹(`layer`: 지도 · 진하기 · 반반 자르기 · 위 겹은 손가락 안 받음) · 머리 줄 밑으로 표 내리기(`overlayTop`) |
| `native/src/compare/ui/annotation-layer.tsx` | `display` · `map` 을 받으면 원본↔화면 · 두 손가락 확대 · 이동을 LayerMap(채움/전체를 아는 판)으로. 안 주면 예전 contain 그대로 |
| `native/src/compare/ui/workbench.tsx` | `planStage` → `planImmersive`(칸이 무대를 다 덮음 · 위 빈자리 0) · OverlayBox(따로 그리던 겹친 판) 지움 → 같은 두 Pane 을 같은 자리에 겹침(`overlayTopMap`) · 새 비교는 함께 보기에 들어선 첫 순간 한 번 겹침(B 45%) · 타임라인 위 진하기 줄(−/+ 5% · 25 · 50 · 75 · 위 영상 바꾸기, 반반이면 까닭 + 나누기 끄기) · 보기 창에 채움/전체 · 더보기에 전체/채워 보기 · 머리 줄이 영상 위에 뜸(영상 바탕은 화면 맨 위부터, 단추는 안전 영역 안) · 도구 숨기기 / 도구 보이기(44pt) · 뒤로는 먼저 도구만 · 영상 누르면 돌아옴 · 숨김 중 뒤로 쓸기 막음 · 검은 판 · 이 화면에 있는 동안만 상태 막대 밝은 글자 · 그리는 동안 겹침이 잠깐 나뉜다는 글 |
| `native/src/compare/ui/workspace-parts.tsx` · `note-editor.tsx` · `panels.tsx` · `timeline.tsx` | `usePalette` → `useComparePalette`(작은 창 · 메모 편집 · 시트 · 타임라인도 같은 검은 판) |
| `scripts/native-compare-regress-ui.mts` | 가짜 모듈 표에 몰입 모듈 · 팔레트 훅 · `expo-status-bar` · 하드웨어 뒤로. UI03 · UI10 의 '원본 비율 칸 · 아래 붙임 · 겹친 판 하나' 기대를 몰입 계약으로 바꿈(이름 · 다른 단언은 그대로) + 새 IM04 · IM06 |
| `scripts/native-compare-immersive-selftest.mts` | 30 → 34(확대 · 이동 한계 · 짚은 자리 고정 · 문서 왕복 · 예전 문서) · `npm run native-compare:immersive`, `native-compare:test` 끝에 이음 |
| `package.json` | 위 npm 스크립트 한 줄 |

## IM 항목별

| 항목 | 한 것 | 확인(모의 · 계산) | 기기 |
| --- | --- | --- | --- |
| IM01 검은 화면 | 뿌리 · 무대 · 칸 #000, 도구 · 창 · 메모 편집 · 시트 · 타임라인이 `useComparePalette`, 상태 막대 light(화면 초점 동안만 — `expo-status-bar` 의 쌓이는 막대, 떠나면 앱 설정으로) | 팔레트 대비(라이트 · 다크 · 네이비 · 대비 높이기 모두) | 미확인 — 실제 상태 막대 · 다른 화면이 덮을 때 |
| IM02 영상은 위에서 | 머리 줄 = 영상 위 오버레이(안전 영역 안, 옅은 막), 칸 표는 머리 밑으로, 칸 모서리 · 테두리 · 거터 없음 | regress UI03(위 빈자리 0) | 미확인 — Dynamic Island 가 채움 영상 머리를 가리는지 |
| IM03 칸 · 채움/전체 | 칸이 무대를 빈틈없이(구분선 1pt), 새 비교 기본 채움 · '일부 잘림' · 전체(위 붙임) · 언제든 되돌림 · '맞춤'으로 확대 · 이동 0 | regress UI03 · 몰입 시험(채움은 밀어도 빈자리 없음 200건) | 미확인 |
| IM04 겹침 | B 45% · 0~100% 5% 걸음 · 25/50/75 · 위 영상 바꾸기 · 반반(진하기 안 씀 · 까닭) | regress IM04 · 몰입 시험(왕복 · 끝점) | 미확인 — **실제 반투명 합성(AVPlayerLayer 두 겹)** |
| IM05 변환 하나 | 영상 · 그림 · 돋보기 · 확대 · 겹친 위 영상이 LayerMap 하나. OverlayBox 지움 | 몰입 시험(applyReg 와 같은 자리 · 짚은 자리 고정 300건) · regress UI10(두 칸 같은 자리 · 겹친 판 0) | 미확인 |
| IM06 도구 숨김 | 머리 · 타임라인 · 재생 · 도구 줄 · 옆 칸 예약을 풀고 '도구 보이기' 하나 · 뒤로 · 영상 누르기 · 창이나 메모가 열리면 되살림 · 편집 · 창 · 그리기 중엔 숨기지 않음 | regress IM06(같은 칸 키 · 풀린 높이를 영상이 씀 · 뒤로 먼저 · 저장 안 함) | 미확인 — VoiceOver 초점을 되살리기 단추로 옮기는 것은 **안 함**(알림만) |
| IM07 전환 | `LayoutAnimation` 200ms 투명도 · 동작 줄이기면 바로. 칸 키 그대로라 재생기를 다시 붙이지 않음 | regress UI10 · IM06(칸 키 같음) | 미확인 — 실제 움직임 · 재생 끊김 없음 |
| IM08 굴림 없음 · 닿는 도구 | SS01 · SS02 의 도구 줄 · 작은 창 그대로, 진하기 줄은 같은 ToolBar(좁으면 '더보기') | regress SS 전부 | 미확인 |
| IM09 저장 호환 | 새 칸은 선택 칸 · 예전 문서는 저장된 겹침 · 진하기 · 반반 그대로 · 자동 겹침 없음 · 확대 · 기준 · 맞춤 그대로 · 숨김은 저장 안 함 | 몰입 시험 · regress IM04 · IM06 | 옛 앱이 새 문서를 열 때는 예전 overlay 칸으로 본다(0/100% 는 0.1/0.9 로) |
| IM10 검증 | 아래 '검사' | — | — |
| IM11 대장 | 이 문서 · 공용 대장 · HANDOFF | — | — |
| IM12 보고 | 한국어 보고 | — | — |

## 정한 것(인계 문서가 맡긴 일상 결정)

- 영상 바탕은 화면 맨 위부터(머리 줄이 위에 뜸), 조작은 안전 영역 안.
- 채움은 되돌릴 수 있고 잘림을 알리며, 전체 · '맞춤'(확대 · 이동 0)이 있다. 채움에서 확대 1 이어도 잘린 만큼은 밀어 볼 수 있다.
- 진짜 0 · 100% 진하기는 새 선택 칸 `present` 에만. 예전 `overlay.opacity` 는 옛 앱을 위해 0.1~0.9 로 같이 맞춘다.
- 겹침에서 위 영상(B)은 아래 영상(A)의 확대 · 이동을 따른다(변환 하나). B 칸 따로 저장된 확대는 나눠 볼 때 쓴다.
- 그리기는 한 영상 위에서 — 겹침에서 그리기를 켜면 잠깐 나눠 보이고 끝나면 돌아간다(글로 알림).
- `immersiveFrame()` 은 순수 계약으로 남겼고, 화면은 같은 규칙을 RN 배치(머리 절대 위치 · 도구 줄 걷기)로 따른다.

## 검사(2026-11-03, 로그 `/private/tmp/claude-501/-Users-yuno-Developer-bullpen-log/f6829270-4955-482d-a74b-53e957b60b57/scratchpad/im/final-*.log`)

- `npm run native-compare:test` → 끝 코드 0: native-compare 318 · regress 225(223 + 새 IM04 · IM06) · screen 800 · 몰입 34, 실패 0.
- `npm run my-videos:test` → 0: 117 + 69. `npm run release-access:test` → 0: 703.
- `cd native && npx tsc --noEmit -p tsconfig.json` → 2: 오류 4개, 모두 이 작업 밖 경로 타입(coach-chat · coach-settings · library/warmup · training/routine — 시작 때와 같음). 비교 폴더 0.
- `cd native && npx eslint src/compare src/app/pitch/compare.tsx` → 0 문제. `npx eslint scripts/native-compare-regress-ui.mts scripts/native-compare-immersive-selftest.mts` → 경고 1(원래 있던 `_t`).

배치 전후 예(순수 계산, 기기 측정 아님): 무대 390×571, 세로 9:16 두 영상 — 예전 `planStage` 는 189×336 두 칸이 y235(위 235pt 빔),
지금(채움 · 자동)은 나란히 194×571 · 195×571 칸, 위 빈자리 0, 무대 덮음 99.8%(구분선 1pt), 좌우 일부 잘림 표시. 도구를 숨기면 머리 · 도구 줄 높이를 영상이 쓴다(regress IM06: 560 → 760).

## 기기에서 볼 것(사용자 몫)

1. 세로 · 가로 · iPad 에서 검은 화면 · 상태 막대 글자 · 다른 화면으로 갔다 돌아올 때 상태 막대.
2. 채움에서 Dynamic Island · 머리 줄이 투수 머리를 가리는지 → 가리면 '전체' 또는 videoTop 'safe' 로 바꿀지.
3. 겹침 B 45% · 0 · 100% · 반반이 실제로 섞여 보이는지(AVPlayerLayer 두 겹 · 투명도), 재생이 어긋나지 않는지.
4. 도구 숨기기 → 도구 보이기 · 뒤로 · 영상 누르기, 전환 중 재생이 끊기지 않는지, VoiceOver 로 도구 보이기에 닿는지.
5. 채움에서 한 손가락이 아니라 두 손가락으로 밀어 잘린 손 · 공을 되찾기, '맞춤'.
6. 그리기 · 돋보기가 영상과 같은 자리에(채움 · 전체 · 반전 · 확대).
