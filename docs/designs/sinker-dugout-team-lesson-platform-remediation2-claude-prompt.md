# Sinker × DUGOUT: second independent review and corrective implementation

This message is authorized by the human user for the existing Claude MAIN session named “싱커, 덕아웃 개발 맥북 메인”. Read this brief and the second review in full, then implement the authorized corrective work in the existing repository.

Read:
- docs/designs/sinker-dugout-team-lesson-platform-review2-2026-11-01.md
- docs/designs/sinker-dugout-team-lesson-platform-stage0.md
- The original platform plan and R01–R14 implementation brief.
- AGENTS.md, HANDOFF.md and applicable nested instructions.

## Baseline and status discipline

Reviewed HEAD: e9176bfb, including your corrective commits 031f6d79 and 79a8bfb8. Recheck current source before editing. Preserve concurrent work and any already authorized deployment in progress. Do not revert the separate updated beta policy: training, records, notifications and support were deliberately added to the current allowlist. Older briefing text that described a pitching-3D-only policy must not overwrite the current human-approved policy.

The first review's booking races and personal pitch-count disclosure were improved, and typed completion notices are now connected. The old pure delegation escalation case is blocked. Retain those improvements.

However, the DB-free corrective work is still incomplete. Five additional findings G01–G05 are documented below. Do not mark the entire platform complete or label F03/F05/F08 fully resolved based on source checks alone. Update their statuses accurately.

The reviewer reran org:test (463), release-access:test (687), release-gate:test (100), and web TypeScript checking (exit 0). The access-gate suite still logs two mocked home-query “rows is not iterable” errors. Actual source modules with isolated mocked dependencies reproduced G02, G03, G04 and G05; no real database or device was used. G01 is directly visible in the component control flow. Verify all cases yourself and preserve the evidence boundaries.

## Priority 1 — Membership and invitation invariants (G02/G03)

G02: lib/org/join.ts reads an existing membership's id/status, not its role. For an ordinary USER with accountType PLAYER and an existing LEFT STAFF membership, accepting a PLAYER invitation sets status ACTIVE while retaining STAFF. The actual source mock returned ok=true and an ACTIVE STAFF. orgsFor/requireOperator/coachOrgCan then recognize the restored coaching authority. A player rejoin must never undo revoked operational duties.

confirmBookingTx in lib/org/booking-transitions.ts has the same role-blind reactivation pattern when enrolling a booking participant. Fix both paths, not only the invitation UI.

Design and implement one explicit membership-transition policy:
- Read role and status inside the relevant transaction.
- Distinguish athlete enrollment/rejoin from appointment/reactivation of operational duties.
- PLAYER invitations and ordinary lesson enrollment must never reactivate LEFT STAFF or MASTER authority.
- Do not silently downgrade ACTIVE staff/owners to PLAYER as a quick fix.
- A fresh staff appointment requires a valid director-issued STAFF invitation or separately authorized assignment action.
- When a single existing membership cannot represent player-plus-coach responsibilities, return an explicit supported conflict or implement the coordinated additive responsibility model. Do not silently consume the invitation, report success, and leave the wrong role.
- Preserve personal history and eligible received lesson history. Do not create duplicate accounts or duplicate organization memberships.

Required matrix: each existing PLAYER/STAFF/MASTER role with ACTIVE/LEFT/INVITED status, incoming PLAYER/STAFF invite, owner status, and enrollment through booking confirmation. Include the concrete LEFT STAFF + PLAYER invite regression. Assert the resulting effective privileges, not merely status or response text. Test both web and native action paths.

G03: a supposedly single-use STAFF invite can be accepted by two users concurrently. Validation occurs before the transaction, and the final orgInvite.update is unconditional by id. Actual joinWithCode mock execution admitted two STAFF users from one code.

Implement atomic redemption:
- For STAFF and placeholder-specific single-use invites, claim the invite inside the transaction with id/org/role, usedAt:null and current expiration predicates. Check the affected-row count.
- Link/create the membership and consume the invite in that same transaction. A failed membership transition must roll back the claim.
- Define same-recipient retry behavior without admitting a second recipient.
- Preserve intentional multi-use PLAYER invite behavior.
- Claim an unlinked placeholder with a conditional userId:null update. Never overwrite another account's claim.
- Revalidate expiration, revocation and role at redemption time. A SELECT before entering a transaction is not sufficient.
- Return typed used/expired/conflict/already-accepted results without leaking other users' private information.

Test two different users racing one STAFF invitation, two users racing a placeholder, the same user retrying after a lost response, expiration between preview and acceptance, invitation revocation, and rollback after a successful claim followed by downstream failure. Run real concurrency tests only in an isolated database, never the shared production database.

## Priority 2 — Finish the real web acceptance journey (G01)

The server now permits ordinary accounts to accept STAFF invitations, but components/org/join-view.tsx still defines usable as invite.role === 'PLAYER'. Valid STAFF invitations have no acceptance form and are presented as invalid/expired. Both /teams/join and legacy /join use this component.

Use a shared server-derived preview/acceptance contract for supported invitation roles. Provide:
- An athlete enrollment flow for PLAYER invites, including separate personal-data sharing choices.
- A staff appointment acceptance flow that names the organization and coaching duties. Do not treat staff acceptance as athlete sharing consent.
- Accurate expired/used/conflicting-role/forbidden/already-member outcomes.
- An explicit path for an existing player invited to staff responsibilities, governed by the membership policy above.
- A post-acceptance path to DUGOUT management and a Sinker membership/workspace refresh.

Audit generated CopyJoinLink destinations and native deep links. Keep existing invitation links working through permission-checked compatibility routing. Preserve account identity and personal Sinker access.

Test the rendered UI with authenticated role fixtures and the real acceptance action, including an ordinary account with a valid STAFF invite. Proving that joinWithCode accepts a role is not proof that a user can reach it from the screen.

## Priority 3 — Durable activity attribution and ordered synchronization (G04)

The added links queue does not yet satisfy F08:
1. setOrgReturn still stores the active event association only in memory. It is not written to links until consumeOrgReturn. A fresh module instance after restart has no association and issues no link RPC.
2. flushLinks removes a queue item on any returned response, including ok:true,linked:0. The workout sets have an independent outbox, and linkMyWork only links sets already on the server. A successful empty link before set upload permanently removes the only retry.
3. Requests identify work with a since-time lower bound rather than exact session/set identities; later unrelated personal work can be included.
4. persist is unawaited and saveJson swallows failures. pendingLinkCount has no actual UI consumer. Do not describe this as confirmed durable storage or visible pending state.

Implement a clear dependency protocol:
- Persist active account/athlete/org/member/event/assignment and concrete source session/set identities when the activity starts, not only when leaving a screen.
- Keep return navigation separate from attribution, including app restart and switching contexts.
- Coordinate the workout outbox with the link outbox: acknowledged set persistence must precede the final link acknowledgement, or the server must accept and durably resolve pending references.
- Use a stable operation key and concrete expected source identities. Do not infer ownership of broad same-day/since-time ranges when explicit identities are available.
- Distinguish acknowledged completion, waiting for source records, valid empty activity, retryable failure and terminal authorization rejection. linked:0 alone cannot prove all intended work was linked.
- Remove a pending item only after a final acknowledged outcome for its expected source records.
- Serialize storage writes, expose persistence failures, and await durable storage at critical boundaries. Do not report “saved on device” if only memory was updated.
- Display pending/error/rejected linking states in an actual athlete screen with retry where appropriate.
- Revalidate membership and consent server-side. Keep personal activity if organization linking is rejected. Never replay one user's queue as another user's account.

Tests must execute the real store/outbox code with deterministic storage/RPC fixtures: restart after activity start but before exit, restart after exit, link-before-source arrival, partial source arrival, delayed/lost response, duplicate retry, storage rejection, context switch, logout/login as another account, membership revocation and later unrelated personal sets. Then verify the supported flows on a device or simulator and report exactly which evidence is available.

## Priority 4 — Correct scoped DTOs and UI consumption (G05)

The current lens/redaction helpers have partial-target leaks. Actual pure-function reproduction:
- roster.read = organization.
- training.read = explicit_group with targets [m1].
- redactEventDetail hides m2.values but retains m2.outingNote, because lens.checkin is globally true when any training permission exists.
- redactToday keeps full-team recorded/selfRecorded/issues and group-level briefing when memberId is null, since seeTraining treats null as allowed.

Currently orgAuthz loads no persisted grants, so this is a latent defect before narrow grants are connected, not proof of a live user disclosure. Repair it before enabling delegation.

Use explicit target predicates for each protected category. Keep target sets declared in the type, not hidden in a cast. Resolve self to the actual current member identity. Data is allowed only within the relevant capability's target scope AND applicable individual consent.

For organization-wide aggregates and memberId:null rows:
- Provide the original aggregate only when access covers every included target.
- Otherwise recompute from authorized source rows or suppress it with a clear hidden/unavailable state.
- Do not expose hidden member counts, training outcomes or correction summaries through team-level totals.

Audit the complete response graph: member rows, outing notes, counts, plan actual values, plan target/memberIds, personal exceptions, tag lists, names dictionaries, event memo and briefing. Basic team-wide scheduling visibility may remain permitted, but private per-athlete fields and derived metadata require their own checks.

Prefer an allowlisted DTO for each role/capability combination. Spreading an unredacted object before deleting a few known fields lets newly added sensitive fields bypass the policy. Apply query filters before reading protected data, then verify the final DTO as defense in depth.

Complete the same policy across remaining note/homework/video endpoints, web management pages, search, notifications and exports. Do not connect persisted narrow grants while these paths remain broad.

Wire hidden/unavailable states into the actual client views. Native TodayEvents currently renders missing recorded as “recorded ?? 0”; hidden data must not become a real zero. Keep private, unknown, pending and zero visibly distinct. Test supported old clients explicitly; optional response fields are not a compatibility proof.

Required subject matrix includes:
- Organization roster plus training only for m1.
- Roster only, no training.
- A narrow roster plus broad training.
- Schedule-only operator.
- Owner/full coach.
- Future guardian with two children and one separately assigned operational duty.

Assert individual fields and derived metadata for both allowed and disallowed subjects, including memberId:null aggregates. The previous tests narrowed roster and training together; that does not cover independently scoped capabilities.

## Verification realism and completion gates

Your current transition mock acquires a row lock for every updateMany, including data:{}. The installed Prisma runtime, tested by the reviewer against a fake adapter, generates SELECTs without UPDATE/FOR UPDATE for that empty update. Do not cite that call as a row lock. The subsequent conditional CONFIRMED→DONE UPDATE remains the important protection. Do not fabricate a completion failure from this observation; improve test realism and use actual constraints/transitions as evidence.

Keep the previous conditional booking fixes and test them again. Address post-commit notification durability and different-booking slot-capacity protection as still pending items when not implemented. Fix the access-gate test fixture errors and assert expected successful payloads, not just absence of a feature-lock response.

Do not change the public beta allowlist or platform roles as a side effect of this correction. Respect current user authorizations and shared DB coordination/backup rules. Complete DB-free corrective work before requesting any genuinely necessary shared-state operation. Preserve any separately authorized deployment already underway; this review does not instruct you to cancel or roll it back. Treat new production deployment according to the current user's applicable authorization rather than assuming every future patch is preapproved.

The full product still requires verified guardian relationships, persisted scoped grants and settings, team/private lesson chat, complete DUGOUT administration ownership, coach/resource slot capacity and rescheduling, purchaser-versus-athlete handling, pass ledger, note visibility, recurring events/attendance/notice acknowledgement, reliable change delivery, and measured cross-app behavior. Keep all R01–R14 on the continuation plan; do not drop them because the current batch is DB-free.

Deliver:
1. G01–G05 response: reproduced/fixed/pending, source locations, actual tests and limitations.
2. Updated F03/F05/F08 and R01–R14 statuses, separating implementation from verified behavior.
3. Proof of staff invitation acceptance through the actual UI and privilege assertions after rejoin/revocation.
4. Restart/offline/outbox ordering evidence and exact-source attribution tests.
5. DTO negative-access tests and actual hidden-state rendering evidence.
6. Exact remaining migration decisions, compatibility/rollback steps and next bounded task.

Start with G02/G03 to close privilege lifecycle defects, then complete G01, G04 and G05. Do not report a feature complete solely because the helper exists, the test count increased or TypeScript passes.
