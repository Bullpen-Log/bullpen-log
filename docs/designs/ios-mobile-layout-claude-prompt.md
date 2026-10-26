# Claude implementation prompt: iPhone layout reliability and mobile optimization

## Objective

Audit and repair the actual iPhone app's layout system so every screen, sheet, menu and input flow remains usable within its real presentation bounds. The user reports clipped content, oversized overlays and interfaces that do not fit a phone properly.

Deliver root-cause fixes and functioning app screens. Maintain the calm, predictable behavior expected of an Apple first-party app: readable content, clear navigation, reachable actions and appropriate presentation sizes. Do not treat this as a request to recolor the app or shrink everything.

Read `docs/designs/ios-mobile-layout-audit-plan.md` for the code-based findings and the uncertainty of each hypothesis. This prompt is for implementation when the user submits it as a task. The existence of this document is not itself authorization to publish a build or change production data.

## Repository and execution rules

1. Read current AGENTS.md, CLAUDE.md, relevant project guidance and HANDOFF.md. Inspect git status and preserve changes from other sessions.
2. Work on the real Expo app under `native/`, not the retired `mobile/` app or only a narrow desktop browser preview.
3. Inspect actual installed versions and their documentation. The audit found Expo ~58, React Native 0.88.0, Expo Router ~58 and react-native-webview 14. Do not assume old API behavior or migrate versions as a shortcut.
4. Inspect `native/app.config.js`: default is Sinker; APP_VARIANT=dugout selects the separate DUGOUT app with another route root. Prioritize Sinker screen reliability and check shared changes against DUGOUT.
5. Preserve bundle IDs, authentication, route contracts, data calculations, training/session state, offline queues, uploads, camera measurement logic and existing user-supplied icons.
6. This repository shares a production database. Use read-only inspection and deterministic local fixtures for layout work. Do not create production test accounts, orders, records or fake content. Do not run destructive Prisma commands or an application build script that applies migrations.
7. Prefer existing dependencies and components. Avoid introducing another sheet/keyboard/navigation framework unless a demonstrated limitation justifies it. New native packages require a build/OTA compatibility assessment.
8. Start with the current main checkout unless the user specifies another worktree. Do not overwrite files from stale sub1 snapshots. Check file status again before broad edits because another session may be working concurrently.
9. Native app changes are not made visible by refreshing localhost:3000. Determine whether the app is using Metro, a development build, a bundled release or an OTA update. Report the exact preview path. Keep existing Metro sessions and other agents' processes intact.
10. Do not push, deploy OTA updates, install production builds or publish to TestFlight without applicable user authorization. Prepare a reviewable local result first.

## What is known versus what must be reproduced

The source audit identified specific risk areas; it did not prove every user's failure or inspect the running app UI. A booted simulator was listed, but UI automation could not access its application window. Do not claim that prior screenshots or runtime tests exist.

Use these investigation targets:
- `native/src/app/more.tsx`: a non-scrolling folder body; tile size based on full-window height; groups and permission-dependent items; `overflow: hidden` inside the folder.
- `native/src/workout/sheets.tsx`: fit sheets use a transparent Modal with maxHeight:'88%' and a ScrollView; the non-fit pageSheet branch has KeyboardAvoidingView but the fit branch does not.
- `native/src/velocity/abs/batter-chip.tsx`: numeric TextInput with autoFocus in a custom sheet; no local keyboard-avoidance or scroll wrapper.
- `native/src/shell/tab-bar.tsx`: TAB_BAR_HEIGHT=49, ITEM_H=52, PAD=4, gap=max(inset.bottom-13,12). The 49 value is explicitly a legacy compatibility contract, not proof of a bug by itself.
- `native/src/app/index.tsx`: passes TAB_BAR_HEIGHT to native tabs. Several tabs reserve bottom+24 in content padding. Inspect actual automatic/native insets before changing it.
- `native/src/shell/tab-pager.tsx`: pages use full window width; verify that the parent is actually full-window in every supported state.
- `native/src/lib/layout.tsx`: READABLE and READABLE_WIDE, width-based TwoColumns and bar-side helpers. Preserve useful adaptive behavior.
- `native/src/setup/frame.tsx`: scrollable setup form with KeyboardAvoidingView and a footer; verify errors and long text instead of replacing working layout indiscriminately.
- `native/src/app/_layout.tsx`: mixed Stack modal, formSheet fitToContents and transparentModal presentations.
- `native/src/app/index.tsx` and `native/src/dugout/app/index.tsx`: hybrid WebView with contentInsetAdjustmentBehavior='never'.
- `native/src/rn/index.js` and `native/metro.config.js`: app Text/TextInput use a font shim; Animated.Text may use a different font path. Font metrics can matter but do not rewrite the global shim without evidence.
- `native/src/lib/design-tokens.ts`: shared title/body/control/spacing tokens.
- Camera/video/3D/map controls: fixed maximum media heights, aspect ratios, absolute overlays and native coordinate mappings require special care.

Do not infer that SafeAreaProvider is missing merely because it is not explicitly in the local root file; Expo Router/navigation may provide it. Inspect the actual provider and presentation hierarchy.

## Phase 0: establish a reproducible issue inventory

Identify the visible build/version and its relationship to the checked-out source. Record app variant, commit/update identity when available, iOS version, device logical size, font scale, Display Zoom, route, entry path and rendering mode (native or webview).

Attempt the user's symptoms through representative flows even if no exact failing route is provided. Ask for the most important specific route only if useful, and continue independent investigation while awaiting it. Do not stop at requesting screenshots or a device model.

For each issue, record:
- Steps to open and reproduce it.
- Expected behavior and observed failure.
- Whether the cause is confirmed, strongly suspected or not reproduced.
- Parent/presentation dimensions, safe insets, content size, chrome bounds and keyboard state.
- Source locations responsible for those constraints.
- Fix strategy, affected shared consumers and before/after evidence.

Prioritize defects that block dismissal, saving, navigation or data entry. A long intentional full-screen workflow is not automatically oversized; loss of context or inaccessible controls is the problem to investigate.

If runtime access is blocked, explain the actual blocker and continue code-based, narrowly justified repairs or prepare the reproducible local fixture. Mark runtime-dependent outcomes unverified. A simulator boot state, successful bundle build or browser screenshot is not evidence that native layout is correct.

## Phase 1: establish explicit layout ownership

Define who owns each inset for every presentation class:

| Presentation | Top ownership | Bottom ownership | Scrolling | Keyboard ownership |
| --- | --- | --- | --- | --- |
| Native tab screen | Route/screen contract | Actual visible tab occlusion | Body list/scroll | One deliberate strategy |
| Pushed native screen | Navigation or screen | Safe area and optional footer | Body | One deliberate strategy |
| System modal/form sheet | System presentation + local header | Sheet safe area/footer | Bounded body | System or local, verified |
| Custom transparent sheet | Measured modal host | Sheet safe area/footer | Bounded body | Explicit overlap handling |
| WebView page | Native host or web, explicitly assigned | Native tabs/web footer, explicitly assigned | Web viewport | Measured WKWebView/web viewport behavior |

Use this table as a contract, not a reason to add every inset to every screen. The same obstruction must be accounted for once.

Implement the smallest useful extension to existing screen/sheet helpers. Candidate primitives include a screen frame, scroll-content inset helper, measured bottom-occlusion context, form frame and shared sheet layout. Avoid a large generic configuration framework.

Use flex layout and measured parent bounds. Use useWindowDimensions for window changes and fontScale where appropriate; use onLayout when the actual container, sheet or media region is smaller than the window. All React Native dimensions are logical layout units; do not multiply them by device pixel ratio to fit Retina screens.

Keep scroll ancestors bounded. A ScrollView needs a finite viewport and a valid flex chain; a percentage maxHeight by itself does not establish a complete content/keyboard contract.

## Bottom tab and fixed-action contract

Measure the actual visible tab region, including the floating gap and safe-area relationship. Separate visual bar height from the bottom of the screen up to the bar's top edge. Account for any additional clearance once.

Illustration from audited code: visual bar height is approximately 60; with inset.bottom=34, gap=21 and bottom occlusion is approximately 81. A content padding of49+24 cannot be evaluated without checking other insets. Do not replace49 with60 everywhere or add bottom safe area everywhere.

Share the actual occlusion with native tab screens and any relevant WebView contract. Handle hidden tabs, alternate sport tabs, a separate back button, keyboard visibility and fixed footers. If obstructions overlap, use their actual union rather than blindly adding all heights.

The final list row and its action must scroll fully above the obstruction with usable clearance. Align scroll indicators with the usable viewport when supported. Verify both empty and long content. Do not place permanent giant blank padding under screens without a tab.

## Keyboard and forms

Each presentation must have one coherent keyboard strategy. Choose KeyboardAvoidingView, supported automatic keyboard insets or a measured layout adjustment based on actual host behavior. Do not pile them on without measuring; double adjustment creates large empty gaps and jumping content.

Where manual measurement is needed, compute the keyboard's intersection with the actual app/presentation rectangle in a common coordinate system. Do not simply subtract keyboard height from an already resized viewport. Handle show/hide and frame changes, not just a boolean 'keyboard up'. Respect current installed API behavior.

Requirements:
- The focused input, its label and validation feedback remain discoverable and reachable.
- The user can reach Save/Next/Confirm without a fragile dismissal gesture.
- Long forms scroll within a bounded viewport.
- Number-pad flows have a clear completion/dismiss action; do not rely on a Return key that is absent.
- Keyboard dismissal restores the original layout without stale bottom space.
- Hardware keyboard, Korean composition, multiline input and validation errors do not break layout or discard drafts.
- When long text changes layout, controls may wrap or stack instead of clipping.
- Do not mount duplicate footers or accidentally submit twice.

Start with ABS batter-height input, workout notes/swap/finish, nutrition goal editing, profile/setup fields and comment/inquiry composers. Trace shared helpers so a repair benefits all consumers without breaking unrelated forms.

## Sheet and menu sizing

Choose presentation by task:
- Short selection/confirmation: content-sized sheet with a safe maximum.
- Medium editor: bounded sheet with scrollable body, reachable header/footer.
- Long multi-step task or rich editing: large system sheet or full screen with navigation and draft protection.

Derive the maximum from the actual presentation bounds and current keyboard overlap. Do not hardcode a single screen-height percentage as the complete solution. Large Dynamic Type may require a larger detent/full-screen fallback; preserve readability instead of shrinking fonts.

Keep header/close control and footer usable while only the body scrolls. Respect safe areas in the modal's own context. Inspect fitToContents with flex-based children; do not create an intrinsic-sizing loop. Check API support for nested modals and sheet detents against the installed Expo Router/react-native-screens versions.

For More specifically:
- Bound the folder to actual available height after safe areas and chrome.
- Make all menu groups reachable through scrolling when needed.
- Do not assume a fixed number of rows or one permission configuration.
- Preserve adequate touch targets and readable labels.
- Make content scrolling take precedence over dismissal dragging where appropriate.
- Provide explicit accessible dismissal and sensible focus behavior.
- Do not allow decorative clipping to cut off menu content.

Preserve draft guards and unsaved-change decisions when standardizing dismissal. Honor Reduce Motion without timing-dependent unmount bugs.

## Text, controls and adaptive content

Do not globally disable allowFontScaling, cap all text to normal size, or wrap the whole screen in a scale transform. These conceal symptoms and harm accessibility.

Prefer minHeight and natural multiline layout for text-bearing rows and actions. Use fixed height only where the content and accessibility behavior justify it. Introduce flexShrink/minWidth or stacked variants where needed. Important instructions and error messages should not rely on numberOfLines=1 or ellipsis.

Use existing typography as a starting point; title34 or body15 is not automatically the cause. Measure fontScale and line boxes, including Pretendard and Animated.Text differences. Avoid clipping glyph ascenders/descenders with excessively tight line heights. Test Korean labels and units, not just short English strings.

Keep essential touch targets approximately44 logical units or larger. On a short phone, reduce decorative media and excess spacing before shrinking action targets. Preserve usable side padding and clear hierarchy. Do not require a dashboard's complete content to fit without scrolling.

## Media, camera, charts and gestures

Compute media size from available width and height while preserving aspect ratio. A maxHeight cap must not leave an incompatible fixed width/aspect ratio. Avoid oversized video/3D panels pushing every action offscreen.

For live camera screens, separate full-bleed preview from safe-area-contained controls. Changing preview bounds/crop affects coordinate transforms, plate/ball overlays, touch calibration and recorded frames. Update/test coordinate mapping as needed; do not change velocity/ABS math to compensate for a layout error. Use a real supported device for camera verification; simulator camera substitutes do not prove correctness.

Coordinate ScrollView, sheet-dismiss gestures, tab swipes and 3D manipulation. A paused or competing gesture is not necessarily a size bug. Ensure hidden tabs do not intercept touches or remain unexpectedly focusable. Anchor calendar popovers to current measured bounds and clamp them within the current presentation, including large text and reopening.

## Native/WebView boundary

Audit the complete chain: native host → WKWebView bounds → web viewport → CSS safe area/keyboard/footer behavior → bridge-controlled native tabs. Check both Sinker and DUGOUT UAs and their route handling.

Record native safe insets alongside web innerHeight, visualViewport height and relevant CSS viewport variables. Treat these as different coordinate systems until mapped. Inspect the web bridge and tab hiding logic before adding new messages or environment flags.

Assign top/bottom inset responsibilities once. Preserve authentication, offline behavior, web navigation, appropriate scrolling and accessibility zoom. Do not assume a desktop CSS patch fixes native screens, or that disabling browser zoom makes a layout correct.

## Device/state matrix

Use supported devices/runtimes matching these logical-size classes; record the actual tested dimensions:
- Short/small phone around375×667.
- Standard notched phone around390×844.
- Large phone around430×932.
- The user's actual device/settings when available.

Prioritize small and standard sizes first, then expand. Include:
- Default text, large text and an accessibility text setting.
- Display Zoom where available.
- Keyboard closed/open/frame changed; numeric, Korean and multiline input; hardware keyboard if available.
- Long Korean titles, usernames, unit labels and errors.
- Zero/one/many rows and ordinary/admin/locked menus.
- Page, form sheet, custom modal, dismiss/reopen and return navigation.
- Light/dark or navy contrast checks where shared surfaces change.
- DUGOUT variant regression and iPad resizing where supported.

The app is currently portrait-oriented. Do not enable phone rotation just to expand the test matrix. Check adaptive window/presentation changes and any existing media orientation support without changing orientation policy casually.

## Measurement and privacy

For difficult cases, add development-only geometry diagnostics: host and child bounds, safe insets, measured tab/footer rectangles, keyboard overlap, scroll viewport/content sizes, fontScale and text line count. Keep coordinates in a documented space.

Do not log tokens, medical/training details, messages, addresses, private images or personal data. Do not send layout traces to a new service. Remove or disable diagnostic overlays before delivery. Do not retain screenshots containing personal content in a public repository.

## Work sequence

1. Inspect source/build identity and reproduce representative failures. Create an issue inventory with confirmed/suspected status.
2. Fix the shared inset/occlusion and presentation sizing contract first, while validating one representative tab and one input sheet.
3. Repair More and the highest-priority input sheets, preserving state and dismissal behavior.
4. Apply the corrected shared behavior to affected tabs/forms and dedicated modals; inspect each consumer rather than mechanically replacing constants.
5. Review media/camera/3D and WebView boundaries. Keep specialized coordinate behavior intact.
6. Verify the matrix progressively and correct regressions. Recheck version identity so the observed app is actually running the repaired code.
7. Deliver concrete screenshots/measurements and a Korean handoff. Continue independent work through this scope; do not stop after a proposed plan or a single shared helper.

## Verification and completion

Use meaningful focused tests for new layout calculations and state transitions where useful, plus native visual/interaction inspection. Do not create tests that merely assert exact styles or arbitrary pixel strings.

Run relevant native type/lint checks according to the current project setup. Distinguish current changes from pre-existing errors. Do not call a native integration verified because TypeScript passes. Do not claim a test was run if the device/tool was unavailable.

Acceptance criteria:
- Critical content is visible or reachable by normal scrolling.
- Close/Back/Save/Next/Confirm remain usable in the supported keyboard/text-size states.
- Final content is not permanently underneath native tabs, the home indicator or a fixed action panel.
- No large stale keyboard gaps or doubled safe-area padding after transitions.
- More works with many items without shrinking targets or clipping.
- Short sheets are appropriately sized; long sheets/tasks grow or scroll intentionally.
- No horizontal clipping of important text, forms or images on small phones.
- Camera/video/3D aspect ratios and overlays remain correct.
- No new data loss, duplicate actions, gesture capture or web/native navigation regressions.
- No global font-scaling disablement, page-wide shrink transform or unexplained negative offsets.

Final response in Korean must include:
1. Confirmed root causes, distinct from remaining hypotheses.
2. Changed files and what shared responsibility each fix establishes.
3. Device/logical size/iOS/build/text settings actually tested.
4. Before/after screenshots or geometry evidence without private user content.
5. Runtime checks that remain blocked and why.
6. Exact instructions for seeing the repaired app: Metro/development build or compatible release path. State if a new native build is needed.

Follow repository HANDOFF rules for shared-file/setup changes. Do not claim Claude/Codex or the other developer has read a note merely because it was written. Leave production publishing to an explicitly authorized action.
