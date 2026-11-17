# EX-LOAD01 + R1 — current-main integration candidate / deployment packet

2026-11-17. User directly requested completion through deployment in original Support1 chat after part acceptance. Overall is the SOLE serial release integrator/push owner. This candidate is for Sub2 independent integration review and overall final approval, **not self-approved publication or schema activation**. Public App Store launch remains held.

## Exact source and provenance

- Clean base: `58c7daf984da3bcbf9bd4e76f5f65d887a1aad1e`, the actually published reconciliation base including STEPBOX81e9a4b7, auto-login, mechanics and FPS.
- Isolated candidate: `/Users/yuno/.codex/worktrees/ex-load01-r1-release/bullpen-log`. Original shared dirty root, shared3000 and overall's release checkout were not edited/reset/restarted.
- Private evidence/transport: `/Users/yuno/Library/Application Support/Sinker/ex-load01-r1-deploy-20261117/`.
- Reviewed source basis: original66-path EXLOAD artifact SHA `0fc972646a6d53246c247426657a891f286c70d8f362807ed15825cf04d195ad` plus final79-path R1 SHA `7e80b8e67131c3d02953761017c777a47fed999304887321fe9919394e05066c`. Detailed part acceptance is root `docs/work-orders/EX-LOAD01-R1-status-packet.md`; exact code is baseline-relative, so those patches cannot be blindly applied against current main.
- Current-main candidate has114 source/pending-SQL/test paths. Source-only incremental diff SHA **`b5fb664cc7e3fe6c7c8b2780099bccfda734dd709f0e3d45a0a20d0c5271e8e5`**, preserved as `source-only-integration.diff`; exact before/after hashes and provenance in `source-only-integration-manifest.json`. Final transport adds this operational review and a bounded HANDOFF prepend; its full manifest/hash are outside the diff to avoid a self-reference.
- Three-way projection uses old committedaa9d ancestor, accepted current/frozen R1 source and clean published58c main. Five textual conflicts were resolved explicitly: additive admin load context/props in training page/client; identical equipment display helper body retained; independent STEPBOX equipment and load-gate imports combined; the actual accepted training API contract retained. Separately approved STEPBOX support token is added to the new load contract (exact current post-STEPBOX contract bytes). The plan records each resolution/hash.
- API snapshot/source changes remain scoped; no blanket snapshot regeneration. Unrelated shipped API/FPS/auth/mechanics changes retained through the current-main side.
- **Four prerequisites absent from clean main**, copied byte-for-byte from the captured pre-R1 baseline: `lib/workout/v2/plan-v2.ts`, `store.ts`, `obligations.ts`, `operation.ts`. Their exact hashes/matching baseline are in the manifest. Their existence is required by authored v2 imports, but historical EX-RX01/R2A foundation acceptance is NOT invented. GPT03/overall must reconcile that prior implementation/policy acceptance before publication. Other pre-existing target/v2 behavior embedded in the authored paths also remains an explicit dependency of EXLOAD, not a newly designed feature here. No v2 migration/flag is activated by this package.

## Checks on this exact isolated integration

- Canonical web TypeScript: **exit0**, using the existing current-main release dependency/client installation by a read-only symlink.
- Canonical native installed TypeScript6.0.3: **exit0**. No native build, simulator, Metro, install, schema generation or shared config change.
- Direct copied independent core harness on candidate imports: **35/0 exit0**. Direct actual freezer/target/history seams: **8/0 exit0**. Copies write only private new evidence. These verify the integrated source, not the old root path.
- Source-only reverse preservation: **114/114**, exit0 in a private copy only, exact clean58c baseline bytes/absence restored. Final full transport has its own reverse check. No root reverse apply/reset/stash.
- An initial web compile used root's old generated Prisma client and reported unrelated missing intake models. Correcting ONLY the candidate dependency link to the already-existing latest-main client gives canonical exit0. Original failure log retained as a client/environment probe, not a source bug or hidden test pass. No Prisma client generation occurred.
- Original part evidence remains: UI4/0, strict recovery9/0, real independent PG11/0, retention/ownership/admin/targets, canonical original root compilers,79-path preservation. Source integration is not physical iPhone certification or a claim to have rerun every suite. Sub2 owns independent final integration review; overall decides build/release verification.

## Fresh service evidence — READ ONLY, no user data output

Existing reviewed inventory script was first inspected, then run with the existing private env-file execution. Its DB reads are inside `SET TRANSACTION READ ONLY`; credentials were not opened or printed. New output was written privately, not recomputed from the prior cache.

- Fresh inventory at **2026-11-17T07:30:39.555Z**:459 library rows. externalMass141, none155, band96, indicatedLoad33, combined1, implementMass32, unresolved1. **Visible unresolved0**; the only unresolved row is hidden.82 visible band rows require per-set role choice as designed.
- The15 visible e1RM-ineligible program candidate exercises remain in the inventory. A separate bounded fresh **BEGIN READ ONLY** audit at **07:33:02Z** reads only programKey/status/nextDay/pinned and active frozen plans internally, then stores aggregate output without user/program/session IDs, credentials or raw plans.
- Actual service:3 program rows,2 active; unknown keys0; active pinned references to those15 candidates0; remaining active percent-main-slot occurrences0; active frozen sessions0; actual current conflicts0. This clears the question about current pinned cycles at that time, not a guarantee against future user choices or a reason to change the allowlist.
- Read-only schema inspection confirms neither new column nor `WorkoutLoadRecovery` exists. No service writes, tests/account mutation or data backfill occurred.
- Fresh evidence: `fresh-inventory/load-contract-inventory.json`, `program-eligibility-audit.json` and bounded audit script/log; private full paths in the final manifest. No sensitive user data is included in public documents.

## Concrete activation / rollout gates

The candidate keeps `prisma/pending-migrations/20261116150000_ex_load01_recording_contract/` PENDING. The reviewed SQL is additive only:

1. Nullable `UserExerciseSet.load JSONB`.
2. Nullable `ExerciseVideo.loadSemantics JSONB`.
3. New `WorkoutLoadRecovery` table plus owner/set/hash uniqueness and two lookup indexes; no rewrite/deletion of old rows.

Corresponding `schema-additions.prisma` remains a proposal alongside SQL; active `prisma/schema.prisma` and active migrations are unchanged. Broad deployment instruction is not silently substituted for the historical prepare-only migration gate. **Before activation:** reconcile exact scoped approval, tell/coordinate Kim Min and the schema owner, create and verify a fresh `npm run backup`, then prepare SQL+schema together and use only `prisma migrate deploy`/generate through the approved serial procedure. Never migrate dev/db push/reset. No such backup/application/coordination completion is claimed here.

After schema application, verify actual columns/table/indexes and old-reader compatibility with the feature still off. Only then enable `WORKOUT_LOAD_SCHEMA=1` for the correct production environment and verify a new deployment and approved synthetic transaction/recovery paths. `WORKOUT_V2` remains off; its separate historical foundation migration is not required by this additive load SQL and is not activated as collateral.

**Code rollout while the switch remains off is distinct from complete feature activation:** recovery/retention/labels and safe capabilities can ship, but rich band/combined/unequal/setup storage correctly remains unavailable with update guidance. Do not call that fully activated equipment recording.

Outstanding honest device checks: the15-check iPhone/iPad keyboard/safe area/accessibility/symbols/haptics/gesture/animation/offline/account matrix. Old client coach re-save/load-rejected/null-owner caveats and conservative app-team preflight remain disclosed in the accepted part packet. If they are release-blocking, keep the affected capability off rather than inventing device proof.

## Ownership / next step

Candidate source is frozen when this packet is handed off; Support1 releases its own claims. Overall owns integration/push and Sub2 independent final integration review. No product commit/push, DB schema/flag/data change, native build or deployment has occurred in this prep. No other owner claims were changed. This work does not touch EX-REF04 private-evidence scope, human review progress or public-launch hold.
