# INTAKE-GUIDE-PLAYER-R10 — delivery and verification

2026-11-16 · GPT05 영상 공유 · base `bdaf74b4dc8b5daaa3b3beee3ea1a236fe474467`.

The user explicitly requested direct implementation and production release: replace native tutorial controls with our player, autoplay, pause/play, seek, fullscreen, larger correctly proportioned video, no vertical scrolling, simpler presentation, and removal of the iOS-version note. This continues the user-authorized direct-GPT implementation exception. Final integration/release review remains with the main GPT.

## Delivered behavior

- Both in-flow preparation and the optional original-file help use `GuidePlayer`. Only pause/play, a draggable native range input, and fullscreen are shown. Videos start muted and inline. A rejected autoplay attempt leaves a usable play button. Ended playback never advances the form.
- Fullscreen uses the wrapper API when available and the same full-viewport custom player when unsupported. The video element is preserved during expansion; custom controls, seek position, Escape, and keyboard focus handling remain available. Scrubbing captures the pointer and resumes only if the recording was playing before the drag. Manual pause is respected across help/visibility changes.
- Hidden/page-away/unmounted tutorials pause. Help opening pauses the active tutorial. Load failure gives readable instructions and retry without blocking Next. Submitted originals and their preview/upload path are not autoplayed or transformed by this component.
- Preparation allocates the remaining viewport to the player, with one short instruction and one primary action. Help and shortcuts are grouped in the header help. At 375×667 the tutorial picture is about 409px high, versus about 260px in R09 (about 57% more height), with Next inside the viewport.
- Only the external intake route locks document scrolling. It follows visualViewport height/offset for address-bar and keyboard changes, and restores document styles when leaving. Screens, help, and terms use explicit previous/next content pages when they overflow. Natural field/block boundaries and final-page padding avoid cut-off input fields. Focus into a later field displays its page. Text is not discarded to achieve the layout.
- The published-result wrapper includes its notice, result, and footer in the same paging boundary so consent withdrawal/result-return actions remain reachable. `ResultBody`, the administrator preview, and the 3D engine are unchanged. The existing safe-area marker is preserved.
- The iOS-version footnote is removed; the useful iCloud download note remains. Existing name/PIN, consent answers, 120fps validation, file picker policy, hash checks, TUS upload, receipt, record management, DB, and native app contracts are unchanged.

## Replaced export tutorial

The old `02-export-original` was physically cropped to 590×328. The user supplied the full original recording folders during this task. A new video-only excerpt from the supplied unmodified recording is published at:

- `/intake-guides/original-file-v3/02-export-original.mp4`
- `/intake-guides/original-file-v3/02-export-original.jpg`

The excerpt preserves the full 1180×2556 frame and its aspect ratio. It shows the complete share menu, highlights the unmodified-export row, and begins the transition to Files. No hidden screen content was fabricated. Contact/device suggestions and the underlying Photos location heading are covered by opaque masks. Only tutorial media was edited; no submitted original was processed.

Final media audit: 3.45 seconds, 209 decoded frames, zero audio tracks, zero asset metadata. All 209 frames were OCR checked for the source contact/location labels, with **zero matches**. The contact mask was sampled at 111188 pixels across all frames; every sampled RGB channel was 21. The source and private QA frames remain outside the public repository.

| Asset | SHA-256 |
| --- | --- |
| MP4 | `b99e58c7e15d63c8e7d48ed5e1e6b0894aea6102ce0a6e1ac41575085d304cc7` |
| JPEG | `cc6a329b712990be5a52808495b385db599badfd74c8c3c146efcde12574629e` |

## Verification

Commands completed with exit 0 in the exclusive release checkout:

| Check | Result / log |
| --- | --- |
| `npm run intake:client-test` | 236 passed · `/tmp/r10-client-final.log` |
| Preparation selftest | 38 passed · `/tmp/r10-preparation.log` |
| `npm run intake:public-test` | 176 passed · `/tmp/r10-public.log` |
| `npm run intake:transfer-test` | 241 passed · `/tmp/r10-transfer.log` |
| `npm run intake:invitee-test` | 292 passed · `/tmp/r10-invitee.log` |
| `npx tsc --noEmit --incremental false` | no diagnostics · `/tmp/r10-types-final.log` |
| Scoped ESLint | no diagnostics · `/tmp/r10-lint-final.log` |
| `npx next build` | passed · `/tmp/r10-build-final.log` |
| `git diff --check` | passed |
| AVFoundation/Vision final media audit | passed · `/tmp/r10-media-export.log`, `/tmp/r10-media-privacy.log` |

The build was called directly; migration/build-wrapper commands, dependencies, schema, and operating configuration were not changed. Existing Node harness deprecation/module warnings remain unrelated.

Browser evidence used the real IntakeFlow, client inspection, and upload-run/TUS against an isolated local API and byte receiver. No real invitation, production object, DB row, legal agreement, or credential was created.

- Muted autoplay, controls=false, natural 1180×2556 dimensions of the v3 file, contain fit, single active tutorial, play/pause, pointer-drag seek to 6.31s while staying paused, keyboard seeking, fullscreen custom controls/return, and failed-source fallback were observed.
- At 375×667 and 320×568, guide controls and Next/file picker remain on-screen. Document height equals the viewport. At 320×480, enrollment becomes two content pages; the full PIN-confirm input and primary action remain reachable. Tab moves into the correct page. A wheel gesture changes neither document scroll nor the active content page.
- In the isolated fixture, actual side/rear file chooser selections, review questions, terms opening (which did not itself grant consent), explicit send, actual PATCH bytes, verification, and receipt passed. Two different 240fps MOV parser/transport fixtures, 524752 bytes each, had identical selected/received SHA-256 values. A 59.94fps file stayed blocked. These files are test fixtures, not evidence of camera provenance.
- After the final media/header change, the actual guide stages 1→2(v3)→3→4→real chooser→selected-file confirmation were rechecked. No tutorial ending advances a stage automatically.
- 1280×800 was checked. Physical iPhone Photos/Files/Safari interaction, native OS fullscreen, physical software keyboard behavior, arbitrary zoom/font settings and every 3D-result state were not exercised. The existing native document-picker policy was not changed. The prior browser tool limitation on simulating chooser cancel remains.

Private evidence: `/Users/yuno/bullpen-intake-player-r10-evidence/guide-mobile-final.png`, `export-mobile-final.png`, `transfer-proof.json`; raw frames and contact sheets in the same private directory must not be published.

## Release follow-through

The exact source commit is to be reviewed by the main GPT, integrated without unrelated dirty work, and released under the user's explicit instruction. Verify the deployed commit/status, actual served client markers, v3 MP4/JPEG responses and hashes, and local 3000 response. A successful web deployment is not a physical-device claim. The final production result belongs in the release/HANDOFF record.
