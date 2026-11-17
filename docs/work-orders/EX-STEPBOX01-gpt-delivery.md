# EX-STEPBOX01 — Direct GPT implementation delivery and acceptance evidence

2026-11-17. Implementer: GPT01 `01 · 영상비교`, chat `01a1c08f-1381-7350-8544-b98d47d58e65`. Human explicitly instructed `너가 구현해`. No Claude implementation or receipt is claimed. This is implementer self-verification with separate behavior/source-render/preservation checks; overall independent integration review is still pending.

## Scope and exact change boundary

- Root: `/Users/yuno/Developer/bullpen-log`, main `aa9d89848bd2ee182ed2151653466c83ed3a9010` plus pre-existing EX-LOAD01/EX-RX01/player/auth/review changes. No branch reset, dependency installation, DB/schema/content-row writes, review advancement, simulator/Metro/native build, commit/push or production deployment.
- Source manifest: `~/Library/Application Support/Sinker/ex-stepbox01-review-20261117/delivery/manifest.json`, 20 exact product/test paths; before/after bytes alongside. Own incremental patch `incremental.diff`, SHA256 `708848d5e0770899d5f19960fe35f0071fd482727b12517d3727698b0bccb53a`. A full root HEAD diff is NOT this delivery; it includes other work.
- Preservation: `delivery/preservation.json` proves reversing this incremental patch in a PRIVATE COPY restores all20 exact before hashes, including pre-existing dirty bytes. Root itself was never reverted. Final source hashes matched the manifest.
- Functional core: new `lib/equipment-requirements.ts` resolves AND between equipment requirements, OR within an explicitly approved substitute group. Only ID `854ee1d0-f529-4ddf-b502-20afa9a9ce8b` gets step-box primary / qualified box alternative, and only while a box/step-box support tag is actually present. Extra band/dumbbell/unknown requirements remain mandatory. No title-based or global box aliasing. Stored equipment/user/history rows are untouched.
- Canonical historical `박스` remains a stored token; selectors clarify it as `박스 (점프용)` and add distinct `스텝박스`. Alternate availability does not flatten substitutes into simultaneous weight equipment. Stock inventory is not a certification of an individual box's height/stability; the actual condition is displayed.
- Program/daily-plan/rehab callers retain their existing safety/prescription gates and share `canDo`/`filterByEquipment`. Suggestion unlock counts use the same matcher; equal counts prefer a primary requirement over its substitute. Empty owned list retains unspecified-inventory behavior.

## Actual shared-file handoff

- GPT05 had no prior STEPBOX edits/claim/dispatch.
- Support1 authorized the additive `lib/exercise-meta.ts` edit on SHA256 `4d17b8f241cb3374ac4fc8f1d4e18d09cba9dacab924ccdd898cf2a222bffc6b`.
- Support1 froze the R1 contract at `3a87053daeb84abedfc14273ecbb6f100f122f8ce756425b4a71596f243442d2` and approved ONLY adding the support token. The actual c668 owner subsequently removed its claims on contract.ts, training-client.tsx and training-today-data.ts. GPT01 observed that removal before claiming/writing; it did not release another owner's claims. All other c668 paths stayed out of scope.
- Immediate shared before bytes: `pre-shared/lib/workout/load/contract.ts`, `pre-shared/app/(app)/library/training/training-client.tsx`, `pre-shared/lib/report/training-today-data.ts`, and `pre-shared/exercise-meta.ts` under the evidence root. Support1 was notified to use those pre-STEPBOX bytes in R1 artifacts instead of absorbing foreign changes. R1 completion-gate code was never edited here.

## Acceptance mapping

| Criterion | Production connection and observed evidence | Result |
|---|---|---|
| AC01 distinct choices/legacy values | `EXERCISE_EQUIPMENT`, `pickMany`, web CheckboxGroup/MetaFilter/program-start, native FilterSheet/today forms. Actual-source SSR preserved checked raw `박스` while exposing separate step-box. | Pass in source/tests/SSR |
| AC02 contextual OR + other AND | `equipmentRequirements`, `missingEquipment`, `canUseEquipment`; exact exercise profile; qualification in web/native detail/add and replacement labels. | Pass |
| AC03 no blanket substitution | Unprofiled box jump and same-title/different-ID cases reject step-box-only. Removed support/unknown tags retain existing constraints; input arrays/records remain unchanged. | Pass |
| AC04 consumers agree | `lib/report/equipment.ts` availability+suggestions; `lib/program/program.ts` jump/basics candidates; web training-client/add-exercise and native browse/today filter tags; server `loadTodayPicker` missing-equipment warnings. | Pass in behavioral/source checks |
| AC05 recording semantics/history | Only one token added to SUPPORT_EQUIPMENT. Step-box-only is bodyweight/support, no kg/e1RM; dumbbell+step-box matches dumbbell+box mode/mass requirement. No protocol/resolver change or stored record rewrite. | Pass |
| AC06 real surfaces | Actual-source React SSR for web selector/filter/badges and native filter/detail, plus source connection review. RN primitives/IO adapted; no physical-device or pixel-layout claims. | Pass at source-render level; device pending |
| AC07 preservation/no release |20-file inverse patch restores every before hash; separate12-path runtime patch preserved unrelated intake file exactly. No production write/deployment. | Pass |

## Executed checks (original exits)

Logs reside under `~/Library/Application Support/Sinker/ex-stepbox01-review-20261117/logs/` (copies of `/tmp/ex-stepbox-*.log`). Source/render harnesses and outputs are alongside; no service credentials or user data were used.

- `node --import ./scripts/alias-register.mjs scripts/ex-stepbox-selftest.mts`: **exit0,121 checks**. Primary/alternative/both/neither, extra requirements, legacy/unprofiled/title collisions, mutation protection, today selection, unlock suggestions, native filters/search, program candidates, selector validation and recording support/mass semantics. Earlier expected failures at missing selector/support registration are preserved as development observations, not final failures.
- `npm run program:test`: **exit0,241 passed/0 failed** (`ex-stepbox-program-final.log`).
- `npm run native-library:test`: **exit0,127 passed** (`ex-stepbox-native-library.log`).
- Root `npx tsc --noEmit --incremental false`: **exit0** (`ex-stepbox-root-types-final.log`).
- Native default typecheck earlier: **exit2**, existing `lib/form-values.ts:34 FormData.entries`/DOM.Iterable issue. No unrelated source/config fix made. Native check with `--lib ESNext,DOM,DOM.Iterable`: **exit0** (`ex-stepbox-native-types-final.log`). Do not label the default invocation passed.
- Scoped root/native eslint: **exit0** (`ex-stepbox-lint-final.log`, `ex-stepbox-native-lint-final.log`).
- Actual-source React SSR private harness `render/check.cjs`: **exit0,5 surfaces**, `render/result.json` and per-surface HTML. Native primitives/IO were adapters; this is not native layout/gesture evidence.
- Scoped `git diff --check`: **exit0**. No new type errors or failed acceptance tests remain in this feature's checked scope.

## Local runtime reflection (not production)

- Overall explicitly authorized a bounded, validated, non-overlapping preview mirror. Existing localhost3000 PID77501 uses `/Users/yuno/.codex/worktrees/latest-local-server/bullpen-log`, HEAD `d6850f0b…`; root is not its cwd. No restart/switch/reset/pull/whole-tree sync.
- `preview/applied-manifest.json`:12 exact web/runtime files with before/after SHA256; `preview/validated-web.patch` is the feature-only adapted patch. Runtime lacked EX-LOAD01 and earlier EX-RX01 dirty code: those batches were NOT bulk-copied. Runtime meta retained its existing implementation and gained the additive support choice/display helper; missing-equipment and replacement labels received only the needed equipment changes. Root20-file canonical implementation remains the primary delivery.
- The pre-existing9-line `lib/intake/media.ts` FPS candidate was preserved byte-for-byte; hash is pinned in the preview manifest.
- Preview `npx tsc --noEmit --incremental false`: **exit0**, `/tmp/ex-stepbox-preview-types.log`. `git diff --check`: **exit0**.
- Actual HTTP: `http://localhost:3000/` **200**; `/library/training` **307** without an authenticated curl session. The served `/_next/static/chunks/lib_0ojj8bu._.js` contained the step-box token, approved exercise ID and qualification after HMR. No authenticated interactive library operation was claimed.

## Remaining limits and next action

### Standalone current-main release candidate — additional integration evidence

- Baseline verified against `git ls-remote origin refs/heads/main`: **`2a1818f53964482941e725cc006ac4217697a2bd`**. No worktree created or overall-owned release checkout edited. A private source-only git-archive fixture excludes environment/credential files and uses existing dependency symlinks.
- Candidate: `~/Library/Application Support/Sinker/ex-stepbox01-review-20261117/standalone-main/EX-STEPBOX01-main.patch`, SHA256 **`f5dcca15f7cab0ad3468207a683fa96b697e5d9e4f2bb0c944711abd40c26cb6`**. Exact **19-path** before/after hash allowlist in sibling `manifest.json`; `fixture/` is the applied pinned-main source. This candidate supersedes the dirty-root incremental patch FOR RELEASE INTEGRATION ONLY.
- Explicit differences from root canonical: **no `lib/workout/load/contract.ts`** (unfinished R1 module does not exist in main), and a main-specific test imports existing `weightKindOf` instead. Main's existing `usesWeight`/`needsWeight`/`weightKindOf` already treats support-only step-box as no weight, mixed dumbbell+support as dumbbell; unchanged legacy implementations are exercised directly. No R1 versioned contract, loadSemantics, recovery, schema or historical-envelope code is imported.
- `lib/exercise-meta.ts` adds the choice and display helper to main's own existing mass logic; `training-today-data.ts` receives only equipment missing-group logic, with no R1 imports. Web training-client preserves main's unrelated current code. Native today forms keeps main's existing intensity caption instead of absorbing the prior dirty EX-RX wording. Program changes are only step-box support whitelists on main's newer source. The other feature changes apply as bounded context patches; see per-file `adaptedFromRoot` flags and exact hashes.
- Actual candidate checks: `functional.log` **exit0 /121**, `program.log` **exit0 /243**, `native-library.log` **exit0 /127**, `render.log` **exit0 /5 actual-source SSR surfaces**. Commands run inside `standalone-main/fixture`, so aliases resolve candidate code rather than dirty root. Same IO/native primitive limitations apply. Typecheck result is recorded separately in `types.log` and final reviewer handoff; do not infer it from root results.
- Candidate full typecheck: **exit2** (`types.log`,1204 lines). Private fixture reuses root's older generated Prisma client, which lacks current-main IntakeInvitation/intakeSubmission types; full main type verification therefore requires a baseline-compatible existing dependency environment. No client generation/install or schema change was performed to mask this mismatch. This is an unresolved full-type evidence limitation, not a clean full-type result. Candidate19 after hashes and reverse apply-check both passed.
- No production deployment or independent acceptance is claimed. GPT Support Sub2 is the independent reviewer; overall retains integration/release control. Recheck baseline and apply-check if main advances before integration.

- Physical iPhone, real permissions/gestures, authenticated UI interaction and production deployment remain unverified. The actual persisted exercise equipment row remains `박스`; current display/matching applies the explicit exercise policy without a production DB write. No general database-backed alternatives editor was added.
- This direct implementation is complete within the code/test scope above. Overall must review the exact incremental source and EX-LOAD integration boundary before any authorized publishing; public App Store launch remains held. Do not sweep unrelated dirty files or assume the preview equals the entire root tree.
- Human department report should explain behavior/evidence/limits. No automatic new Claude follow-up batch; any further feature expansion or production row rewrite needs its own direction. Production release authority is not implied by these self-checks.
