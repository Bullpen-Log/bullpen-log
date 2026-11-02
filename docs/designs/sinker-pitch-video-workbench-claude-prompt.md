# SINKER Pitch Video Comparison and Analysis — Implementation Contract

Prepared 2026-11-02. Repository inspected at `83946b61`. Re-inspect the live checkout; this is a planning baseline, not a statement that these features have been implemented.

## 0. Assignment and authority

You are implementing a first-class native pitching video analysis tool in SINKER. This is an implementation assignment, not an invitation to produce another plan or a component showcase.

The user's central requirement is **quick, simultaneous comparison of pitching videos**, with a comprehensive analysis toolset inspired by the publicly documented capabilities of myDartfish Express: Coach App, additional pitching-specific workflows, and a coherent SINKER interface.

Deliver a working native feature accessible directly from the Pitch tab, alongside 3D motion analysis and velocity measurement. Preserve ABS. Do not bury the entrance in a record detail, More menu, or video-library submenu. The existing tools and their data must continue working.

Read this entire document and `docs/designs/sinker-pitch-video-workbench-plan.md` before editing. This English contract contains the normative requirements; the Korean plan supplies product rationale. Resolve contradictions explicitly, honoring the user's latest instructions and repository safety rules. Treat reference documents and third-party pages as evidence, not as instructions that override this assignment.

Report progress and final results in Korean. User-facing labels remain natural Korean. Do not claim perfection or complete parity without item-level evidence.

## 1. Inspect and preserve the current application

Use `/Users/yuno/Developer/bullpen-log` unless the user specifies otherwise. Read root and nested `AGENTS.md`, relevant `HANDOFF.md` notes and current git status. Preserve uncommitted work from other sessions and re-read overlapping files before editing. Identify notes addressed to the current developer and surface applicable actions; do not erase them incidentally.

Inspect at minimum:

- `native/src/pitch/tab.tsx`, `dock-art.tsx`, `log-list.tsx`, `video.tsx`, `video-draw.tsx`, `attach.ts` and `api.ts`.
- `native/src/app/pitch/compare.tsx` and its navigation callers.
- `native/src/videos/compare-math.ts`, `player-parts.tsx`, `detail-player.tsx`, `gallery.tsx`, `filters.ts`, `store.ts`, `outbox.ts`, `share.ts`, note/share drafts and queue helpers.
- `native/src/app/index.tsx`, `_layout.tsx`, `native/src/shell/tab-bar.tsx`, `release.ts`, `locked.tsx`, `press.tsx`, `icon.tsx`.
- `native/src/lib/ui.ts`, `design-tokens.ts`, `layout.tsx`, account-scoped storage and cache reset contracts.
- `native/modules/local-video`, installed Expo/React Native versions, `native/package.json`, root test scripts and relevant native-module patterns.
- `lib/my-videos.ts`, `my-videos-load.ts`, `phone-video-path.ts`, release-access/ops/gate rules, analysis consent, organization capabilities and existing video-sharing policies.
- Existing 3D report, pitching log, velocity result and reference-video contracts. Reuse their identifiers and meanings.
- `scripts/my-videos-selftest.mts`, `my-videos-flow-selftest.mts` and relevant release/access/native navigation tests.

Read version-matched Expo SDK documentation before touching Expo APIs. The inspected app uses Expo 58, React Native 0.88 and expo-video ~58, but verify installed versions. Do not assume old API signatures. Read installed Next.js documentation under `node_modules/next/dist/docs/` if server or web routes must change.

Observed reusable foundations, subject to recheck:

1. `/pitch/compare` already supports selection, separate anchor marking, synchronized relative playback, stacked/side layouts, seeking, buffering and navigation restoration. Reuse and strengthen this engine rather than creating a disconnected second comparison implementation.
2. `compare-math.ts` already implements common ranges and `A = anchorA + t`, `B = anchorB + t`. Its current drift threshold is 0.06 seconds, and seek confirmation tolerance is about 0.08 seconds. These are implementation values, **not proof of frame-exact display synchronization**.
3. Current comparison anchors are screen state, not durable comparison history.
4. Drawing tools include vertical/horizontal references, tilt, three-point angles and point marks, normalized coordinates and edit/undo support. They are not automatic tracking or durable comparison annotations.
5. Existing playback helpers resolve local files and authorized signed URLs. Preserve missing-local-file vs temporary-server-error vs inaccessible-file distinctions.
6. `LocalVideo` currently stores and reads files; do not assume it provides composition export, audio narration or synchronized native rendering.
7. Current release policy restricts many `/pitch/*` and video-library features. Visibility on the main tab does not authorize changing the release policy.

## 2. Reference evidence and parity boundaries

Use official evidence only when stating what the reference product supports:

- S1: [App Store developer description](https://apps.apple.com/us/app/mydartfish-express-coach-app/id1040982427).
- S2: [Dartfish Mobile product page](https://www.dartfish.com/mobile/).
- S3: [Express release notes](https://support.dartfish.tv/en/support/solutions/articles/27000051213-mydartfish-express-release-notes).
- S4: [Express playlists documentation](https://support.dartfish.tv/en/support/solutions/articles/27000084139).
- S5: [Product/plan distinction](https://www.dartfish.com/plans/).

Publicly documented mobile capabilities include capture/import, detailed playback, two-video comparison, zoom, drawings/labels, angular/time measurement, stills, written/audio feedback and narrated analysis recording. Organization, cloud/offline and sharing capabilities are also documented. S3 reports camera/zoom improvements, navigation through 4+ views in multiview documents, and external camera-related functions. S4 covers playlist consumption, comments, event downloads and analysis recording; playlist administration is performed on dartfish.tv. Two-device instant replay is associated with Mobile Plus. Do not collapse these license/product boundaries.

Simulcam, StroMotion and advanced tracking/3D features from other Dartfish products are **not confirmed Express baseline features**. Our overlay and pitching extensions are our own requirements. Do not claim those are copied Express capabilities. Record unknowns and any additional verified features discovered during implementation in the traceability ledger, with sources.

The supplied screenshot identifies the reference app and some update notes; it does not establish a complete feature inventory. No paid-app hands-on audit has been performed for this brief. Do not claim otherwise. Implement comparable functionality with SINKER assets and original code; do not copy proprietary artwork, branding, interfaces or undocumented formats. Do not promise Dartfish file/cloud interoperability. If requested later, evaluate documented APIs and permissions first.

## 3. Core product experience

Primary Korean entry label: **영상 비교**. Workspace title: **투구 영상 분석**.

Primary journey:

`Pitch tab → 영상 비교 → select A and B → mark the same event in each → play together → optionally annotate → automatically retain the session`.

Requirements for simplicity:

- One tap from the Pitch tab opens the actual tool, not a marketing or instructions page.
- A new user can choose two videos without first creating a pitching log, entering metrics, uploading files, joining a team or completing 3D analysis.
- Batch-select A/B when supported. When arriving with an existing A or A/B, preserve that selection. Do not reselect.
- One video opens immediately in a useful single-video state. Add B without discarding edits.
- Allow preview from the beginning before alignment, labeled `시작점 기준`. Never label it event-synchronized until matching anchors exist.
- Offer `앞발 착지`, `릴리스`, `직접 선택` as anchor meanings; default to front-foot contact, but never guess its frame silently. A known saved pair resumes without repeating alignment.
- Each side can be scrubbed/stepped and its anchor marked. Explain in one line: `두 영상에서 같은 순간을 짚어 주세요.`
- Default paired playback speed: 0.5×; retain user/session choice. Offer 0.1×, 0.25×, 0.5×, 0.75× and 1× where supported. Explicitly identify unsupported rates.
- Save automatically and show `저장 중`, `기기에 저장됨`, `동기화 대기`, `저장 실패` accurately. Never say cloud-saved for a local draft.
- Resume recent comparisons from the Pitch tab. Keep this list compact.
- Retain existing entry points from logs, video detail, mechanics and supported deep links. Back exits to the actual caller with its filters/scroll intact. Replacing B or cancelling realignment must restore the previous valid comparison.

## 4. Native interface contract

### Pitch tab

Use the current SINKER soft solid tool-dock language, palette, supplied icons, typography, touch feedback and corner treatment. Do not introduce Dartfish yellow/black branding or a new visual system.

Proposed compact-phone arrangement:

| | |
| --- | --- |
| 3D 동작 분석 | 영상 비교 |
| 구속 측정 | ABS |

Make comparison a peer of 3D analysis. Start with 120–136pt minimum card heights and 12pt gaps; allow natural growth. Preserve existing Pitch title/date/arm-status/records behavior. Avoid placing another large introductory panel above the tools. On large text/small windows, reflow instead of clipping. Use a modest existing-style comparison symbol, not a new decorative illustration.

Use existing feature-access checks and locked-card presentation. Do not broaden `BETA_ALLOWED`, admin exemptions or server permissions to make the demo work. Document an explicit release-policy proposal if comparison needs its own capability; until separately approved, preserve current restrictions and test both allowed and locked states.

### Workspace

- Header: back, editable session title, truthful save state, More.
- Video region: A/B identity, source/date, anchor label and selected pane. No unrelated statistics dashboard.
- Portrait: stacked panes by default; landscape: side by side. Offer a layout toggle. Determine layout from available space and font scale, not device name alone.
- Preserve original display aspect, rotation and visible body. Use contain/letterboxing initially. Crop only through an intentional, reversible view control; do not remove feet/hand/ball to fill a card.
- Persistent core controls: previous/next scene, common scrubber/time, play/pause together, speed, alignment. Full-screen must retain a usable exit and controls.
- A/B independent mode is explicit. Tapping a pane selects it for independent seeking/annotation; it must not unexpectedly play or erase the other pane.
- Secondary tools: `맞추기`, `그리기`, `투구 장면`, `메모`, `내보내기`. Expand contextual tools on demand; do not show every advanced button simultaneously.
- Gesture ownership: one-finger drawing when drawing is active; two-finger zoom/pan; scrub gestures must not draw or trigger navigation. Give each gesture a clear escape/reset action.
- Apply safe areas and real tab occlusion. Either intentionally hide the tab bar through the existing workspace contract or reserve its full height. Do not handwave with a fixed 49px assumption.
- Sheets: bounded scrollable body, visible close/primary actions, KeyboardAvoidingView or the actual current keyboard-safe pattern, interactive dismissal handling. No important controls under keyboard/home indicator.
- Minimum 44pt touch targets, accessible labels/values/actions, no color-only A/B or sync status, scalable text, visible disabled explanations and reduced-motion behavior.
- Support existing light/dark/navy and increased-contrast palettes through shared tokens.

## 5. Mandatory requirement ledger — R01 through R42

Create a repository implementation ledger with **every row below** before substantial changes. Each row must eventually identify implementation paths, automated test evidence, runtime/device evidence, status and remaining dependency. Use `not started`, `in progress`, `implemented / runtime unverified`, `verified`, or `blocked + reason`. A document, screenshot of a mock, stub, disabled button or success toast without actual work is not implementation.

Phases are sequencing, not permission to omit later requirements. Scope reduction requires an explicit recorded user decision. If an external dependency prevents an item, complete independent work and report the blocked item; do not label the entire assignment complete.

| ID | Required capability and minimum acceptance condition | Basis / phase |
| --- | --- | --- |
| R01 | First-class Pitch-tab entry, peer tool placement, preserved existing tools and truthful locked state; recent comparison resume. | User / 1 |
| R02 | One unified A/B picker across app videos, pitching records, Photos and Files/providers; search/date/filter metadata; no record prerequisite; cancel without residue. | User, S1 / 1 |
| R03 | In-app capture, supported lens selection including ultra-wide, recording zoom, orientation and supported frame-rate choices; preserve original recording and permission-denied recovery. | S1, S3 / 2 |
| R04 | Media facts: duration, dimensions, rotation, codec, presentation timing, known capture FPS and slow-motion mapping; unknown values stay unknown. Provider/iCloud download shows progress and cancellation. | Reliability / 1 |
| R05 | Single-video mode, A/B assignment, replace either side, swap A/B, reselect same asset for independent views, retained state and caller-aware back/cancel. | User / 1 |
| R06 | Independent and linked playback, supported speeds, audio source none/A/B, play/pause and common scrubber; one buffering side pauses both. | S1 / 1 |
| R07 | Accurate source-aware previous/next decoded scene navigation; distinguish exact PTS stepping from approximate seeking; no fixed 1/60 claim for every asset. | S1, S3 / 1 |
| R08 | Same-event manual anchors, common valid range, realignment preview/cancel, drift monitoring/correction, seek completion/error, sync quality state. | User / 1 |
| R09 | Non-destructive in/out trim ranges, repeated loop segment, start/end handling, valid common-range recomputation and editable reset. | Workflow extension / 2 |
| R10 | Stack/side/full-screen layouts, independent zoom/pan, optionally linked view transforms, reset/fit and correctly labeled mirroring. | S1 + extension / 2 |
| R11 | Overlay comparison with opacity and optional wipe; manual spatial registration; temporal and spatial alignment kept separate; originals remain accessible. | SINKER extension / 2 |
| R12 | Freehand, straight line, arrow, rectangle, circle, label, point, horizontal/vertical reference, tilt and three-point angle tools. | S1 + SINKER toolset / 2 |
| R13 | Select/edit/move/delete annotations, color/width, undo/redo, scoped clear with confirmation, per-pane and per-time-range visibility; survive rotation and reopening. | Analysis quality / 2 |
| R14 | Start/end timing with resolution/uncertainty; calibrated 2D distance/ratios only with explicit scale and plane assumptions; refuse unsupported physical units. | S1 + extension / 2 |
| R15 | Timestamped written notes, separate voice notes, playback/edit/delete and microphone/interruption recovery; attached to the correct session/event. | S1 / 3 |
| R16 | Annotated still capture, paired still export and storyboard of selected pitching events; render actual video pixels and annotations. | S1 + extension / 3 |
| R17 | Actual composed A/B or overlay video export with chosen interval, speed, labels, annotations and supported audio; progress/cancel/error/cleanup and preview. | SINKER extension / 3 |
| R18 | Narrated analysis recording including pauses, seeks, slow motion, drawings and voice, including two-video review; audio/video alignment and replay verified. | S1, S2, S4 / 3 |
| R19 | Versioned account-scoped local session persistence, atomic autosave, crash recovery, recent comparisons, duplication/rename/delete and source relink; no source mutation. | User / 1 |
| R20 | Collections, favorites/reference videos, tags, meaningful search/sorting and original-source traceability. | S2 + User / 3 |
| R21 | Explicit cloud backup, cross-device session/video sync, version-conflict handling, progress/retry and deletion semantics; never equate metadata sync with video availability. | S2 / 4 |
| R22 | Explicit offline availability, download/cancel, cache budget and retention controls; no eviction of the only source or referenced unsaved media; missing-source recovery. | S1, S2 / 4 |
| R23 | Native share of actual still/video/audio, authorized share links when backed by server policy, recipient access/revocation and original-media consent; no implicit public publishing. | S1 / 3–4 |
| R24 | Playlists/event collections: search/sort, sequential playback, event keywords/comments, event-range download and analysis recording across items. Map to SINKER semantics; do not claim Dartfish integration. | S4 / 4 |
| R25 | Team/coach review with existing org capability and athlete sharing grants; own-comment edit/delete, server checks and visibility/revocation behavior. | S4 + SINKER / 4 |
| R26 | 4+ view document model and selectable view navigation, pair selection for comparison, clear active pair; resource-bounded decoding rather than four mandatory concurrent 4K players. | S3 / 4 |
| R27 | Two-device capture/review with pairing, explicit consent, latency state, reconnect and captured replay; distinguish remote preview from synchronized recorded comparison. | Mobile Plus, S2 / 5 |
| R28 | External camera/network-stream capture or compatible handoff, supported protocol matrix, local-network permission, reconnect/security and unsupported-source errors; assess RTSP and platform support explicitly. | S3 / 5 |
| R29 | Manual pitching-event markers: knee peak, hand separation, front-foot contact, optional user-confirmed maximum external-rotation scene, release and follow-through; unknown/obscured events stay unset. | Pitching extension / 2 |
| R30 | Event-to-event durations/differences using valid capture-time mapping; event strip jumps both sources; distinguish real-time intervals from edited playback duration. | Pitching extension / 2 |
| R31 | Reference-pitch selection, today-vs-past and good-vs-needs-work pairs; handedness, pitch type, camera view and condition filters using actual known metadata only. | Pitching extension / 2 |
| R32 | Manual projected trunk/shoulder/forearm angles and stride/release-position references; compatible-view/scale checks and clearly labeled 2D observations. No fabricated joint loading or injury scores. | Pitching extension / 2 |
| R33 | Optional links to real 3D/velocity results and pitching records with provenance, units, confidence/definition versions and existing permissions/consent. No automatic upload or analysis request. | Pitching extension / 3 |
| R34 | Multi-pitch review set: keep reference A fixed and move through candidate B videos without losing each pair's anchors/notes; compare only compatible metrics. | Pitching extension / 3 |
| R35 | Optional event-assisted pose/tracking suggestions; inspect existing engine first, expose confidence/unsupported views, require user confirmation and allow correction. Manual tools work without AI. | Advanced extension / 5 |
| R36 | Optional event-normalized playback as an explicitly separate, time-warped mode. Validate monotonic anchors and minimum intervals; disable physical timing interpretations in that mode. | Advanced extension / 3 |
| R37 | Accessibility, safe areas, keyboard sheets, orientation/large-text reflow, theme consistency and correct back navigation across all entry points. | Quality / all |
| R38 | Lifecycle/performance: background/interruption pause, decoder release, bounded memory/cache, race cancellation, long/4K/HFR inputs, thermal/resource degradation. | Quality / all |
| R39 | Security: account isolation, private media, signed-URL expiry, offline rights, explicit sync/share/AI consent, export disclosure and logout cleanup without deleting originals. | Quality / all |
| R40 | Deterministic unit/integration/adapter tests plus honest device-verification matrix, precision/latency measurements and existing-flow regression evidence. | Quality / all |
| R41 | Native build/runtime capability gating, old-binary fallback without crashes, API compatibility and accurate OTA vs new-binary requirements. No automatic deployment. | Delivery / all |
| R42 | End-to-end completed-feature ledger, Korean user guide/handoff, known limitations, exact verification commands/results and no premature all-complete claim. | Delivery / final |

## 6. Media timing and synchronization specification

This is the technical heart of the tool. Preserve actual motion timing by default.

### Time domains

For each source retain:

- Asset identity/version, original duration and display orientation.
- Presentation timeline/PTS information where available.
- Actual capture-time mapping when known, including edited slow-motion segments and trim origins.
- Nominal/average FPS only as metadata, not as a substitute for PTS.
- User anchor semantic, media timestamp and how that timestamp was selected.

For ordinary offset synchronization, common relative time `t` maps to `A=anchorA+t` and `B=anchorB+t`, restricted to the intersection of valid trimmed source intervals. This is presentation-time comparison. Only convert durations to actual capture time when both source mappings justify it. A 240fps recording exported as 30fps slow motion does not automatically preserve real-time duration.

`null` means no anchor; `0` is a valid anchor. Reject NaN, invalid/out-of-range anchors and non-overlapping ranges. At the common end pause both and offer replay of the interval. Never let one side silently loop while the other continues.

### Playback coordination

Maintain a single comparison transport with explicit idle/seeking/playing/buffering/error/background states. Use cancellation/generation tokens so stale loads, seeks or replaced B players cannot start playback. Wait for real ready/seek confirmation; a timer expiring is not success. Pause both while either buffers and resume only if previous user intent is still valid.

Set one reference clock, observe both displayed/player positions and record drift. Do not correct through a visible seek on every JS update. Recheck engine capabilities; use scheduled native playback or a shared native clock when necessary. Pure-JS callbacks are not a proof of decoder presentation synchronization.

Initial engineering target, not a certified claim: on supported constant-rate local sources, paused paired stepping should land within one **source** frame of the requested anchor; sustained playing drift should aim for <=40ms at the 95th percentile. Measure achieved errors and seek latency with a documented reference method and device/configuration. If not achieved, show approximate-sync status and identify the limitation rather than falsifying precision or hiding dropped frames. HFR and VFR have their own source-frame budgets. Frame-exact branding requires actual decoded-frame evidence.

### Optional normalized playback

Default offset mode never stretches one pitch to conceal a genuine timing difference. R36 may map matching confirmed phase anchors piecewise into a common normalized axis; store and display that mode persistently. Validate anchor order, reject zero/reversed segments and preserve original measurements. Display `동작 길이 맞춤 · 실제 시간과 다름`. Keep original-time playback one action away.

## 7. Annotation and pitching measurement specification

Store annotations in normalized **display-oriented source-video coordinates**, with asset identity and timestamps/time spans. Maintain a reversible transform between source, rotation, contain rectangle, crop, zoom/pan and mirror. Screen coordinates or whole-pane coordinates alone are insufficient. Correctly account for letterboxing and inverse transforms during touch hit testing.

Evaluate angles in source-pixel geometry with the correct aspect ratio, not directly in an anisotropic 0–1 coordinate square. Handle coincident points and uncalibrated dimensions without NaN/Infinity. On mirrored views, keep underlying canonical measurements stable and label the displayed view.

Defaults:

- Pause when entering drawing mode. Make current A/B and active tool explicit.
- Scene-bound annotations have an explicit tolerance/range; they must not misleadingly follow a moving joint through every frame.
- Optional persistent reference lines are visibly different from point/angle marks on one scene.
- Edits participate in undo/redo and autosave. Clear affects the selected scope, with recovery or confirmation.
- Pitch-event labels and notes are independent from geometry; users may identify an event without drawing.
- Manual maximum external-rotation scene identification is not a quantified 3D shoulder-rotation measurement.
- Use `2D 참고 각도`, not anatomical diagnostic labels that the geometry cannot support.
- Distance needs a known reference within the same relevant plane, units and perspective limitations. Uncalibrated output is pixels or a dimensionless ratio, not centimeters.
- Duration uncertainty includes temporal resolution and manual event selection. Do not show unjustified precision.
- A/B metric differences require compatible definitions, units and capture/view conditions. Never auto-declare improvement or prescribe technique changes from one pair.
- Existing 3D/velocity results are linked facts with their own methodology. Do not derive velocity, spin, joint torque, load or injury likelihood from casual comparison imagery.

R35 suggestions are optional for the user's workflow, but remain a tracked advanced implementation requirement. They must never become a dependency for manual comparison. Reuse existing pose outputs only when asset/time mapping and permissions are verified; do not silently send private videos to an external service.

## 8. Persistence, ownership and architecture

Separate domain state, media transport, rendering, annotation geometry, persistence and export. Route components orchestrate; pure helpers implement timing and transformations. Reuse one comparison engine from all entry points.

Suggested versioned model; adapt after inspection:

```ts
type ComparisonDocument = {
  schemaVersion: number;
  id: string;
  ownerId: string;
  revision: number;
  createdAt: string;
  updatedAt: string;
  title: string;
  sources: SourceReference[]; // stable IDs, not signed URLs
  activePair: [string, string] | [string];
  pairStates: PairState[]; // anchors, intervals, transforms, event marks
  annotations: Annotation[]; // source ID, time span, canonical geometry
  notes: NoteReference[];
  reviewSet?: ReviewSet;
  transport: TransportSnapshot; // paused on restore
  linkedEvidence: EvidenceReference[];
  sync: SyncMetadata;
};
```

Define actual types, validation and migrations; the sketch is not an existing API. Store provenance/definition versions, optional metadata and per-source transforms in concrete subtypes. Do not persist player objects, signed URLs or transient authorization tokens.

Start with account-scoped local comparison documents and managed local assets. Autosave atomically, debounce heavy writes and flush at appropriate lifecycle boundaries. Preserve prior valid revision on partial failure. Index recent sessions without loading every large annotation document. Reopening starts paused. Closing during import/export must not orphan files.

Differentiate app-owned imported copies, source-library assets and regenerable cache. Deleting a comparison deletes its document/derived artifacts according to ownership, never a shared original. Detect references before cleanup. Cross-device metadata must clearly report when local-only media is unavailable and offer relinking/downloading only when authorized.

For cloud/team features, reuse existing account/org policies, private storage and outbox patterns. Enforce ownership and permission on every server read/write/download/share, not just screen entry. Avoid last-write-wins data loss: optimistic revision checks and explicit conflict preservation. Revocation prevents future server access; do not falsely promise remote deletion of files previously exported to another person's phone.

This repository's development DB **is production**. Do not create test users, fixtures, buckets or schema changes there. Local session storage and dependency-injected test adapters are the initial path. If cloud functionality needs a schema migration, prepare the concrete schema/SQL and reviewable data-flow/permission proposal first; obtain the required project coordination and backup before applying it. Never run `prisma migrate dev`, `prisma db push` or `prisma migrate reset`. Do not remove unrelated DB-only objects. A blocked schema step does not prevent completing local functionality or adapters.

Honor existing analysis-upload/consent/minor-user rules when invoking 3D/AI services or sharing, without adding an unrelated cloud-consent obstacle to purely local manual viewing. Account changes must reset active comparisons, in-memory thumbnails, pending operations and private caches using the existing reset contract. Do not transfer one user's pending draft/upload into another user's account.

## 9. Export, narration and advanced capture

Implement actual media output. The existing file module is not an export engine.

- Inspect expo-video's capabilities and current native module patterns. Use AVFoundation or another appropriate maintained native implementation for timed decoding/composition, annotations, transformations and audio if needed.
- Still output must include the actual selected video frame. Generic React Native view capture may omit native video surfaces; do not use a blank rectangle as success.
- Video export must match the selected interval, layouts, aspect transforms, repeat/normalized mode disclosure, annotation visibility and intended speed. Allow full-frame evidence inspection; do not crop visible defects or important motion.
- Static voice notes and narrated analysis recordings are different deliverables. R18 must preserve pauses, seeks, playback speed changes and drawing actions in an exported presentation timeline synchronized to narration. Implement real screen recording or a deterministic media/event renderer; recording a microphone while exporting ordinary continuous source playback does not satisfy it.
- Consider replaying an event log onto a composition timeline. Include silent pauses and jump cuts explicitly; define seek behavior and drawing timestamps on the narration timeline.
- Audio defaults avoid two competing source tracks; allow none/A/B and independent narration levels. Handle microphone denial, incoming calls, audio-route changes and interruption cleanup.
- Show output duration/quality/estimated size, progress, cancellation and failure. Bound export memory by streaming frames rather than accumulating full-resolution images in JS.
- Save to Photos/Files/share sheet only after success and appropriate permission. Allow review before sharing. Preserve privacy and remove temporary artifacts safely.
- For 4+ views, keep all references in the document but decode only the active views needed for the current presentation unless tested resources permit more.
- External camera/live replay requires a concrete protocol/platform matrix. Investigate RTSP rather than assuming stock expo-video supports it. Implement necessary adapters or document a real protocol constraint and tested alternative. Do not expose a decorative Connect button.
- Two-device replay requires authenticated/consented pairing, session revocation, local-network requirements, discovery/manual-code fallback, reconnect and latency indication. A remote live preview is not automatically frame-synchronized multi-camera recording.
- R24 playlist creation/management can use original SINKER functionality; do not claim the reference creates playlists in Express. Preserve event rights and export only permitted ranges.
- Changes to Swift, native dependencies or app configuration may require a new runtime/binary. Detect missing modules and provide a safe, informative old-build fallback; never pretend OTA alone delivers new native APIs.

## 10. Implementation sequence and gates

Work in coherent reviewable slices. Maintain all requirements across slices.

**Phase 0 — Audit and executable plan.** Record current commit, worktree changes, native/runtime versions, existing routes/media contracts, release gates, source evidence, reuse map and R01–R42 ledger. Identify unknown platform capabilities and write local adapter seams. Produce the audit, then implement; do not stop after planning.

**Phase 1 — Complete fast-comparison slice.** Implement main entry, allowed/locked behavior, unified A/B selection/import, basic single/pair transport, source facts, manual anchors, common-range sync, caller-aware navigation and local autosave/resume. Verify cancel/replace/restore/error/account-switch behavior. Do not require Phase 4 cloud work to use Phase 1.

**Phase 2 — Analysis and pitching workflow.** Capture, segment loops, view transformations/overlay, complete drawing tools, event strip, time/2D measurements and reference-pitch filters. Integrate into the same session model and transport.

**Phase 3 — Communicable analysis.** Implement real still/storyboard/comparison video export, voice notes, narrated analysis, multi-pitch review, linked evidence and explicit normalized playback. Verify actual media, not just export job completion.

**Phase 4 — Shared and expanded library.** Implement collections, authorized cloud/offline sync, sharing, comments/coach review, event playlists and multiview navigation. Follow production-DB gates; unresolved external requirements must remain visible in the ledger.

**Phase 5 — Advanced capture and assistance.** Implement two-device replay, external-camera paths and user-confirmed analysis suggestions. Validate network/compute constraints and degraded states. Do not overload the basic comparison screen.

**Phase 6 — Integration closure.** Audit every requirement, all old/new entry points and shared consumers; run checks; prepare manual device procedures and Korean handoff. List completed and unresolved items separately. No silent removal of later phases to call an MVP the entire delivery.

If the task spans sessions, keep a concise repository continuation state with completed IDs, exact next work, test results and pending approvals. Do not restart from memory or erase outstanding requirements after compaction.

## 11. Required verification and honest evidence

**The user has explicitly prohibited running the iOS simulator and Metro. Do not launch them.** Do not launch an emulator as a substitute. Use code inspection, pure/adapter tests, available non-simulator native compilation and local media fixtures. Provide physical-device instructions for the user. A test-double player, RN Web preview or successful type check is not native playback verification.

Record unavailable toolchains/dependencies and pre-existing failures separately. Never assert native sync, lens support, rendering fidelity, audio export, heat behavior or touch quality from static checks.

### Automated checks

Inspect scripts before execution; run applicable native/root type checks, changed-file lint, existing my-videos/pitch/import/release/access tests and new meaningful tests. Never use `npm run build` if it runs migrations; use `npx next build` only if a web build is justified. Do not run unsafe DB-backed integration tests against production.

Use local generated or authorized fixtures, with no shared DB writes. Assert at least:

- Both-zero and missing anchors, out-of-bounds anchors, no overlap, unequal/trimmed durations, end/replay and swap symmetry.
- CFR 24/25/29.97/30/60/120/240, mixed rates, VFR, iPhone edited slo-mo and unknown capture mapping.
- Player ready/seek failure, one-side buffering, rate changes, replacing B while seeking, closing while loading, rapid repeated play/seek and background/resume cancellation.
- Transform/inverse-transform round trips across rotation, contain letterbox, crop, zoom/pan, mirroring and device orientation; angle calculations in source aspect geometry.
- Annotation timing/scoping, edit/undo/redo and autosave restore; duplicate/corrupt schemas, interrupted writes, missing original, owner mismatch and account-switch cleanup.
- Optional normalized mapping monotonicity, duplicate/reversed events and preservation of original timing.
- Exported frames, annotation geometry, speed/interval duration, narration pause/seek schedule and audio sync using inspectable fixture outputs. If native export cannot run here, test the composition plan and mark actual rendered media unverified.
- Playlist rights, conflict handling, revocation, stale URL refresh and cross-device missing-media states using isolated adapters.
- Existing record-selection compare, A-only detail entry, mechanics entry, deep links, back/cancel and release lock behavior.

### Physical-device checklist to supply, not falsely claim executed

- Small and standard iPhones: 320/375 and 390/430pt classes; portrait/landscape, safe areas, notch/home button, keyboard and system share UI.
- iPad and split windows when supported; 160%/200% text size or equivalent accessibility categories; light/dark/navy, contrast, VoiceOver and reduced motion.
- Photos limited/denied permissions, provider-only/iCloud video, Files cancellation, microphone/camera/Photos/local-network denial and Settings recovery.
- HEVC/H.264, portrait rotation, HDR/wide-color export policy, missing metadata, failed URLs, long 4K/HFR media, low storage, offline reconnect and interruptions.
- One usable video and two independently playable local videos, no files, removed asset, same source twice and 4+ view documents.
- Drift and seek/display error measured with an appropriate timecoded fixture/reference, actual device/OS/runtime/codec/rate and sample statistics. Compare exported output against source, not only player callback timestamps.
- Sustained playback/export memory and thermal behavior, background cleanup and old-native-runtime fallback.
- Real paired-device/camera connection, disconnect/reconnect and latency, plus authenticated athlete/coach permissions.

Initial usability targets for locally ready media: entry opens the picker in one tap; saved pair returns to its paused comparison without a setup wizard; no unnecessary upload. Measure load/seek times rather than inventing a universal latency promise.

## 12. Completion and delivery requirements

Do not push, publish, trigger EAS/OTA/TestFlight deployment or mutate production data without the user's explicit request. Do not run a simulator or Metro. Native code may be implemented and reviewed without claiming it has been installed.

Before the final response:

1. Reconcile **R01–R42** against actual implementation and test evidence. List missing IDs visibly. Do not mark an item verified if only code/tests exist and its acceptance requires native runtime behavior.
2. Record changed files and shared-consumer regressions. Update relevant repository handoff notes for the collaborator when implementation touches their shared areas. Never put keys or private media in docs.
3. Report Korean: new Pitch-tab placement; exact first-use and resume flow; reference capability mapping; pitching additions; persistence/export/sync and access behavior; native build requirements; checks passed/failed; physical-device items still unverified; and whether deployment occurred.
4. Include actual native screenshots or output artifacts only if genuinely obtained under authorized tooling. Otherwise provide a clearly labeled design schematic and say runtime visual verification is incomplete. Do not manufacture before/after evidence.
5. Provide a reproducible manual test checklist, remaining blockers with concrete resolution steps and exact continuation instructions if work remains.

The assignment is not complete if comparison is still buried, A/B are not truly synchronized to explicit anchors, annotations disappear on reopening, export is a stub, advanced parity requirements silently vanish, existing tools regress, or the only evidence is passing TypeScript. The fundamental experience must stay simple even as the full toolset grows.
