# APP-AUTOLOGIN01 — Native automatic sign-in

Revision1, 2026-11-17. Human authorized implementation by GPT `운영 지원 · 서브2` directly; do NOT hand implementation to Claude. Overall coordinator retains final integration review. Public App Store launch is on hold; no new release/commit/push is authorized by this implementation order.

## Goal and ownership

Sinker and Dugout should retain a valid signed-in session across ordinary app close/reopen and restore it without asking the same user to log in repeatedly. Inspect actual persistence/auth startup behavior first and identify confirmed failure causes versus hypotheses. Reuse existing auth/session/security contracts and avoid adding a parallel authentication stack. Do not interpret automatic sign-in as bypassing credentials, hardcoding an administrator, or submitting stored plaintext passwords.

GPT Sub2 owns source investigation, scoped plan, implementation, relevant checks and a consolidated Korean delivery to the user in its own chat. The latest direct-user implementation instruction supersedes the prior onboarding-only restriction and general Claude implementation default for this task. Routine in-scope decisions do not need overall preapproval. If an actual significant product/security policy decision is required, state the concrete choice while continuing independent work.

## Start and boundaries

Read current root AGENTS/CLAUDE/WORKFLOW/SESSION_COORDINATION, bootstrap, relevant auth code and latest release handoff. Use session-guard and exact-path claims. Current root contains numerous other departments' uncommitted changes and may lag released main; compare relevant auth paths to origin/main without restoring entire old files or switching the shared checkout.

Candidate areas to inspect (not an automatic edit allowlist): native/src/account/session.ts; native/src/lib/rpc.ts; native/src/app/login.tsx and startup layouts; native/src/dugout/app/login.tsx and startup/WebView bridge; lib/session.ts, lib/session-type.ts, lib/login-prefs.ts, lib/login-ticket.ts and actual login/logout/refresh endpoints. Shared RPC registry and lib/release-access.ts may be claimed by EX-LOAD01-R1: coordinate before touching them. Existing device credentials/drafts/outbox and account boundaries must be preserved.

Phone changes belong in native/src. Inspect Sinker and Dugout consumers, webview/cookie bridges, signed-in startup routing and existing web behavior for regressions. Cross-account isolation is mandatory. No framework edits without installed version-specific docs; no new dependency or schema change by default.

## Acceptance criteria

1. A normally authenticated user can close/reopen the app and restore a still-valid session after asynchronous secure hydration. Do not flash protected content for an unknown/other account or redirect to login before hydration finishes.
2. Existing expiry/refresh behavior is respected. Handle concurrent requests, app foreground, temporary offline/timeout/server errors and successful recovery without unnecessarily deleting a valid stored session or looping sign-in. Never extend session privileges/duration without an explicit policy decision.
3. Explicit logout is final for the selected app/account: clear/revoke existing auth as appropriate, prevent a late refresh response from logging the user back in, and do not leak prior user UI/cache/queued requests into another account. Preserve user drafts according to existing ownership rules rather than indiscriminately deleting local data.
4. Expired/revoked/deleted-account credentials are handled through the real server contract and return to login cleanly. A transient network failure is not proof of revocation.
5. Use existing secure storage and supported OS protection for credentials. No plaintext password persistence, hardcoded credentials, token logging or auth bypass. Existing new bundle IDs do not automatically inherit old-app credentials; first sign-in may still be required.
6. Sinker and Dugout entry points and retained WebViews use consistent existing contracts. Do not silently implement only one app or add a new website-only login path. Preserve manual login, error messages and existing permissions.
7. Add meaningful bounded behavior/regression checks for restoration, expiry, concurrency, logout-race and account isolation as actually affected. Use mocks/local fixtures without writing production DB or creating accounts. Run relevant type/lint checks; preserve full logs and original exit codes. Code-only tests are not physical-device evidence.

## Limits and delivery

No simulator, Metro, Expo server, local native build, DB/schema/storage/user-data writes, dependency additions, account creation, credentials copying, commit/push, OTA/TestFlight deployment or public App Store submission. Existing server ownership must not be disrupted. Use existing authorized sessions for necessary read-only checks; never copy credentials to work orders or logs.

Report confirmed causes, changed paths and production integration, tests/exit codes/evidence, differences between both apps, remaining device/network verification and any necessary user decision. Present the completed initial authorized implementation to the user; do not enter endless automatic Claude or GPT repair batches. Stop at a concrete reviewable delivery, with final overall review/release permission separate.

## GPT Sub2 delivery — 2026-11-17, rev1 initial implementation

Status: source implementation and bounded local checks complete; ready for overall independent integration review. NOT released or device-verified. Implementer: GPT Sub2, chat `01a1e508-05f3-7fd2-8f22-426d95e5187a`; no Claude dispatch.

### Diagnosis and scoped implementation

Root checkout remains `/Users/yuno/Developer/bullpen-log`, main `aa9d89848bd2ee182ed2151653466c83ed3a9010`, with all unrelated dirty changes preserved. Compared the relevant auth/native-module/root-layout paths against locally available `origin/main` `a7330a75` before editing: no baseline differences in these paths. No fetch/pull/branch switch. The latest release handoff records localized-name builds from `60a30a92` (Sinker `20261117.42605`, Dugout `20261117.42234`); those builds do NOT contain this work. Public launch remains on hold.

Confirmed source behavior (not a reproduction of the human's physical-device symptom):
- Both WebView roots could mount before the one-time RPC cookie synchronization completed. Sinker could then reach its native login route, which clears the session.
- Native `sync` imported every matching WebView cookie over the native request jar, including a stale session. Initial synchronization errors were swallowed and cached for the process lifetime.
- Authentication mutations and login-screen clearing had no shared ordering barrier. An earlier request could finish after logout, and shared reads/direct API responses lacked a transport-level account-generation check.
- The existing implementation uses iOS `HTTPCookieStorage` and `WKHTTPCookieStore`, with server-issued HttpOnly/Secure persistent cookies. There is no existing Expo SecureStore/token-refresh stack to reuse. Server JWT expiry is 30 days for persistent sessions; password-fingerprint and deleted-account checks are in the existing DAL. No duration/privilege extension, new credential store, dependency or refresh endpoint was introduced.

Implemented the scoped plan:
1. Serialize native cookie copy/mirror/clear through completion; ignore expired cookie imports and prefer an existing unexpired native session over an older WebView session. Keep host/domain scoping, existing OS cookie stores and token secrecy.
2. Add shared lifecycle hydration and ordered account mutations. Both apps' root stacks wait for cookie synchronization/mirroring and existing `app.loadAppMe` validation. Only its exact unauthenticated result clears credentials. Network/timeout/500/policy failures retain credentials and show a bounded retry screen.
3. Preserve Sinker login-route cleanup semantics, queue cleanup before new login, and apply the same cleanup to Dugout's web-logout/native-login bridge. Keep manual login fields and messages. Logout clears both local jars even if the server is temporarily unreachable; server-side token policy is unchanged.
4. Reject pre-transition or during-transition RPC/direct API work without returning another account's data or redirect. Key `loadMe` and read sharing by account generation. Use the existing retryable `offline` transport code for stale work so old outbox consumers retain drafts instead of counting an unknown permanent error. Clear disposable caches only; no draft/outbox/file deletion was added.

### Changed paths

- `native/modules/bullpen-native/ios/BullpenNativeModule.swift`
- `native/src/lib/session-lifecycle.ts` (new), `native/src/lib/rpc.ts`
- `native/src/account/session.ts`, `native/src/account/session-gate.tsx` (new)
- `native/src/app/_layout.tsx`, `native/src/app/login.tsx`
- `native/src/dugout/app/_layout.tsx`, `native/src/dugout/app/login.tsx`
- `native/src/pitch/api.ts`
- `scripts/native-autologin-selftest.mts` (new), `scripts/native-dev3d-load-selftest.mts` (hydration mock dependency update)
- This delivery section only in the work order.

No changes to shared RPC registry, `lib/release-access.ts`, auth server contracts, schema, dependencies, native bundle IDs, release pipeline or collaborators' EX-LOAD01 paths.

### Acceptance evidence and limits

| AC | Evidence | Limit |
|---|---|---|
| 1, 6 | Both root stacks use the same SessionGate; fixture verifies one hydration/mirror before concurrent startup requests. Login screens retain app-specific navigation. | Real WK/HTTPCookie persistence and cold-launch rendering require a new native build and physical devices. |
| 2, 4 | Actual RPC/account modules exercised with delayed hydration, retry, exact unauthenticated denial, offline/500/malformed/policy/domain errors and timeout including response/hydration wait. Existing Sinker foreground `askMe` behavior and server-side WebView validation remain. | No live server/account mutation. There is no rolling refresh contract; expiry is unchanged. Foreground and network transitions on devices remain unverified. |
| 3 | Late read and redirect/body responses rejected; overlapping login/logout ordered; offline logout clears jars; direct API late result rejected; `loadMe` returns B after A rather than reusing A's promise. Existing outbox regression passes. | In-flight server mutations cannot be undone by client cancellation; they retain the credentials with which they were sent. Offline push-unregistration success is not claimed. |
| 5 | Credentials remain in OS cookie stores; no password/token persistence, token logs or new dependency. New bundle IDs keep separate app containers. | Old-app credentials are not migrated across bundle IDs; first login may still be necessary. No claim of a new Keychain implementation. |
| 7 | Tests and exit codes below. | Native Swift checks are source assertions only, not compiled/runtime evidence. |

### Final checks (original exit codes)

Evidence directory: `/tmp/APP-AUTOLOGIN01` (local, not committed; no credentials).

| Command | Exit | Result / full log |
|---|---:|---|
| `node --experimental-strip-types scripts/native-autologin-selftest.mts` | 0 | 56 assertions; actual JS/TS production modules with VM/local cookie/network fixtures, plus five source-only integration/native assertions. `behavior-final.log` |
| `node --experimental-strip-types scripts/native-dev3d-load-selftest.mts` | 0 | Existing actual-RPC deadline regression 18; `dev3d.log` |
| `npm run native-read-share:test` | 0 | 8; `read-share-final.log` |
| `npm run native-load-core:test` | 0 | 11; `load-core-final.log` |
| `npm run native-outbox:test` | 0 | Exercise/armcare queue ownership, offline retention and cache/config preservation; `outbox-final.log`. Current collaborating dirty source tested without edits. |
| `node node_modules/typescript/bin/tsc --noEmit --project native/tsconfig.json --lib ESNext,DOM,DOM.Iterable` | 0 | `types-final.log` |
| Native installed ESLint on the nine changed source files | 0 | `lint-final.log` |
| `git diff --check` | 0 | `diff-check.log` |

An initial default native typecheck exited2 on existing `lib/form-values.ts` FormData.entries DOM.Iterable configuration plus two new test typing issues. The test issues were corrected; final typecheck explicitly supplies DOM.Iterable without editing shared configuration. Initial lint exited1 on a new synchronous effect state update; moved that update to the retry event handler and final lint passed. A direct invocation of existing alias-based regression tests initially failed module resolution; reran through their declared npm scripts and passed. Node emitted existing module-type/deprecated-loader warnings; package configuration was preserved.

### Review and release boundary

No DB/account/storage writes, credentials access, simulator, Metro, Expo server, native app build, commit, push, OTA, TestFlight deployment or public submission. Existing localhost3000 was observed only and not restarted by this chat. All claims will be released after delivery.

The Swift cookie-ordering change requires a future authorized native rebuild for both apps; OTA alone is insufficient. Overall review must inspect the exact scoped diff and new files (local evidence manifest records hashes), followed by separately authorized delivery/device checks: force-close/reopen, app foreground after expiry/revocation, slow/offline recovery, logout while a request waits, A-to-B transition and retained WebViews. No additional implementation/reorder batch has been started.
