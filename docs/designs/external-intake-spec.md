Implement a guided, invitation-based original-video submission flow for our existing Sinker / Dugout project.
The goal is a complete working feature, including public submission, private original storage, a shared administrator inbox, integration with the existing pitching 3D analysis system, and explicit publication of results back to the same invitation link. Follow the specification below. Do not stop at a visual prototype. Do not claim completion for behavior that has not been tested.

PRODUCT EXPERIENCE
A friend receives a private link, opens it without installing an app or creating an account, and follows one clear step at a time:
Welcome → Athlete name → Side video → Rear video → Review and consent → Upload → Receipt → Status or published 3D results on the same link.
Use interaction principles associated with approachable financial apps such as Toss: one question per screen, plain language, clear hierarchy, large primary actions, helpful contextual guidance, and honest feedback. Use our own existing visual identity. Do not copy another brand's assets.

REPOSITORY AND EXISTING IMPLEMENTATION
Read AGENTS.md and relevant repository instructions first. Read the bundled Next.js documentation before writing Next.js code.
Inspect: app/api/pitch-lab/upload-url/route.ts, lib/pitch-lab.ts, lib/pitch-lab-meta.ts, lib/pitch-lab-file.ts, lib/pitch-lab-guard.ts, lib/permissions.ts, lib/storage.ts, lib/analysis-consent.ts, lib/release-access.ts, lib/release-gate.ts, app/actions/pitch-lab.ts, app/(app)/admin/dev3d/, app/embed/lab/[id]/, lib/pitch-3d/v2/, proxy.ts. Verify their current contents; other developers may have changed them.
Existing constraints: existing pitching upload requires authentication; lab upload has a 150MB per-file limit; 3D developer administration is oriented toward batting samples; administrator sharing has personal and marker-sample exceptions; result embedding requires authenticated access; some mobile browser routes redirect to app-install guidance; lightweight file fingerprints are not full-file integrity hashes.
Preserve existing personal-video and marker-sample permissions. Add external pitching intake without exposing existing private data. Preserve unrelated uncommitted changes. Use the current checkout and verify local development behavior on port 3000. Production deployment is a separate step requiring authorization.

DATABASE SAFETY
Development uses the same database as production. Never run prisma migrate dev, prisma db push, or prisma migrate reset. Follow repository coordination and backup rules before applying schema changes. Prefer additive migrations. Develop and test against isolated fixtures without modifying real users' records. Do not store secrets or private invitation URLs in committed documentation.

PUBLIC PAGE
Create an independent public submission layout. It must not require authentication, onboarding, app installation, or navigation through Sinker or Dugout. No marketplace, community, account, or dashboard navigation. Allow the exact public routes through production phone-browser routing. Keep administrator endpoints authenticated. A valid invitation grants narrowly scoped capabilities for its own request. It must never act as an administrator session.

STEP 1 — WELCOME
Title: "투구 영상 두 개를 보내주세요"
Description: "옆과 뒤에서 촬영한 영상을 보내면 분석을 준비해요.\n앱 설치나 회원가입은 필요 없어요."
Primary action: "시작하기"
Secondary help: "촬영 방법 보기", "원본 영상을 고르는 방법"
Explain that paired analysis requires the same pitch filmed simultaneously from two viewpoints. Include simple side/rear illustrations. Explain side-camera placement for right- and left-handed pitchers in the capture guide. Avoid collecting unnecessary fields during basic intake.

STEP 2 — ATHLETE NAME
Title: "영상 속 선수의 이름은 무엇인가요?"
Description: "접수된 영상을 이름별로 정리할 때 사용해요."
Require a trimmed, reasonable-length name. Support Korean names and international names. Do not automatically merge people with identical names.
Primary: "다음"
Support proxy submission by a parent or coach when appropriate. Separate athlete identity from submitter identity. Collect only necessary additional information and applicable consent.

STEP 3 — SIDE VIDEO
Title: "먼저, 옆에서 찍은 영상을 골라주세요"
Description: "투수의 옆모습과 전신이 보이는 영상이에요."
Before selection: Show a compact side-view guide and "옆 영상 선택".
After selection: Show a preview when supported, filename, size, available video facts, "다른 영상 선택", and "이 영상으로 계속".
Do not advance automatically after selection. Do not autoplay audio. Unsupported browser playback must not automatically invalidate the file.

STEP 4 — REAR VIDEO
Title: "이번에는 뒤에서 찍은 영상이에요"
Description: "같은 투구를 뒤에서 촬영한 영상을 골라주세요."
Use the same selection and confirmation behavior. Detect selecting the same file for both viewpoints. Do not discard the valid side selection when rear selection fails.

STEP 5 — REVIEW AND CONSENT
Title: "이 두 영상을 보내면 돼요"
Display: Athlete name, editable. Side and rear file summaries, individually replaceable. A concise confirmation that both videos show the same pitch. Required submission and processing disclosures. Optional information in a collapsed section.
Primary: "영상 보내기"
Do not upload file bytes before the necessary authorization and consent. Keep analysis-service consent separate from optional model-development or training use. Review current consent implementation and unresolved processing details. Do not fabricate recipient, retention, jurisdiction, or guardian policies. Do not use administrator consent as a substitute for athlete consent.

STEP 6 — UPLOAD
Title: "영상을 원본 그대로 보내고 있어요"
Description: "완료될 때까지 이 화면을 열어두세요."
Show: Real total progress. Per-file progress and completion. Explicit preparation, uploading, and server-verification stages. Actionable recovery messages.
After byte transfer: "전송이 끝났어요. 파일이 잘 도착했는지 확인하고 있어요."
Only show receipt after the server confirms registration. Do not simulate progress or promise background completion after browser closure. Support interruption recovery instead.

STEP 7 — RECEIPT
Title: "영상이 잘 도착했어요"
Description: "분석 결과가 준비되고 공개되면 이 링크에서 확인할 수 있어요."
Display athlete name, receipt date, receipt ID, and current status. Offer "링크 복사". Do not promise notifications unless an actual notification channel exists.

RETURN VISITS
Resolve current server state before choosing the screen:
- Unfinished draft: restore the appropriate step.
- Interrupted upload: offer recovery.
- Submitted: show receipt/status.
- Correction requested: reopen only requested fields or viewpoints.
- Analysis running: show truthful status.
- Analysis complete but unpublished: show administrator review status.
- Published: show the explicitly approved result version.
- Expired upload permission: disable new uploads without automatically expiring separately valid result access.
- Revoked invitation: deny subsequent protected access.

ORIGINAL VIDEO HANDLING
Never resize, recompress, transcode, or strip metadata from originals. Preserve the exact file bytes received from the browser.
Distinguish: 1. Whether the device supplied a true camera original. 2. Whether the selected file was transferred without modification.
Do not claim that 120/240fps metadata proves camera-original authenticity.
Use factual labels: "240fps 감지", "영상 정보 확인 필요", "선택한 파일 그대로 전송됨" only after integrity verification.
Account for fractional frame rates, variable frame timing, orientation, and slow-motion edit lists. Do not interpret playback duration as capture duration without examining the media timeline.
Provide an iPhone original-selection recovery guide: Photos → Share → Export Unmodified Originals → Files → choose that file. Verify wording and behavior against supported OS versions. Do not claim the website can force the photo picker to return originals.
If preview cannot decode HEVC/MOV, preserve the file selection and allow server verification. Generate previews separately after upload. Never replace originals with preview files. Do not treat lightweight partial-file fingerprints as full SHA-256 hashes.

UPLOAD ARCHITECTURE
Use direct-to-private-storage resumable uploads. Do not pass large video bodies through Vercel functions. Prefer Supabase TUS with server-issued, narrowly scoped upload tokens. Use current official documentation for exact SDK and protocol behavior.
Default proposal: 1GiB per original. 2GiB per submission. Administrator-configurable limits within verified infrastructure limits. Verify project and bucket limits; do not assume the existing bucket accepts the proposed size.
Use sequential uploads by default to reduce mobile memory pressure. Do not load both large videos into memory. Use bounded-memory or incremental integrity checking.
Resume when the transport session remains valid. If browser file access is lost, ask the user to reselect the same file. Validate identity before resuming. Persist resumable metadata, not promises that File objects survive reloads. Scope recovery data to the invitation and submission. Avoid leaking credentials in logs or analytics. Handle transport expiration separately from invitation expiration.

STATE AND CONSISTENCY
Use explicit state transitions and server-authoritative status. Track per-file upload/validation independently from submission status, analysis status, and publication status. Finalization must be idempotent. Repeated clicks, retries, and lost responses must not create duplicates. Do not overwrite accepted originals. Use immutable file versions and freeze the selected pair at finalization. Support two devices uploading different viewpoints without corruption. Reject stale replacement/finalization attempts using version checks.
Use durable jobs and reconciliation for: Storage completion versus database registration. File verification. Sample registration. Analysis completion. Temporary-file cleanup. Processing must continue when the administrator closes the page.

SECURITY
Use high-entropy invitation credentials and store their hashes. Do not expose names in invitation URLs. Validate invitation status, scope, expiry, quotas, and object ownership on every relevant operation. Do not allow arbitrary storage paths, sample IDs, or result IDs. Keep originals private. Do not expose service-role credentials. Use rate limits, file-count and size limits, and actual file verification. Client-provided MIME types and file sizes are not authoritative.
Disable indexing and personal link-preview metadata. Link-preview GET requests must not consume or finalize invitations. Prevent sensitive caching, referrer leakage, and logging of tokens.
Offer optional access-code protection for result viewing. Explain that a bearer link can be used by anyone who possesses it.
Revocation must stop new authorizations and finalization. Do not claim previously issued storage URLs are immediately revoked. Use appropriately short read access and document residual validity.

SHARED ADMINISTRATION
Add "외부 영상 접수" to 3D administration. Keep existing pitching/batting functionality distinguishable. Both authorized representative administrators must see the same intake. Do not duplicate originals into separate administrator accounts. Do not derive permanent access solely from the invitation creator's role.
List: Name, receipt date, viewpoint completion, verification status, analysis status, publication status, assignee.
Support: Search, filters, pagination, previews, file facts, individual original downloads, paired original downloads, internal notes, assignments, correction requests, analysis execution, publication, unpublication, and audit history.
Use safe, readable download filenames: athlete_receipt-date_receipt-id_side-or-rear_original.ext
If generating archives, do so with a suitable background/streaming design. Do not assemble multi-gigabyte archives in browser memory or an ordinary short-lived web request.
Per-administrator read state must remain independent. Shared workflow status must be consistent.

ANALYSIS INTEGRATION
Automatically register a verified, finalized submission with the existing pitching sample/analysis workflow. Do not automatically start paid GPU analysis on untrusted uploads. Default to administrator-triggered analysis after validation and consent. Use an explicit storage/source adapter rather than broadening existing ownership checks or impersonating an administrator. Prevent duplicate analysis runs for the same immutable input version. Retain originals and useful failure information after analysis failure.

PUBLIC RESULT VIEW
Reuse existing 3D rendering components where appropriate. Create a separate public data-access boundary. Return only the approved result version and allowed presentation fields. Never expose internal notes, unpublished results, other submissions, or administrator-only original download URLs. Support rotation, zoom, play/pause, speed, and key moments. Show approved explanation and result date. Publishing must bind to a specific successful result version. Reanalysis must remain unpublished until explicitly approved. Do not silently replace a published report. Use a responsive result layout with enough room for 3D interaction. Do not constrain the result viewer to the narrow form column.

DATA MODEL
Use durable records for: Invitation/request and capability lifecycle. Athlete/submitter identity. Submission and revision. Immutable viewpoint assets and integrity facts. Analysis linkage and jobs. Publication version. Consent and withdrawal. Audit history.
Store receipt timestamps server-side. Distinguish receipt date from capture date and preserve date provenance. Display dates consistently in the intended timezone. Do not merge people by name alone. Do not place personal names in storage keys. Make orphan cleanup reference-aware and safe for active uploads. Define retention policies before enabling deletion of accepted originals.

DESIGN AND ACCESSIBILITY
One primary task per screen. Use concise Korean copy and contextual help. Use existing design tokens and icons.
Mobile: Single column, approximately 20–24px side padding, comfortable touch targets, safe-area-aware bottom actions.
Desktop: Approximately 480–560px centered form column.
Handle keyboard, short screens, scrolling, large text, and orientation. No horizontal overflow or hidden primary actions. Use semantic controls, focus management, accessible progress announcements, and reduced-motion support. Use brief transitions without blocking interaction. Show errors beside the relevant control with a concrete next action. Do not rely on color alone.

VERIFICATION
Test real flows, not only component snapshots. Required cases:
Valid 120fps and 240fps original pairs. Fractional rates and slow-motion timing. HEVC/MOV preview limitations. Photos picker versus Files selection. iCloud-backed files. iPhone Safari and Kakao in-app browser. Android browser and desktop browser. Side success/rear failure. Network interruption and transport expiry. Reload, browser termination, and file reselection. Finalization response loss. Duplicate submit clicks. Same file in both slots. Concurrent devices and concurrent administrators. Expired/revoked invitations. Unauthorized direct access to files/results. Publication, reanalysis, unpublication, and corrected submissions. Downloaded originals matching selected-file SHA-256.
Use isolated fake data. If physical devices or real high-frame-rate originals are unavailable, explicitly mark those tests unverified; do not claim they passed.

DELIVERY PROCESS
1. Inspect current code and document implementation decisions. 2. Prove original-preserving resumable transfer. 3. Implement the guided public flow. 4. Implement shared administration and reliable registration. 5. Integrate analysis and versioned result publication. 6. Run appropriate automated and browser tests. 7. Report completed behavior, test evidence, remaining physical-device checks, setup requirements, and material limitations.
Before declaring completion, map every requirement above to its implementation and verification evidence. Clearly identify any unfinished item rather than silently omitting it.
