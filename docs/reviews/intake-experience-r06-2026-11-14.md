# External intake experience — R06 implementation review

Date: 2026-11-14. Owner: GPT 05, Video Sharing.

The user explicitly instructed GPT to implement the approved experience redesign directly. Implementation is confined to the existing `intake/r05` checkout; unrelated dirty root work and the main local server on port 3000 were preserved.

## Delivered behavior

- Shared invitee typography, input borders, focus rings, spacing and 52px primary actions. Short headings and concise purpose text replace repeated introductions. Initial input autofocus is removed; validation still focuses the affected field.
- Enrollment and return access use the familiar Korean word for password. Four digits, leading zeros, private in-memory credential handling and server authentication are unchanged. Sender credentials remain separate from athlete naming.
- Welcome foregrounds the same pitch, simultaneous two-phone capture, and mandatory 120fps-or-higher originals. Side/rear selection keeps the capture requirement visible, displays filename and frame information, and puts secondary metadata and size guidance in disclosures.
- Capture help follows setup, placement, framing/clothing and recording. Device-specific settings are selected rather than shown together. Original preparation offers iPhone original export, iPhone-to-Mac AirDrop and Android/computer routes. Only the selected procedure is displayed. The AirDrop route explicitly explains Share → Options → All Photos Data and Current format, with OS/route limitations retained.
- The review remains a sequence of individual decisions. File summaries are compact, required and optional consent remain separate, and terms open in a dialog. The legally recorded consent body, version and text hash are untouched; opening the dialog does not check consent.
- Upload headings distinguish preparation, transfer and server verification; stopped work is not labelled as still running or confirmed. The receipt foregrounds the next step and server retention deadline while secondary details can be expanded. Recovery, correction, reconsent and result access follow the same presentation.
- Admin screens follow originals/download → result import/review/publication → corrections. Frame and integrity facts remain visible, detailed metadata is expandable, automatic analysis settings are separate from the result list, and manual imports remain private until actual review and publication. Access maintenance, consent history and audit history are secondary disclosures. Local-copy recording explains that it does not extend server retention.

## Invariants checked

No schema, migration, package, storage, native-app, GPU configuration, upload implementation or authorization changes. Original files are not transcoded or recompressed by this change. Existing SHA-256 and full-file verification remain authoritative for selected-file transport identity. This does not prove that an operating system's picker supplied an unmodified camera original.

Display-only changes in the shared intake state/error/admin-label helpers and admin detail rules preserve their calculations and decisions. Existing admin regression assertions were retained and updated for renamed copy; source-text checks tolerate formatting whitespace and trailing commas.

## Validation

- Core: 496 passed.
- Original transfer: 241 passed.
- Client/review: 193 passed.
- Public endpoints: 176 passed.
- Invitee access: 292 passed.
- Admin detail: 407 passed.
- Scoped ESLint: passed. Git whitespace check: passed.
- Production webpack compilation: succeeded. Full build/type generation is blocked by a pre-existing unrelated export, `recordingsHref`, in `app/(app)/admin/velocity/recordings/page.tsx`. The generated Next route validator rejects that named export. Main integration must use or supply the existing owner’s fix; this task does not edit the unrelated page.

## Visual inspection and limits

The browser preview renders actual components with synthetic data and inert admin-action replacements. It has no environment file or database fixtures and records no production uploads, credentials, consent, review or publication. Screenshots and measurements are private local evidence under the R06 evidence directory, not repository assets.

Checked widths: 320, 375, 393 and 430px; desktop admin at 1280px. No horizontal overflow in the tested invitee cases. At 375×667, enrollment, welcome, side selection, file confirmation, required-consent decision, final summary, receipt and active upload fit the viewport with the ordinary sample data and the long sample filename. At 320×568, some screens scroll vertically rather than clipping content. Detailed guides, terms, expanded metadata, validation errors and large text may intentionally scroll.

Verified in browser: initial input focus does not open a keyboard automatically; empty-input errors focus the name field; terms remain closed initially and opening/closing them leaves the consent checkbox unchecked; original-help route selection changes the displayed instructions; admin originals and publication prerequisites are distinguishable. Real iPhone/Android photo pickers, AirDrop export, a physical software keyboard and 3D hardware rendering were not newly verified. The upload transport suite passed, but no new production video was uploaded during this UI work.

## Release handoff

Main GPT must independently review and integrate this scoped source commit in isolation, address the unrelated baseline build failure using the appropriate current source, deploy under the existing user release authorization and verify the live assets. A completed local implementation is not itself a production deployment.
