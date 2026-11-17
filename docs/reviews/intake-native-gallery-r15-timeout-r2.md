# R15 revision 2 — Pick timeout/retry correction and authorized release

Date: 2026-11-17. GPT05 implements directly under the user's existing direct-implementation instruction. The user explicitly authorized this correction and deployment: **“해. 배포까지 모두 완료해”**. Overall owns serial integration, remote push, Vercel and internal TestFlight distribution. Do not infer public App Store launch approval.

## Finding and boundary

Independent Sub2 review of original R15 `d7972580` reproduced a P2 timeout seam: the browser's ten-minute pick deadline removed its reply listener and rejected without canceling the native pick. The UI then cleared its `pending` flag. An iCloud copy could remain active, and the next attempt was rejected as busy. Original evidence: `/tmp/r15-sub2-timeout-probe.mjs`, `/tmp/r15-sub2-timeout-result.json` (`cancelCount:0`, operations `pick,pick`).

This revision changes only the browser request helper, the native bridge state machine, the existing bridge selftest and this record. The Swift resource copier, Photos permission UI, public intake account boundary, frame policy, DB, storage and R14 admin link recovery are unchanged.

Working parent: `54976f88f245325d7c137bf48ae2cf2bd5db0bd1`. Intervening R14 commits `5abe5f91` and `54976f88` are NOT release dependencies. Clean release must cherry-pick original R15 `d7972580` and this narrow revision only, excluding those R14 commits.

## Correction

- On pick timeout the browser removes the old reply listener, sends `cancel` with the exact expired `pickId`, and waits for cancellation acknowledgement (or bounded bridge error/timeout) before rejecting and enabling UI retry.
- Native pick state is an identity-bearing operation, rather than one global boolean. Cancellation invalidates the operation before awaiting the native module, while a cancellation barrier prevents a new pick from racing the native cancellation call.
- Every returned resource is checked against the active operation both before and after size lookup. A canceled resource arriving late is deleted and never registered. An old operation's `finally` cannot clear a newer operation.
- A completed result whose reply was already queued at the browser deadline is associated with its pick ID and removed by scoped cancellation. Other selected handles are preserved. Delayed cancellation for an old ID cannot cancel a newer pick.
- Existing ordinary stage-unmount cancellation stays connected through the already-keyed PreparationStep. There was no missing-key defect to fix.

If the native message channel itself is broken, the cancellation RPC has its own bounded timeout and the existing Files/reopen fallback remains necessary. This does not claim that a disconnected process can be forcibly controlled from JavaScript.

## Verification

`node --import ./scripts/alias-register.mjs scripts/intake-native-original-selftest.mts` passes **109 assertions**. The new tests manually invoke the actual production timeout callback without waiting ten minutes. They prove:

1. The browser sends correlated cancellation and does not settle the timed-out attempt until native cancellation completes.
2. A retry is admitted after cancellation, even when the old simulated iCloud copy remains unresolved.
3. An old late result is deleted, cannot settle the new request and cannot clear the new busy state.
4. A delayed old-ID cancel leaves the retry active; previously valid handles remain readable.
5. A reply queued before the deadline but delivered after it has its expired handle deleted while the previous valid handle remains usable.

Existing tests within the same suite still cover original-byte SHA256/TUS equality, strict 60fps rejection, 240fps and synthetic ~170fps acceptance, origin/path/token/range checks, access denial, cancel and close cleanup. These use mocked Photos disk and HTTP, not a physical phone.

Preparation navigation/state regression: **40 passed**. Scoped web/test ESLint and native bridge ESLint pass. Native and web TypeScript pass (exit 0). Full clean web build and independent seam acceptance belong to overall's exact-commit integration, not the earlier R14-mixed build.

Detailed local logs: `/Users/yuno/bullpen-intake-r15-r2-evidence/`. The original R15 evidence is preserved separately. No local native build, simulator, Metro, DB change or production mutation is performed by this department correction.

## Release handoff and remaining evidence

Overall independently verified the user's new deployment instruction and will integrate only accepted R15 commits into its clean release checkout. Required publication: operational web; new Sinker native binary via the existing fingerprint workflow; manual Dugout binary with `app=dugout`, `upload=true`, `simulator_check=false`, since its shared module and intake route also changed. Existing signing/credentials and public App Store hold remain unchanged. No duplicate push or workflow dispatch from this department.

Guide recordings are still not supplied; method-specific instructions remain visible, and approved future recordings can be attached to the prepared guide entries. Physical iPhone Photos, limited/denied access, cold/warm deep links and selected-resource versus downloaded-server hash are not inferred from automated tests or successful Apple processing. Deployment, Apple availability and device confirmation must be reported separately.
