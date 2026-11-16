# INTAKE-GUIDED-ORIGINAL-R09 — delivery and verification

Date: 2026-11-16. Owner: GPT05 영상 공유. Base: `b089dc42e76490e706a86669eb5a625aead41b5c`.

The user explicitly requested direct GPT implementation, end-to-end verification, and production release. This is the direct-implementation exception in `docs/WORKFLOW.md`. The main GPT owns final independent review, integration, and production deployment. This document does not claim those later actions have already happened.

## Result

Each side/rear recording has five connected stages: share in Photos, export the unmodified original, save in Files, open the actual file chooser, and confirm the selected recording. Next advances manually. Selecting a valid file advances to confirmation; it does not upload. Both recordings lead into the existing question-by-question review, explicit send action, server verification, and receipt. Android/desktop may select an existing original directly; the iPhone guide can also be selected explicitly. The existing welcome help remains optional.

Replacement from review, correction, or upload recovery uses the same preparation screens and returns to its caller. Caller components remain mounted so their unsaved fields survive. The original `File` and upload pipeline are reused; no client conversion or new upload endpoints were introduced. Existing model-consent withdrawal remains available during preparation. Authentication, consent rules, original checks, 120fps threshold, original retention, administrator management, schema and database are unchanged.

Guide position is a versioned, 24-hour, submission-ID-scoped sessionStorage hint. It contains only view, stage, route, and return destination. It never stores a token, identity, PIN, filename, file, hash or upload authorization. Invalid/expired storage is ignored; storage denial does not block the flow. Server state and actual in-memory files outrank the hint. Missing files after reload require re-selection; old review history cannot produce an empty screen or bypass selection. Correction/recovery history cannot reopen an obsolete normal intake screen.

Only the current tutorial clip mounts. Playback is manual, pauses on hidden/pagehide/unmount or alternate help, and never advances the form. Load failure offers text instructions and retry. Chapters 1–3 reuse the approved R08 redacted media. Chapter 4 is a 0–3.25-second excerpt showing only the OS Files picker; it removes the obsolete intake UI. The new public video is 590×1278, contains zero audio tracks and zero asset metadata. Its final frame at 3.20 seconds was inspected. No submitted original was edited.

## Automated checks

All commands completed with exit 0 in the exclusive release checkout.

| Command | Result | Local log |
| --- | --- | --- |
| `node --import ./scripts/alias-register.mjs scripts/intake-preparation-selftest.mts` | 38 passed | `/tmp/guided-preparation-final.log` |
| `npm run intake:test` | 507 passed | `/tmp/guided-core.log` |
| `npm run intake:client-test` | 234 passed | `/tmp/guided-client-final.log` |
| `npm run intake:transfer-test` | 241 passed | `/tmp/guided-transfer.log` |
| `npm run intake:public-test` | 176 passed | `/tmp/guided-public.log` |
| `npm run intake:invitee-test` | 292 passed | `/tmp/guided-invitee.log` |
| `npx tsc --noEmit --incremental false` | no diagnostics | `/tmp/guided-types-final.log` |
| ESLint over changed intake components and preparation test | no diagnostics | `/tmp/guided-lint-final.log` |
| `npx next build` | compiled, type checked, 139 static pages | `/tmp/guided-build-final.log` |
| `git diff --check` | passed | terminal |

The Next build was invoked directly; `npm run build` and migration commands were not run. Existing Node module/deprecation warnings occur in the selftest harness. No dependencies were added.

## Browser and actual-byte transfer evidence

The actual production `IntakeFlow` and its client, file inspection, useSend/upload-run, and TUS transport ran in an isolated Next fixture. Only API/state/storage were replaced with a local in-memory receiver; no real invitation, legal agreement, DB row or production object was created. File chooser selection used two distinct binary MOV test fixtures with 240fps container timing. These are parser/transport fixtures, not playable camera recordings or proof of camera provenance.

Observed in the browser:

- Athlete name → all four preparation instructions → actual picker → selected-file confirmation → rear preparation → existing review → explicit send → receipt.
- 59.94fps file rejected on selection; stage 4 stays open. Failed replacement retains the prior accepted file, which can be explicitly reused.
- Browser Back/Forward restores guide stages. Reload preserves an instruction position; missing files return to selection. Reload + Back/Forward into an old review entry remains usable and requires files.
- Review replacement returns to the same review panel; age, relationship, throwing hand and consent answers stay intact. Selecting a new file intentionally clears the existing same-pitch confirmation, as before.
- Correction retains an unsaved changed athlete name and left-hand selection after the guide/file-selection round trip.
- Recovery retains its same-pitch checkbox after the guide/file-selection round trip.
- Tutorial playback reaches readyState 4; opening alternate help pauses it. One current tutorial is mounted. Receipt contains no video.
- A deliberately unavailable tutorial URL shows text fallback/retry, and Next still advances. The temporary fixture failure override was removed afterward.
- At 375×667, guide stage 1 has document height 667 with Next inside the viewport; guide stages 2–4 were also traversed. No horizontal overflow. A 1280×800 viewport was checked. Large text/zoom and every physical device were not tested.

The receiver required byte count and SHA-256 equality before marking either asset verified, then required both verified assets before issuing a fixture receipt:

| View | Bytes selected / received | SHA-256 selected = received |
| --- | --- | --- |
| Side | 524752 / 524752 | `4a5f1d4ad4be4178889636b7d00a174c776cbfb4e2cd7e746252a2565bdea32d` |
| Rear | 524752 / 524752 | `8e83f83be4779ce1a5ffbb5552f0033cdd443d87100f92accbbe5e9268fcf307` |

Local evidence, intentionally outside the public repository:

- `/Users/yuno/bullpen-intake-guided-evidence/transfer-proof.json`
- `/Users/yuno/bullpen-intake-guided-evidence/receipt.png`
- `/Users/yuno/bullpen-intake-guided-evidence/guide-mobile.png`
- `/Users/yuno/bullpen-intake-guided-evidence/guide-desktop.png`

## Limits and release checks

No physical iPhone Photos → Files → Safari chooser path was performed. Browser automation cannot establish what a real OS chooser offers, whether the person exported the true camera original, or whether iCloud finished downloading it. The existing R08 document-only accept policy is unchanged; original provenance remains a user action while selected-to-received byte identity is enforced by existing checks. A file chooser cancel could not be simulated by the browser tool (it rejects an empty file list); cancellation is a no-change path in the unchanged FileButton handler, not an observed OS test.

Before release, the main GPT must independently inspect the exact source commit and confirm the claimed tests. After release, verify the actual production commit/status, the new chunk/guide references, the v2 MP4/JPEG response and local/served hashes, and the local 3000 response. A successful deployment alone is not a physical-device end-to-end test. Add the production result to the main handoff/release record; do not claim Mac mini receipt without evidence.
