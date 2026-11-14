# INTAKE-FILE-GUIDE-R08 — File-first original collection and private video guide

## Assignment

- v1, 2026-11-14. User confirmed unmodified export works and explicitly requested file selection as the default, other acquisition methods blocked, private contact information masked in supplied recordings, and an easy chaptered guide integrated in the product.
- Implementer: existing MacBook Claude05 `local_9ce3d4e4-ff2b-4f88-bb3d-bd109907f9b1`. Begin now. GPT05 owns guide media sanitization/design and independent review. Preserve Mac mini final review authority and other sessions' changes.
- Work in `/Users/yuno/Developer/bullpen-log`, on top of current uncommitted R07 corrections. Do not reset, switch the shared branch or include unrelated player/review/dummy/design edits.
- Scope is intake UI/picker, its guide assets and meaningful tests. No DB, auth/consent/retention changes, new dependencies or native builds. Product push is handled by GPT only after review under the user's existing request to review and upload matching work. Do not push yourself.

## English implementation order

Read AGENTS/CLAUDE/WORKFLOW/SESSION_COORDINATION and installed Next.js video/public-asset docs. Run session-guard check and claim exact code/test files. Read the current R07 diff, not just the original committed baseline. Implement the following change now.

### File-first picker

1. Every intake-owned picker (initial side/rear, replacement, correction and retry) must follow the same document/file acquisition policy. Remove user-facing Photos/camera, AirDrop, Current-format selection or generic acquisition-route alternatives from the original-upload guide. Capture guidance is separate and remains available.
2. On iOS Safari/WKWebView, use a document-oriented MIME policy which maps to UTTypeData without adding image/video MIME types or their recognized extensions. Investigate `accept="application/octet-stream"`: current WebKit maps this to public.data and skips the Photos/camera action sheet when accepted types do not conform to image/movie. Native UniformTypeIdentifiers independently confirms movie conforms to data while data itself does not conform to image/movie. Do not add `video/*` or `.mov` alongside it on iOS, which would re-enable media-picker classification. Verify the actual behavior as far as available; static source evidence is not a physical-device test.
3. Preserve usable desktop/Android document selection. If they need platform-specific filtering, isolate it in a small testable intake helper and cover iPad desktop-style user agents. Do not make genuine MOV/MP4 files unselectable or use the known broken `*/*` trick. Do not re-enable Photos as an automatic fallback. Keep server/content-based supported-container, size, hash, pair and >=120fps gates unchanged: a broad document MIME is a selection policy, not permission to accept arbitrary file content.
4. Prefer button label `파일에서 원본 선택` (and consistent replace wording). Give a concise instruction that the original must already be saved in Files. User-facing instructions must match actual button labels. A web File does not prove its provider or camera provenance; do not implement a fake client flag claiming security-grade origin enforcement.

### Four-chapter original preparation guide

The user provided actual recordings, and GPT will produce privacy-reviewed, muted, metadata-stripped MP4s and posters at:

`public/intake-guides/original-file-v1/01-open-share.mp4` (+ `.jpg` poster)
`public/intake-guides/original-file-v1/02-export-original.mp4` (+ `.jpg`)
`public/intake-guides/original-file-v1/03-save-files.mp4` (+ `.jpg`)
`public/intake-guides/original-file-v1/04-pick-file.mp4` (+ `.jpg`)

Only those sanitized outputs may be used. Never copy the source recordings, unmasked screenshots, sidecars, names, private locations, invitation URLs or test assets into public/repository paths. GPT owns these media paths; claim code, not media files.

Build one reusable guide inside the existing intake UI, not a new app:

1. **사진에서 공유 열기** — choose the recorded video in Photos and tap Share.
2. **무수정 원본 내보내기** — scroll the Share actions and tap the actual device wording. The recording says `무수정 원본 내보내기`; a short note may mention other OS versions say `수정되지 않은 원본 내보내기`. Do not teach All Photos Data, Current or normal Save to Files as prerequisites; the essential action is unmodified export.
3. **파일 앱에 저장하기** — choose an easy-to-find local folder (the recording uses a sample folder); remember its location and tap Save. Folder creation is optional; never force a particular folder name. iCloud must finish downloading before selection.
4. **접수 화면에서 파일 고르기** — return to the same invitation, use `파일에서 원본 선택`, pick the exported MOV from Files, confirm the detected rate and proceed. State clearly that no preview is required for HEVC originals. The recorded final page is an older visual version, so preserve accurate narration and avoid claiming it exactly matches new labels.

Use a single active chapter with visible numbered navigation and Previous/Next actions, a short task title, one/two plain Korean action sentences, and the relevant portrait video. Text instructions must remain fully usable if video fails. Do not autoplay all clips, require watching to the end, or treat pressing Next as a consent/verification action. Native accessible video controls, playsInline, preload=none/metadata and a poster; no forced fullscreen. Pause/reset the active clip on chapter change, guide close, screen departure or page hiding. Do not let hidden videos continue playing. Size the portrait player so text/actions remain reachable on a 375×667 phone; expanded details/large text may scroll normally. The video is supplemental, and file selection must remain reachable for someone whose original is already prepared.

Show an inviting `원본 저장 방법 보기` action at initial selection and recovery; replace the long mandatory wall of text with a concise overview and the chaptered guide. Avoid accidentally requiring the same four chapters separately for each file. Preserve both selections and entered data when opening/closing help. Original-guide help currently used in correction/status must show the same policy and chapters.

### Acceptance and delivery

- A single consistent document-first policy reaches every intake FileButton consumer; no old route selector or Photos/camera recommendation remains.
- Valid 120/239.76/240 MOV/MP4 remains accepted; low/unknown/non-video/oversize/same-pair rules remain accurate and enforced. Preserve R07 diagnostics and File-identity-safe hashing corrections.
- Four real sanitized clips and posters resolve locally; guide controls, chapter transitions, failure fallback, close/pause and accessible text work at phone/desktop sizes. Test opening help while a valid file is selected and after a failed replacement.
- Do not claim actual iPhone chooser behavior tested from source/DOM tests alone. List physical checks pending. The user has supplied physical evidence of unmodified-export -> Files -> selection displaying ~240fps; that does not independently establish admin-download byte identity.
- Run appropriate core/client and picker/guide behavior tests, scoped lint and type checks. No npm run build (production DB). Report exact changes, commands/exit codes, source/diff, privacy asset integration, remaining physical checks and limits in Korean. Do not deploy or claim completion while assets are missing.

## Evidence

- User supplied two guide recordings and confirmed unmodified export succeeds. Private source paths are exchanged only locally, not recorded here.
- [WebKit file upload source](https://github.com/WebKit/WebKit/blob/main/Source/WebKit/UIProcess/ios/forms/WKFileUploadPanel.mm): accepted UTI -> media-picker options and document-picker branch; generic data MIME is a file-selection strategy, not a universal provider-provenance guarantee.
- Local Swift UniformTypeIdentifiers probe: octetStreamUTI public.data, movie conforms to data, data conforms to neither image nor movie.

## Delivery record

Dispatched to the existing MacBook Claude05 chat and implementation start observed. Initial delivery received; GPT requested provenance-neutral instructional wording and real-asset playback/lifecycle verification. Product review/release remains pending.

GPT media delivery: four muted MP4 chapters and four JPEG posters copied to the exact public paths above, 8,131,140 bytes total. Chapter 02 is cropped to 590×328 to enlarge the correct export action, with a blue outline; the others are 590×1278. Contact suggestions are covered before their appearance or excluded by the crop. The location/date heading in Photos is also covered. Exported assets have one video track, zero audio tracks and no asset/common metadata. All 1,900 frames decode; OCR inspected all 529 frames of chapters 01/02 and 44 sampled frames elsewhere. All 143,886 sampled pixels in the continuous privacy masks matched the opaque fill, with zero outliers. OCR found no source location/date heading in the outputs. Raw recordings, private QA images and OCR text remain outside the repository.
