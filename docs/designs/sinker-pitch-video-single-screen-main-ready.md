# 싱커 비교 화면 — 메인 SS01–SS07 교정 끝 · 서브1 통합 준비

- task ID: `sinker-immersive-2026-11-03-im01-im12`
- status: `ready-for-sub1-integration`
- 작성: 2026-11-03 · 메인(Claude, 금윤호 맥북 `/Users/yuno/Developer/bullpen-log`)
- 기준 HEAD: `a7bbda63415bb9e9cae43a0184557211dce63911`(커밋 안 함 — 아래 파일들은 **작업 트리 diff** 로 있다. 커밋 · 푸시 · OTA · 배포 안 함)
- 조율 계약: [immersive-coordination](./sinker-pitch-video-immersive-coordination.md) · [main-coordination-task](./sinker-pitch-video-immersive-main-coordination-task.md)

**이 시점부터 메인은 아래 '넘기는 파일'을 더 고치지 않는다.** 서브1이 현재 작업 트리의 코드를 다시 읽고 필요한 부분만 잇는다. 오래된 사본 · HEAD 판 · 자체 복제본으로 통째로 덮어쓰지 말 것 — 메인의 SS 교정(재현 시험 137개가 HEAD 판에서 실패하던 것)이 사라진다.
서브1 전용 파일(`native/src/compare/immersive/` · `scripts/native-compare-immersive-selftest.mts` · `docs/designs/sinker-pitch-video-immersive-sub1-status.md`)은 메인이 읽지도 고치지도 않았다.

## 완료한 SS 항목

결과 표 · 까닭 · 파일은 대장 [workbench-ledger](./sinker-pitch-video-workbench-ledger.md) 'SS01–SS07' 절. 요약:

| ID | 상태 | 핵심 |
| --- | --- | --- |
| SS01 그리기 줄 폭 | implemented / runtime unverified | 잰 폭 단추 줄(planBar · ToolBar) · 지금 도구 → 열두 도구 쪽 고르기 · 색 · 굵기는 '모양' 한 창 · 다시 하기 · 지우기 · 설정은 넘치면 더보기 |
| SS02 큰 행 · 가림 | implemented / runtime unverified | 단추 하나 · 글 조각 하나 단위 쪽 · 영상 가림 약 36%(위 64 는 늘 영상) · 가로 폰은 오른쪽 칸 자리 · 고르기 묶음 2줄 넘으면 '지금 값' 단추 · 장면 모음 그림 크기 · A·B 나란히 |
| SS03 자판 높이 | implemented / runtime unverified | 자판 윗변(show · change frame · hide) · 겹침 한 번만 · 쓰는 동안 머리 줄 걷음 · planEditor(두 줄 → 한 줄 모음 → 한 줄 입력) |
| SS04 메모 쪽 · 초안 | implemented / runtime unverified | 원문 하나 · 쪽 = 원문 구간 · 넘친 글 다음 쪽 · 한도는 원문 · 한글 조합 중엔 칸 글 유지 · 저장/닫기/버리기 · 계정 폴더 초안 |
| SS05 단독 재생 생명주기 | implemented / runtime unverified | useSidePlayback · 뒤로 감 · 떠남 · 닫힘 · 영상 바뀜 · 오류에 두 재생기 멈춤 · transport-hook 도 idle 에 멈춤 |
| SS06 대상 일관 | implemented / runtime unverified | 함께 · A · B = 재생 · 한 장면 · 옮기기 같은 대상 · 함께로 오면 따로 옮긴 쪽 자리 기준 · 좁으면 고르는 창 |
| SS07 큰 글씨 | implemented / runtime unverified | 비교 핵심 글자 2배(FS_MAX)까지 · 어림도 2배 · 도구 칸 이름은 안 들어가면 그림만 |

미완료 · 제한(메인이 안 함): 실기기 · 시뮬레이터 확인 전부(렌더 · 실제 글꼴 폭 · 자판 · 한글 마크된 글자 · VoiceOver · 디코더 · 성능), 2배 넘는 접근성 글자는 2배에서 멈춤, 영상 위 작은 표(pane 1.2배) · 타임라인 양 끝 시각(1.3배) 상한은 남김, R01–R42 의 녹음 · 합성 내보내기 · PTS · 클라우드는 별개.

## 실행한 검사(2026-11-03, 메인 폴더 · 최종판 — 원래 명령의 exit code 와 전체 로그로 판정)

| 명령 | exit | 결과(전체 로그에서) |
| --- | --- | --- |
| `npm run native-compare:test` | **0** | 318 통과 → regress **223 통과 · 0 실패** → screen **800 통과 · 0 실패** |
| `npm run my-videos:test` | **0** | 117개 통과 0 실패 · 69 통과 0 실패 |
| `npm run release-access:test` | **0** | 703개 통과 |
| `cd native && npx eslint src/compare src/app/pitch/compare.tsx` | **0** | 출력 없음(0 문제) |
| `npx eslint scripts/native-compare-regress-ui.mts scripts/native-compare-screen-test.mts` | **0** | 경고 1(`_t` 298줄 — HEAD 에도 있던 것) |
| `cd native && npx tsc --noEmit -p tsconfig.json` | **2** | 오류 4개, 모두 메인이 안 고친 파일의 expo-router 경로 타입: `app/coach-chat.tsx` · `app/coach-settings.tsx` · `app/library/warmup/index.tsx` · `app/training/routine/[id].tsx`(작업 시작 때와 같음, 범위 밖이라 안 고침). 비교 폴더 · SS 시험 파일 오류 0 |

- 최종 확인 중 `tsc` 가 메인이 더한 SS 시험 줄의 타입 오류 2개를 찾았다(`regress-ui.mts` — `as unknown as` 하나, `!!` 둘). 실행 결과는 같았고 고친 뒤 위 표대로다. 앞선 보고의 'tsc 비교 폴더 0' 은 이 시험 파일을 빼고 본 것이었다.
- 같은 regress 를 HEAD 판 화면 파일 사본으로(`COMPARE_UI_ROOT=<git show HEAD:native/src/compare/ui/*>`) — 86 통과 · **137 실패**(SS01 30 · SS02 73 · SS03 4 · SS04 5 · SS05 17 · SS06 5 · SS07 2 · 처음 맞추기 1) — 재현 확인(교정 중 실행).
- 모두 모의 · 순수 검사다. 실제 아이폰 렌더 · 자판 · 한글 입력 · VoiceOver · 디코더 확인 아님.

## 서브1이 쓸 공개 API

### `native/src/compare/fit.ts`(새 · 순수)
- 글자: `FS_MAX = 2` · `fsOf(fontScale)` · `charUnits` · `textUnits` · `textW(s, fontSize, fs)` · `visualLines(text, w, fontPx)` · `lineCount` · `textBlockH` · `splitTextToHeight`.
- 단추 · 줄 크기: `ctlH(fs)`(= max(44, 21fs + 8)) · `iconW`(44) · `textBtnW(label, fs)` · `segItemW` · `segW` · `segH` · `headH` · `LINE`.
- 단추 줄: `BarItem { key, w, essential?, priority?, overflow?, compactW?, push? }` · `planBar(items, { width, maxRows, gap?, moreW? })` · `planBarAdaptive(items, { width, maxRows, preferCompact? })`(1줄부터, 빼지 않고 들어가는 가장 적은 줄) · `barFits` · `lineWidth` · `MORE_KEY`. `fits` 는 줄 수와 **줄 폭** 둘 다 본다.
- 작은 창: `InspRow<N> { key, h, node?, head?, items?: InspItem[], text?: { s, danger?, style? } }` · `expandRows(rows, { width, bodyH, fs, measuredW?, textFit? })` · `atomicNeed` · `packPages(blocks, bodyH, gap)` → `{ pages, oversize }` · `pagesFit` · `flowLines` · `inspChrome(fs)` · `inspectorBudget({ stageH, fs, needBody })` → `{ avail, bodyH, share, compact }` · `PREVIEW_MIN`(64) · `shotLayout` · `segMode(labels, width, fs, maxH?)` → `row | wrap | pick` · `segBlockH`.
- 메모: `paginateNote(text, { w, fontPx, lines })` · `joinPages` · `pagesCover` · `pageOfCaret` · `pageLines` · `pageOverflows` · `pageEndCaret` · `editPage(text, pages, k, nextPage, max)` · `graphemeCut` · `probablyComposing(prev, next)`.
- 자판 · 편집 줄: `keyboardOverlap(rootBottom, keyboardTop)` · `planEditor({ avail, fs, maxLines? })` → `EditorPlan { merged, inline?, lines, inputH, height, previewH, fits }` · `EDITOR_PREVIEW`.

### `native/src/compare/ui/tool-bar.tsx`(새)
`<ToolBar items={ToolItem[]} width maxRows label preferCompact? />` — `ToolItem = BarItem & { node, compactNode?, more?: { label, run, destructive?, disabled? } }`. 줄 폭 · 단추 폭은 onLayout 으로 잰 값으로 다시 놓는다. 넘친 것은 '더보기' → `ActionSheetIOS`.

### `native/src/compare/ui/side-playback.ts`(새)
`useSidePlayback({ pa, pb, rate, onTime(side, t) })` → `{ playing: 'a' | 'b' | null, play(side), stop(), stopAll(), toggle(side) }`. 뒤로 감(AppState) · `useIsFocused` false · 닫힘 · 재생기 바뀜 · `statusChange` error 에 두 재생기를 `playerCall.pause`, `playToEnd` 에 멈춤. 저절로 다시 안 틂.

### `native/src/compare/note-drafts.ts`(새) · `store.ts`
`draftKey(docId, { noteId?, sourceId, t })` · `parseDrafts` · `serializeDrafts` · `createDraftStore(fs, ownerId, opts?)` → `{ ownerId, load, get, list(docId), set, remove, removeDoc, flush, subscribe }` · `DRAFT_FILE`(`note-drafts.draft`). `store.ts` 에 `compareDrafts()`(지금 계정 저장소 · 로그아웃이면 null), 비교를 지우면 그 초안도.

### 바뀐 기존 API
- `ui/workspace-parts.tsx`: `TextBtn` 에 `icon?` · 글 두 줄까지 감김 · `Seg` 에 `maxW?` · `maxH?`(감기 · '지금 값' 단추) · `Inspector` 는 `IRow`(=InspRow) 의 `items` · `text` 를 덩어리로 쪽 나눔 · `onAccessibilityEscape` · 새 도우미 `flowRow` · `btnItem` · `iconItem` · `segRowOf(key, labels, width, fs, node, maxH?)` · `subRow` 는 이제 `text` 줄(높이 자동) · `ShotPair` 에 `row?` · `ctlH` · `chipRowsH` 는 2배 어림.
- `ui/note-editor.tsx`: props `{ title, initial, initialCaret?, plan: EditorPlan, width, onDraft(text, caret), onSave, onClose, onDiscard }`(예전 `lines` · `onCancel` 없음).
- `ui/transport-hook.ts`: 모양 그대로. 숨김(뒤로 감 · 떠남)에 늘 `background` 를 보내 두 재생기를 멈추고, 닫힐 때 멈춘다.
- `timing.ts`: `normalizedOfB(map, tb)` 더함. `workspace-context.ts`: Inspector 이름 `style` · `target` 더함.
- `ui/workbench.tsx`: 무대 `testID="compare-stage"` · 작은 창 자리 `compare-inspector-stage` | `compare-inspector-side` · 가로 오른쪽 칸 `compare-side`. 오른쪽 칸 폭은 안전 영역 뺀 폭의 30%(176~240). 메모를 쓰는 동안 머리 줄 없음.
- 공간 · 영상 자리 계산(`workspace-layout.ts` planStage · `geometry.ts`)은 **안 바꿨다** — 몰입 화면의 채움/상단 정렬은 서브1이 거기에 이으면 된다(두 구현을 남기지 말 것).

## 넘기는 파일(메인은 이제 안 고침)

메인이 이번에 고친 · 만든 파일(작업 트리 diff):
- 새: `native/src/compare/fit.ts` · `native/src/compare/note-drafts.ts` · `native/src/compare/ui/tool-bar.tsx` · `native/src/compare/ui/side-playback.ts`
- 고침: `native/src/compare/ui/workbench.tsx` · `ui/workspace-parts.tsx` · `ui/note-editor.tsx` · `ui/transport-hook.ts` · `ui/panels.tsx` · `ui/pane.tsx` · `ui/compare-picker.tsx` · `native/src/compare/store.ts` · `timing.ts` · `workspace-context.ts`
- 시험: `scripts/native-compare-regress-ui.mts`(SS 재현 · 하네스: 화면 크기 · 안전 영역 · 자판 · 포커스 · `COMPARE_UI_ROOT`) · `scripts/native-compare-screen-test.mts`
- 문서: `docs/designs/sinker-pitch-video-workbench-ledger.md`(SS 절) · `HANDOFF.md`(김민 앞 2026-11-03 글 하나) · 이 파일

그 밖의 기존 비교 파일(`workspace-layout.ts` · `geometry.ts` · `doc.ts` · 저장 모듈 · `annotation-layer.tsx` · `timeline.tsx` · `source-picker.tsx` · `app/pitch/compare.tsx` · 다른 시험)은 이번에 안 고쳤고, 인계 계약대로 이제 서브1이 필요한 만큼 고칠 수 있다.
메인은 인계 뒤 위 파일들을 더 고치지 않는다(서브1과 겨루지 않는다). 다른 세션의 변경(`AGENTS.md` · `lib/market/lesson-dummy.ts` · `scripts/lesson-dummy-2026-10-31.mts` · 데스크톱 설계 문서)은 손대지 않았다.

## 인계 완료(메인 → 서브1)

- 메인의 SS01–SS07 교정 · 최종 검사가 끝났다. **메인은 이 시점부터 '넘기는 파일'을 더 고치지 않는다.**
- 서브1 상태(검토 보완 메모 기준): 독립 몰입 모듈 4개 · 시험 30개를 마쳤고 세션이 끝난 통합 대기다. **이 파일을 써도 서브1은 저절로 다시 시작하지 않는다** — 사용자가 서브1 세션을 다시 열어 이 문서를 읽고 통합하라고 지시해야 한다.
- 서브1이 통합할 때: 현재 작업 트리의 메인 코드 위에 잇고, 끝나면 `npm run native-compare:test`(SS 회귀 223 · 화면 800 포함)와 IM 시험을 함께 돌려 SS 가 그대로인지 본다.
- 메인은 서브1 전용 파일(`native/src/compare/immersive/` · `scripts/native-compare-immersive-selftest.mts` · `-sub1-status.md`)을 읽지도 고치지도 않았다.

## 주의

- 회귀 · 화면 시험(SS 223 · 800)을 IM 시험과 같이 다시 돌려 SS 가 깨지지 않았는지 볼 것. 하네스의 `partsModule` · `panelsModule` 은 실제 소스를 컴파일해 도우미는 진짜, 부품은 이름 글자로 남긴다.
- 커밋 · 푸시 · OTA · 배포는 승인되지 않았다. 시뮬레이터 · Metro · DB 쓰기 · 새 의존성 금지는 그대로.
