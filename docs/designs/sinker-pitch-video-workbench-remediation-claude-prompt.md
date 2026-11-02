# SINKER Pitch Video Workbench — Review Remediation and Completion

Prepared 2026-11-02 after independent review of feature commit `b7cd3562`, merged at `760d9859`.

## 1. Execute this assignment now

The user requests implementation of the improvements identified in the independent review. Work in the existing SINKER development session and main checkout:

`/Users/yuno/Developer/bullpen-log`

Read this entire prompt, inspect the current repository, reproduce the findings against the current code, and **begin correcting the application immediately**. Do not respond with another plan and stop. Do not merely update the requirement ledger or repeat that previous tests pass.

The first deliverable is a reliable, simple native pitching-video comparison flow. Prioritize asset preservation, durable session restoration, correct playback recovery, and the ability to select/replace two videos without existing pitching records. Then address the interaction and measurement issues, and continue the remaining original requirements in dependency order.

User-facing text, progress reports and the final report must be in Korean. This prompt is English so its implementation instructions are precise and portable across sessions.

## 2. Mandatory reading and preservation

Read before editing:

1. Root `AGENTS.md`, `native/AGENTS.md`, applicable nested instructions, and relevant `HANDOFF.md` notes.
2. `docs/designs/sinker-pitch-video-workbench-review-2026-11-02.md` — independent findings and remediation priorities.
3. `docs/designs/sinker-pitch-video-workbench-claude-prompt.md` — original R01–R42 contract.
4. `docs/designs/sinker-pitch-video-workbench-plan.md` — product rationale.
5. `docs/designs/sinker-pitch-video-workbench-ledger.md` — current claimed implementation and unresolved work.
6. Feature diff `b7cd3562`, subsequent changes and actual current implementations of all files you touch.

The review's line numbers identify the reviewed revision; locate the corresponding logic again. The review is evidence, not an instruction to force a bug into code that has already been fixed. If a finding no longer applies, show the actual source change and regression evidence.

Inspect git status first and preserve unrelated work. Known unrelated changes at review time included `AGENTS.md`, `lib/market/lesson-dummy.ts`, dummy scripts and desktop-audit documents. Recheck rather than relying on this list. Do not overwrite other collaborators' changes or restore historical files wholesale.

Read the version-matched Expo and installed API documentation before changing Expo/native integrations. Read installed Next.js documentation if touching framework/server behavior. Do not invent an API from memory.

## 3. Existing restrictions remain in force

- **Do not start the iOS simulator, any emulator, or Metro.** The user explicitly prohibited them. Do not reinterpret a generic verification requirement as permission to launch them.
- Work on the official Expo native app under `native/src`; do not substitute a web-only demo for native functionality.
- The development DB is production. No test users, test inventory, shared-data writes, schema application, seeding or storage deletion against production.
- Never run `prisma migrate dev`, `prisma db push`, or `prisma migrate reset`.
- Inspect scripts. Do not use `npm run build`, which runs migrations. If a justified web build is needed, use `npx next build`.
- Do not read, print, transmit or commit secret values. Fixtures must be synthetic/local or authorized nonprivate media.
- Do not push, publish, deploy, issue an OTA update, start TestFlight/EAS deployment or unlock beta access. The user has authorized local implementation, not production publication.
- Preserve 3D analysis, velocity measurement, ABS, pitching logs, existing comparison callers and account permissions.
- Respect current release gating. Main-tab visibility is not permission to broaden `BETA_ALLOWED` or bypass server policy.
- Changes to native code or packages may require a new binary. Implement safe capability detection and report the requirement accurately; do not claim OTA delivers new native APIs.
- Write appropriate collaborator handoff notes for shared native files. Preserve unrelated notes. Follow established Korean commit conventions if creating authorized implementation commits; do not include unrelated files or `.claude/launch.json`.

## 4. Evidence baseline and its limits

At independent review time:

- `npm run native-compare:test`: 317 passed.
- `npm run my-videos:test`: 117 + 69 passed.
- `npm run release-access:test`: 692 passed.
- Native type check failed with 9 diagnostics, including missing `expo-screen-orientation`/`expo-notifications`, `FormData.entries`, other route casts and push typing.
- Changed-area lint failed on the unresolved orientation package import.

These failures describe that installation, not a permanent excuse. The existing Claude session may have subsequently installed dependencies/generated clients; inspect and re-run before classifying current failures. Do not make broad unrelated dependency or schema changes to produce a green report.

The independent review used real domain/storage functions with an in-memory filesystem and actual component/hook source transpiled against a lightweight mock hook scheduler. It did **not** verify native decoding, real React commits, Photos picker behavior, touch, rendering fidelity, measured synchronization or physical-device performance.

Optional local evidence files, if still present:

```bash
node --import ./scripts/native-test-register.mjs /tmp/sinker-compare-review-20261102/probes.mts
node --import ./scripts/native-test-register.mjs /tmp/sinker-compare-review-20261102/hooks.mts
```

They reproduce incorrect behavior and are not production regression tests. Port each relevant reproduction into maintained tests asserting the desired behavior. Tests must fail before the fix and pass after it. Do not modify expectations to approve the defect.

## 5. F01 — Serialize shared metadata and protect referenced media

Review locations: `native/src/compare/storage.ts` (`serial`, `writeIndex`, `updateIndex`, `rebuildIndex`, `remove`) and `native/src/compare/store.ts` (`deleteComparison`).

Confirmed adapter reproduction:

1. Seed a valid empty `index.json`.
2. Save two different documents concurrently. Both reference the same media; one is a reference copy and the other owns the app-imported copies.
3. Both document files exist, but the recent index retains only the last writer.
4. Delete the indexed owning document. The non-indexed document still exists, yet both media paths are returned as orphans.

This is app-managed-copy deletion risk, not a claim that Photos originals were deleted.

Required correction:

- Coordinate account-wide index updates, rebuilding, document deletion and asset-reference decisions. Per-document queues alone do not serialize a shared index.
- Avoid deadlocks when a queued operation invokes another storage operation. Specify transaction/queue boundaries explicitly.
- A recent index is a convenience, not authoritative evidence that no other document references an asset.
- Determine references from all valid persisted documents or a robust independent asset registry. Include documents outside the 500-entry recent-index cap.
- On unreadable documents, listing failure, incomplete recovery or unknown references, fail conservatively and retain media. Never convert an I/O error into permission to delete.
- Do not return deletion success when a required document removal failed. Prevent a concurrent pending save from resurrecting a deleted document.
- Keep reference validation and actual local-file deletion safe across concurrent saves/references. Returning orphan paths and deleting them later outside the coordinated boundary must not create a time-of-check/time-of-use race.
- Preserve original Photos/library/record assets. Explicitly distinguish managed copies, shared references, temporary imports and regenerable cache.

Acceptance tests: simultaneous saves of 2 and many documents; partial/missing/corrupt index; more than 500 documents; concurrent save/delete/duplicate; unreadable document; failed list/remove; interrupted recovery; delayed local-file removal. Referenced media must never be proposed for deletion. Assert actual adapter effects, not only returned status.

## 6. F04 and F06 — Make recovery and version protection safe

### F04: recovered valid predecessor can be destroyed

`load` can return a valid `.prev` when `.json` is corrupt. The next save moves the corrupt `.json` over the valid `.prev`. If installing `.tmp` then fails, neither remaining document is valid.

Correction: retain a validated good generation until the new generation is successfully installed and validated. Distinguish recovered state from merely existing main bytes. Do not clean up the only recoverable copy during an error path. Choose an atomic/generation strategy consistent with the actual filesystem adapter; validate real move/overwrite semantics rather than assuming POSIX guarantees.

Acceptance: inject failures at every write/move/installation/cleanup boundary, including an initial corrupt main plus valid predecessor. At least one valid old or new document must remain readable after each interruption. Preserve complete document contents, not just an ID or success flag.

### F06: save can overwrite a future-schema document

The loader returns `newer`, but save currently blocks only `owner`, then proceeds to write schema 1 over schema 2.

Correction: only a genuine `missing` result authorizes initial creation. Return explicit failures for newer schema, ownership mismatch, corrupt data and I/O errors. Any intentional recovery/replacement is a separate controlled operation, not an accidental fallback to new-document creation. Preserve existing bytes on rejection and propagate truthful error messages.

Acceptance: attempt writes over future schema/revision, wrong owner, corrupt main and unreadable filesystem; assert unchanged bytes. Verify normal new-document and valid revision-update paths still work.

## 7. F02 — Restore before persisting playback position

Review location: `native/src/compare/ui/workbench.tsx`, initialization of `times`, `keepRel`, `restoreRel`, active-pair switching and autosave.

Observed source-level reproduction: a document with A anchor 2s, B anchor 3s and saved relative time +1.25s schedules a new relative time 0 before the players become ready; after readiness there is no seek back to +1.25s.

Required correction:

- Introduce an explicit per-document/per-pair restoration lifecycle: loading, restoring, ready, failed or equivalent.
- Retain the intended restore target separately from transient displayed times.
- Do not persist playback-position changes until restoration has completed and the requested positions are acknowledged sufficiently by both player adapters.
- Do not treat requested currentTime values or elapsed timeout as native seek confirmation.
- A load error, delayed side B, retry or changing media must not overwrite the last good saved position with zero.
- Pair switching, A/B swap, review-set candidate changes and cancelled realignment must restore the correct pair's anchors, position and transforms.
- Replace the one-time global restoration boolean if it cannot handle pair changes.
- Persist single-video session position and make its save/resume policy explicit. Do not silently lose an imported single-video session or leak its managed copy.
- Coordinate revision acknowledgements without overwriting edits made while autosave is in flight.

Acceptance matrix: +1.25, negative, zero and near-end relative positions; A-first/B-first readiness; slow side; failed/retried source; switch B and back; swap; reopen; conflict; single video. Before readiness, persisted position remains unchanged. Restore paused, without autoplay. Test the actual restoration/save integration, not only relative-time arithmetic.

## 8. F03 — Resume buffering at the current common position

Review location: `native/src/compare/ui/transport-hook.ts` and its transport-state integration.

Confirmed mock-player reproduction: start at 0s, advance A/B to 5s, make B load, then ready. Both seek back to 0s because the stored seek target is still the old play-start target.

Required correction:

- Separate requested seek target, confirmed common position and buffering-resume target.
- Capture the current valid common position upon entering buffering, before any callbacks mutate it.
- Resume from that captured point after both sides are ready and seeking is confirmed.
- Pause, background, close, source replacement and user seek must invalidate stale intent/generation. No late callback may restart playback after those actions.
- Handle event-order variations (`playingChange` before/after `statusChange`) without accidental rewinds or losing user pause intent.
- Work correctly with loops, normalized time mapping and unequal source lengths.
- Review drift-correction seeks and the 500ms loading suppression so a genuinely buffering side cannot silently leave the other playing.

Acceptance: buffer at 5s and resume there; repeated buffering; buffer immediately after correction; pause while buffering; B replaced while waiting; source error; background; loop boundary; different anchors. Exercise the real transport hook/adapter integration in addition to reducer tests.

## 9. F05 — Separate relative loops from absolute trim ranges

Review location: `native/src/compare/doc.ts`, shared `range` parser and `parsePair`.

Confirmed reproduction: `loop={start:-1,end:1}` survives in memory but becomes null after serialize/parse because the absolute-range parser requires start >= 0.

Correction: define explicit parsers/types for absolute source time and signed relative time. Validate finite bounds, order and intersection with the pair's valid range. Do not accept malformed or out-of-range loops merely to preserve negative values. Reconcile loop position on anchor/trim/source changes without silently shifting the meaning.

Acceptance: all-negative, crossing-zero and positive loops round-trip; invalid/NaN/reversed values fail safely; realignment and trimming preserve or explicitly reset valid loop state. Test actual document persistence plus resumed playback.

## 10. F07 — Complete one-source-to-two-source selection

Review locations: `native/src/app/pitch/compare.tsx` StartPicker, Workbench pick stage and `native/src/compare/store.ts` imports.

The initial picker offers Photos/capture, but later B selection opens only VideoGallery. Imported comparison-only files are intentionally absent from the global gallery. A new user who imports one video cannot then add a second from Photos. Independent A replacement and source relinking are also incomplete.

Required correction:

- Reuse one source-selection workflow for initial A/B selection, adding B, replacing A, replacing B and relinking a missing source.
- Offer existing app videos, sources already in the current document, Photos, capture and Files where actually supported.
- Keep a useful single-video view, then allow B addition without creating records or uploading media.
- On cancellation restore the original pair, annotations, anchors, position and transforms. Do not mutate the active comparison prematurely.
- Support same-file two-view comparison intentionally, with independent view state.
- Track temporary managed-copy ownership until document adoption. Handle partial import success, cancellation, screen exit, account change, low storage and stale async results without leaks or cross-account data exposure.
- Provide loading/error/retry states and clear permission recovery. Recheck actual installed capture/file modules before adding dependencies. A package may be needed for Files; do not describe dependency work as an inherently impossible feature.
- Keep old record/detail/mechanics/deep-link callers and caller-aware back behavior working.

Acceptance: zero app-library videos → Photos A → open → Photos B → align → play → close → recent resume. Also capture A/capture B, app A/Photos B, A replacement, B replacement/cancel, existing-source selection, missing-source relink, same asset twice and failed/account-switched import. Use isolated fixtures; native picker behavior remains a separate physical-device verification item.

## 11. F08 — Resolve interaction and analysis-quality risks

These are source-identified risks and gaps, not all confirmed physical-device failures. Inspect, implement and test them without inventing runtime evidence.

1. **Drawing and scrolling:** the current parent `scrollEnabled={!drawing}` can freeze the page at the tool panel below the video. Coordinate scrolling only during a captured drawing gesture, or keep the video and essential tools reachable through a suitable fixed/contextual toolbar. Keyboard/modal actions and exits must remain reachable.
2. **One measured layout boundary:** the current pane calculation uses a 1000px ceiling while READABLE caps the actual container at 720. Use the actual available container's onLayout dimensions, safe areas and font scale. Test iPad, split windows and rotation. Persist view transforms independently of stale screen-pixel geometry, or normalize/remap pan correctly on resize.
3. **Normalized playback:** restrict the valid transport range to the confirmed matching event domain; avoid clamping B to a terminal event while A keeps advancing. Validate monotonic anchors and supported speed ratios, and disclose time warping throughout. Test seeks, loops, buffering and mode switches. Ordinary offset comparison remains the default.
4. **Truthful metrics:** do not label p95 drift as the maximum. Separate callback-derived estimates from actual decoded-frame synchronization. Unknown capture timing does not justify a physical timing comparison.
5. **Transform restoration:** audit live view overrides, A/B swaps, pair switching, linked zoom and reset so stale transient transforms do not override saved pair state.
6. **Basic-screen simplicity:** keep video, shared transport, speed and alignment easy to reach. Group detailed drawing/event/measurement/note tools contextually. Avoid numerous permanently expanded chips and technical status explanations crowding the main view.
7. **Accessibility:** scalable labels, >=44pt targets, no color-only state, reachable sheets with keyboard, meaningful VoiceOver values, light/dark/navy and reduced motion. Do not use font-scale caps or clipping as a density repair.

Code/layout tests: 320/375/390/430pt, landscape, iPad/split windows and large text. Mock or RN Web checks must be labeled as such and must not launch Metro. Real device verification remains explicitly pending where unavailable.

## 12. Remaining original feature work must stay visible

After the reliability and first-use corrections, continue the original R01–R42 roadmap in this dependency order:

1. **Analysis workflow:** usable per-source trim, spatial-registration UI, editable annotation handles, reference/source filtering, duplicate/relink UI and robust review-set navigation.
2. **Precise media facts:** PTS/frame stepping, orientation, codec and piecewise edited slow-motion capture mapping. Inspect existing native capture/local-file modules and SDK support first. Do not infer capture time from nominal FPS alone.
3. **Useful outputs:** actual annotated stills/storyboards, voice notes, composed comparison video, narrated analysis preserving pauses/seeks/speeds/drawings and native sharing. Planning an export is not exporting a file.
4. **Evidence links:** persist real 3D/velocity/pitch-log references with provenance, timestamps, units, confidence/definition versions and existing consent/permissions.
5. **Library/team services:** authorized offline/cloud synchronization, conflict handling, deletion semantics, playlists/comments, coach review and selectable 4+ view documents.
6. **Advanced capture/assistance:** paired-device replay, supported external camera protocols and user-confirmed event suggestions.

Keep every unresolved R ID in the ledger. Do not silently delete scope or claim all 42 are complete after repairing the core. If a specific external dependency or approved schema action is required, prepare the concrete reviewable proposal, finish independent work, and state the blocker accurately. Do not stop merely because an optional package is not yet installed.

For composed media/narration use real decoded video pixels and a real audio/presentation timeline. A blank native video surface in a view screenshot, a microphone-only recording over unrelated playback, or a success toast without a file does not satisfy the requirement. Verify output contents where runnable under the user's tooling restrictions.

## 13. Work sequence for this execution

1. Record current commit/git state, read the documents and reproduce the findings. Create an F01–F08 remediation checklist linked to the existing R ledger.
2. Correct F01/F04/F06 together as a reviewed storage-safety slice, with injected-failure/concurrency tests.
3. Correct F02/F03/F05 as a restoration/transport slice, using actual hook/adapter integration tests.
4. Correct F07 and complete single→pair import/replace/cancel flows.
5. Address F08 layout/interaction/normalized-mode issues and shared-consumer regressions.
6. Run applicable checks and update evidence, then continue remaining original features in the order above. Keep unresolved requirements explicit.

If work spans compactions, save precise continuation state: completed F/R IDs, changed files, tests, unresolved blockers and the exact next action. Do not lose outstanding items when summarizing.

## 14. Verification contract

Use synthetic fixtures, injected adapters and local temporary storage only. New tests should assert user-visible invariants and data preservation, not implementation strings.

Minimum checks, after inspecting scripts:

```bash
npm run native-compare:test
npm run my-videos:test
npm run release-access:test
npx tsc --noEmit -p native/tsconfig.json
```

Run changed-file native lint and any newly relevant navigation/import/account tests. Record actual exit codes and current diagnostics. If checks cannot run because of installation/toolchain issues, identify the exact condition and separate it from product defects. Do not claim all checks pass when a command failed.

For each F item report: baseline reproduction, changed paths, desired invariant, failing-before/passing-after test, residual native/runtime limits. Storage tests must exercise the real filesystem adapter where feasible with local disposable files, not production data; keep failure-injection tests at the injectable layer as well.

Prepare a physical-device checklist for the user covering small/standard phones, rotation/large text, Photos/Files/camera permissions, real decoder drift, interruption/reconnect, source replacement, resume and export. **Do not run simulator or Metro to execute it.** No fabricated screenshots or claims that static/type tests prove visual quality.

## 15. Final delivery

Report in Korean:

- What was actually corrected and which first-use/resume scenarios now work at the verified level.
- A table for F01–F08: fixed, partially fixed, not applicable with evidence, or unresolved with a concrete reason.
- Updated R01–R42 ledger and remaining feature work.
- Changed files, tests/exit results, genuine output artifacts and verified vs unverified environments.
- Exact manual physical-device checks still needed.
- Any required native binary or schema decisions, with concrete proposals prepared first.
- Whether commit/push/deployment occurred; no publication without the user's separate request.

Do not call the feature reliable while referenced-copy deletion, position loss, buffering rewind or blocked second-video selection remains. Begin with the first storage-safety correction now.
