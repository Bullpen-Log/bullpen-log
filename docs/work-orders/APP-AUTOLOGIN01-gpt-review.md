# APP-AUTOLOGIN01 — Overall independent review

2026-11-17 KST. Reviewer: GPT overall (01a176ce-b1a7-7c43-b0e7-cfe5f8189bd7).

## Decision and authorization

Approved for the human-authorized scoped integration and BOTH apps TestFlight rebuild/upload. The actual human direction in GPT Sub2 requested overall review and completion through TestFlight. Public App Store submission/release remains ON HOLD. No DB, schema, storage-content, dependency or session-expiry-policy changes.

## Provenance and inspected boundaries

Exact 13-file Sub2 delivery from /tmp/APP-AUTOLOGIN01/manifest.json independently SHA256-verified against original files, and tracked baselines checked against clean latest-main checkout before copying. Integration checkout: autologin-release. Started at1ceb94d3; fast-forwarded to07420243 (review-record-only commits). Root dirty collaborators preserved.

Independently read Swift cookie queue/sync/mirror/clear, production session lifecycle, both root SessionGate consumers, both login routes, RPC account/cache generations, account mutations/offline logout, direct pitch API and loadMe cache. Cookie restoration completes before mounting consumers; exact server unauthentication clears the session; uncertain network/server failure retains cookies and offers retry; account mutations serialize; late old-account results are rejected; drafts/outboxes are not deleted. Push unregister is exempted from account-change wait to prevent logout deadlock. Existing server expiry remains unchanged. No token copy to ordinary app storage.

One extra correction by overall: native/tsconfig.json explicitly adds DOM.Iterable alongside inherited DOM/ESNext. Default native typecheck previously failed FormData.entries at lib/form-values.ts34/40; corrected default check exits0. Runtime behavior unchanged.

## Independent checks and original results

- node --experimental-strip-types scripts/native-autologin-selftest.mts: exit0,56 assertions, /tmp/autologin-independent-final.log and .exit. Production TS modules with mock cookie/network transport plus source integration assertions; NOT native/device execution.
- native default tsc --noEmit --incremental false: exit0, /tmp/autologin-native-types-final.log and .exit. Before correction missing FormData.entries recorded /tmp/autologin-default-before.log.
- changed native TS/TSX eslint: exit0, /tmp/autologin-lint-final.log and .exit. Swift excluded from JS lint and is NOT thereby compiled.
- native-dev3d-load-selftest: exit0,18 assertions, /tmp/autologin-independent-dev3d.log.
- native-read-share:test:8 passed; native-load-core:test:11 passed, original /tmp/autologin-read-share.log and /tmp/autologin-load-core.log.
- native-outbox:test: exit1,3 assertions fail. Unchanged production/test/loader paths match origin/main. Existing test expects transient server error removal on attempt8, but existing production intentionally retains server/http errors indefinitely; retained item also affects later count assertion. Not an auth regression; preserve data-safe production behavior and do not rewrite unrelated ownership scope.
- root tsc: exit2 locally, /tmp/autologin-web-types.log. Shared node_modules generated Prisma client lacks Intake* models in current schema; no generated-client mutation in collaborators' shared dependencies. Auth native check passes; this root check is NOT reported passed.

## Remaining verification and delivery gate

No simulator/Metro/Expo server/local native build/physical device was run. CI native builds must compile Swift, sign, check actual localized installed names, upload, then Apple API must confirm the exact new build processing and internal beta state. Successful fixture tests are not proof of iOS keychain/cookie persistence on real hardware. Device cold launch, airplane-mode retry, process termination/restart, login/logout/account switch, WebView sync and push registration remain device acceptance checks. Final run IDs/build numbers/Apple states will be appended after observed delivery.

## Additional isolated root type diagnosis

Generated Prisma client from the committed schema into /tmp/autologin-typecheck/client using a minimal temporary config (no environment file, network datasource or shared generated-client writes). Generation exit0. Temporary typecheck mapped @prisma/client to that isolated output; root types still exit2 because the shared installed dependency tree lacks @noble/hashes/sha2.js, @noble/hashes/utils.js and tus-js-client used by unchanged intake files. This is an environment mismatch, not a passed default check; no dependency installation was performed. Logs: /tmp/autologin-isolated-prisma.log and /tmp/autologin-web-types-isolated.log, original .exit sidecars. The actual Vercel deployment for4a405f92 subsequently reported success via GitHub commit status. Native compiler/type gates remain separate.

## Observed release completion — 2026-11-17 KST

Release source4a405f927fb45ec1c877d11b26aac343a3c8ec90, main. No unrelated root dirty work included.

| App | Bundle / Apple record | CI run / job | Version/build | Apple build UUID | Final direct API states |
|---|---|---|---|---|---|
| Sinker | com.sinker.app /6835422935 |44028533479 /133854758385 |1.1.0 /20261117.61036 |4893d8de-4bc7-42b5-85af-a646a5d1f18c |VALID / IN_BETA_TESTING |
| Dugout | com.mhk.dugout /6835459450 |44028702211 /133855145488 |1.1.0 /20261117.60843 |869b9e44-05b8-4552-a3d4-89e3fb1cfcd4 |VALID / IN_BETA_TESTING |

Both native workflow exits0, verified via completed jobs and watch .exit sidecars. Full job logs /tmp/autologin-sinker-ci-full.log and /tmp/autologin-dugout-ci-full.log contain actual BullpenNativeModule.swift compilation, ARCHIVE SUCCEEDED and Upload succeeded. GitHub annotation installed-name checks: Sinker ko=싱커 /en-default=Sinker, Dugout ko=덕아웃 /en-default=Dugout. Existing Geum signing/bundle configuration preserved. Sinker screen-code publish also succeeded; its changed native runtime still requires the new TestFlight build. The main-push plan completed before separate Dugout dispatch, so neither was cancelled by shared plan concurrency.

Apple direct build and buildBetaDetail reads confirmed exact UUIDs above. Sinker initially PROCESSING then VALID; both internal IN_BETA_TESTING. Both external states READY_FOR_BETA_SUBMISSION, NOT submitted to external review/public launch. Local API evidence /tmp/autologin-sinker-build-direct.json, /tmp/autologin-sinker-beta.json, /tmp/autologin-dugout-apple-filter.json, /tmp/autologin-dugout-beta.json. GitHub source commit Vercel status also success.

Release delivery COMPLETE for authorized internal TestFlight scope. Physical-device installation, cold-start persistence, offline retry/account switching and push remain unverified; no simulation is described as device proof. Public App Store submission/release remains ON HOLD.

## Compiler provenance clarification — 2026-11-17 reconciliation

Later independent Support1 evidence identified canonical native-local TypeScript6.0.3 default check passes, while root/web TypeScript5.9.3 invoked against native config produced FormData.entries. Our logged release command used the root binary from native cwd (`node ../node_modules/typescript/bin/tsc`), so earlier wording that the canonical default native compiler itself was broken is withdrawn. The recorded original exits/logs remain real for that command. DOM.Iterable explicitly preserves compatibility for that cross-project invocation; it changes no runtime logic and has not been removed. Native-local compiler correctness and root-binary compatibility are distinct checks. Release CI/Apple success and device-unverified status remain unchanged.
