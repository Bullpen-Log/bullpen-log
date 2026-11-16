# Guided original video preparation and submission

Design date: 2026-11-16. Source baseline: released `ad032b25`, including the R07/R08 original-file picker and four approved tutorial clips. Status: design only; no implementation or deployment is included in this change.

## Product decision

Make the original-saving tutorial part of the actual intake journey. Each screen presents one short tutorial, one task and one primary action. The user performs the task, returns to the intake page and presses Next. The final tutorial step directly opens the real file picker; accepted file inspection leads to confirmation and then preparation of the other camera view.

The normal path must no longer depend on opening a separate help dialog, reading all instructions and closing it to find the upload control again. Existing help entry points should resume the relevant preparation stage rather than open a disconnected tutorial. Contextual help can remain available without becoming the primary journey.

## Current gap

`OriginalFileGuide` already contains four chapters and Previous/Next buttons. Its last action only closes a modal. Chapter position lives inside the mounted guide body, so reopening starts over. `VideoStep` owns a separate file-selection action, while `Flow` owns the selected files, inspection, review and transfer state. The user must connect these two experiences mentally.

The redesign connects these pieces without replacing the existing original-file checks or upload machinery.

## End-to-end journey

1. Set or enter sender credentials and confirm the athlete name, following the existing flow.
2. Prepare and choose the side video through the five screens below.
3. Prepare and choose the rear video through the same five screens, with the rear view named throughout.
4. Continue the existing individual review decisions, required/optional consent and final summary.
5. Press the explicit final send action. Only then start transfer using the existing pipeline.
6. Show preparation, transfer, server verification and receipt with their existing truthful completion conditions.

Selecting a file in a guided screen prepares it locally. Advancing tutorial screens must not reserve/upload files or record consent. Tutorial completion is not submission completion.

## Five screens for each camera view

| Screen | Title and task | Tutorial | Primary action and transition |
| --- | --- | --- | --- |
| 1 | `옆 영상에서 공유 열기` / `뒤 영상에서 공유 열기`. Open the correct recording in Photos and open Share. | Existing `01-open-share` clip. | `다음` advances after the user performs the task. Local hint: `사진 앱에서 이 작업을 마친 뒤 다음을 누릅니다.` |
| 2 | `무수정 원본 내보내기`. Find the original-export action. | Existing `02-export-original` clip, keeping its clear menu close-up. | `다음` advances. A small `이 메뉴가 보이지 않음` action offers an applicable alternative route. |
| 3 | `파일 앱에 원본 저장`. Save to a location the user can find again. | Existing `03-save-files` clip. | `다음` advances after saving. The next screen explains that the user returns to this intake page. |
| 4 | `저장한 옆 영상 선택` / `저장한 뒤 영상 선택`. Select the file just saved. | Relevant Files-picker portion of the fourth clip, aligned with the actual current interface. | `파일에서 원본 선택` opens the real picker from that user click. Selecting a file starts existing inspection. Cancel stays here. Accepted inspection advances to screen 5; failure remains here with recovery. |
| 5 | `옆 영상 확인` / `뒤 영상 확인`. Verify the selected recording and detected frame information. | Selected-file preview instead of another tutorial. | `다음` advances to rear preparation or the existing review wizard. Enabled only for an accepted current file. |

Screen 5 foregrounds view, filename and detected fps. Resolution, duration, size and timing diagnostics remain available in a disclosure. The selected recording preview and the instructional recording must be visually and semantically distinct. No confirmed-original badge is inferred from watching a tutorial, checking a box, seeing 240fps or opening the Files picker.

A secondary `원본을 이미 저장했습니다` shortcut can take an experienced user to screen 4. In particular, a user who exported both recordings together need not repeat three explanations for the rear recording. This shortcut does not mark a file valid or bypass any selection, pair, consent or server checks.

## Screen layout and wording

- Use the existing full-page intake shell. Show one screen at a time with the primary action anchored at the bottom and an accessible Previous control.
- Label the context explicitly: `옆 영상 준비 · 2/5` or `뒤 영상 준비 · 2/5`. Keep the overall journey understandable through named phases, avoiding two unexplained competing `2/5` counters.
- Present a short title, the current tutorial player and at most two short task sentences. Avoid repeating the entire recording checklist on every preparation screen.
- Keep the familiar current type scale and consistent input/action spacing. Aim for the video, task and primary controls to fit an ordinary 375×667 viewport. Preserve scrolling for small heights, large text and error recovery; never crop controls or shrink explanatory text to force a fit.
- Portrait footage can sit beside a short task on narrow screens only when both remain legible. Use the current wide menu close-up at full content width. Test the actual clips, not placeholder rectangles.
- Questions may use conversational Korean. Instructions use the guidebook style: `공유 버튼을 누릅니다.`, `저장한 파일을 선택합니다.`

Example screen:

```text
이전                         옆 영상 준비 · 2/5

무수정 원본 내보내기

[현재 단계의 짧은 안내 영상 / 재생·다시 보기]

공유 목록을 내려 ‘무수정 원본 내보내기’를 누릅니다.
사진 앱에서 이 작업을 마친 뒤 다음을 누릅니다.

이 메뉴가 보이지 않음

                         다음
```

## Playback and task completion

The Next button records the user's progression through an instruction, not verification of an operating-system action. A website cannot observe whether the user actually completed an operation inside Photos or Files. The user performs those operations manually. The page should not claim to open/control Photos, detect a completed export or select an operating-system menu automatically.

Use manual play, inline playback and a clear replay affordance. Retain the approved clips' silent playback and posters. Load only the current tutorial and pause it when changing stages, leaving the page, hiding the tab or switching apps. Do not automatically resume playback when the user returns.

When a tutorial ends, keep its current stage visible. Do not auto-advance: the user still needs to perform the illustrated task. Do not require watching every second before allowing Next, since a user may understand the action and complete it immediately. File-inspection success is the real gate before screen 5 and the next camera view.

## State ownership and navigation

Add a preparation substate owned by `Flow`, alongside the existing selected files. Do not put the authoritative position inside a modal/player component that is destroyed on close.

Suggested state shape:

```text
view: side | rear
stage: share | export | save | select | confirm
route: apple-files | existing-other-device-route
origin: new | replace | correction | recovery
returnTarget: the calling intake screen
```

The only valid transition from `select` to `confirm` comes from accepted inspection of the current `File` object. Keep rejection, inspecting and accepted states distinguishable. Preparing the rear view must not unmount or discard an accepted side file. Watching/replaying a guide, moving back or changing help must not reselect a file, invalidate its SHA cache or trigger upload. Keep the R07 per-File hash association and late-selection-result protections.

Extend `history-position.ts` with allowlisted preparation view/stage/context when needed. Preserve the existing depth-based Back/Forward behavior. Browser Back and the on-page Previous control should describe the same journey. Neither `File` objects nor access credentials belong in history state. A stale history entry that points to confirmation without a current accepted file must resolve to selection.

## Returning from Photos or Files

Save the current instruction position when the user advances, before relying on page-hide/unload events. An ordinary app switch keeps the current stage in memory and pauses its video. Returning to Safari shows that stage with the Next button available; merely returning does not mark a task completed.

For a reload in the same browser tab, use a small versioned `sessionStorage` checkpoint scoped to the server-provided opaque submission ID after authentication. Store only route, view, stage, origin, guide version and update time. Do not store the invitation token, PIN, sender/athlete name, filename, paths, hashes, file bytes or consent answers. A proposed UI-checkpoint TTL is 24 hours; it does not change any server retention period. Treat storage denial as nonfatal and keep the in-memory flow working.

Authenticate and reload authoritative server state before applying a checkpoint. Closed, expired, withdrawn, archived, published, correction and in-progress-upload states take precedence over tutorial position. Validate all checkpoint enums, submission scope, guide version and age. Clear the checkpoint on completed submission, explicit leave-device action or an incompatible server state.

A browser reload or operating-system eviction can lose local `File` objects. If this happens, explain that the saved file needs to be selected again. Never restore a “selected” or “ready to send” state from a checkpoint alone. If the server already has an upload, use existing recovery logic rather than replaying an ordinary new-submission tutorial. Do not promise cross-device or new-tab tutorial persistence.

## Errors and alternate routes

- File-picker cancellation leaves the user at selection with no error and no fabricated completion.
- While inspection runs, show a real inspecting state and prevent forward progress. Keep backward navigation safe from late inspection callbacks.
- For low/unknown fps, unreadable/empty files, unsupported containers, size limits or the same-file pair, retain the existing rejection policy and diagnostics. Offer file reselection and a targeted return to original preparation. Do not offer compression, speed conversion or a generic override to satisfy 120fps.
- Preserve the existing accepted file when an attempted replacement fails. Clearly identify that the previous file is still selected; do not imply that the rejected replacement passed or silently continue with it.
- A tutorial-load/playback failure shows the poster and complete short text instructions, with retry available. It must not prevent valid file submission.
- If the original-export menu is unavailable, provide the existing applicable original-transfer instructions as an alternate route, preserving their OS/share-target limitations. Do not let the user advance under a claim that an export was automatically verified.
- Use the existing Apple-touch detection as a default route hint, with an explicit option to choose another device/transfer method. Existing iPhone recordings must not be presented as instructions for Android or Windows. Preserve the current non-Apple picker policy until that platform's route is separately validated.

## Replacement, correction and upload recovery

Reuse the same preparation component with a specific view and return target. Return to the caller's requested slot, not always to the start of side/rear submission. Keep the other view, athlete fields and consent state intact. Corrections continue to expose only requested fields/files. Upload recovery still requires the original same-file checks; viewing the guide is not permission to resume with arbitrary replacement bytes.

Do not change previously received assets, active original paths, inspection thresholds, publication controls or consent versions as part of this UX change.

## Existing media and code reuse

Reuse the approved, redacted first three clips and their posters under `public/intake-guides/original-file-v1`. The fourth clip already warns that its intake interface is old. Before making it a primary instruction, review its full footage and either use a coherent OS-picker-only excerpt or replace it with a recording of the implemented interface. The visible button names, tap sequence and return point must match the product. New media must retain the existing privacy review: no contact suggestions, private titles/locations, unredacted personal recordings or unapproved audio/metadata.

Expected code ownership:

| File or area | Planned change |
| --- | --- |
| `components/intake/intake-flow.tsx` | Own preparation context, per-view transitions, return targets and recovery precedence. |
| `components/intake/original-file-guide.tsx` | Extract/reuse the chapter player; remove the disconnected close-only finish from the normal path. |
| `components/intake/file-picker.ts` | Keep one source for labels/chapters and the R08 accept/open order. |
| `components/intake/guided-steps.tsx` | Integrate the tutorial screens with actual selection and file confirmation. |
| `components/intake/status-steps.tsx`, `slots.tsx` | Connect replacement/correction/recovery callers without changing their allowed scope. |
| `components/intake/history-position.ts` | Add validated preparation navigation while preserving history depth. |
| Existing intake client tests and local preview | Test actual transitions, selected-file preservation and failure/reload behavior. |

The picker must still open directly from the user's click using the existing shared helper, without an asynchronous detour or effect-triggered automatic picker opening. Continue to use the actual selected `File` in inspection, hashing and transfer.

## Acceptance criteria

1. A first-time iPhone user can complete side preparation, real selection, file confirmation, rear preparation and final submission without opening/closing a separate guide to locate the next action.
2. Each Next presents one task. Ending playback, returning from another app and dismissing a picker do not advance the task automatically.
3. Accepted file inspection gates progress; 120fps, format, size, pairing and server verification rules remain unchanged. No original/received claim appears before its actual condition is satisfied.
4. Same-tab app switching/reload restores an appropriate instruction after authentication; missing `File` objects cause explicit reselection. Checkpoint failure, old versions, stale history and another invitation cannot skip a required gate.
5. The second view, Back/Forward, failed replacement, correction and upload recovery preserve unaffected files and input. No duplicate transfer starts from guide navigation.
6. Only the current tutorial loads/plays. Hidden/previous clips pause, a failed clip has usable text, and all clips remain redacted and match the implemented interface.
7. Verify 320/375/393/430 widths, light/dark modes, large text, keyboard/screen-reader focus, long filenames and final actions. Expanded help may scroll; required actions remain reachable.
8. Use isolated tests for state, API and consent behavior. On an approved real-device test path, follow the guide while switching between Safari, Photos and Files; select known 120/240fps originals and a known 60fps failure, then verify selected-file-to-server-to-download byte/hash identity. Separate transport identity from camera provenance. Browser emulation alone does not satisfy this physical-path check.

## Implementation sequence

First implement the shared preparation state/navigation and connect it to real file inspection. Then finish per-screen copy/layout and chapter playback, add same-tab checkpoint recovery, wire replacement/correction/recovery contexts and align the fourth clip. Run focused state/interaction tests and inspect the actual small-screen UI before independent review. Release only the reviewed scope under the repository's existing approval workflow.
