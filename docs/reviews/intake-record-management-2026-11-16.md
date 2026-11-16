# Intake record management — 2026-11-16

User asked administrators to edit and delete the test athletes submitted through video intake. Implemented directly under the prior instruction to GPT to perform implementation. Based on fresh origin/main 0d532e70 in the main-approved exclusive release checkout.

## Behavior

- Intake detail now has **선수 정보 수정** and **접수 삭제**. Editing corrects the administrative athlete display name and private invitation memo. Access credentials, original bytes, consent and immutable finalized revision/result names are preserved; this distinction is stated in the form.
- Deleting moves the record to **휴지통**, excludes it from ordinary list/search/unread counts, revokes existing invitee sessions and makes the invitation inactive. Active publications are taken down in the same transaction.
- The list has a visible trash link and the invitation filter includes trash. Archived detail shows restoration controls rather than ordinary editing/download/publication tools.
- Restoring returns the record to the ordinary list with its pre-trash active/revoked invitation status. Previously revoked links stay revoked. Publications never automatically return. Session epochs advance on both operations. Existing retention deadlines continue; expired/purged original files are not recreated.
- No schema or migration. The existing invitation String status stores `archived`. Public intake guards already reject every non-active status. Original retention and unreferenced file cleanup remain unchanged. This is recoverable record deletion, not immediate permanent storage erasure.

## Server and tests

Every action checks existing intake admin permissions on the server and in the data layer. All mutations lock the submission row, require the observed version, increment it and audit the operation. The archive audit includes its exact version and previous invitation status for restoration. Failed/stale edits do not overwrite concurrent work.

PGlite admin suite: **883 passed**, including direct unprivileged and server-action guards, validation, stale writes/restores, trash exclusion/search, blocked public links, originals/revisions preserved, publication removed, no automatic republication, revoked-link restoration and repeat archive/restore. Existing R06 display-copy assertions in this previously unrun suite were aligned with the already deployed formal Korean text; their conditions remain intact.

Existing detail suite: **407 passed**. TypeScript and scoped ESLint passed. Full Next production build passed. Browser inspected actual RecordManagement components with inert action replacements: edit/save closes correctly, delete confirmation and trash/restore presentation. Preview has no environment file and writes no production data. Temporary browser evidence is private under `~/bullpen-intake-admin-evidence`.

No existing user/test production records were edited or deleted by this task. Root dirty work, R07/R08 original-selection/media policies and main-owned local3000 checkout are preserved. Main final review/integration/release still required at handoff.
