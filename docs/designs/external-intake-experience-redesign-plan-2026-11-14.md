# Video Collection Experience Review and Redesign Plan

Date: 14 November 2026  
Prepared for: the product owner and the existing Claude video-sharing implementation owner  
Status: design proposal only. This document does not start implementation or authorize deployment.

## 1. Objective and product boundaries

Redesign the entire invitation-based video collection experience so a person can understand each screen, prepare the correct originals, submit them, and return to check progress without having to interpret a dense instruction sheet.

The immediate problem is not missing newline characters. The interface gives too much information the same visual weight, repeats explanations, uses long titles, and puts help in the wrong place. The redesign must change information priority, wording, grouping, typography and interaction together.

Preserve the existing collection product: a private invitation link; a name and four-digit numeric password with leading zeros preserved; two original side/rear videos of the same pitch captured simultaneously at 120fps or higher; unchanged file bytes; administrator download; and access to an explicitly approved 3D result through the same invitation. There must be no member signup or main-service navigation in this experience.

The review covers all invitee-facing screens, help viewers, transient states and return journeys, together with the intake administrator's invitation, receiving, download, correction and result-return workflow. Other parts of the administrator console are outside this plan.

## 2. Evidence and diagnosis

The owner's actual iPhone screenshot is the primary evidence for the enrollment screen. The current source baseline is R05 source `86fc71eed9ad0fa116a43cc3c12bfeccbd8e9c01`, deployed as `7d767680c2b0f48fb168a4b844575c8b075998b6`. The broader review uses the source for the remaining states and the previous isolated screen evidence. These are design findings; they are not a claim that every branch has been exercised on a real phone.

### Why the previous line-break correction was insufficient

1. **It separated sentences before removing repetition.** Enrollment repeats the purpose of the login information in its first two explanatory sentences. Turning both into paragraphs increases height without increasing understanding.
2. **It treats most screens as the same kind of document.** `Screen` provides a prominent heading, description, content stack and action area. A field hint, a capture tutorial, a consent decision and an upload status need different information structures within that shell.
3. **The titles carry too much of the explanation.** The enrollment title is a long question about the link, name and PIN. Its heavy heading style and automatic wrapping dominate a simple setup task. A question format is permitted, not mandatory for every title.
4. **Terminology interrupts reading.** Visible strings contain `PIN 은` and `PIN 을`. The embedded spaces, repeated English abbreviation and separate numeric explanation make a familiar password task look technical.
5. **Spacing reflects component boundaries rather than relationships.** Large uniform gaps separate related password fields, while a condition such as four required digits sits in the introduction instead of beside its field.
6. **Visual emphasis is poorly distributed.** Strong headings and labels coexist with large dark input shapes and a bright focus outline, while unfocused fields are less distinct from the background. The first screenshot makes the form feel uneven rather than intentionally grouped. Exact contrast must be measured; the screenshot alone does not establish a contrast ratio.
7. **Instructions are repeated across the journey.** Same-pitch capture, high frame rate and original-selection rules appear in preparation, picking, confirmation and help. Repetition should be a short reminder at the decision point, not a second full explanation.
8. **Technical distinctions are exposed without a consistent hierarchy.** Uploading, file arrival, verification and receipt are different states. Metadata and integrity details can overwhelm the main status unless separated from the next action.
9. **The previous acceptance criteria were too mechanical.** No horizontal overflow, a passing build and a visible Next button do not demonstrate clear information hierarchy or natural Korean reading. The redesign needs comparative visual review and task comprehension checks.

## 3. Shared design rules

### 3.1 Define the job of each screen

Use four presentation patterns inside the standalone intake shell:

| Pattern | Main content | Appropriate use |
|---|---|---|
| Input | Short title, one purpose sentence, grouped fields and local hints | Enrollment, unlock, athlete name, proxy details |
| Decision | One clear question, a short consequence or requirement, one choice group | Same pitch, age, relation, hand and consent |
| Procedure | Short introduction, ordered actions and a relevant illustration | Capture settings, camera placement and original preparation |
| Status | Current outcome, what happens next, relevant progress and one recovery action | Upload, verification, receipt, correction and unavailable states |

Do not force a procedure into a short form or turn a status screen into a tutorial. Detailed help and complete terms may scroll deliberately. Ordinary decision screens must not require users to search below a long explanation to find their choice or action.

### 3.2 Set a consistent hierarchy

Use these as starting design values, to be validated with the actual Korean font and device rendering:

| Element | Proposed treatment |
|---|---|
| Page title | 22–24px, approximately 650–700 weight, clear line height; one line when practical, at most two at normal mobile sizes |
| Main explanation | 15–16px, regular weight, approximately 1.5–1.6 line height; one idea and usually no more than two rendered lines on a decision screen |
| Field label | 14–15px, medium or semibold; brief and stable wording |
| Essential field instruction | Readable body/helper text immediately adjacent to the field; never reduced to decorative fine print |
| Secondary metadata | 13–14px, lower emphasis but readable in both themes |
| Primary action | Consistent 52–56px starting height and one clear label |
| Secondary control | At least a 44px interactive target where feasible; the visible icon/text may be smaller |

Use a small spacing scale rather than independent values on each screen: label to input about 6–8px; hint to its input about 4–8px; related fields about 12–16px; distinct groups about 24px; major sections about 24–32px. These are relationship rules, not a requirement to add every gap to every screen.

Keep shared left alignment. Use restrained borders or dividers when they clarify grouping. Do not wrap every explanation in a card or add icons merely to fill space. Blue should primarily identify the current action, a help link or focus. Give inactive inputs a consistent visible boundary; retain a distinct keyboard-focus state.

### 3.3 Rewrite before inserting breaks

- Remove duplicate meaning first. Each sentence must contribute an instruction, a condition or a consequence.
- Use `비밀번호` for the invitee-facing four-digit credential. Keep internal API/type names such as PIN unchanged. Introduce `4자리` beside the password field rather than repeatedly explaining the abbreviation.
- Correct particles and spacing in interface copy: for example, `PIN은`, not `PIN 은`, where the abbreviation still needs to appear.
- Use 합니다/됩니다 for explanations. Questions may use 요. Short noun titles such as `이름과 비밀번호 설정` are also appropriate.
- Put a field's condition next to the field. Put a procedure in an ordered list. Put detailed background in existing help.
- Avoid forced line breaks based on character counts or a single screenshot. Let Korean words wrap naturally after the copy has been shortened. Do not solve overflow with tiny text or truncation of essential information.
- Keep mandatory capture requirements visible before file selection. Progressive disclosure must not hide the 120fps minimum or the need for two simultaneous views.

### 3.4 Separate names and roles explicitly

The enrollment name identifies the person returning to this invitation. The athlete name identifies the person in the footage and is used for video organization. They can be different. Do not merge them into one identity field or imply that changing the athlete name changes the invitation credentials.

Use a short, local clarification when the athlete field is prefilled, for example `선수가 다른 경우 이름을 수정합니다.` Provide the credential distinction in nearby help if needed, rather than repeating a long explanation for everyone.

## 4. Screen by screen review and proposed changes

The following changes form one coherent design system. Exact Korean strings are drafting examples; they must be checked together in the final visual compositions.

| Screen or state | Current risk or reading burden | Proposed structure and behavior |
|---|---|---|
| Invitation entry and first enrollment | Long question title; repeated identity explanation; PIN terminology; fields are not grouped by relationship | Short setup title, one purpose sentence, name group, password/confirmation group, password visibility control near that group, and one setup action. Keep the existing atomic enrollment contract. |
| Returning user unlock | Similar long name/PIN question; session-specific explanation can overshadow the fields | Title such as `영상 확인`; name and password inputs with one reason-specific sentence. Use one primary `계속` action and a nearby recovery-help link. Do not introduce a global name/password search. |
| Session expired during work | Risk of looking like a restart and losing confidence in retained selections | A short reauthentication explanation: identity must be confirmed again and the current selection will be retained where browser access still exists. Keep the paused task mounted; show retained state accurately. |
| Welcome and preparation | Same capture rule is explained in description, prose and requirement list | One concise purpose statement, side/rear illustration, and three compact mandatory facts: same pitch, simultaneous two-camera capture, 120fps+ originals. Keep detailed shooting and original-selection help as separate actions. |
| Camera settings guide | Long mixed introduction, device instructions, framing and limitations | Separate sections in task order: choose device; set high frame rate; position cameras; frame the body; start/stop together. Each numbered item contains one action. Place a caveat directly after the action it qualifies. |
| Camera placement and clothing guide | Diagram, distances, body coverage and clothing notes compete for attention | Put the illustration first for its specific task, followed by a short checklist. Distinguish side-horizontal and rear-vertical capture consistently. Keep handedness-dependent instructions synchronized with the diagram. Preserve the approved technical guidance rather than inventing new capture specifications. |
| Athlete name | The naming purpose and credential distinction can become a long paragraph beneath a simple field | Short title such as `선수 이름`; one purpose line; one input. Only show the prefilled-name clarification when applicable. Keep sender identity separate. |
| Side-video selection | Long question title plus technical description, framing tips, original instructions, size limits and warnings | Title `옆 영상 선택`; compact mandatory requirement strip; one relevant framing diagram; one prominent pick/replace action. Put format/export instructions behind `원본 선택 방법`. Put size limits beside selection as concise metadata. |
| Rear-video selection | Repeats the side screen's full instructions and adds same-pitch information | Mirror the side layout exactly. Emphasize the differing requirement: the same pitch from behind, captured simultaneously, with rear framing/orientation. Keep view labels, metadata positions and replacement actions consistent. |
| Original preparation guide | OS sharing, transfer destination, export, file picker and warnings are mixed | Choose a route first: direct original-file preparation on a supported phone, or AirDrop to a Mac. Show only that route's short ordered steps; keep other routes available without expanding all of them at once. Use text instructions or clearly labelled diagrams, not fabricated iOS screenshots. |
| Original-selection limitations | A large warning can become a second tutorial | Use one concise limitation near the relevant route. Explain that the website cannot turn on All Photos Data and that a photo picker may supply a converted file. Preserve supported Files/export alternatives and accurate device/version qualifications. Do not promise that one OS toggle guarantees every later picker returns the camera original. |
| Selected-file state | Filename, size, fps, dimensions, duration and integrity information can read as one long technical sentence | Show filename, view and clear selection status first. Keep detected fps visible because it affects eligibility. Show size secondarily; put additional metadata in an optional details area. Provide an explicit Replace action. |
| Invalid or low-fps file | Dense warning text repeats the capture guide | State the problem, the affected view and the next action. Example: `120fps 미만 영상입니다.` followed by `120fps 이상으로 촬영한 원본을 선택하십시오.` Keep the explanation about conversion not restoring frames in help. Unknown timing gets its own accurate message. |
| Pair review | Two file summaries can duplicate all metadata from selection | Show two compact matched rows with view, identifiable filename and detected fps. Allow replacement. Keep the pair legible without a second technical report. |
| Same-pitch confirmation | Long question and explanation repeat the preparation guide | One short question, for example `두 영상은 같은 투구인가요?`, followed by a concise simultaneous-capture reminder and the existing explicit choice. Do not imply that a checkbox proves the pair is valid. |
| Age confirmation | Policy explanation can dominate a simple decision | Keep the existing age rule and choices. Use one plain consequence sentence. Show the ineligible outcome immediately with a clear correction path if the age was chosen incorrectly. Do not add new legal or eligibility policies. |
| Submitter relation | The reason for asking and conditional fields are visually mixed | Keep one relation question. Reveal the submitter-name field only where currently required or applicable, immediately below the selected relation. Use one short proxy-recording note. |
| Throwing hand | Optionality and later administrator checking are separate paragraphs | One short question, clearly marked optional. Display one choice group. Use a single helper sentence stating that it can be left unanswered. Do not silently turn an optional field into a required one. |
| Required consent decision | Long purpose summary, document title, mandatory label, proxy note and checkbox all compete | Show required status once; one faithful short purpose summary; `약관 보기`; explicit unchecked choice; Next. Keep a proxy-specific note only when relevant. Do not hide a material processing purpose to make the card smaller. |
| Optional consent decisions | Optionality and refusal consequences are repeated | Label optional status once and state the consequence once. Keep each choice separate, default off, and allow Next without agreeing. Do not substitute a vague 'agree to everything' control. |
| Terms viewer | Many paragraphs of equal emphasis still feel like a wall of text | Group the existing document by its existing subject labels, with clear headings and readable paragraphs. Preserve the full original text, version and hash. Opening/closing the viewer must not change consent. Keep focus return and accessible naming in the acceptance review. |
| Final confirmation | A dense list of fields and many edit controls can feel like an administrative summary | Compact grouped summary: athlete; side/rear pair; submitted answers; required/optional consent states. Keep values truthful and edit actions clearly named. No repeated tutorial or checklist. One primary `영상 보내기` action. |
| File preparation, upload and verification | A long title, stage rail, total progress, per-file progress, metadata and repeated status text compete | Use a short state title and one dominant status indicator. Per-file rows identify side/rear and their state. Distinguish preparation, upload and server verification; progress must describe the phase it measures. Do not claim receipt or original verification prematurely. |
| Pause, interruption and resume | Browser-file-access explanation sounds technical and can obscure the action | Lead with what the person can do: retry/resume, or reselect the same file when required. Then show a short reason. Identify the affected view. Preserve resume hashes and idempotent finalization; do not promise upload continuation after the browser closes. |
| Uploaded but not finalized | File arrival and completed receipt can be confused | A short 'files arrived' status followed by the single outstanding confirmation/finalization action. Do not show a completed receipt until the server actually issues it. |
| Receipt and verification outcome | Receipt number, dates, retention, integrity and next steps have the same weight | Lead with the true current state and next expectation. Show athlete and receipt number next. Keep per-view file status readable. Put secondary dates/metadata in a details area while retaining a visible original-storage deadline. Keep link-copy feedback near the copy action. |
| Correction requested | Long explanation plus full form can make the person re-evaluate the whole submission | State exactly what the administrator requested. Show only editable/requested fields in a clearly grouped section. Keep unchanged data as a compact read-only reference. Terms remain behind their viewer. Preserve replacement and correction contracts. |
| Reconsent | An update notice becomes another long document form | Show a short update explanation, the current required summary and viewer, and explicit unselected confirmation. Never auto-carry an old answer into a new document version. Do not invent a summary of what changed without comparing the actual versions. |
| Invalid, revoked, expired, locked and withdrawn states | Similar warnings may leave the person uncertain about next steps | One outcome title, one cause/consequence sentence and one genuinely available recovery action. Preserve generic authentication failures where necessary. Do not reveal another person's name or data to improve the wording. |
| Processing and approved 3D result | Collection status can become mixed with 3D controls or main-service links | Keep processing expectations concise and truthful; no invented completion estimate. For an approved result, show the viewer first and short interaction help second. Retain invitation/name/password access, explicit administrator publication and no main-service navigation. |

### Administrator receiving workflow

Apply the same hierarchy and wording principles to the receiving side, while using a denser desktop layout where appropriate. Administrative detail should not be hidden merely to copy the invitee's one-question layout. Organize the work into clear sections with an obvious next action.

| Screen or task | Current structural risk | Proposed treatment |
|---|---|---|
| Intake list and filters | Verification, analysis, publication, assignment and dates compete as equal columns/statuses | Make sender/athlete, receipt date, pair status and required attention the primary scan. Keep analysis/publication as distinct secondary states. Group filters by purpose and give empty results a relevant recovery action. |
| Invitation creation | Settings, technical readiness and the resulting link can be confused with one continuous form | Separate invitation settings from the created-link result. Label what the recipient must do. Show one clear copy action with immediate success/failure feedback. Do not imply a token can be recovered if the current security contract does not permit it. |
| Invitation link sharing | Copy, reset, reissue and revoke have very different effects but similar link-related wording | Distinguish sharing the current available link from issuing a replacement. State invalidation consequences beside reissue/revoke controls. Keep destructive or access-changing actions out of the primary receiving action group. |
| Submission detail overview | Many management sections make it difficult to know whether the originals have arrived and what to do next | Start with athlete/sender, current pair/verification state, any correction needed, and original availability. Then use separate sections for originals, result preparation, publication and administrative history. |
| Preview and original download | A video preview can be mistaken for the actual original, and transport verification for capture authenticity | Keep Preview and Download original as separate named actions. Show side/rear pairing, available file facts and byte-integrity status. Do not label a selected-file hash match as proof of camera provenance. |
| Pair download and manifest | Multiple download links or technical metadata may look like an implemented archive or automated export | Explain the existing pair-download behavior accurately. Separate the manifest from the video files, with a short explanation of pairing/hash information. Do not promise a ZIP archive or automatic local-folder synchronization. |
| Local-copy confirmation and retention | A successful browser download may look like a confirmed backup; server and local retention can be conflated | Show server availability/deletion deadline separately from an administrator's explicit local-copy confirmation. Keep a short label for the destination and accurately describe what that confirmation records. A download click alone must not mark a backup complete. |
| Correction request | A long set of editable fields and a free-text message can lead to vague instructions | Group requests into video replacement and information correction. Identify the affected view/field, give a concise recipient-facing explanation and preview that explanation. Preserve the existing requested-field restrictions and old-record handling. |
| Manual 3D result import | Original hash binding, supported result format and processing readiness can be lost in prose | Show the current pair/revision, the supported result-file requirement and one import action. Keep technical detail available for the operator without presenting GPU readiness as a requirement for manual processing. Do not broaden the accepted result format. |
| Private review and publication | Import success can be mistaken for recipient visibility | Use clearly separate states: imported privately, reviewed, approved/published. Put the exact pending review action next to its result version. Preserve the existing review-bound explicit publication gate. |
| Activity, ownership and withdrawal controls | Low-frequency management actions and audit history compete with receiving videos | Place assignment/history in secondary sections. Keep withdrawal/revocation consequences explicit, but avoid making them the visual focus of a normal successful receipt. Preserve authorization and existing audit records. |

Administrative copy should also use concise 합니다/됩니다 explanations, consistent names for originals/results/statuses, and local action-specific help. This is a plan for the intake feature, not permission to change permissions, retention policy, storage configuration or shared data.

## 5. Example enrollment composition

Use this as the first design specimen, not as the only screen to improve:

| Element | Proposed Korean copy | Intended role |
|---|---|---|
| Title | 이름과 비밀번호 설정 | Describe the task without a long question |
| Introduction | 영상을 다시 확인할 때 사용할 정보입니다. | Explain the purpose once |
| Name label | 보내는 분 이름 | Identify the submitter, not automatically the athlete |
| Password label | 비밀번호 | Familiar terminology |
| Password hint | 직접 정하는 숫자 4자리입니다. | State the input condition beside the field |
| Confirmation label | 비밀번호 확인 | Group with the first password field |
| Visibility control | 비밀번호 표시 | Stay adjacent to the password group; expose toggle state accessibly |
| Recovery help | 비밀번호를 잊은 경우 | Secondary help, not another large introductory paragraph |
| Primary action | 설정하고 계속 | Describe the actual setup action |

Keep the existing confirmation behavior and validation. Do not use placeholders as the only labels. Do not insert sample passwords into fields. Avoid automatically opening the keyboard on entry unless the actual device review supports that behavior; focus the relevant field when validation fails. The final design must work with the keyboard open, not only in a full-height static screenshot.

## 6. Implementation architecture for a later order

Keep changes scoped to `components/intake` and intake-owned display copy. Use a small set of purposeful primitives: compact title/intro, input group with local hint, requirement summary, numbered instruction, per-view file summary, and status with next action. Reuse them only when their information role is the same.

Do not continue adding a newline between every sentence in one generic renderer. Use explicit content structure for each role. Existing newline-delimited terms may be rendered into paragraphs without altering the server-owned document string. Do not add a large component framework or touch global styles simply to restyle this private flow.

Relevant areas:

| Area | Main files |
|---|---|
| Shell and typography | `components/intake/shell.tsx`, scoped intake styles if necessary |
| Enrollment and unlock | `components/intake/invitee-steps.tsx` |
| Preparation, athlete name and picking | `components/intake/guided-steps.tsx`, `guides.tsx`, `illustrations.tsx` |
| File identity and selection feedback | `slots.tsx`, `file-summary.tsx`, `pick.ts` |
| Decisions, terms and final summary | `review-wizard.tsx`, `consent-block.tsx`, `review-rules.ts` |
| Sending and recovery | `send-step.tsx`, `status-steps.tsx`, `use-send.ts` |
| Return state and approved result | `intake-flow.tsx`, `result-view.tsx`, `model-consent.tsx` |
| Administrator receiving workflow | `app/(app)/admin/intake/page.tsx`, `create-invitation.tsx`, `intake-filters.tsx`, `[id]/detail-client.tsx`, `[id]/detail-manage.tsx`, `[id]/run-review.tsx` |

Read the current files and installed Next.js guidance before any future implementation. Preserve the server-side validation, upload, auth and publication contracts. Changing visible terminology must not rename database fields or API keys.

## 7. Delivery sequence and review gates

1. **Inventory and copy map.** List every screen/state and classify each text block as title, purpose, requirement, field hint, procedure, status, recovery or detail. Remove duplicated meaning and produce a before/after copy map for the whole journey.
2. **Representative compositions.** Prepare the enrollment, video-selection, consent-decision and upload-status designs together. These represent the four presentation patterns. Review their hierarchy and consistency before propagating the design to the remaining screens. This prevents another global spacing change from reproducing the same problem everywhere.
3. **Whole-flow design pass.** Apply the agreed patterns to every row in the review matrix, including errors, correction, reconsent and returning-user states. Verify that mandatory information is still visible at its decision point.
4. **Scoped implementation, only after a separate implementation instruction.** The existing Claude video-sharing owner implements the approved plan. Follow session ownership rules and preserve concurrent work. Do not make a new owner or instruct Claude main to implement this department's UI.
5. **Independent GPT review.** Review the actual final source and rendered flow, not only implementation notes. Compare the original owner screenshot against the revised enrollment screen at the same effective viewport and font scale. Reject unresolved repetition, awkward mixed-script spacing, inconsistent groups or hidden essential information even if tests pass.
6. **Release, when instructed.** Integrate only the accepted ref, perform appropriate build and regression checks, deploy under the applicable release authorization, and verify the operating version. Do not treat a planning document as permission to deploy.

## 8. Acceptance criteria

### Readability and information priority

- Each screen has one clear task, decision or current status and one primary action.
- A reader can identify what to do next without reading the detailed help first, except when deliberately learning the capture procedure.
- Introductions do not repeat the title or the immediately following field hint.
- Titles are naturally composed in Korean; mandatory rules are not removed just to shorten text.
- Password terminology and Korean particles are consistent across enrollment, unlock, error, receipt and result screens.
- Related fields look related; unrelated sections have visibly larger separation.
- Normal inputs, active focus, errors, required status and optional status are distinguishable without relying only on color.

### Layout and interaction

- Check at 320, 375, 390/393 and 430px mobile widths and a representative desktop width, in light and dark themes.
- At normal font scale, ordinary decision screens and the final confirmation show their current choice and primary action without manual scrolling at375×667. Keep an accessible scrolling fallback for shorter displays, enlarged text, long content and the keyboard; never clip information to force a height target.
- Check the enrollment form with the keyboard open, long sender/athlete names, a mismatched confirmation, server errors and password visibility toggled.
- Long guides and terms scroll intentionally inside their viewer. Close controls remain available, and focus returns to the opening control.
- No horizontal overflow, overlapping labels, broken essential words or hidden input errors at any target width.
- The owner-supplied iPhone screenshot must be treated as a real-device review case. Desktop emulation alone cannot close device-specific font, wrapping, keyboard or browser-toolbar findings.

### Behavior and original preservation

- Leading-zero four-digit passwords, generic credential failures, session reauthentication and identity/athlete-name separation still work.
- Selected files and entered answers survive supported Previous/Next and browser Back/Forward navigation, including the previously fixed Forward-then-Previous trace.
- Both views still require120fps+ under the existing validated timing policy. Unknown metadata never becomes a verified original through visual wording.
- Selected-file bytes remain unchanged through upload and authorized download. A matching selected-file hash must not be described as proof that a phone picker supplied an unmodified camera original.
- Existing required/optional consent rules, document versions/hashes, correction/reconsent checks, original-retention rules and review-bound result publication remain intact.
- No new service navigation, signup dependency, automatic consent grant, schema change or GPU requirement is introduced.

## 9. Verification evidence and completion report

A future implementation delivery must include the exact base/ref/diff, the whole-flow copy map, and final-source screenshots or recordings for the four representative patterns plus every materially different branch. Include enrollment with keyboard/error states, valid and rejected file selection, original-preparation routes, consent/viewer behavior, final summary, upload/retry/resume, receipt, correction, reconsent and return access.

Include administrator list/invitation creation and link-copy result, submission overview, original download/manifest/local-copy distinction, correction-message composition, and private-result review/publication. Use isolated records and accurately named states. Do not reissue a real invitation or change live consent/publication merely to generate design evidence.

Record viewport, font scale, theme, scroll position and whether the keyboard is present. Use normal rendered frames after transitions settle. Keep personal filenames, invitations, PINs, cookies and signed URLs out of shared evidence. Use isolated fixtures for development; do not populate the shared production database for screenshots.

Run typechecking, changed-file lint, and meaningful existing tests appropriate to the actual changes. Add a regression only for a changed behavior or an uncovered meaningful risk, not to assert a particular static sentence or mirror a helper's implementation. Visual acceptance remains a separate requirement.

The completion report must distinguish design completion, code acceptance, deployment success and real-device verification. Report which concrete paths were exercised. Do not describe the entire experience as visually verified after checking only that a page fits within its viewport.

## 10. Scope of this planning delivery

This plan reviews and specifies both the complete invitee video collection journey and the administrator receiving/result-return workflow. No implementation order has been sent, no application code has been changed, and no deployment has been performed as part of this planning request.
