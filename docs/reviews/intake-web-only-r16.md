# R16 — App-free invitation intake correction

Date: 2026-11-17. User correction: recipients must send originals through the invitation link without installing or opening Sinker/Dugout. GPT05 acknowledges that the R15 native-gallery second method misunderstood this requirement. This is a web-only correction to the already authorized implementation/deployment, not a request for another native binary.

## Behavior

The public link retains the existing name/PIN, athlete information, consent, paired-view checks, file diagnostics, original-byte hashing and resumable transfer. It leads directly into the existing original-file preparation guides and document picker. App-method choice, app-only permission guides and `sinker://` navigation are removed from that flow. There is no app download/update requirement for the sender.

On iPhone the guide continues to use the built-in Photos/Files workflow: share/options, all photo data, export unmodified original to Files, then choose that file from the same website. Desktop/Android keep their original-file picker and applicable help. Existing user-recorded guide parts and their custom player are preserved. No new gallery guide footage is required for this correction.

The previous R15 `method` and `gallery` checkpoints can exist in session storage or Back history. Normalize these to the Files route and the appropriate original preparation stage; keep valid confirm/select positions, but continue to require a real in-memory file before confirmation. Normal server state, consent/session checks and draft recovery outrank a stored navigation hint.

## Browser boundary

The [WebKit upload panel implementation](https://github.com/WebKit/WebKit/blob/main/Source/WebKit/UIProcess/ios/forms/WKFileUploadPanel.mm) can use compatible Photos representations and transcoding. The native Photos setting documented by [Apple](https://developer.apple.com/documentation/photosui/phpickerconfiguration-swift.struct/assetrepresentationmode) is not a browser JavaScript control. Therefore this correction does not present an unverified direct browser-gallery picker as a guaranteed original-only channel and does not weaken the 120fps requirement to accept a converted 60fps file. Already converted files cannot be repaired by changing a rate label.

Receiving unchanged file bytes is checked by the existing hash/TUS/server pipeline. It does not independently prove that a file was the camera original before selection. Existing guidance remains necessary.

## Change and release boundary

Only public preparation navigation/rendering and their checkpoint regression expectations change. The dormant native implementation already present in distributed binaries is not invoked by the public file flow; it is not removed via another native build. DB/schema, stored videos, accounts, original upload policy, server verification, administrative R14 work and native application files remain untouched.

Overall owns exact-candidate independent review, clean integration and web-only operational publication. Shared intake files are claimed only after overall releases its R15 final-release ownership. The public file picker and byte pipeline remain the same; no extra policy/feature choice is invented to preserve two buttons after removing an unsuitable method.

## Evidence

Implementation base: `aa713eb6e1f14b1ec31c49a3eebba557f0b41cdb` (fresh `origin/main`). Old local R14/R15 deliveries were preserved on local branch `codex/intake-r14-r15-delivery-preserve`, not imported into this correction.

- Preparation migration/state regression: **50 passed** (including raw history, version-1 active/side/rear book records and confirmation requiring a real file).
- Existing upload-client regression: **237 passed**. Retained dormant native subsystem regression: **109 passed**; this is historical compatibility, not the public submission method.
- Actual PreparationStep SSR: **15 assertions passed** across iPhone save/select and desktop select, with native bridge/UA present and absent. No app URI/promotion appears; markup is identical when native presence changes. This is component rendering, not a real phone upload.
- Scoped web/test TypeScript and ESLint: **exit 0**. Raw repository-wide local TypeScript reports two errors in unchanged `scripts/load-fixture-schema.mts:17` for absent generated Prisma `Omit` keys (`loadSemantics`/`load`). Shared generated files were not modified. No whole-project local pass is claimed; overall must verify in its canonical generated-client environment and clean production build before release.
- Product changes are exactly three public preparation files. Two selftests and this record complete the six-file revision. No `native/`, DB/schema, stored-file or upload/server-policy changes.

Detailed local evidence: `/Users/yuno/bullpen-intake-r16-evidence/`. Earlier R15 proofs remain historical and are not overwritten or described as proof of this app-free correction. Overall final web publication/served-code proof follows the accepted exact commit; no app build or OTA dispatch is needed.
