# SINKER immersive pitching video comparison implementation

Implement a video-first, black, edge-to-edge pitching comparison workspace in the native SINKER app. Work in `/Users/yuno/Developer/bullpen-log`. Report progress and delivery in Korean.

The user's latest direction is explicit: the top is too empty, videos must occupy their panes, surrounding controls must be black, one video should be translucent over the other, tools belong below, and users need to hide tools to focus on the videos. Keep the existing one-screen/no-free-scrolling contract.

## Read and preserve current work

Read completely before editing:

- Root AGENTS.md, native/AGENTS.md, CLAUDE.md and relevant HANDOFF.md notes.
- `docs/designs/sinker-pitch-video-immersive-plan.md`.
- `docs/designs/sinker-pitch-video-single-screen-remediation-claude-prompt.md` and the 2026-11-03 review/evidence.
- The original single-screen UI01–UI12 specification and workbench ledger, including R01–R42 and F01–F08 safeguards.

Inspect current git status and actual implementations. Another Claude task may be implementing SS01–SS07. Re-read overlapping files and integrate those fixes; do not overwrite, revert or duplicate them. Work in the main checkout, not an isolated folder whose changes never reach the app.

This specification overrides older presentation requirements only where they conflict: bottom alignment, contain-only default, light surrounding chrome, and absence of a two-video immersive mode. It does NOT override source integrity, coordinate accuracy, synchronization, no scrolling, accessible controls, draft safety or playback lifecycle fixes.

Before changing Expo/React Native APIs, read the matching installed/versioned documentation required by native/AGENTS.md. Read the installed Next.js guide only if relevant framework code is changed. Do not assume remembered APIs are valid.

## Safety boundaries

- Do not launch simulator, Metro, Expo dev server or native local builds. These are expressly prohibited by the user.
- No database writes, migrations, production fixtures, replacement photos or test accounts.
- No secret/.env reads or disclosure. No new dependency or native module is expected by default.
- No commit, push, OTA update, production deployment or build submission without separate current authorization.
- Do not change app-wide themes, Sinker/Dugout release access, other tabs' scrolling or navigation contracts.
- The database is production. Do not run `npm run build`; inspect scripts before any build/check.

## Confirm the current geometry

Inspect `native/src/compare/workspace-layout.ts`, `geometry.ts`, `ui/workbench.tsx`, `pane.tsx`, `annotation-layer.tsx`, `workspace-parts.tsx`, `timeline.tsx` and the current playback/document controllers.

At the reviewed source, one/stack/side place contained video rectangles at the stage bottom. A pure example of stage390×571 with two9:16 sources produces two189×336 panes starting at y235. This is a calculation, not an iPhone measurement. Overlay avoids that top gap but can leave side bars. Pane borders/radii/gutters and theme-based page background also contribute to the framed appearance.

Record the current behavior before changing it. Do not merely top-align the same small rectangles and move all blank space below. Separate viewport, control bounds, pane slots, actual image display rects and source crops.

## IM01 Scoped black workspace

- Make this comparison workspace black regardless of the user's light/dark/navy application theme. Use local semantic tokens or a scoped palette mechanism.
- Starting colors: workspace/stage #000; controls #0B0B0D–#151518; primary text #F5F5F7; secondary text with readable contrast. Keep existing SINKER brand accents and supplied icons, adjusting contrast rather than inventing a new brand.
- Apply to the header overlay, transport, timeline, tool dock, inspectors and note editor within this feature. Ensure portal-based surfaces receive the scoped palette too.
- Set status-bar appearance appropriately while the route is focused and restore the prior screen behavior on exit. Do not globally edit app configuration just to recolor this screen.
- Errors, selected states, disabled actions and focus must remain distinguishable on black. Black styling must not hide clipping.

## IM02 Video starts at the top

- Let the video canvas start at the screen's top; do not reserve an empty title row above it. Put compact back/view/immersive controls over the video within safe insets, with a restrained scrim only where required for contrast.
- Remove comparison-only card-style outer padding, rounded video corners and thick borders. Start with zero outer gutter and a0–1pt split separator.
- Safe-area background may be drawn edge to edge. Interactive controls must remain clear of the notch, Dynamic Island and home indicator. Apply control safe-area insets once, not as repeated video padding.
- Keep the ordinary timeline, playback and contextual tools in a compact bottom region. Measure the real height and give the remainder to video.
- For short landscape/large text, reduce visible tool choices through explicit pages. Use a compact side fallback only when measured geometry requires it; do not permanently reserve a wide empty tool column.

## IM03 Pane slots and fill versus full image

- In split mode, pane SLOTS partition the available stage completely; they are not merely contain-sized video rectangles floating inside a larger stage.
- Provide explicit display choices: `채움` (aspect-preserving fill/cover) and `전체` (full original/contain). Default NEW comparisons to fill, as requested. Do not stretch or distort video.
- Keep a visible compact indication that fill can crop edges, e.g. `채움 · 일부 잘림`, and a readily reachable Full Image action. Restore an explicitly saved fill/full-image choice. Legacy records with no such field use the new fill presentation default without resetting existing pan/zoom/anchors or rewriting their source data. Preserve their existing split/overlay choice and opacity.
- Fill is a reversible view transform. Never rewrite the original media, bake a destructive crop, or use devicePixelRatio to scale coordinates.
- In Full Image mode, top-align the image group rather than bottom-aligning it. Necessary aspect-ratio matte remains black and honest. Do not promise to remove black bars encoded into the original source.
- Evaluate automatic split layouts using visible area, cropping and the smaller image's usability. Preserve the user's explicit split direction and existing anti-jitter behavior.
- Give each source its own aspect/rotation transform. Mixed-aspect sources must not be distorted to match each other.
- Keep source points, touches, mirror, pan, zoom, optional crop, calibration and registration on one consistent source-to-display transform path. Add its inverse for interaction. Merely changing VideoView.contentFit without updating annotations/hit testing is unacceptable.
- Full Image and Reset Framing must remain easy to reach so release hand, ball, head and feet are inspectable. Screen alignment must not be described as proof of3D or biomechanical equality.

## IM04 Translucent comparison as a main view

- Interpret the requested faded video as OPACITY, not Gaussian blur. Keep motion edges sharp.
- For a NEW two-video comparison, align using split mode, then enter the first comparison view with A underneath at100% and B above at45% opacity. Do not change existing documents' saved view or opacity without user action.
- Give Split/Overlay a one-action view switch. Preserve current time, anchors, loop, rate, audio target, framing and annotations while switching. If the user selects split, respect it thereafter.
- Provide a clearly labeled `B 진하기45%` control. Use a0–100% adjustable range,25/50/75 presets and5% fine steps where appropriate. Touch/adjustable targets remain44pt minimum. On narrow screens show the adjustment in a bounded small page rather than squeezing the main transport.
- Define the endpoints:0 shows A,100 shows B. Do not accidentally fade the entire workspace, controls or both video parents.
- Provide a visual top-layer A/B swap separate from source A/B swap. It must not exchange sources, event data, notes or anchors. Label the opacity control with whichever source is the top layer.
- Keep temporal alignment separate from spatial registration. Moving/scaling the top video must not alter timing anchors. Reset Registration resets only spatial registration.
- Retain optional wipe comparison with clear mode state. If wipe ignores opacity, disable/hide the inapplicable opacity control with an honest explanation.
- Do not add an opaque matte around the top image that unnecessarily covers the base image. Test mixed aspect ratios and transformations.
- Ensure both images remain visible and time-synchronized during playback, buffering and stepping. Do not claim native compositing works solely because opacity props exist in JavaScript.

## IM05 One transform path for overlay and annotations

The reviewed OverlayBox uses a separate rendering path that does not apply the full normal-pane view transform. Reuse/consolidate the authoritative mapping rather than maintaining incompatible implementations.

- Preserve source-coordinate annotations through split/overlay/fill/full-image/immersive/rotation changes.
- Opacity affects imagery, not the readability of active tool controls. Clearly identify which source is being annotated.
- Avoid surprising switches out of overlay when drawing is entered. Support the selected drawing target on the active layout with correct mapping, or expose an explicit temporary editing view with an obvious return action if a platform constraint genuinely prevents it. Never silently reset the comparison presentation.
- Preserve transactional undo, handles/loupe, source-based measurements and calibration.

## IM06 Hide tools while keeping the comparison

- Add a clear `도구 숨기기` action to the ordinary comparison screen.
- Enter an immersive state of the SAME workspace, not a separate one-video modal. Keep the same players/source identities, anchors, current time, rate, loop, independent/linked target, opacity, registration, mirror, framing and annotations.
- Hide the title overlay, timeline, transport and tool dock; release their reserved heights/widths so video actually expands. Setting opacity0 while keeping the layout footprint is insufficient.
- Preserve a small, always-reachable `도구 보이기` control with at least44pt touch target in a safe position. Do not trap users in an invisible-controls state. A deliberate video tap may restore tools too.
- Distinguish taps from pan/pinch/drawing/scrub completion; do not steal these gestures or accidentally toggle focus mode.
- Start with explicit hiding. Do not immediately auto-hide tools whenever play starts. Any later automatic hiding must pause for VoiceOver, keyboard, popovers and active manipulation and remain user-controlled.
- Back first exits immersive mode, then follows the existing tool/inspector/navigation contract on a subsequent back. Restore focus to the invoking control when appropriate.
- Toggling immersive mode must not itself start, pause, restart, seek or recreate playback. Background/blur/source-error lifecycle stopping still applies.
- Opening notes/keyboard or an inspector while immersive must explicitly restore the required controls or safely disallow that transition; do not display invisible interactive surfaces. Preserve drafts.

## IM07 Smooth transitions with stable media

- Start with180–220ms restrained chrome transitions, honoring Reduce Motion. Keep source imagery undistorted throughout.
- Recalculate transforms from real layout changes without a feedback loop, decoder remount, black flash or state reset. Preserve source framing and annotation attachment.
- Avoid blindly attaching one player to additional VideoViews for every overlay/focus state. Prefer stable two-source rendering and verify actual platform limitations.
- Pause/serialize geometry-changing transitions during active strokes or preserve the interaction's coordinate frame safely; do not jump under the finger.

## IM08 No scrolling and reachable tools

Retain all SS01–SS07 fixes and UI01–UI12 safeguards. All app-owned tools, selectors and inspectors remain explicit pages/modes, not free-scroll content. No child may become unreachable through overflow:hidden. Do not reduce touch targets or font sizes to fit. OS photo/file/camera/share interfaces retain OS behavior.

## IM09 Persistence and compatibility

Persist user presentation choices only through optional backward-compatible local document/preferences fields as appropriate. Keep immersive visibility transient so reopening does not unexpectedly hide every control. Preserve saved split/overlay, opacity and framing where those already exist.

Preserve account isolation, source ownership, source replacement/cancel, saved playhead restoration, corruption recovery and the original F01–F08 fixes. No database/schema migration is required. Do not widen beta access or refactor unrelated tabs.

## IM10 Verification

Replace obsolete bottom-alignment/contain-only expectations with MODE-SPECIFIC tests. Do not simply delete failing tests to make the suite green.

Test pure geometry and real-source/mock integration for:

-320×568,375×667,390×844,430×932pt, their landscape variants, iPad and split windows;100/160/200% text and all app themes.
- One/two videos,9:16/16:9/4:3/mixed aspects, rotation metadata, unknown/loading/failed sources and old/new documents.
- Fill slot coverage,0–2pt unnecessary top gap target in fill, required contain matte, no source distortion, source/display inverse mapping, calibration/measurement invariance and accessible cropped content.
- Overlay opacity0/45/100, top-layer swap, registration reset, wipe, split/full-image/fill/focus transitions.
- Stable player identities and unchanged playhead/anchors/rate/loop while hiding/restoring tools, rotating or changing layout. Both linked and independent playback must stop on background/blur.
- Visible restore control, focus restoration, hidden controls removed from accessibility traversal, Reduce Motion, active stroke/pinch conflicts, keyboard/draft safety and inspector boundaries.

Run relevant installed checks, including native-compare tests, my-videos tests, release-access tests, targeted lint and native typecheck. Inspect scripts first. Separate unrelated type failures from introduced errors.

No simulator/Metro/device execution is authorized by this prompt. Do not fabricate native screenshots. Pure geometry/mocks cannot establish actual native opacity blending, clipping, status bar contrast, video surface compositing, keyboard behavior, touch quality or thermal performance. Mark these physical-device checks unverified if unavailable.

## IM11 Delivery ledger

Update the comparison implementation ledger with IM01–IM12, SS01–SS07 preservation, changed files, exact commands/results and remaining limitations. Add a HANDOFF note only when shared consumers/contracts are affected. Original audio/export/cloud/PTS gaps remain separate, not magically complete after this visual change.

## IM12 Korean delivery

Report:

1. The confirmed cause of top blank space and the mode-specific layout changes.
2. How black surrounding chrome, fill/full-image, translucency and tool hiding work.
3. How source evidence, annotations and playback state are preserved.
4. Before/after geometry calculations, clearly distinguished from actual native measurements/screenshots.
5. Tests, failures, affected files and physical-device verification limits.
6. Whether any commit/push/deployment occurred; this prompt does not authorize them.

Implement the actual native workspace when the user authorizes execution of this prompt. Do not treat creation of this planning document itself as an instruction to interrupt another running session or publish changes.
