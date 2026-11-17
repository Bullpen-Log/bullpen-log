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
