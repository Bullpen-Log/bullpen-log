# SINKER pitching comparison single screen remediation

Implement this task now in `/Users/yuno/Developer/bullpen-log`. This is an implementation request, not another planning exercise. Report progress and delivery in Korean. Use the current main checkout and preserve other sessions' changes.

The user wants a convenient, video-first pitching comparison workspace where all app-owned operations finish within one screen, without free page scrolling. Do not solve fitting problems by hiding unreachable content, shrinking touch targets, or limiting accessibility text enlargement.

## Read first

Read these files completely before editing:

1. Root `AGENTS.md`, applicable nested instructions including `native/AGENTS.md`, `CLAUDE.md`, and relevant `HANDOFF.md` notes.
2. `docs/designs/sinker-pitch-video-single-screen-review-2026-11-03.md` and its companion evidence JSON.
3. `docs/designs/sinker-pitch-video-single-screen-plan.md` and `sinker-pitch-video-single-screen-claude-prompt.md` (UI01–UI12).
4. `docs/designs/sinker-pitch-video-workbench-ledger.md` and the original R01–R42 and F01–F08 contracts as needed to preserve existing functionality.

The new review and this remediation contract take precedence for the specific defects below. Preserve all nonconflicting original requirements. Read the installed/version-matched Expo/React Native documentation before changing their API behavior. If framework code is touched, read the applicable installed Next.js guide too.

Recheck git state and overlapping files before modifying them. The reviewed HEAD was `a7bbda63`; do not assume it is still current. Existing changes in AGENTS.md, lesson dummy files/scripts and desktop design documents belong to other work. Preserve them. The new review/evidence/prompt are part of this comparison task.

## Nonnegotiable boundaries

- Do NOT start a simulator, Metro, Expo dev server, or native local build. The user explicitly forbids simulator and Metro use. Use source-level, pure and mock execution checks; honestly identify everything requiring a physical device.
- Do NOT push, deploy, publish an OTA update or submit a build. Do not interpret old push requests as authorization for this new work. Do not commit unless separately authorized by the current task context; leave a reviewable diff.
- Do NOT change the production/shared database, run migrations, seed test data, replace photographs or create test accounts. No dependency installation or new native module is expected for this remediation.
- Never read, print, send or commit secret/key/.env values.
- Do not run `npm run build` (it can deploy migrations). A web build is not needed for this native task.
- Do not widen beta release access or alter unrelated Sinker/Dugout/admin navigation.
- Preserve existing save isolation, corruption recovery, account boundaries, asset ownership, source selection cancellation, restore semantics and buffering/loop corrections.
- Scope free-scroll prohibition to this comparison feature. Do not disable scrolling across the app. OS photo/file/camera/share interfaces retain their own behavior.

## Establish reproductions before fixes

Turn SS01–SS05 into durable regression checks that fail against the current defect and pass after the fix. Use the real source functions/components and realistic mocks where device rendering is unavailable. Do not count a hand-copied layout constant or absence of ScrollView as proof that all children fit.

The review probes are source/mock evidence, not native screenshots. Reproduce independently and report any difference before changing the associated claim. Do not silently discard a finding because the existing suite passes.

## SS05 and SS06: consistent playback targets and lifecycle

Implement one lifecycle policy for linked playback and independent A/B playback, including alignment mode. Alignment currently calls a native player directly outside the linked transport machine; background handling can leave that player running while the transport is idle.

- Explicitly pause BOTH players on background, screen blur, unmount, source replacement and relevant errors. Invalidate pending seek/resume intent. Clearing an interval alone is insufficient.
- Return to the same confirmed position, paused. Do not automatically resume after foregrounding.
- Make Together/A/B mean the same target for scrubbing, stepping and play/pause. In ordinary comparison, selecting A must not silently switch to Together when play is pressed.
- Define the resynchronization reference when returning from independent playback to Together. Keep anchor semantics intact; communicate the reference briefly.
- Preserve offset, normalized-motion and loop behavior, as well as cancellation generations and buffering recovery.
- On narrow screens, provide a small explicit target chooser rather than an unexplained cycling control. Keep the selected target visible.

Acceptance: Together/A/B × alignment/normal comparison × playback/seek/buffering/loop × background/blur/return/source change. Both players stop when required; selecting A plays only A, and B only B; linked playback restoration remains correct.

## SS01: drawing tools must fit small portrait widths

The paired drawing toolbar currently needs at least 348pt for a 320pt screen: seven 44pt actions, six 4pt gaps and 16pt outer padding. The second row can grow further when a shape is selected.

- Measure available width and actual control bounds. Do not rely solely on device class or orientation.
- On narrow widths, keep target, current tool, style, undo and Done in stable reachable positions. Adapt the precise composition to measured labels and larger text.
- Current tool opens a bounded paginated chooser retaining line/angle/freehand/point and every existing drawing tool. Preserve a quick route to common tools without displaying all controls simultaneously.
- Group color/width under a compact style entry. Put contextual redo/delete in an appropriate menu if necessary. Keep undo and Done easy to reach.
- Do not simply wrap everything into more rows and take the space back from the video. Do not use horizontal scrolling or reduce 44pt touch targets.
- Preserve precision handles, loupe, original-image coordinates, single-transaction undo and source identity.

Acceptance: 320/375pt portrait, selected/unselected shapes, larger text, landscape side dock. Every essential control fits, all tools remain reachable, and video/timeline/transport remain present in normal analysis modes.

## SS02: split oversized inspector content, not just rows

Inspector pages currently allow a single row taller than their body. Measured row heights do not solve that case, while maxHeight plus overflow:hidden can make commands unreachable.

- Paginate atomic commands/content fragments, not giant Wrap rows. If a row cannot fit, split or recompose it. Treat an oversized final page as a failed boundary assertion.
- Recompose overlay registration into compact directional/scale/reset groups. Split the six pitching events into fitting pages. Handle crowded markers and long information/notes too.
- Storyboards must fit real paired image heights. Use side-by-side thumbnails or one event per page in short landscape layouts; do not clip B's image.
- Bound the inspector's video occlusion. Start with roughly one third of the stage where feasible. For smaller spaces, replace contextual tool content or enter an explicit compact editing state with a visible video preview. Do not promise an impossible universal ratio.
- Keep close, page navigation, timeline and playback reachable. Preserve all existing commands, selected state and start-row navigation.

Acceptance: after actual content measurement, every page's child bounds fit its allocated body. All pages and commands are reachable without free scrolling. Test long Korean labels, big text, very short landscape, and zero/one/many entries.

## SS03 and SS04: keyboard-safe notes with lossless pagination

The current two-line minimum can consume more height than remains above a landscape keyboard. A 390pt viewport with a hypothetical 216pt keyboard needs at least 424pt before any video space. The current no-scroll input also accepts 12 newline-separated lines into one two-line page; maxLength then freezes the overflow rather than redistributing it.

- Derive the editing budget from the measured workspace and actual keyboard intersection exactly once. Handle keyboard frame changes, rotation and predictive keyboard changes, not only show/hide events.
- Collapse duplicate editor/title chrome in short layouts. Keep visible Save/Cancel and the current editable text, with a small stopped video preview. Allow a one-line page when necessary instead of forcing two lines.
- In keyboard editing only, transport may temporarily be replaced by editing actions as already allowed by UI08. Restore its position/state afterwards. Do not bring back page or TextInput free scrolling.
- Keep one canonical draft string and page ranges into it. Preserve whitespace/newlines and grapheme boundaries. Base pagination on line breaks, available width and measured text fit rather than character count alone.
- Handle paste, insertion/deletion inside existing pages, long Korean text, emoji, blank lines and content resizing. Redistribute overflow without losing or hiding text. Avoid disrupting active Korean IME composition; resolve pagination safely after composition commits using supported platform behavior.
- Preserve the logical caret/selection across pages, keyboard changes and rotation. New pages must contain the overflow, not merely add an empty page after hidden text.
- Apply the total note limit to the canonical string, not individual page approximations.
- Distinguish Save, Close while keeping draft, and explicitly Discard. Persist recoverable local drafts by account/document/source/time so app restarts do not contradict the recovery message. Keep draft recovery isolated across accounts; no cloud/database changes.

Acceptance: all source text remains accessible; page concatenation matches canonical text; saved text preserves intended whitespace subject to existing explicit validation. Exercise 12+ newlines, long paste, emoji, Korean composition, middle edits, rotation and keyboard resize. Save/Cancel/current input remain inside the available screen. Explicit discard alone removes a draft.

## SS07: large text and accessibility

- Do not claim genuine 200% support while important labels are capped at 1.3/1.4. Deliberately migrate this feature's essential labels to the system text scale with adaptive page capacity.
- Do not remove app-wide font caps indiscriminately. Do not shrink the root font or apply scaling hacks.
- Keep meaningful visible selected states, accessible names, 44pt targets and usable focus order: video, timeline, playback, tools.
- Make modal/nonmodal semantics consistent with the actual inspector behavior. Test escape/back and focus restoration with the available test level; report VoiceOver device behavior as unverified if not tested.

## Practical ease of use

Preserve recent comparisons and the existing 2×2 pitching-tool entrance. Keep source A/B identity, selected playback target and selected tool understandable without permanent help paragraphs.

Improve first use without another introductory screen: choose videos, use front-foot contact as an explicit default alignment event, guide A then B, and start comparison paused at the chosen anchors. Preserve manual alternatives, undo and cancellation. Do not invent automatic detection or accuracy claims.

Keep frequent controls stable. A fixed reference with successive B clips should preserve each pair's anchors, notes, views and position. Errors must identify the affected source and offer retry/relink/cancel without destroying the comparison.

Extract small focused components/controllers from the large Workbench where useful, but do not rewrite the storage system or replace an entire historical implementation. Re-read overlapping files before edits.

## Verification and delivery

Inspect package scripts before running commands. Run appropriate tests, including:

- `npm run native-compare:test`
- `npm run my-videos:test`
- `npm run release-access:test`
- Targeted ESLint on all changed native/test files using the installed tooling.
- `npx tsc --noEmit -p native/tsconfig.json`

At review time, comparison tests were 318 basic +75 regression +468 screen calculations; video tests were117+69; release access703. Native typecheck reported five errors outside comparison: FormData.entries, coach-chat/settings and warmup/routine route types. Recheck rather than assuming these remain. Do not fix unrelated collaborators' errors merely to turn a report green. Separate existing errors from introduced ones with evidence.

Extend the no-simulator test matrix to 320×568, 375×667, 390×844, 430×932 and corresponding landscape, iPad/split widths, 100/160/200% text, themes, all tool states, failed/loading media and keyboard editing. Verify child bounds and reachable commands, not just video-stage geometry.

Update the implementation ledger with SS01–SS07, UI01–UI12 coverage, files, actual commands/results and remaining device limits. Add a concise HANDOFF note if shared consumers are changed. Do not mark original R01–R42 complete: audio, native composition/export, PTS accuracy and cloud features remain separate work.

Finish with a Korean report containing:

1. Each SS finding, reproduced cause, fix, changed files and regression evidence.
2. How video/timeline/tool reachability and common operation steps improved.
3. Full test results and unrelated failures.
4. An honest list of untested physical-device rendering/keyboard/IME/VoiceOver/decoder/performance states.
5. Confirmation that no simulator/Metro, database writes, push, OTA or production deployment occurred.

Do the authorized implementation now. Do not stop after restating the plan or after passing the old tests. Do not claim native visual verification from mocks or fabricated screenshots.
