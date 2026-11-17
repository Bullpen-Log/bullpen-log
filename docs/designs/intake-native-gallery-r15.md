# Intake R15 — Two original-video submission methods

Date: 2026-11-17. Owner: GPT05 video sharing. User explicitly requested direct implementation in this chat. Checkout: `intake-recopy-r14/bullpen-log`, baseline `7bd636f1`. R14 admin link recovery belongs to Claude05 and is excluded from this change.

## Product behavior

The recipient chooses one of two methods before preparing each camera view. Both methods use the existing invitation, name/PIN, consent, paired-view review, original-byte hashing, upload, receipt and server verification. The capture-rate requirement remains unchanged; a genuinely low-frame file is not promoted to 120fps.

| Method | Preparation and guide | Actual selection |
| --- | --- | --- |
| Files | Existing two user-recorded guides: save original, then select saved file | Existing document picker; iOS continues to exclude the browser Photos transcoding route |
| App gallery original | Access guide → Next opens the real Photos access prompt → selection guide → original picker → file validation | A new iOS Photos resource module copies the asset's `.video` resource directly, without an export session or video encoding |

The method screen and each guide have their own Back/Next progression. Gallery access denial remains on the access step with an explanation. Canceling a picker does not clear the previous file. The confirmation's replacement action returns to the selected method's picker. Existing stored Files guide positions remain readable.

In Safari, gallery selection opens an explanation and an explicit **Continue in app** link. The recipient needs an iPhone app binary containing the new native module. If it is missing or the app cannot open, the Files method remains available. The app opens its isolated public intake screen, then requests the same name/PIN again; browser cookies or selected files are not handed to the app. No App Store installation or automatic background app launch is attempted.

## Original bytes and architecture

1. `sinker://intake#<token>` opens a dedicated public intake screen; both Sinker and Dugout app routes export this screen. The parser also accepts the existing `bullpenlog` and `dugout` schemes for equivalent direct invitations.
2. The screen loads only the configured site's `/submit#<same-token>` in an incognito WebView. It has no service tabs, account bridge, service links or cookie mirroring. Gesture navigation back into the service is disabled. The exact `/intake` route uses the invitation's own gate instead of the service account restore or Sinker beta feature guard. Other native routes retain their account/release behavior.
3. The optional `IntakeOriginal` Expo module authorizes Photos access. Its PHPicker exposes videos; the chosen asset ID is resolved with Photos access. Limited Photos access must include the selected video.
4. `PHAssetResourceManager.writeData` copies the asset resource of type `.video` to an application-private temporary file. `.current` on PHPicker helps selection but is not treated as proof of original bytes. No `AVAssetExportSession`, Photos adjusted/full-size resource, cropping, reencoding or metadata stripping is used. Editing in Photos is intentionally ignored when requesting the capture original.
5. The native screen issues an opaque handle; the document never supplies a disk path. `authorize`, `pick`, `read` and `cancel` are the only protocol operations. Requests require the configured origin, `/submit`, same invitation fragment, a bounded message and valid read limits. A read is at most 2MiB, with one disk read in flight. Handles belong to one screen registry.
6. The web adapter provides the existing production pipeline with `size` and bounded `slice().arrayBuffer()` reads. The same metadata parser, SHA256 and custom TUS Blob reader operate on those bytes. There is no whole-video base64 payload or whole-video browser Blob. Guide-player media and uploaded originals remain separate.
7. App originals display their file facts without creating a browser preview URL. The recipient confirms name, dimensions and frame information. A missing video preview does not block an otherwise valid original.

iCloud originals may require a network download and enough private disk space. The picker shows a waiting state and errors retain a Files fallback. Temporary files are deleted when the intake screen closes/reloads; a late download after cancellation is discarded. A generation guard prevents a canceled old picker/copy from settling a later pick. Copies orphaned by a previous app process are removed on the next original-pick initialization. Twelve active copies are allowed per screen, with a clear reopen instruction at the limit; existing handles are never silently evicted.

An original exported through this API can still have low capture fps if that was the file originally imported into Photos. The existing rate and byte checks still decide acceptance. This method prevents a browser selection conversion; it cannot reconstruct frames already lost before import.

## Guide recordings to capture after implementation

No new recording was supplied for this change. `GALLERY_GUIDES` in `components/intake/preparation-step.tsx` holds two guide entries with optional `video`/`poster` properties. Until assets are supplied, each step displays its own instructions and performs the real action; it does not request nonexistent video URLs or show the Files video as a Gallery demonstration.

1. **Photos access:** Begin at the app's access-guide step, press Next, and show the actual Photos permission dialog. If demonstrating limited access, include the intended video in the allowed selection. End when the selection-guide step appears.
2. **Original selection:** Begin at the selection-guide step, press Gallery original selection, select one 120fps-or-higher capture, and show the confirmed filename/frame information after preparation. Include iCloud waiting only if useful.

Preserve the user's intentional recording parts and all demonstrated actions. Do not cut out interactions to shorten a recording. Mosaic names/photos that reveal private information while leaving action targets visible; remove the iPhone time/battery strip. Once approved recordings are available, add their actual asset paths to the corresponding optional fields. The existing custom GuidePlayer automatically supplies autoplay/loop, pause, seek and fullscreen; no native player controls are introduced.

## Verification and delivery boundary

Implementation connects both entry routes and the real access/selection actions. Automated evidence uses a fake Photos disk and HTTP transport with the actual production web reader, metadata parser, SHA256 and TUS library; it is not evidence of a physical Photos picker.

- New `scripts/intake-native-original-selftest.mts`: protocol origin/token/path/bounds, cancellation, permission error, late cleanup, 240fps acceptance, variable-rate acceptance, real 60fps rejection, and exact byte/SHA256 equality after real TUS chunking over the bridge.
- Existing preparation navigation/state and client upload regressions are rerun.
- Web and native TypeScript plus scoped lint, Swift syntax parsing are run. Swift syntax parsing is not an iOS compile/link check.
- Read-only browser inspection uses SSR fixtures rendered from the actual component, with current site CSS, at 390×844, 320×568 and 844×390 (landscape). Method choice, gallery instructions, app handoff and bottom actions are visible. This is layout evidence, not a live native picker test or a production deployment.

Before calling Gallery submission available to recipients: integrate the reviewed native/web changes, produce a new app binary (an OTA update alone cannot install the Photos module), distribute it through the established release process, and test on a physical iPhone. Required device cases: cold/warm invitation deep link; no service login; allowed/limited/denied Photos; cancel; iCloud resource; 120/170/240fps originals versus 60fps; two camera views; app interruption/reselection; failed/resumed transfer; compare downloaded server original SHA256 and file size to the selected Photos resource. Actual iPhone 15 Pro behavior and the reported Kim Min file remain unverified without that device/file.

No production DB, schema, storage objects or deployment are changed by this R15 implementation. No native simulator, Metro server or local native build is launched. R14's separate inactive migration proposal is not part of this feature.

### Results (2026-11-17)

- New bridge/metadata/hash/TUS selftest: **87 assertions passed**, including the R13 synthetic ~170fps distribution over the native adapter and genuine 60fps rejection. Production HTTP and Photos resource retrieval were mocked; the production byte reader and TUS implementation were executed.
- Existing preparation: **40 passed**; existing client: **237 passed**; core regression: **637 passed**.
- Web TypeScript, native TypeScript, scoped web/native ESLint and Swift frontend syntax parse: exit **0**.
- `npx next build` (direct invocation, no Prisma migration command): exit **0**. This compiled the shared checkout with concurrent R14 uncommitted files present; R14 is not included in the R15 delivery commit. This is not an isolated approval of R14.
- UI layout: component-rendered browser fixtures showed both choices and the app handoff at 320×568; gallery stage actions stayed within 390×844, 320×568 and 844×390. Fixtures were read-only and did not trigger real Photos permission dialogs.
- Detailed local logs: `/Users/yuno/bullpen-intake-r15-evidence/`. No real device, native compile/link, production deployment or new guide footage is claimed.

Commands: `node --import ./scripts/alias-register.mjs scripts/intake-native-original-selftest.mts`, `scripts/intake-preparation-selftest.mts` and `scripts/intake-client-selftest.mts` with the same loader; `npx tsc --noEmit --incremental false`; native `tsc --project tsconfig.json --noEmit --incremental false`; scoped ESLint; `swiftc -frontend -parse native/modules/bullpen-native/ios/IntakeOriginalModule.swift`; `npx next build`.

### Primary API references

The native original-resource choice follows Apple's [original video resource definition](https://developer.apple.com/documentation/photos/phassetresourcetype/video) and [Photos resource manager API](https://developer.apple.com/documentation/photos/phassetresourcemanager). The native message-origin check uses the frame URL supplied by the [React Native WebView iOS implementation](https://github.com/react-native-webview/react-native-webview/blob/master/apple/RNCWebViewImpl.m), also inspected in the installed 14.0.1 package.

### Handoff

Only R15 paths are committed. R14 admin/service/token/schema-proposal changes remain owned by Claude05. Main is notified of the shared account-gate/root-layout changes and receives the exact R15 commit and this record. `HANDOFF.md` is currently claimed by the main R1 integration session; it is not edited concurrently here. The current implementation includes a default-false `publicInvitation` prop in the shared SessionGate, passed only for exact `/intake`; other account routes keep their existing restore behavior. New native-module distribution and physical-device tests are the next release boundary, not silently completed by web build success.
