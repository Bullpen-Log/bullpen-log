# INTAKE-ORIGINAL-R07 — Reliable acquisition of original high-frame-rate videos

## Status and ownership

- Revision: v2, 14 November 2026 (Asia/Seoul). v2 assigns immediate web implementation to MacBook Claude 05 under the user's direct instruction.
- Status: Claude web delivery and three GPT-requested corrections reviewed; independent core/client/lint checks pass. Overall acceptance and product release withheld pending real-original acquisition evidence (AC01/02/07). Phases A/B and evidence-backed, in-scope C fixes are authorized now. Native Phase D and the proposed unknown-rate upload behavior require a separate scoped decision.
- Requested deliverable: the user asked for root-cause analysis, a correction plan, and a detailed English implementation prompt after a reported 240fps upload failure.
- GPT design/review owner: MacBook video-sharing support session `01a1c31b-e186-76c2-bc94-3f61553b3506`.
- Implementation owner: `맥북 · 05 · 영상 공유 · Claude`, session `local_9ce3d4e4-ff2b-4f88-bb3d-bd109907f9b1`. User directly instructed this GPT to hand over the order and have this MacBook Claude start immediately. Existing Mac mini ownership outside this scoped correction is preserved; coordinate overlapping edits rather than duplicating them.
- Final design/integration/review owner: the existing Mac mini GPT overall lead and its video-sharing GPT.
- Source inspected: `/Users/yuno/Developer/bullpen-log`, `main`, HEAD `e58bc55fc3d8cff1232d8e09f201b217ad90122d`; includes intake R04/R06 and handoff `bfd82a2a`.
- Authorization: the latest direct user instruction is “맥북 클로드 영상 공유 담당에게 넘겨서 바로 작업지시해.” This authorizes this correction's local web implementation, appropriate isolated checks, and delivery for GPT review. Product changes at dispatch: none. Deployment/DB authorization: none. Original incident file: not supplied; the supplied file is a screen recording of the incident, not the selected camera video.
- Existing unrelated local changes: AGENTS, exercise-video player/review records, market dummy and desktop design work. Preserve them.

## English implementation prompt

You are MacBook Claude 05, assigned directly by the user to implement this scoped Sinker intake correction now. The previous preparation-only restriction and the v1 draft waiting-for-assignment text are superseded for this order. Start Phases A/B immediately and implement demonstrated, in-scope Phase C corrections. If a physical device or camera original is unavailable, continue independent diagnostics, recovery UI and isolated checks; report real-device acceptance as pending. Do not wait for a new routine implementation permission. Pause only overlapping files or genuinely out-of-scope decisions; preserve Mac mini final review authority. Read AGENTS.md, CLAUDE.md, docs/WORKFLOW.md, docs/SESSION_COORDINATION.md, the latest HANDOFF, and this entire order. Run session-guard check with your real session ID, reread current source/diffs, and claim exact files before editing. Read the relevant installed Next.js guide before changing Next.js code. Preserve other sessions' work and the existing intake implementation. This order does not authorize deployment, shared production DB changes, dependency installation, or native builds. Use the current suitable local checkout at `/Users/yuno/Developer/bullpen-log` after checking its current source and claims; do not reset/switch it or pull over active unrelated edits. The order can be read at its full absolute path in this GPT's document checkout. Do not implement against the obsolete pre-integration intake branch.

### 1. User problem and required outcome

The owner recorded a video at 240fps, opened the invitation in iPhone Safari, selected the video through Photos Library, and was told that the video was recorded below 120fps. The owner cannot complete a genuine-original submission through the current experience.

Deliver a supported, actually tested route from an available original asset to the administrator's original download, with its bytes preserved. Valid 120/119.88fps and 240/239.76fps assets must work. A low-rate exported representation must lead to original recovery, not a false assertion about how the camera recorded the source. An unreadable timing table must not be described as proven low capture rate.

Keep these separate in code, diagnostics and copy:

1. **Acquisition:** what representation Photos or a file provider supplies to the browser/app.
2. **File suitability:** what sample timing and media structure can be established from that file.
3. **Transport integrity:** whether the acquired file, stored object and admin download have identical bytes.
4. **Provenance:** whether the acquisition route obtained the original asset resource. High fps, HEVC, a MOV extension, a filename or Apple metadata alone cannot establish this.

No website can reconstruct frames already discarded by an export or fetch a private Photos original using only a converted browser File. The product must provide a usable original-acquisition route and accurately disclose unsupported situations. Do not claim an unconditional camera-authenticity guarantee for arbitrary user files or unavailable/deleted originals.

### 2. Facts established before this order

**Incident evidence, observed in the owner's 42.7-second screen recording:**

- The user confirmed iPhone Safari -> Photos Library.
- Approximately 5 seconds: the system chooser offers Photos Library, camera capture, and Choose File under the current video selector.
- Approximately 16–19 seconds: the media picker options show Full Size and Automatic format checked. Current is available but is not selected in the inspected frames. The visible options do not contain All Photos Data.
- Approximately 37–41 seconds: the intake side-video selection step shows the existing `capture_rate_low` text, asserting that the video was recorded below 120fps. No intake upload-progress screen appears before that error in the recording.
- The recording does not reveal the selected File's bytes, actual sample timing, browser-delivered fps, or the original asset's structure. Do not label conversion, a particular received fps, or a parser bug as conclusively reproduced from this recording alone.

**Current source:**

- `components/intake/slots.tsx`: FileButton uses a standard file input with `accept='video/*,.mov,.mp4,.m4v'`. It offers no PhotoKit original-resource control.
- `components/intake/pick.ts`: inspectPick calls readIntakeMediaFacts and captureRateCode before retaining the selection. Low or unknown rate returns an error; this can block before storage transfer.
- `lib/intake/media.ts`: minimum 120fps, effective threshold 119.82, not an equality-to-120 rule. Uses `stts` sample timing and `mdhd` timescale, recognizes edit-list retiming, and accepts 240fps. Variable-timing files additionally require average fps above the floor.
- `lib/intake/service.ts`: verifyAsset independently repeats rate validation; finalizeSubmission also checks applicable verified assets. A frontend-only bypass cannot fix server rejection.
- `components/intake/guides.tsx`: original export and AirDrop help already exist, but are secondary help rather than a demonstrated primary acquisition journey. Do not deliver the existing guide again and call the issue resolved.
- `native/src/pitch/attach.ts` has a separate picker configured with Current representation. This is not the public Safari intake picker and is not evidence that public intake obtains originals.
- `readIntakeMediaFacts` bounds top-level boxes to 64 and moov to 16 MiB, reads ordinary sample tables, and selects the first video track. Inspect supported/unsupported shapes rather than assuming every genuine MOV can be read.

**Read-only local probe actually run, exit 0:** production readIntakeMediaFacts/captureRateCode plus existing synthetic MOV fixtures accepted 240fps, 239.76023976fps, and 240fps with a slow-motion edit list. A 30fps fixture returned capture_rate_low; absent sample timing returned capture_rate_unknown. These five cases demonstrate classifier behavior, not successful real iPhone acquisition, decoding, network upload or provenance.

**Working diagnosis:** Photos-to-browser representation conversion under Automatic is a leading explanation consistent with the observed route. Incorrect or unsupported parsing remains an alternative until the actual rejected File is compared with the original. The confirmed product defect is that the journey can reject at selection without providing a proven original acquisition path or a measured, recoverable explanation.

### 3. Phase A — Obtain decisive evidence

Before changing the acceptance threshold, compare the SAME camera asset through these routes on the affected physical iPhone, recording the real device/OS/browser versions and deployed source ref:

| Route | Comparison required |
|---|---|
| Safari -> Photos -> Automatic | Reproduce the reported failure; inspect the File actually handed to JavaScript. |
| Safari -> Photos -> Current | Measure whether this specific route preserves the original; do not assume it does. |
| Photos -> Export Unmodified Originals -> Files -> Safari Choose File | Preferred browser-only route; test the destinations actually available on the device. |
| Photos on Mac -> Export Unmodified Original -> browser file selection | Independent original reference and desktop fallback. |
| AirDrop with All Photos Data, when applicable | Optional fallback; identify the original movie among any related resources. |

For each acquired file record privately: safe route label, container/codec, byte count, hash, video-track count, selected-track identity, sample count, timescale, sample-duration distribution, modal/average rate, media duration, presentation duration, edit-list facts, parser outcome, and rejection stage/code. Compare with a trusted independent media probe if available. Explain differences between r_frame_rate, avg_frame_rate, sample timing and presentation duration; a single probe field is not capture truth.

Add bounded local diagnostics available after selection failure. Compute expensive full-file hashes only on explicit diagnosis or normal send, not repeatedly on render. Never log invitation URLs/tokens, names, precise locations, filenames, credentials, original files or full metadata dumps publicly. Browser rejection must expose a safe reason and detected rate when known. No new production telemetry collector is needed.

The screen recording is private evidence. Do not commit it, its screenshots, identifying thumbnail grids or extracted metadata. Do not analyze the recording's own fps as the failed asset's fps. If the actual original or rejected File cannot be obtained, explicitly leave the incident mechanism unconfirmed while continuing the supported-route work.

### 4. Phase B — Correct the browser original-acquisition journey

Use **export original -> select a file** as the recommended iPhone path, subject to physical-device verification:

1. Photos -> select the video -> Share -> Export Unmodified Originals -> choose an available Files destination -> Save.
2. Return to the SAME invitation; preserve entered identity, consent progress and the other video selection as appropriate.
3. Choose the exported original through the Files/document route, not the Photos picker again.
4. Read file facts without transcoding; clearly show detected file fps and separate file duration from slow-motion playback duration where relevant.
5. Upload those bytes through the existing resumable transport and verify them on the server.

Apple currently documents a Files destination for this export, including iCloud Drive, while another official export guide describes external storage. Verify the actual target OS. Do not make an external drive or Mac mandatory if the affected iPhone supports exporting directly to Files. If the option/destination is unavailable, show an honest fallback: Mac Photos unmodified export, iCloud unmodified-original download where available, or the separately approved native original-resource path.

Design the side/rear selection UI around two clear actions such as `원본 준비 방법` and `준비한 원본 파일 선택`. Explain the exact Files choice before opening the system UI. Preserve the two-view requirements and access without member signup. Decide from device evidence whether a separate generic document-oriented input improves this route. HTML accept, multiple, filename changes or MIME changes are not a cross-version original-guarantee switch. Server byte validation remains necessary if accept is broadened. Do not invent the ability to programmatically force the Safari Files provider or enable All Photos Data from JavaScript.

Photos-direct selection may remain a secondary convenience path only with truthful guidance and recovery. Current means avoiding format conversion where possible; it does not by itself prove an unmodified camera original. All Photos Data belongs to supported sharing routes such as AirDrop, not a toggle the website can enable inside its picker.

On a low-rate selection, replace the accusation about camera recording with file-specific evidence. Example, only when 30fps was actually measured:

`선택한 파일에서는 30fps가 확인됩니다. 사진 선택 과정에서 변환된 파일일 수 있습니다. 240fps로 촬영했다면 수정되지 않은 원본을 파일 앱에 저장한 뒤 다시 선택해 주세요.`

Provide immediate actions to open original preparation or choose the prepared file. Do not present reshooting as the only solution when the high-rate original may still exist. Unknown fps must have a distinct explanation. Never fabricate a detected rate or assert that conversion definitely happened.

### 5. Phase C — Fix only demonstrated media-classification faults

Maintain minimum-rate eligibility; do not solve acquisition loss by accepting every 30/60fps file, trusting a 240fps filename/checkbox, increasing displayed fps, retiming, frame interpolation, re-encoding or remuxing originals.

If an independently obtained genuine original fails, reproduce it against both client and server. Audit:

- sample timing versus presentation/edit-list timing;
- fractional 119.88/239.76 rates and integer timestamp quantization;
- variable timing, dropped frames and the current modal-versus-average requirement;
- aggregation of repeated sample-duration runs, multi-video-track selection, truncated tables, integer overflow and read limits;
- fragmented or otherwise unsupported MOV/MP4 layouts, without removing bounds or guessing rate from names;
- shared classifier/version parity across inspectPick, verifyAsset and finalizeSubmission.

Add a minimal, privacy-safe structural fixture for each proved parser fault. Retain bounds on untrusted files. If wider parser or dependency support is required, present the smallest supported design and its runtime cost to the lead first.

**Proposed unknown-rate treatment, requiring lead confirmation before changing current behavior:** allow a plausibly supported, size-bounded MOV/MP4 to be transferred unchanged for investigation when local timing is unknown, without claiming it is suitable. Server inability to establish timing should preserve integrity-checked bytes as unconfirmed/needs_attention, not promote them to verified. Reuse existing unconfirmed machinery where sound; verify all finalization, download, correction, retention and UI effects. Both automatic analysis and manual-result import/publication must remain blocked unless their existing eligibility requirements are satisfied. Known low-rate files still lead to original recovery. Prove this does not become an unrestricted public upload path or a new retention policy. If this requires schema or contract changes, stop that phase and obtain a scoped decision.

### 6. Phase D — Controlled native acquisition if required

If the user requires selecting directly from Photos inside Sinker without the export step, design a narrow native-original path. This is a separate phase requiring explicit assignment of native files and acceptance of the new-build/distribution impact; do not implement it silently under the web fix.

- Resolve the selected PHAsset under actual Photos permissions, including limited access. Do not silently fall back to an edited picker representation when asset access is unavailable.
- Enumerate PHAssetResource resources and retrieve the original video resource using PHAssetResourceManager. Apple's `.video` is original video data; `.fullSizeVideo` is modified data despite its name. Do not choose the first resource or assume “full size” means original.
- Stream/write the resource to an app-owned file with cloud-download progress, network permission, cancellation, disk-space checks and cleanup. Do not export via a lossy preset, render an AVComposition or load a GiB video as a base64 string.
- Current picker representation or quality=1 alone is insufficient evidence of original-resource extraction. PHVideoRequestOptions.version.original is useful for unadjusted AVAsset access, but byte-original acquisition must be demonstrated for the chosen API path.
- Integrate with the existing invitation-scoped credentials, consent, private storage, resumable transfer and hashes. Never pass file bytes through a WebView bridge; use narrowly scoped handles/tokens and origin checks if a bridge is needed.
- Preserve the public browser invitation. Requiring a member account or forcing every recipient to install Sinker is a separate product change.
- Record that this is the original stored in Photos, not proof that a third-party imported asset was captured by this camera. A missing original cannot be recreated.

### 7. Scope and invariants

Proposed web files, to be claimed and confirmed at dispatch: `components/intake/{slots,pick,guides,guided-steps,file-summary,shell,intake-flow}.tsx` or their actual `.ts` equivalents, intake-owned errors/state copy, `lib/intake/media.ts`, and relevant intake fixtures/tests. `lib/intake/service.ts` and existing state/analysis/manual-result consumers are permitted only for a reviewed server parity or unconfirmed-state change. Do not touch unrelated players, pitch imports, layout, auth, policies or shared 3D engine code without an explicit extension.

Preserve invitation/name/password security, leading-zero passwords, consent bodies/versions/hashes, administrator rights, source-pair binding, review-before-publication, existing submissions/results, immutable asset history, retention, cancellation/resume/idempotency and download access controls. Keep HEVC/MOV originals even where browser preview fails. No conversion, metadata stripping or trimming of stored originals. The downstream analysis owner must confirm correct time interpretation for 240fps/retimed originals; do not normalize the source file to satisfy the engine.

No production DB writes or test uploads to shared production storage during development unless the existing owner confirms a specific authorized test. Use isolation and fake services for code checks. Never run prisma migrate dev/db push/reset or npm run build. Package/schema/storage/region/native-config changes require their applicable approval process. No product deployment, product push or automatic job creation is authorized by this order. Existing documentation-only handoff authorization remains separate.

### 8. Acceptance criteria and evidence

| ID | Required observable result |
|---|---|
| AC01 | On the affected physical iPhone, the SAME available 240fps camera original can follow the documented primary route through successful private receipt and administrator original download. Record the actual OS/browser, route and source ref. |
| AC02 | Compare original reference -> exported/native-extracted original -> browser/app acquired bytes -> stored object -> downloaded original. Sizes and SHA-256 agree wherever these are intended to be the same file. A changed acquisition representation is identified before asserting identity. |
| AC03 | Genuine 120/119.88 and 240/239.76fps cases pass client and server suitability checks, including supported slow-motion edit-list cases. Ordinary 30/60fps exports remain ineligible and offer original recovery. |
| AC04 | The incident's low-rate branch and an unknown-rate branch have distinct, truthful errors, safe measured diagnostics and a direct recovery action. No statement infers original camera recording rate solely from an exported low-rate File. |
| AC05 | Cancel/reselect preserves the other view and entered information; iCloud unavailable/cancelled, insufficient disk space, permission denial and preview failure have usable recovery. No late transfer continues after cancellation. |
| AC06 | Any approved unconfirmed transfer remains inaccessible to analysis/manual-result acceptance/publication. Hash mismatch, unsupported/non-video input and same-file pairs are still blocked. Existing successful submissions/results remain unchanged. |
| AC07 | Test real HEVC/MOV and real local/cloud originals on the supported route; test a true low-rate control and a converted slow-motion representation. Synthetic headers, a screen recording and screenshots alone do not satisfy real-original acceptance. |
| AC08 | Browser-only recipients can use the invitation without signup. If direct native extraction is implemented, show its supported/unsupported and permission behavior, app-version requirement and actual resource type used. |

Run meaningful existing suites according to changed scope: intake core, client, transfer and server/DB/public/admin/analysis tests when affected, plus appropriate type/lint checks. Do not claim the entire suite was rerun if only selected tests ran. Use bounded parser fixtures and meaningful behavioral assertions. Include return codes, source ref, private log locations and limitations.

Release readiness requires real acquisition evidence, not just green parser tests. If the required physical device or original is unavailable, deliver the implementation and isolated evidence with AC01/02/07 explicitly pending; do not report the user's issue fixed. The lead decides any conditional release, separately from technical review.

### 9. Delivery back to GPT

Provide: (1) confirmed incident mechanism or remaining alternatives with decisive evidence; (2) before/after route and screenshots without private data; (3) exact changed files/ref and reasons; (4) parity/integrity/permission/cancel regression results; (5) real-device evidence matrix and missing checks; (6) remaining decisions, including native build impact if applicable; (7) a Korean handoff with changes, checks, unverified items and next step. GPT independently reviews; the Mac mini lead retains final approval.

Do not send the user back through the same failed Photos path with only a longer help paragraph. Deliver an actually usable route and verify the received original.

## Primary sources checked for this draft

- [Apple — Download iCloud photos and videos](https://support.apple.com/en-ie/111762): Photos Export Unmodified Originals to a Files destination; iCloud.com unmodified-original download options. Device availability must be verified.
- [Apple — Share photos and videos on iPhone](https://support.apple.com/guide/iphone/share-photos-and-videos-iphf28f17237/ios): Current format and All Photos Data in supported sharing contexts. These are not JavaScript controls.
- [Apple — Export photos and videos on Mac](https://support.apple.com/en-lamr/guide/photos/pht6e157c5f/mac): unmodified export and ordinary quality-selecting video export are different operations.
- [WebKit — 2021 video upload transcoding change](https://trac.webkit.org/timeline?authors=&daysback=4&from=2021-10-06): historical primary evidence that the system picker/browser may transcode before the website receives a file. Not proof of current affected-device behavior; do not resurrect historical multiple-attribute workarounds as guarantees.
- [Apple — preferredAssetRepresentationMode](https://developer.apple.com/la/documentation/photosui/phpickerconfiguration-c.class/preferredassetrepresentationmode): Current avoids transcoding where possible, not an unconditional unmodified-resource guarantee.
- [Apple — PHAssetResourceType.video](https://developer.apple.com/documentation/photos/phassetresourcetype/video), [fullSizeVideo](https://developer.apple.com/documentation/photos/phassetresourcetype/fullsizevideo): original versus modified video resources.
- [Apple — PHAssetResourceManager.writeData](https://developer.apple.com/documentation/photos/phassetresourcemanager/writedata(for:tofile:options:completionhandler:)): underlying resource data written to a local file, including possible cloud retrieval.

## Implementation receipt / questions / delivery

v2 dispatch evidence: the Claude UI for session `local_9ce3d4e4-ff2b-4f88-bb3d-bd109907f9b1` shows the IMPLEMENT NOW message and an active response. Its checklist marks “발주서 v2 · 현재 상태 · 겹침 확인” complete, “원본 선택 · 검증 경로 조사” in progress, and a running read of video-slot/file-summary source. This confirms receipt and investigation start, not implementation completion or acceptance. Delivery and GPT review remain pending.


## Independent review update — 14 November 2026

See `docs/reviews/intake-original-r07-2026-11-14.md`. GPT found and obtained corrections for average-rate error wording, File-identity-bound diagnostic hashing, and recovery action labels. Independently rerun core507/client211 and changed-file lint passed. User supplied private original/edited files transferred with AirDrop All Photos Data enabled; both show dominant60fps and whole-sample average45.29fps under independent inspection, so they do not establish a successful240fps-original path. Awaiting Photos asset fps and real-device acquisition/download evidence. User authorized product push **if** the order is satisfied; that condition is not met, so no product commit/push/deployment has occurred.
