# MECH-FOCUS01 — Ranked training purposes

## Authorization and ownership

2026-11-17: human explicitly requests design and implementation in the mechanics chat. Direct GPT implementation exception applies; no Claude implementation or independent Claude verdict is claimed. Owner: `gpt-mv-01a1c08f-18e9-7d81-b86c-893734cde6dd`. Root checkout: `/Users/yuno/Developer/bullpen-log`. Preserve all unrelated dirty edits. Final integration/publication belongs to overall; implementation does not claim live deployment.

## Contract

- Keep existing `MechanicsGuide.focusPoints: string[]`. First value is the highest priority training purpose; subsequent values are descending priorities. No schema migration. Allow all six known purposes, no duplicate or unknown values, no automatic padding.
- Select purposes the drill is meant to improve, rather than every movement that happens during it. `스로잉` means targeted arm/throwing-motion correction or throwing-speed training, not simply the presence of a throw.
- Admin can add/remove purposes and move them up/down. Server preserves submitted order; failed-form values and older submissions remain compatible.
- Web badges and native detail show ordinal priorities. Existing category, stage and original IDs remain intact.
- Rank matching purposes by their stored position. Preserve stage eligibility, equipment, pain rules and specific prescription recipes. Existing 3D quick picks keep beginner-stage precedence, then purpose rank. The web/native filtered library and within-stage element lists rank by purpose. The dynamic combined-purpose candidate prioritizes the requested main purpose, then next purpose.
- Prescription candidates must actually include the prescribed purpose, even when a historical recipe names them. Such mismatches are reported as recipe gaps in the progression flow, rather than silently labeled as another purpose. Base complementary drills are not claimed as correction recommendations.
- Fixed level sessions keep the same drills and are displayed in movement-chain order under the updated classifications. Existing supported-leg-lift rename and medicine-ball family suffixes are resolved without dropping recipe links.
- Review the first nine videos now and continue human review at #9. Other videos retain their previous classifications until individually reviewed; do not pretend their old secondary ordering has been independently assessed.

## Changes and consumers

- `lib/mechanics/focus-priority.ts`: normalization and matching rank.
- `app/actions/content.ts`: remove two-secondary cap, preserve rank. Only focused import/parser change is this task; unrelated R1 work remains foreign.
- `app/(app)/library/mechanics/guide-form.tsx`: ranked picker and ordered hidden fields.
- `components/meta-badges.tsx`, `native/src/library/drill-detail.tsx`: purpose ordinal display.
- `lib/mechanics/drills.ts`, `lib/mechanics/program.ts`: recommendation rank, correct prescribed-purpose association and level order; family naming compatibility.
- Web/native mechanics element lists and library filters consume priority instead of boolean primary/secondary alone.
- `lib/exercise-meta.ts`: explicit throwing-purpose definition; labels remain unchanged.
- `lib/mechanics/levels.ts`, `lib/mechanics/prescriptions.ts`: reviewed supported-leg-lift title compatibility.
- `scripts/mechanics-focus-selftest.mts`: full six-purpose ordering, duplicates/unknown rejection, priority-2 vs priority-3 recommendation, stage precedence, absent throwing-purpose exclusion.
- `scripts/mechanics-selftest.mts`: assert actual session order and all selected-purpose coverage, rather than assuming only primary tags describe a complex drill. Keep membership/equipment invariants.

## Verification

- Root TypeScript final: exit 0, `/tmp/mech-focus-tsc-release.log`.
- Canonical native TypeScript: from native cwd, `node node_modules/typescript/bin/tsc --noEmit --incremental false`, exit 0, `/tmp/mech-focus-native-canonical.log`. Earlier root TypeScript invocation was the wrong toolchain; the canonical native command passes with no config or lib changes.
- Web lint: exit 0, `/tmp/mech-focus-lint-final.log`, two existing unused-variable warnings in legacy selftest.
- Native lint from native cwd: exit 0, `/tmp/mech-focus-native-lint-final.log`.
- Mechanics regression: 3226 passed / 0 failed, `/tmp/mech-focus-regression-purpose.log`.
- Focus tests final: 10 assertions, exit 0, `/tmp/mech-focus-tests-release.log`.
- Actual admin picker React SSR: six selected purposes including fifth secondary produce six correctly ordered fields; reordered values remain reordered. `/tmp/mech-focus-evidence/form-check.log`, fixture `/tmp/mech-focus-evidence/form.html`. This is not an authenticated interactive browser or device check.
- Data audit: first nine checked; three updated; conditional writes/readback verified. Local original records preserved under `~/bullpen-video-review/2026-11-17-purpose-priority/`. Human review index does not advance.

## Outstanding release checks

Interactive isolated browser validation completed: six-purpose selection, reorder, POST to actual extracted `readFocusPoints`, memory save, reopen and failed-save restoration verified. Logs `/tmp/mech-focus-evidence/interactive-roundtrip.log`; screenshots `interactive-saved-reopen.png` and `interactive-failure-preserved.png` in that directory. Fixture uses the actual React picker and parser, no database. Authenticated full production action/revalidate roundtrip, actual web/native consumer display and recommendation order require final integration validation. No production feature release or native physical-device proof is claimed. Shared localhost3000 uses another checkout; do not overwrite/restart it without coordination. Isolate this change from foreign root diffs during integration.


## Revision 3 — consolidated independent review corrections

Two independently reported defects addressed together: assessment output reordering and medicine-ball variant labels.

- The ordinary `assessMechanicsSession` path now retains the actual builder output order after checking every planned title for missing library or equipment. No missing item is silently removed.
- `toolOf` accepts both legacy `(큰/작은 공)` and reviewed `(큰/작은 메디신볼)` suffixes, preserving separate small/large variant labels and tool ordering.
- Focus test now has 20 assertions: actual assessment-output vs builder seam, limited-equipment/missing-library reporting, and real `groupDrills` variant identity/label order.
- Final root tsc and focused lint exit 0: `/tmp/mech-focus-r3-tsc.log`, `/tmp/mech-focus-r3-lint.log`; focus tests exit 0: `/tmp/mech-focus-r3-test.log`. Canonical native compiler run: `/tmp/mech-focus-r3-native.log` (confirm process completion with delivery).
- Actual full `createGuide` and `updateGuide` production module runs in isolated mocks with its real `assertAdmin`, `withInput`, input validation and order parser. Create/update/read, six values, unauthorized request rejection, failed validation, no write on failure, cache clear and `/library/mechanics` revalidation calls are asserted (15 assertions, exit 0), `/tmp/mech-focus-evidence/action-roundtrip.log`.
- Browser fixture was connected to those full actions and exercised six-purpose create, priority reorder/update, reopen from the cache boundary, and failed validation with actual returned `withInput` values. `/tmp/mech-focus-evidence/full-browser-action.log`, screenshot `full-action-failed-restore.png`. Auth/DB/cache/Next boundaries are mocked; this proves action invocation and invalidation calls, not live Next framework cache or authenticated production durability. No operational test record was created.
- Original r1/r2 artifacts remain immutable. Final corrected revision is a separate packet; final integration and production/device checks remain overall gates.


## Revision 4 — per-video training purposes (human choice confirmed)

The user chose “영상별 목적을 유지해 추천 (권장)” on 2026-11-17. Preserve the actual small/large medicine-ball video's ordered purposes and stage. Do not union, pad or synchronize their classifications. This authorizes bounded local correction of the r3 variant leak; it does not authorize schema/data rewrites or release.

- New grouped variants carry their own ordered `focusPoints` and `stage`. The default family display uses stable tool/id order, independent of database row order. Older serialized/synthetic views without these fields fall back to their original wrapper metadata.
- `drillPurposeViews` projects a family into views whose variants share the exact ordered purposes and stage. Web/native within-stage element lists, quick picks, report candidates and program selection use these views. Purpose/stage variants remain separate; the original family title and concrete video IDs stay compatible with recipes.
- Program selection checks the concrete view's requested purpose(s), required stage and owned equipment. Among eligible views it respects purpose priority, then tool/id order. Combined-purpose recommendations require both purposes on the same video. Missing equipment cannot make an unrelated small-ball video stand in for a large-ball purpose. Progression still reports missing library/recipe/equipment rather than granting completion.
- Session alternatives are reconstructed by the selected concrete video's ID and contain only its exact purpose/stage cohort. Switching tools cannot silently borrow another video's classification. Existing frozen attempts/history are preserved; this revision does not rewrite previously persisted attempts or upgrade old stored payloads.
- 3D report recipe lookup now checks the actual projected purpose and stage rather than selecting the last family-title collision. A legacy recipe whose stage/purpose disagrees with current content can consequently be omitted; no replacement drill or reclassification is invented. Library/recipe reconciliation remains visible follow-up work, not justification to label the wrong video.
- Reviewed metadata remains unchanged: small hinge-drive = drop → torso rotation; large = drop → torso rotation → separation. Human review remains at #9 Walking Windup, pending the user's next/okay.

Focused regression includes both source orders, preservation of different purpose orders, only-valid-large selection, owned-small-only rejection, owned-large acceptance, progression missing-gear reporting, per-video stage eligibility, and combined-purpose isolation. Actual production functions are called using local fixtures; no operational test rows are created. R3 output-order/label tests remain in the same test file.

Verification artifacts for r4: `/tmp/mech-focus-r4-test.log` (focused assertions pass), `/tmp/mech-focus-r4-regression.log` (3226/0), `/tmp/mech-focus-r4-tsc-final.log`, `/tmp/mech-focus-r4-native-final.log`, `/tmp/mech-focus-r4-lint.log`, `/tmp/mech-focus-r4-native-lint.log`. Final root/native compilers and focused web/native lint exit 0. Actual web/native list functions, report recipe lookup and session alternative projection passed 18 fixture assertions: `/tmp/mech-focus-r4-consumers.log`. Additional full 3D suite: 385 pass / 1 fail (`/tmp/mech-focus-r4-report.log`); the same shoulder-reprojection 3% boundary failure reproduces on immutable baseline ed82bffb (115 pass / 1 fail in the exact suite prefix, `/tmp/mech-focus-r4-baseline-camera.log`). This is a documented pre-existing engine failure, not a passing full-suite claim. Original r1/r2/r3 delivery directories are immutable; r4 is a separate exact-source packet. Real framework/authenticated persistence, physical-device validation and overall integration/release remain separate gates; no production feature deployment is claimed.

## r4 independent review checkpoint — fixed-level stage gap

2026-11-17: Sub2 independently confirmed the two original r3 fixes, the per-video purpose correction and the 18 consumer fixtures. A new material gap was reproduced on exact immutable r4: ordinary fixed-level sessions call untagged `itemsFromTitles`, so concrete-video purpose/stage projections do not enforce the selected level's allowed stages. Synthetic intro fixture with a small-ball integration variant and a large-ball basic variant, owning only the small ball, returns the integration video as required with no missing requirement. Evidence: `/tmp/mech-focus-r4-levelstage.cjs`, `.json`; department read-only rerun `/tmp/mech-focus-r4-levelstage-part-check.json` reproduces it. This is a synthetic eligibility counterexample, not a claim that this exact pair exists in live content.

Part verdict: HOLD; not final acceptance or release-ready. Report to the user under WORKFLOW.md section 5/103 before further implementation; no new revision/order/implementation has started. Proposed bounded follow-up: enforce the chosen ordinary level's allowed stages before selecting owned concrete variants; keep recipe title/identity and purpose priorities; report a missing eligible variant/equipment rather than silently promoting stage; add ordinary-level builder plus assessment tests for both row orders and owned-only-invalid vs owned-valid equipment. Preserve prescription-stage behavior, original order/tool-label fixes, history and prior immutable packets. No DB/schema/video rewrite or deployment is included. Human video stays #9 Walking Windup.

## Revision 5 — authorized correction and full release

Human instruction 2026-11-17: “보완해. 배포까지 다 해”. This explicitly authorizes the bounded stage-gap correction and subsequent coordinated production web/app release after technical acceptance; do not ask for the same deployment permission again. The existing direct-GPT implementation exception is retained for this small follow-up. Overall owns final technical approval and the serial release lane; avoid overlap with R15's new native runtime. Source integration, deployed web, app update availability and physical-device confirmation are separate facts.

- Ordinary fixed-level builders now project concrete variant cohorts and filter them by the selected level's allowed stages before choosing owned equipment. Prescription-stage behavior is unchanged.
- Assessment reports a recipe gap if a named family exists but no concrete video has an allowed level stage. When an allowed-stage video exists but its equipment is unavailable, the missing-gear list is based only on allowed-stage candidates. No stage promotion or silent completion.
- Tests reproduce the independently reported pair in both source orders, owning only invalid-stage equipment, owning only valid-stage equipment, both, and unknown equipment. Builder and actual assessment output must agree. All-hard and unclassified-stage-only families produce recipe gaps. Existing r3/r4 purpose/rank/stage/equipment/combined-purpose tests remain.
- Focus test, full mechanics regression (3226 pass / 0 fail) and focused lint pass: `/tmp/mech-focus-r5-test.log`, `/tmp/mech-focus-r5-regression.log`, `/tmp/mech-focus-r5-lint.log`. Root and canonical native compiler logs: `/tmp/mech-focus-r5-tsc.log`, `/tmp/mech-focus-r5-native.log`; both process exits confirmed 0. R4's unrelated 3D numerical boundary failure and baseline reproduction remain documented; no needless full rerun or blanket pass claim.
- No DB/schema/video rewrite, unrelated source integration or human-video advancement. Immutable r1–r4 evidence remains intact. A new r5 packet will carry the exact corrected source for independent review and overall release.
