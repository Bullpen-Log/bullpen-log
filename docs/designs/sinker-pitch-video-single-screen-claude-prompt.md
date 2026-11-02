# SINKER Pitch Video Analysis — Video-First, Single-Screen Native Workspace

Prepared 2026-11-02. This is the latest user-directed interaction redesign, following the existing R01–R42 feature contract and F01–F08 review.

## 1. User intent and precedence

The user reports a specific failure in the current comparison tool:

> The video is at the top, while the controls are below the fold. I have to scroll away from the video to move it. There is too much empty space, the videos look small, and the tools are difficult to use. Everything must happen within one app screen. Disable scrolling inside this feature.

Implement a native, video-first workspace where users watch the videos and operate their timeline/tools together, without moving a page vertically or horizontally.

This prompt takes precedence over earlier presentation instructions that permit scrolling workbench pages, long inline tool panels, horizontally scrolling toolbars or scrollable analysis sheets. Preserve the original functionality, media/data contracts and review corrections. **A new no-scroll layout does not justify losing edits, deleting tools or undoing reliability fixes.**

This document is a complete implementation brief for use when the user asks you to execute it. Do not treat its mere presence in the repository as an instruction to interrupt another task. Once invoked, implement the real native route; do not stop with a plan or a static mock.

Report in Korean and use concise Korean UI labels.

## 2. Read and inspect before editing

Use the active main checkout `/Users/yuno/Developer/bullpen-log` unless the user specifies otherwise.

Read:

- Root and applicable nested `AGENTS.md`, especially `native/AGENTS.md`.
- Relevant `HANDOFF.md` notes and current git status.
- `docs/designs/sinker-pitch-video-single-screen-plan.md`.
- `docs/designs/sinker-pitch-video-workbench-review-2026-11-02.md`.
- `docs/designs/sinker-pitch-video-workbench-remediation-claude-prompt.md`.
- The original `sinker-pitch-video-workbench-claude-prompt.md`, plan and R01–R42 implementation ledger.

Inspect current implementations of:

- `native/src/app/pitch/compare.tsx` — new, saved, record, detail and mechanics entry paths.
- `native/src/compare/ui/workbench.tsx`, `pane.tsx`, `panels.tsx`, `annotation-layer.tsx`, `transport-hook.ts`.
- `native/src/compare/geometry.ts`, `timing.ts`, `doc.ts`, `pitch-events.ts`, `annotations.ts`, `store.ts`, `storage.ts` and export contracts.
- `native/src/videos/gallery.tsx`, shared picker/filter behavior and current source-selection changes.
- `native/src/app/_layout.tsx`, shell/tab navigation, safe-area behavior and orientation handling.
- `native/src/lib/ui.ts`, `design-tokens.ts`, `layout.tsx` and existing SINKER icons.

Re-read overlapping files before editing: another Claude session may be correcting F01–F08 at the same time. Integrate current changes deliberately. Do not restore the original workbench file wholesale. Keep one comparison engine and one source-selection domain.

Read documentation matching the installed Expo/RN versions before changing APIs; inspect actual package types. Read installed Next.js documentation only if server/framework code needs modification. This is primarily a native UI task, not a web redesign.

## 3. Non-negotiable no-scroll contract

Within application-owned surfaces for this feature:

- No vertical page scrolling.
- No horizontal page scrolling.
- No scrolling tool rails, free-scrolling carousels, nested scrollable sheets or kinetic/bouncing lists.
- No content revealed only by scrolling a disabled or hidden overflow region.
- No programmatic `scrollTo`/auto-scroll-to-focus as a workaround.
- No enabling page scrolling just because large text or a smaller window makes layout harder.

Use bounded views, context modes, small popovers and **explicit Previous/Next page controls** instead. Every essential tool and data item must remain reachable.

Important distinctions:

1. Timeline dragging is **seeking**, not page scrolling; keep it.
2. Pinch zoom and pan inside an intentionally zoomed video are image inspection; keep them, bounded to the video. They must not move the workspace.
3. Dragging annotation handles or a loop handle is direct manipulation; keep it.
4. A small floating tool panel may have a deliberate drag handle if needed; it must not introduce page scroll or escape the usable viewport.
5. iOS Photos/Files pickers, system camera, share sheet and permission dialogs are OS-owned surfaces. Their internal scrolling cannot be universally disabled by our app. Document that boundary honestly; do not claim to control system UI.
6. The ordinary video library and other app tabs retain their normal navigation/scrolling. Use a comparison-specific paginated presentation of shared data rather than globally disabling their scrolling.

Do not solve this by wrapping the old long page in a fixed-height clipped View or setting its ScrollView to `scrollEnabled={false}`. Recompose the contents to fit and remain operable.

## 4. Target composition

Normal portrait workspace, in fixed order:

```text
Safe top area
Compact header: back | short title/save state | More
Flexible video stage: A/B or single/overlay/focus
Shared timeline with time/anchor/loop indicators
Transport: target selector | previous | play/pause | next | speed
Compact contextual tool dock
Safe bottom area
```

The root is a bounded, non-scrolling native View using the actual route/container size. Reserve chrome once; give the remaining space to the video stage with proper flex/minimum constraints.

Starting dimensions at default text size, to be refined from actual measurements:

- Header content height about 44pt, excluding safe top inset.
- Video outer gutters 4–8pt and inter-video gaps 4–6pt where touch/visibility permits.
- Timeline has a visually thin track but at least a 44pt hit/accessibility region.
- Transport row about 44pt.
- Tool dock about 44–48pt.
- Only necessary 4–8pt separators; avoid accumulated 14/16pt gaps.
- Touch targets remain at least 44pt even when icons are only 18–22pt.

These are starting budgets, not fixed heights to clip larger text. Measure real chrome height and paginate/change context when it grows.

During this dedicated workspace, use existing route/navigation mechanisms to hide the global bottom tab bar if present. Restore it on exit with the correct active tab. Do not reserve tab-bar padding if no tab bar is rendered. Do not hide global navigation across unrelated routes.

Avoid duplicate titles, permanent instructional cards, prominent saving subtitles, repeated source metadata rows, separate rounded playback cards and large exterior card padding. Retain SINKER's palette, icons, readable type and restrained rounded controls. A neutral video matte is appropriate; replacing the entire chrome with an unrelated black/yellow editor is not.

Use a compact save indicator with an accessible label; show a clear actionable failure state when saving fails. Hide only routine detail, not errors or rights information.

## 5. Layout from actual geometry, not screen percentages

Remove arbitrary `windowHeight * 0.31` / `0.46` video caps as the primary sizing rule. Do not calculate media width from the full window while rendering into a narrower READABLE container.

Measure the workspace and chrome via the actual current layout mechanism. Derive:

```text
usableHeight = measuredRootHeight - unconsumedSafeInsets
stageHeight = usableHeight - measuredHeader - measuredTransport
              - measuredDock - intentionalSeparators
```

Avoid counting safe areas twice. Keyboard-inset handling must use actual window/inset behavior without double-shrinking an already resized view.

Implement a pure geometry helper, for example `compare/workspace-layout.ts`, with typed inputs for usable bounds, chrome measurements, source display aspects, layout preference, font scale, keyboard state and active context. Return actual stage/pane/control rectangles plus the chosen layout mode. Do not couple it to storage or player instances.

At default text size, no keyboard and closed contextual popovers, aim to give the video **stage** roughly 65–75% or more of the usable portrait height. Report achieved geometry instead of fabricating compliance on constrained layouts. Also measure actual displayed video-frame area: a large stage containing tiny videos is not success.

### Choose an aspect-aware comparison layout

Evaluate side-by-side and stacked candidates using each source's real display-oriented aspect ratio and the available bounds. Do not impose one common aspect on both sources.

- Two portrait videos often use the screen better side by side, even on a portrait phone.
- Two landscape videos often use a portrait phone better stacked.
- Mixed orientations require actual contain-rectangle calculations.
- Evaluate total visible frame area and the usability of the smaller pane, not just nominal container area.
- Keep both sources visible in the default paired comparison; do not silently hide B to improve the area statistic.
- Respect explicit user layout choice and persist it at the correct session/pair scope.
- Auto-selection happens on meaningful source/container changes, with stability/hysteresis. Small dimension fluctuations must not flip the layout repeatedly.
- Rotate/reflow without remounting players, losing time, anchors or canonical annotations.

Keep original contentFit/contain semantics by default. Do not crop the pitcher's hand, head, feet or release to fill the screen. Preserve original evidence and zoom/reset access.

Some letterboxing is unavoidable when source and device aspect ratios differ. Distinguish it from avoidable UI padding. In constrained portrait comparisons offer one-tap A/B focus, overlay and landscape options. Focus mode is an intentional inspection mode, not a hidden replacement for equal comparison.

Keep the **last displayed video-frame edge** near the timeline, typically within 8–12pt when the selected layout permits. Do not leave a large empty card/gap between media and its controls. Align and pack the media intelligently; do not create fake content to fill unavoidable free space.

### Short landscape and accessibility layouts

Use the wider space deliberately: a compact side tool dock or corner controls can replace the portrait bottom tool row. Keep the shared scrubber/transport adjacent to media. A tool inspector may replace other contextual controls, but ordinary comparison must not require opening a modal just to seek.

If controls cannot all fit at the requested text size, show fewer secondary actions per explicit page, use meaningful accessible icons and context changes. Preserve full labels through accessible names/details. Do not shrink the root font, disable text enlargement, clip essential labels or reduce touch targets.

## 6. Persistent transport and alignment

The user must always see the videos and seek/play controls together during viewing, alignment, drawing and event analysis.

- One shared timeline, fixed immediately below/next to the video stage.
- One explicit target selector: `함께`, `A`, `B`. A/B independent mode must be visibly selected.
- Previous scene, play/pause, next scene and speed remain directly available.
- Put audio choice, repeat setup, precise time entry and extended playback options in a compact context menu.
- Timeline accessibility exposes current value, valid bounds and increment/decrement actions. Do not rely only on drag gestures.
- Coalesce scrub requests; latest target wins. Pause at scrub start. Preserve generation cancellation, paired seek validation and current source-time semantics.
- Show loop handles on this timeline, with selectable handles and scene-step buttons for fine adjustment if handles overlap.
- Maintain fixed control locations across normal modes so users do not relearn where play/seek moved.

### Alignment workflow

Replace the long alignment card with a small contextual strip:

1. Choose the event meaning, normally front-foot contact.
2. Select A, scrub with the same timeline, tap `A 기준 지정`.
3. Select B, scrub, tap `B 기준 지정`.
4. Complete or cancel; preserve an existing valid comparison until confirmation.

Reuse the same transport location throughout. Show concise A/B anchor badges on the media rather than allocating separate rows below each video. Never treat changing an event label as proof that existing anchors represent that event. Keep start-point preview distinctly labeled.

## 7. Tools as small context modes

Only one primary context is active at once: viewing, alignment, drawing, events, note editing or output. Only one transient inspector/popover is open. Back closes an inspector, then leaves the tool context, then exits the workspace.

Opening a normal analysis tool must not push videos/transport down a longer page. Prefer a bounded floating inspector in unused matte space or a compact dock replacing the previous context row. If unavoidable, a temporary reserved inspector area may reduce the stage within the same bounded screen; measure the result and keep both video access and transport usable. Do not stack inspector panels.

### Drawing

- One tap enters the last-used drawing tool and pauses playback.
- Provide quick access to line, angle, freehand and point tools.
- Full tool selection uses a bounded grid with explicit pages; preserve all original tools.
- A/B target, active tool, Undo and Done must remain obvious and reachable.
- Color and width are small popovers shown only on demand; do not display every option simultaneously.
- Show a selected-shape action group for move/edit/delete/redo as appropriate. No long inline configuration form.
- Use correctly sized hit regions for handles. Provide a local magnifier/precision loupe or a verified equivalent so the finger does not hide the placement point. Identify any actual platform dependency honestly.
- Treat a completed stroke/handle drag as one undo transaction. Do not create hundreds of undo entries for pointer samples or filesystem writes per sample.
- Preserve canonical source coordinates and inverse transforms across new layout, zoom, pan, mirror and rotation. Do not convert annotations into fixed screen pixels.
- One-finger drawing, two-finger inspection and timeline gestures must not steal each other's touches. Drawing must never scroll the page or accidentally trigger back navigation.
- Done returns to the previous viewing state with media and controls in place; no scrolling to find Done.

### Pitch events and measurements

- Use an event selector or pages with a small number of events, not a six-row expanding form.
- The current event exposes A/B position, mark, clear and obscured status.
- Timeline markers provide direct event jumps; handle dense/overlapping markers through a compact chooser.
- Put interval/2D measurements on bounded result pages. Keep data definitions, unknown states and the separation between presentation time and actual capture time.
- Do not reintroduce timing/synchronization defects when switching event or normalized mode.

### Metadata, notes and output

- Move long source title/date/pitch type/view and diagnostic explanations into paginated information inspectors.
- Notes list shows one or a few fitting notes per page, with explicit Previous/Next and a page count.
- Existing long notes must remain fully available. Use a bounded paginated text reader/editor instead of an internally scrolling field. Choose page capacity from measured line height and keyboard-free space, not an arbitrary destructive character limit.
- Preserve the complete backing text and global selection/caret mapping. Handle Korean IME composition without splitting an active composition or losing text when repaginating. Auto-save drafts and support cancel/restore.
- With keyboard visible, pause playback. Retain a useful video preview and reachable save/cancel controls.
- On extremely short keyboard layouts, enter an explicit compact editing mode: replace ordinary transport/tool rows with editor controls instead of trying to fit every toolbar behind the keyboard. Close editing to restore the same video time/selection and normal persistent transport. No scrolling is required for that transition.
- Output/storyboard/settings use bounded pages and real supported actions. An unavailable encoder remains a truthful unavailable action; do not fake a completed export.
- Keep actual still/full-frame inspection accessible without turning the interface into an image document that needs page scroll.

## 8. Source selection without changing the rest of the library

The comparison-owned selector must also respect the app no-scroll contract:

- Reuse the shared video data, filters, search, permissions and source-selection domain.
- Present a fitting grid/list page with explicit previous/next controls; calculate item count from measured space and text size.
- Keep search/source category, A/B selections, cancel and confirmation visible.
- Persist selected items while paging or changing source category.
- Offer app library/current comparison sources/Photos/capture/Files as supported, retaining F07's unified selection rules.
- Empty/error/loading states must fit and expose retry/back/import directly.
- Selecting/replacing A/B or cancelling must preserve the valid document, media ownership, anchors and return context.
- Do not change ordinary VideoGallery behavior globally. Add a clearly scoped presentation variant or comparison selector using shared data and callbacks.

System Photos/Files surfaces remain explicitly OS-owned. Do not build an entire custom Photos browser solely to pretend system scrolling has been disabled.

## 9. Reliability and behavior preservation

This UI redesign must integrate the review corrections, not overwrite them:

- F01: account-wide index coordination and conservative media-reference cleanup.
- F02: restore complete pair state before persisting transient player position.
- F03: buffering recovery resumes at the confirmed current common position.
- F04: retain a known-good document generation through failed replacement.
- F05: preserve signed relative loop ranges.
- F06: never overwrite a future-schema document or interpret I/O error as a missing document.
- F07: unified source selection, single→pair, A/B replace/cancel and imported-asset ownership.
- F08: correct layout boundary, gesture behavior, normalized domain, transforms and truthful diagnostics.

Do not recreate native player instances when opening a tool, changing page/layout, showing an inspector or rotating the device. Preserve media identity, current time, transport intent and canonical annotations. Pause on background/interruption and never auto-resume after a user cancellation or account change.

Keep the Pitch-tab main entry and existing record/detail/mechanics/recent comparison routes. Preserve beta locks. No database change should be needed for this layout work.

## 10. Implementation sequence

1. **Audit:** re-read current code and active changes; identify all comparison-owned scrolling surfaces, layout boundaries and F-fix status. Record the actual source revision.
2. **Pure layout and fixed shell:** create/test measured geometry; connect header, stage and persistent transport in a bounded View. Prove all essential rectangles fit before adding advanced panels.
3. **Video presentation:** aspect-aware candidate selection, minimal media overlays, focus/overlay/landscape, stable player identity and annotation transforms.
4. **Tool contexts:** compact alignment, quick drawing and event selection with one bounded inspector at a time.
5. **Complete no-scroll surfaces:** notes/keyboard/metadata/settings/storyboards/output and comparison source selection become explicitly paginated.
6. **Regression closure:** source flows, save/restore/buffering/loop tests, accessibility/input, viewport geometry and unchanged shared consumers.

Keep a checklist for every surface and every relevant original R requirement. Pagination changes how tools are presented; it does not remove their functionality. Preserve unavailable features in the ledger with accurate status.

If working alongside the earlier reliability task, integrate that task's changes first where necessary and own a clearly scoped UI change. Never reset its files to an older revision. Maintain precise continuation notes through compaction.

## 11. Acceptance and verification

User restrictions remain: **do not launch an iOS simulator, emulator or Metro**. Use local code/pure/layout/adapter tests and available non-simulator checks. A mock render does not prove native usability. Supply physical-device procedures and mark native visual/gesture verification pending when unavailable.

Inspect package scripts before execution. Do not mutate production DB/data, seed fixtures there or run a build that migrates it. Do not push, deploy or publish without a separate user request. Preserve secrets and unrelated work.

### Required geometry/state tests

- Logical viewport sizes: 320×568, 375×667, 390×844 and 430×932; each landscape; supported iPad/split-window sizes.
- Default, 160% and 200% text; meaningful safe-inset and keyboard-visible configurations.
- No source, one source, two portrait, two landscape, mixed aspects, unknown aspect/loading, source error and large/long Korean labels.
- Every comparison-owned state has all essential actions within usable bounds; no overlapping primary controls or offscreen close/save/play actions.
- Test actual contain-frame rectangles and their aggregate area, not only stage width/height.
- Timeline and displayed videos share a visible viewport in normal analysis contexts. Measure edge-to-control distances and unnecessary gaps.
- Tool opening never increases page extent or starts a new ScrollView. Pagination exposes all content/tools at large text.
- Pointer/touch/wheel attempts do not translate the page. Seeking, drawing, handle movement and zoomed-video panning still operate.
- Keyboard-edit mode preserves complete text/IME/caret/draft and restores the workspace correctly.
- Reflow and inspector changes preserve player identity, anchors, playback position, zoom and source-coordinate annotations.
- Every source-selection page preserves selected A/B and permissions; cancellation restores the previous comparison.

Add meaningful integration tests for layout, context transitions, paging and gesture ownership. Source scans for ScrollView alone are insufficient; also detect nested custom scroll containers, focus-driven movement and unreachable content. Do not ban scrolling in unrelated consumers.

Run applicable type/lint and existing native-compare/my-videos/release tests, plus new geometry/context tests. Report exact failures and dependency limitations. Do not claim screenshots or hardware performance measurements that were not obtained.

### Physical-device checklist to provide

Verify genuine video visibility and touch precision; absence of page bounce; timeline use while watching both videos; drawing loupe/handles; keyboard and IME; orientation and large text; permission/system pickers; interruption/resume; and old/native-runtime compatibility. Record OS/device/theme/text size and actual measurements when the user or authorized testing provides them.

## 12. UI acceptance ledger

Track these UI requirements alongside the original R/F ledgers. Each row needs actual implementation paths, test evidence and a clearly separated native-device status.

| ID | Required outcome |
| --- | --- |
| UI01 | Bounded native root; no app-owned page scrolling/bounce in the comparison feature. |
| UI02 | Measured chrome/safe-area budget gives remaining space to video without offscreen actions. |
| UI03 | Source-aspect-aware layout uses actual frame area; original evidence remains inspectable. |
| UI04 | Video and shared timeline/transport are simultaneously visible in normal analysis modes. |
| UI05 | Compact alignment uses the same transport and retains cancel/restore behavior. |
| UI06 | Quick drawing, precision handles/loupe, bounded inspectors and transactional undo. |
| UI07 | Event/measurement/storyboard tools are complete through explicit pages, not scrolling. |
| UI08 | Notes/keyboard/IME and full source information remain usable without truncation or free scrolling. |
| UI09 | Comparison-only source selector is paginated; normal library and OS pickers retain their contracts. |
| UI10 | Mode changes/rotation preserve players, times, sources, annotations and F01–F08 protections. |
| UI11 | Safe areas, large text, themes, accessibility and short landscape layouts are verified at the available test level. |
| UI12 | Genuine evidence, remaining physical-device limits and original R01–R42 status are reported accurately. |

## 13. Completion report

Report in Korean:

1. How the workspace became video-first and which repeated chrome/spacing was removed.
2. How video, timeline and controls stay visible together and how each tool works without scrolling.
3. A table covering every app-owned surface: fixed/paginated/contextual, reachable actions and remaining limitations.
4. Measured stage area, actual video-frame area, layout choice, timeline proximity and clipping/overflow at tested sizes. Label mock/layout measurements accurately.
5. Changes, automated results, manual-device items still pending and F01–F08/R01–R42 preservation.
6. Explicit OS-owned picker exception, if relevant, without claiming app control of it.
7. Commit/deployment status; no publishing without user authorization.

The redesign fails if users must scroll away from a video to seek, if scrolling is merely disabled on a clipped old page, if tools become inaccessible, if empty media containers grow while the actual image stays small, or if fitting the screen destroys accessibility or saved analysis. Build the bounded workspace and verify the actual state transitions.
