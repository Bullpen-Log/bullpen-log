# Sinker × DUGOUT integration: independent review and remediation brief

The user explicitly requests that Claude MAIN, the existing session named “싱커, 덕아웃 개발 맥북 메인”, receive this review and improve the implementation. Continue in that session and the current repository; do not create a substitute session.

Read these files in full:
1. docs/designs/sinker-dugout-team-lesson-platform-review-2026-11-01.md
2. docs/designs/sinker-dugout-team-lesson-platform-claude-prompt.md
3. docs/designs/sinker-dugout-team-lesson-platform-plan.md
4. docs/designs/sinker-dugout-team-lesson-platform-stage0.md

## Scope and accurate status

Review baseline is f0bcf076bf0f57fa76db7cb7243b4b938c2328c8, including a98062a8 and bb51f499. Other sessions were editing unrelated home/pitch/release files during review. Recheck current source and preserve all concurrent work.

Your prior work was explicitly limited to stages that did not require database changes. Do not describe that partial delivery as full integration. Do not treat intentionally deferred database features as an accusation that they were falsely claimed complete. The requirement is now to fix confirmed defects, prepare a precise continuation plan, and complete all currently authorized work.

The reviewer ran org:test (411 passing), release-access:test (640 passing on the concurrent working tree) and release-gate:test (99 passing). Gate tests logged two mocked “rows is not iterable” home-query errors; passing access assertions do not prove those home queries succeeded. The reviewer also executed the actual booking action source with mocked dependencies to reproduce races; these are deterministic action-level interleavings, not real PostgreSQL concurrency measurements. Verify independently.

## A. Repair booking transitions before release (F01/F02)

cancelBooking currently reads allowed state before its transaction and then updates by id alone. An actual-action mock reproduction shows: cancellation reads CONFIRMED; completion commits DONE and a pass debit; cancellation overwrites CANCELED, leaving used=1 and a canceled event.

confirmBooking also checks REQUESTED outside its transaction, creates an event on every call, and updates the booking without its previous status as a predicate. Two calls reading the same request create two events, while only the last event remains referenced. declineBooking has the same stale-read pattern. These are defects in the present implementation, separate from future slot-capacity work.

Implement one explicit server-side transition contract:
- Define allowed previous states for confirmation, decline, completion and cancellation.
- Within the transaction, claim the permitted transition using conditional state predicates, correct owner/organization constraints and a checked affected-row count.
- Only the winning transition may create/link membership, event, credits or downstream durable effects. Roll back the claim if any required step fails.
- An already processed call returns a stable already-processed result. A competing action returns an accurate conflict, not generic success.
- A late confirmation must never resurrect a canceled/declined booking.
- A late cancellation must never overwrite DONE with a charged session. Post-completion corrections require a distinct authorized adjustment workflow and an auditable once-only reversal policy.
- Preserve the prior improvement: canceling an appointment must not delete historical events or performed activity.
- Emit notifications only for committed winning transitions. Do not notify on a losing retry. Design the durable delivery path so a post-commit error cannot turn a successful booking into a misleading retry that never receives its notification.
- Preserve existing client behavior compatibly while returning typed results for updated clients.

First fix same-booking races without schema changes. Then prepare the separate multi-booking capacity solution: coach, athlete and facility/resource conflicts, transaction isolation or locking strategy, retries and enforceable constraints. A preflight availability SELECT alone is insufficient. Prove last-slot behavior in an isolated PostgreSQL test environment; never use shared production data for concurrency tests.

Required cases: confirm/confirm, confirm/cancel, confirm/decline, finish/finish, finish/cancel in both winner orders; failure after a transition claim; repeated requests after lost responses; no orphan events or repeated debits/notifications.

## B. Complete organization-role entry paths without broadening access (F03)

Removing isMasterUser from coachOrg alone is incomplete:
- lib/org/join.ts rejects STAFF invitations for non-MASTER account types.
- loadMySpaces in app/actions/app-org.ts still gates coach organizations behind isMasterUser.
- requireMaster still blocks ordinary accounts in the web management layout, pages and actions.

Create consistent organization-scoped admission across invitation redemption, workspace discovery, DUGOUT navigation, page loaders and mutations. Personal Sinker eligibility must remain a separate decision. Do not change an athlete or parent into global MANAGER/ADMIN or convert their account persona to MASTER to bypass these gates.

Do not simply remove requireMaster everywhere. Introduce or reuse an organization-aware guard, then enforce the exact capability and target scope for every query/action. Unrelated platform administration must retain its existing gates.

Preserve existing authorized STAFF coaching behavior during compatibility migration. Do not appoint an ordinary parent as full STAFF just to simulate a scheduler/treasurer: STAFF currently includes broad training permissions. Until narrow grants are persisted and enforced end to end, keep that new delegation feature unavailable rather than pretending it is implemented.

Verify an ordinary account with a legitimate existing coaching membership can discover and access its authorized workspace, while a normal athlete without duties cannot. Verify the same account retains personal training. Address player-plus-coach responsibilities in one organization with one membership row and additive responsibility grants, rather than duplicate accounts or membership rows.

Correct the inaccurate HANDOFF statement that a general account can currently join through a staff invitation and immediately open the coach screen. Update it to the actual verified behavior.

## C. Replace incomplete delegation and scope enforcement (F04/F05)

canGrant currently only checks permission.manage and whether a scope string equals organization. The actual pure function accepts a PLAYER with only permission.manage(self) granting org.manage(explicit_group). No persisted grants are currently loaded, so this is a latent rule defect, not a claim of a live exploited delegation endpoint.

Before connecting grants to storage:
- Represent the specific target users/member IDs or group IDs and the granting organization. Scope labels alone are not sufficient.
- Compare target-set containment. self, linked_children, assigned_players and explicit_group are not a universal ordered hierarchy.
- Define which capabilities can be delegated, by whom, and under which explicit delegation authority. Unless an owner-only policy explicitly authorizes otherwise, a delegate cannot grant powers or targets outside their own permitted delegation envelope.
- Separate organization ownership transfer and global roles from routine capability grants.
- Define preset restriction, revocation and multiple-grant composition. A simple additive list cannot express removing a preset capability.
- Prevent self-escalation, delegation loops and removal of the last owner. Record actor, recipient, capability, target scope and changes in audit history.
- Reject unknown roles or missing/inactive memberships; do not infer STAFF when membership lookup returns null.

The current server guards only call hasCapability({role}, cap); capabilityScope is not applied to server reads. Audit every read path before granting narrow duties:
- loadOrgToday/loadOrgMembers use roster.read but return arm/training-related information.
- loadEventDetail uses schedule.read but includes individual actual-work values, correction messages and check-in-related information.
- Web member pages directly read notes, passes, reports and personal metrics after broad organization admission.

Build a shared authorization context with organization, capabilities, permitted target sets and consent scope. Apply it at query and DTO construction time for pages, actions, RPC, search, counts, media, exports and notifications. Separate basic roster/schedule fields from training, body/check-in, video, internal notes and finance. If preserving a composite response for old clients, omit unauthorized fields server-side and make hidden/unknown distinct from zero.

Test schedule-only and roster-only operators as real distinct permission subjects; test both list and direct-detail access. A guardian acting as scheduler must not receive other children's private fields even if the UI does not display them.

## D. Remove the existing booking metadata disclosure (F06)

lib/market/lesson-load.ts loadOrgBookings selects user._count.pitchLogs and returns it as player.records. The management bookings page displays the count even for REQUESTED bookings without a membership or sharing consent. This is an existing residual defect, not newly introduced by the reviewed commits.

Remove that unnecessary lifetime personal record count from booking operations. If a training metric is justified elsewhere, require training.read plus the relevant organization's effective sharing consent, allowed target and time range. Do not show private as 0. Check analogous aggregates across pages, RPC, exports and previews. Booking is not consent to share personal history.

## E. Return and display truthful completion results (F07)

completeBookingTx returns passId:null when no usable pass exists, but finishBooking discards the result. BookingActions always displays the same success message. A self-test comment says the screen informs the user; the current wiring does not.

Return typed outcomes such as completed/debited, completed-without-credit, already-completed, state-conflict, forbidden and failed, using repository conventions. Define whether completion without a valid pass is allowed. If allowed, show and record the uncharged outcome explicitly; do not silently charge an old completed booking when a pass is later purchased or the request is retried.

Wire the outcomes to the actual form/UI. Include counts/balance and an adjustment path only when backed by real data. Design the unique ledger and reversal flow for the coordinated database stage; do not advertise an audit ledger before one exists.

## F. Make activity attribution durable (F08)

native/src/org/space-store.ts currently stores orgReturn only in memory; setSpace clears it. consumeOrgReturn clears it before calling app-team.linkMyWork and silently swallows errors. This does not establish durable workout-to-event attribution across restarts/offline failure. The reviewer has not confirmed every mid-workout navigation path on a device; reproduce the exact supported flows rather than assuming all switching is allowed.

Persist the active account/athlete/organization/member/event/assignment and concrete source session/set identities with the activity. Separate return-navigation state from record attribution. Do not rely only on date/since-time matching or a volatile screen pointer.

Use a persistent idempotent pending-link operation and acknowledge it only after server acceptance. Show pending/failure state and retry after reconnect/app restart. Revalidate access at upload; preserve personal activity if organization linking is rejected. Never replay one account's queue as another account. One activity linked to multiple authorized plans still contributes workload once.

Verify app restart, offline completion, lost response, context switch, membership removal, consent revocation and account switch. Measure end-to-end propagation only after reliable linkage and delivery exist.

## G. Complete the original product contract in coordinated stages

The following remain required, with status explicit rather than silently dropped:
- DUGOUT team discovery/request/approval and the actual web/native management migration.
- Verified guardian-child relationships, multiple children/guardians, revocation and child-only views.
- Director-controlled persisted operational grants, targets, audit and actual settings UI.
- DUGOUT team/staff/subgroup/private lesson conversations, membership/history/media rules and moderation. Preserve marketplace 1:1 chat.
- Coach/resource capacity, original-preserving rescheduling, purchaser versus athlete, pass ledger and note draft/published/staff separation.
- Team recurrence and per-occurrence changes, RSVP separate from attendance/training, explicit announcement acknowledgement/deadlines and prioritized convenience functions.
- Reliable authorized change delivery, revocation-aware caches/subscriptions, old-client compatibility and real Sinker–DUGOUT journeys.

M-A through M-F in stage0 are proposals, not production-ready schema specifications. Refine them: concrete scoped grant targets, verified guardian authority, durable room membership revocation/history boundaries, monotonically usable refresh cursors, unique ledger operations, coach/resource capacity and rescheduling conflict semantics. Explain existing-data visibility and compatibility defaults before any migration.

Respect shared DB coordination/backup rules. Prepare concrete schema/API/UI/test artifacts and exact outstanding decisions before requesting a shared-state operation. Do not use pending coordination as a reason to stop unrelated authorized local fixes. Never run migrate dev/db push/reset or run a build that silently applies unapproved migrations.

## H. Verification and delivery

Start by reproducing the findings against current source. Fix F01/F02/F03/F06/F07 in a reviewable DB-free batch, then implement scope/attribution foundations and proceed through the remaining authorized stages.

Add meaningful actual-action and authorization tests. Source substring checks that merely prove coachOrgCan is mentioned are insufficient. Update older tests that deliberately require account-type-only gates when those contracts are intentionally superseded; replace them with positive AND negative organization-scoped behavior tests.

Keep restricted_beta and platform roles intact. New routes/actions/queued operations must remain release-gated. Other sessions are modifying release/home/pitch code; do not revert or overwrite their changes. Keep native/ as the official app and preserve Seoul icn1.

Do not push/deploy or apply shared migrations unless explicitly authorized for those operations. The current request authorizes review follow-up and implementation, not automatic public release or a production database rewrite.

Deliver:
- A finding-by-finding response (accepted, fixed, superseded with evidence, or pending).
- Updated R01–R14 traceability and stage0 status with implemented versus verified separated.
- Tests executed, exact results, and explicit mocks versus real DB/device evidence.
- Screenshots or reproducible authenticated UI checks for affected ordinary staff/director/guardian paths when available.
- Exact remaining migration/coordination decisions, compatibility and rollback plan.

Never claim “complete” or “perfect” from type checks, counts of source assertions, or mocked concurrency alone. Close each requirement with verified behavior and record remaining limitations precisely.
