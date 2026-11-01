# Implementation brief: Sinker × DUGOUT connected team and lesson platform

Act as the lead engineer and product designer working in this existing repository. Implement the following product contract in coherent, verified stages. Reuse the existing system; do not replace it with a disconnected prototype. Keep user-facing copy in Korean and preserve the established visual identity.

## 1. Product contract and required outcomes

Sinker is where athletes perform and record baseball activity: personal training, pitching logs, velocity measurement, pitching analysis, lesson exercises and homework. DUGOUT is where people organize that activity: teams, membership, coaching businesses, bookings, schedules, announcements and communication.

Move team and lesson ADMINISTRATION from Sinker to DUGOUT. Preserve athlete-facing team/lesson execution in Sinker. Coaches may still use Sinker for authorized in-session capture, measurement and analysis; those tools must clearly identify the athlete whose data will be saved. Do not move all coach functionality out of Sinker indiscriminately.

Both products must share one identity, organization membership and authoritative training records. Joining a team or enrolling in lessons through DUGOUT must make the appropriate execution context available in Sinker without creating another athlete account or copying workout history. Preserve personal training and the existing top-left context selector.

Maintain a traceability table for these requirements throughout implementation:

| ID | Required outcome |
|---|---|
| R01 | DUGOUT owns team joining, invitations, approvals and administration. |
| R02 | Sinker retains personal training and the top-left personal/team/lesson selector. |
| R03 | Sinker training automatically becomes visible in DUGOUT within authorized sharing scopes. |
| R04 | Directors/coaches can review assigned athletes, assign plans and resolve discrepancies. |
| R05 | Guardians can view only their verified children's permitted records and team schedules/notices. |
| R06 | Directors can delegate configurable organization duties, including to a parent administrator. |
| R07 | Teams have scheduling, tournament information, notices, attendance and practical coordination tools. |
| R08 | Teams have real group chat with membership, privacy and moderation controls. |
| R09 | Athletes/guardians can find coaches, book lessons and request schedule changes in DUGOUT. |
| R10 | Coaches can manage lesson members, schedules, plans, feedback and session balances efficiently. |
| R11 | Enrolled athletes get a Sinker lesson context and can return to personal training. |
| R12 | Each learner sees their own lesson history, completed sessions, progress, homework and future plan. |
| R13 | Coach-member communication and booking coordination take place in DUGOUT. |
| R14 | Existing data, old clients, privacy rules and current release restrictions remain safe during migration. |

For each ID, record the actual screens, server operations, data ownership, authorization rules, tests, rollout stage and status. Never mark an item complete because its button or mock screen exists.

## 2. Inspect the repository before editing

Read AGENTS.md, applicable nested instructions, HANDOFF.md, current git status and relevant installed Next.js documentation. Preserve other developers' uncommitted changes. Read the companion Korean plan at docs/designs/sinker-dugout-team-lesson-platform-plan.md.

Inspect and reconcile these existing implementation areas:
- prisma/schema.prisma: Org, OrgMember, ShareConsent, OrgEvent, OrgPlan, OrgEventAttendee, OrgAssignment, LessonNote, LessonPass, LessonBooking, OrgNotice/Read, OrgComment and GuardianReport.
- lib/org/access.ts, app-access.ts, rules.ts, space-nav.ts, team-work-store.ts, team-session-store.ts, homework and record-sharing helpers.
- app/actions/lessons.ts and organization/app actions.
- native/src/app/org/, native/src/org/, native/src/dugout/ and their actual navigation/authentication entry points.
- lib/release-access.ts, release-gate.ts and release-ops.ts.
- docs/designs/sinker-team-lesson-contract.md and other team/lesson contracts.

Verify findings against current code; earlier documents can be stale. Organization screens already exist in native/. The old statement that no native organization screens exist is no longer reliable. Retire conflicting product decisions explicitly rather than leaving contradictory instructions for the next engineer.

Known issues to investigate and fix as part of this scope:
1. Current coach access depends on global/account-type gates, which cannot express an ordinary parent with delegated scheduling duties.
2. GuardianReport links are not a verified, signed-in guardian-child relationship model.
3. Existing marketplace conversations are buyer/seller pairs, not team group rooms.
4. Booking completion checks state before the transaction and increments pass usage; prove and fix concurrent double completion.
5. Booking cancellation can delete a linked event; preserve completed activity and historical references.
6. OrgEventAttendee reply/attendance fields are currently documented as unused. Reintroducing attendance requires an explicit contract, not blindly enabling old fields.
7. Existing organization training writes into the athlete's daily training structures. Preserve that aggregation model and reconcile coach-entered and athlete-entered work.

## 3. User journeys and navigation

Team athlete: join/request in DUGOUT → approval → explicit sharing setup → refresh Sinker membership → choose team context → perform assigned training → director sees authorized results in DUGOUT.

Lesson athlete: discover coach in DUGOUT → choose offering and available slot → confirm booking/enrollment → lesson context appears in Sinker → perform lesson/homework → review published feedback and next plan → reschedule or message coach in DUGOUT.

Guardian: verify child relationship → select child → see that child's permitted progress, bookings and notices → coordinate with staff. Support multiple children and multiple verified guardians. A booking purchaser and the actual participating athlete are separate identities.

Director: open DUGOUT team overview → inspect today's schedule and items needing attention → assign whole-team/group/individual plans → review actual training → publish notices and delegate duties.

Coach: manage today's lessons, requests, learners and feedback in DUGOUT → launch an authorized capture/analysis task in Sinker when needed → return to the same learner/session context.

Keep the existing top-left Sinker selector with understandable labels such as 내 훈련, A팀 훈련 and B코치 레슨. Switching must not change identity, consent, historical attribution or an active workout's ownership. Freeze athlete/organization/event attribution when activity starts. Preserve drafts and offer a clear continue/finish flow when switching mid-activity.

Revalidate membership on app foreground, login, deep-link entry and permission errors. After membership loss, safely return athletes to their personal context. Preserve eligible received lesson history read-only without retaining access to the former organization's live roster, chat or private staff notes.

DUGOUT owns management forms; Sinker may show relevant schedule/notice summaries and links. Avoid forcing athletes to leave Sinker for each exercise or re-enter completed work in DUGOUT.

Use verified existing app identifiers, domains and link handlers. Do not invent URL schemes. Never pass access or refresh tokens in URLs. If cross-app login continuity needs an exchange, use the established secure auth flow or a short-lived, single-use, audience-bound exchange. Handle installation, old versions, expired links and the phone-browser redirect policy without loops.

## 4. Authorization and guardian model

Separate global platform role, account persona, organization membership, organization capabilities, guardian relationships, data consent and release-stage access. Organization director is not platform ADMIN. App context is never proof of access.

Use organization-scoped role presets plus explicit grants and scopes. Suggested capabilities: roster.read/manage, schedule.read/manage, training.assign/read/recordForAthlete, lesson.manage, booking.manage, notice.publish, chat.moderate, finance.manage, permission.manage and export.data. Suggested scopes: self, linked_children, assigned_players, explicit_group and organization. Adapt names to existing conventions.

A parent appointed treasurer or scheduler gains those operational duties without automatically seeing other children's training, videos, body data or private notes. If separately appointed to coaching responsibilities, require explicit athlete scope and the same sharing checks as other coaches. Directors can configure organizational duties, not override individual privacy or grant global service roles.

Support verified invitations/approvals for guardian-child links, expiration, revocation and disputed relationships. Do not approve relationships or merge accounts through name matching. Do not use report tokens as permanent authentication. Respect the existing unique organization/user membership constraint; model multiple responsibilities without duplicating membership rows.

Evaluate authorization server-side for every list, detail, search, action, download, export, attachment, subscription and notification. Return only authorized fields. Apply organization isolation and default denial. Prevent role self-escalation, unauthorized grant propagation and removal of the last owner. Audit permission changes and ownership transfer.

Preserve per-organization sharing consent. Joining or booking must not automatically share all historical personal data. Keep sensitive categories private by default where currently private. Record who granted/revoked consent, its scope, effective period and applicable guardian authority. Do not implement unsupported legal age assumptions as if verified.

Revocation must invalidate future reads, subscription delivery, cached views and media access. Partition caches by account/organization/child and clear them on logout or context changes. Use authenticated or short-lived media access, not permanent public URLs. Do not claim that already downloaded external copies can be remotely erased.

## 5. Canonical activity and reliable synchronization

Keep existing athlete-owned workout, pitch and analysis records authoritative. Organization views use authorized references or derived projections; do not create a second independent training database for DUGOUT.

Track athlete, actual author, source context, event/assignment references, occurrence time, server receipt time, version and idempotency key using existing fields where possible. Support personal, team and lesson activity on the same day without breaking daily session aggregation.

One real activity may satisfy multiple authorized assignments, but workload is counted once. Sharing with organization A must not grant organization B access. Existing personal history must not be retroactively imported into a new team without explicit scope selection.

Separate plan, RSVP, actual attendance, recorded exercise, coach confirmation, booking completion and pass consumption. Do not infer actual training from attendance, a planned session or a saved note. Show not received, pending sync, private, partial and needs review distinctly; do not label all missing records as not trained.

Preserve author/provenance for manual coach entries. Reconcile collisions with athlete-entered records without silent overwrites or double-counting. Changes to derived totals must be repeatable and auditable.

After a committed write, reliably trigger authorized refreshes through the current infrastructure. Use a durable event/outbox mechanism where needed; a write followed by best-effort notification alone is insufficient. Real-time events invalidate/refetch data; they do not become the source of truth. Handle retries, duplicate events, out-of-order versions, reconnects and polling/refetch fallback. No unnecessary microservice rewrite.

Proposed target, to measure rather than claim: online committed activity appears on an active authorized DUGOUT screen within p95 five seconds. Show last synchronized time and pending state. Define measurements and report actual results.

Offline Sinker records must retain original attribution and idempotency keys. Revalidate membership and sharing when uploading. If team access was revoked, preserve the athlete's personal work while rejecting unauthorized organization linkage. Never upload one account's queue under another account after logout.

## 6. Team management

Implement roster invitations, approval, leaving, director/coach assignments, guardian links and delegated administration. Existing unlinked roster placeholders need deliberate, verified account linking; do not automatically attach pre-link private history to a new account.

Team overview prioritizes today's schedule, unresolved items and compact athlete status rows. Allow filtering by group/date/status and opening a player's authorized detail without losing the list context.

Training planning follows whole team → subgroup → individual exception. Snapshot assigned participants so later roster changes do not rewrite past attendance or obligations. Preserve the current group/exception workflow and actual-work reconciliation.

Support team practices, games, tournaments, rest and other events; location, arrival time, equipment, target group, recurrence, occurrence-specific edits and cancellation. Preserve historical activity when an event is canceled. Model time zones and date boundaries explicitly.

Add RSVP and actual attendance as separate coordination tools. An RSVP is not attendance, and attendance is not training completion. Absence reasons must not be exposed to the entire team automatically.

Announcements support targeting, pinning, explicit acknowledgement, deadlines and reminders to eligible unconfirmed recipients. Distinguish opening a notice from acknowledging it. Schedule-change notifications must explain what changed and avoid duplicate delivery.

Include these conveniences with explicit priority and status: reusable training/schedule templates, tournament preparation checklists, travel meeting points, staff/parent duty assignments and equipment checkout. Calendar subscriptions must be revocable and minimally disclose data. Parent transport coordination must be opt-in and avoid publishing home addresses/contact details to everyone. Financial accounting/payment integration is a later separate scope, not a fake completed feature.

## 7. Lessons, bookings, progress and session credits

Coach discovery supports relevant location, specialty, audience, price, available time and an accurate profile. Do not invent credentials or verification badges. Reuse current discovery surfaces.

Distinguish organization, coach, offering, athlete, purchaser, facility/resource and time slot. Support a clear path from single trial to ongoing enrollment. A pending request must not confer unlimited membership privileges.

Define allowed transitions for requested, confirmed, completed, rejected, canceled and no-show, plus a separate rescheduling request. Explain whether pending requests reserve capacity. If expiring holds are used, implement their expiry and release semantics.

Enforce coach availability, participant conflicts and resource capacity atomically on the server. Concurrent requests for the last slot must not both succeed. A proposed new time must not destroy the original confirmed booking; acceptance atomically moves the reservation and releases old capacity.

Booking cancellation changes status and preserves existing activity/history. Do not delete performed workouts, analyses, published feedback or linked historical events as a side effect of canceling an appointment.

Make session-credit consumption transactional and idempotent. Use a conditional completion transition plus a uniquely keyed credit ledger or equivalent proof against duplicate debits. Consume the correct athlete's valid pass once. Cancellation/reversal and approved adjustments must also be auditable and idempotent. Saving a note, marking attendance or retrying a request must not independently deduct a session. Show no-valid-pass situations explicitly.

Preserve the fact that a stored payMethod is not implemented payment processing. Do not show successful payment/refund or introduce a live payment provider without an actual separately designed integration.

Learner views show their own upcoming session, completed count, dated lesson history, published coach feedback, assigned homework, actual execution, comparable progress and next goals. Other members under the same coach are not visible by default. Keep draft notes and staff-only notes separate from learner-published feedback.

Progress comparisons must retain measurement dates, units, source and comparable context; do not imply that unlike measurements prove improvement or generate medical conclusions. Sinker displays execution and personal progress; DUGOUT displays the corresponding management view of the same authorized data.

## 8. Conversations and notifications

Provide team-wide chat, staff-only rooms, optional subgroup rooms and private coach-learner conversations with authorized guardian participation where applicable. Do not expose every learner's records in one academy-wide group.

Extend chat additively with room type, participants, scoped permissions, messages and per-user read cursors, or implement equivalent organization-specific models. Preserve marketplace buyer/seller behavior. Do not simulate a group conversation using one buyer and one seller.

Define joining, leaving, history visibility, moderation and retention. Default new participants to messages from joining onward; use separate notices for current team-wide information. Sensitive training must not be automatically posted to group chat. Apply current authorization to referenced records and attachments.

Support reliable send/retry deduplication, ordering, pagination, unread counts, mute, report/hide controls and moderation audit. Revoke subscriptions immediately after access removal. Minimize sensitive lock-screen push content. Record notification deliveries so retries do not spam users. Offer a clear guardian-inclusive communication policy for youth learners; finalize exact eligibility rules in release configuration rather than inventing them.

## 9. UI quality requirements

Preserve existing product identity and shell. Do not redesign the whole homepage, add oversized promotional cards or replace practical screens with generic dashboards.

DUGOUT desktop team navigation should expose overview, roster, training, calendar, notices, conversations and settings using current navigation conventions. Use restrained spacing, compact readable rows, clear hierarchy and contextual detail panels. The lesson coach view prioritizes today's sessions, change requests and unanswered questions. Guardian home prioritizes child selection, next event, recent feedback and notices.

Use native/ for the official phone apps; do not revive mobile/. Mobile management screens use focused lists/detail pages rather than shrinking desktop tables. Preserve safe areas, keyboard behavior, readable scaling, accessible labels and touch targets. Test representative 360/390/430 logical phone widths and desktop 1280/1440/1920 widths. No clipped actions, horizontal page overflow or giant empty cards. Do not promise all information fits into one viewport.

Implement loading, empty, offline, permission-denied, revoked-membership and partial-failure states. Clear Korean messages must identify actionable next steps without leaking private data.

## 10. Migration, release and execution discipline

Reuse existing models and services first. Potential additive structures include guardian relationships, scoped permission grants, coach/resource availability, booking changes, credit ledger, room participants, audit events and durable refresh events. These are candidates, not a mandate to duplicate existing capabilities.

This repository's development database is also production. Follow AGENTS.md coordination and backup requirements before schema changes. Never run prisma migrate dev, prisma db push or prisma migrate reset. Prepare reviewed additive nullable/default migrations and safe backfills. Use dry-run counts, explicit mappings and retry-safe batches; do not merge ambiguous users automatically. Inspect build scripts because builds may deploy migrations.

Current restricted_beta intentionally limits non-ADMIN users to the approved pitching-3D experience. Do not silently unlock organization, training, chat or management features, and do not alter MANAGER behavior or roles. Register every new server operation with release-access coverage. Develop and test using isolated fixtures and authorized test modes. A pilot or public release requires a deliberate release decision; joining/bookings/deep links must not bypass the gate.

Roll out compatible server capabilities before client navigation changes. Support old web/app links through permission-checked routing to the proper product. Do not delete old endpoints until supported installed clients are accounted for. Web deployment and native OTA do not arrive simultaneously. Preserve Seoul icn1 and current app-update procedures.

Keep rollback possible through feature routing/flags and compatible servers without destructive schema reversal or deletion of new athlete records. Document recipient actions in HANDOFF.md. Do not commit, push, deploy, contact another person or run production migrations merely because this implementation brief exists; follow the current human authorization and repository requirements. Complete authorized local work and concrete migration artifacts first; request approval only for genuinely gated external/shared operations.

## 11. Stages and mandatory verification

Stage 0: repository audit, source-of-truth map, permission matrix, requirement traceability and conflicts with old contracts.
Stage 1: shared authorization, guardian relationships, consent, canonical links and idempotent synchronization.
Stage 2: complete team vertical slice from DUGOUT enrollment through Sinker execution to authorized director/guardian review.
Stage 3: complete lesson vertical slice from discovery/booking through execution, feedback, credits and next plan.
Stage 4: group/private communication, announcements, attendance, recurring scheduling and prioritized conveniences.
Stage 5: compatibility validation, measured synchronization, staged exposure and rollback readiness.

Do not stop after a mock UI or silently omit later requirements. If work must be split across sessions, leave exact completed/pending items, evidence and a concrete continuation checkpoint.

Required test scenarios:
- One athlete in two teams and one lesson organization, plus personal training on the same day.
- One guardian with two children; two guardians for one child; direct URL/API attacks against another child.
- A parent becomes scheduler/treasurer without gaining unrelated training access; grants are revoked while screens/subscriptions are open.
- Permission escalation, cross-organization IDs, private fields in list/search/export/push payloads and protected media access.
- Enrollment, pending/denied/revoked sharing, leaving/rejoining and protected historical lesson records.
- Activity retries, duplicate/out-of-order refresh events, offline upload after membership removal and account switching with queued work.
- Athlete and coach recording overlapping activity without double-counting; one activity linked to multiple permitted assignments.
- Two simultaneous last-slot bookings, overlapping coach/resource bookings and concurrent reschedule acceptance.
- Two concurrent booking completions debit exactly once; retries and reversals do not duplicate ledger entries.
- Canceling a booking/event preserves performed activity and learner-published history.
- Parent booking credits and records attach to the child, not the purchaser.
- Private/staff/group chat boundaries, new-member history, revoked attachments and duplicate message retries.
- Context switching during active work, app-to-app return, expired links, uninstalled app and older supported clients.
- Current beta denies restricted operations through UI, direct API, deep link and queued retry paths.

Use isolated data for destructive/concurrency tests, never shared real accounts. Run relevant existing checks and meaningful new tests; report exactly what ran and what did not. Manually verify core flows on both product surfaces and representative desktop/phone sizes.

Final delivery must include changed files, architectural decisions, screenshots or reproducible UI verification, migration/backfill instructions, requirement coverage, actual test results, remaining work, release dependencies and rollback steps. Distinguish implemented, verified, proposed and blocked. Claim completion only when the required end-to-end behavior is verified.
