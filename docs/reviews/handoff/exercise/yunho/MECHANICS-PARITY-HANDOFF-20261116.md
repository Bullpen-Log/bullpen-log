# 03 to04: current review contract and verified environment

2026-11-16 Asia/Seoul. Requested by the human through04. This is an operational handoff, not a deployment or schema request. Exercise current remains EX-Y-P-024, awaiting human review. Mechanics current remains #1 Step-back, human decisions0.04's latest instruction to collect source-video trims until its complete review overrides03's immediate-trim workflow for mechanics only.

## What happens BEFORE human review

Research the actual variation and inspect footage/title/description. Concretize and SAVE routine corrections already authorized by the user: title meaning, real movement/setup, understandable procedure, pitching purpose, terminology, safety, suitable existing metadata and owned poster. Reload/read back the actual saved result; then report before/after, reason, evidence limits and what the human should inspect. Do not merely accumulate authorized content changes as pending candidates or request permission per sentence. This current rule supersedes historical notes-only and per-candidate wording still quoted in old records.

Candidate means a genuine unresolved observation, ambiguous motion, contradictory evidence, unknown rights or an important decision outside the authorization. Label it pending rather than guessing or claiming applied. Distinguish GPT findings from human decisions. Ask only about the unresolved part. Next/okay is required to advance; setting transfer and looping are not next approval. Never carry03's human approvals into04.

## Exact writing and terminology

03 currently uses these description headings: `■ 어떤 운동인가`, `■ 이렇게 하세요`, `■ 투수에게 왜 필요한가`, `■ 강도`. In03's initial read-only snapshot BEFORE04's subsequent correction, Step-back showed the first two plus `■ 왜 하나요` and `■ 세기`: those latter two were not aligned at that snapshot.04 subsequently reported saving the aligned headings; see follow-up below. A deliberate drill-specific first heading can say drill, but do not claim text equality when it is not saved.

- What: concise identification of the actual motion/variation; avoid irrelevant negatives, translation lectures and unsupported comparative benefit.
- How-to: numbered instructions for a first-time performer. Equipment/setup -> action -> return/reset -> practical stop/recovery. Use familiar wording rather than knee-lock, drift/rocker jargon without explanation. Resolve which foot by throwing hand/target direction where needed. Do not invent a stepping pattern or bilateral instruction absent from the chosen purpose/footage.
- Why: pitching demand -> physical/coordination quality developed -> plausible contribution to pitching. For power tasks connect strong/fast force production where supported. Do not merely repeat the movement or say it can be used for training. Execution/landing cues belong in how-to. Direct evidence supports appropriately bounded factual statements; indirect/weak evidence supports purpose/potential contribution, not guaranteed velocity or injury prevention.
- Intensity text: equipment weight/resistance/height, usable stance width/distance and effort selection. Concrete recovery or rest-extension instructions belong in how-to; numeric rest belongs in an existing prescription field when available. Do not invent universal percentages/optimal doses. Step-back's50-60% text is a proposal needing support/context, not proven optimal because it is already saved.
- Keep the same equipment name across descriptions, e.g. 케이블 머신, 메디신볼, 밴드, 바벨, 벤치, 박스; never substitute generic 기계. Use 강도, not 세기. Add meaningful paragraph breaks and consistent numbering. Normal performance interrupted by pain/form loss should say stop if that occurs, not imply exercising until failure is the goal.
- Ground-block wording must remain biomechanically qualified: foot pressure/limiting unwanted forward pelvis movement and transfer toward upper-body motion, without forcing knee lock or guaranteeing velocity. Falling direction/recovery steps alone do not diagnose jump ability.
- Check Korean/US/Japan claims, safety wording and rights; preserve unresolved country-specific issues. Research is not legal clearance. Missing OWN footage/reshoot reasons remain tracked automatically.

## Metadata and reporting: real differences

03 checks every ExerciseVideo field: title, description, source/footage/editing, bodyParts, intensity, difficulty, equipment, sets, reps, holdSeconds, restSeconds, perSide, and title/source variation. Time holds use holdSeconds with reps empty; simultaneous bilateral repetitions do not imply perSide. Assess suitability, not merely whether values exist. Explain material unchanged choices as well as changes. Exact dose is a starting judgment unless directly supported.

04 uses MechanicsGuide, whose existing editor/model has title, category, description, focusPoints, stage, equipment, sortOrder and media/source/aspect/visibility. It does NOT expose ExerciseVideo bodyParts/intensity/difficulty/sets/reps/hold/rest/perSide as dedicated prescription fields. Check focus/main vs supporting elements, phase/stage, difficulty progression and task effort/repetitions/rest in the description where applicable. Distinguish actual throws from movement reps. Do not invent missing database fields or add schema to mimic the exercise editor.

Report exact previous -> saved title/text/metadata for every change, why it changed, saved/readback status and source applicability. For retained fields report retained value and its reason; do not imply a metadata correction was made. Give observed footage scope and limits, owned/ref/missing/reshoot status, actual trim/poster version, and a short human inspection order. User next accepts movement only unless the wording explicitly accepts an edit. Sources belong in records; product prose need not become a bibliography.

## OWN poster: actual supported operation, no code/schema expansion

03 already updated14 previously reviewed OWN exercise posters;18 reference items were expressly excluded by the user. Details: `THUMBNAILS-20261116.json`. No poster gallery/per-poster permission is required. Select a real current-source frame showing characteristic posture/action, relevant equipment and key limbs. Modest aspect-preserving crops may improve clarity; avoid idle frames, unreadable blur or cropped important limbs. Never synthesize a pose. Keep source video and old poster objects. P018's better poster does not resolve its original full-video reshoot request.

03's actual procedure used existing Prisma/Supabase capabilities plus ffmpeg frame extraction, not a new product feature:

1. Back up (`npm run backup`), privately snapshot full current row and media identities. Confirm OWN, real target model/id and expected active video. Download authorized owned source privately; inspect samples and selected full-size poster. Use existing ffmpeg install;03 selected JPEG1280x720 real frames, preserving aspect and relevant body/equipment.
2. Upload poster only to a fresh library JPEG identity in existing pitch-videos storage; no overwrite and no source-video reupload. Keep rollback metadata privately, never in public docs.
3. Update ONLY target `thumbPath`. For04 use `prisma.mechanicsGuide.updateMany` with expected `id`, `source:'OWN'`, `videoPath` and old `thumbPath` conditions; require count1. For03 the corresponding model was exerciseVideo. Stop on concurrent pointer change. Preserve videoPath, title/content, aspect and every other value.
4. Read row back; compare all non-thumbnail fields with before. Download new JPEG and compare SHA256 with generated file; preserve prior poster/source. Do not publish private asset paths or signed URLs.
5. Direct DB writes do not invalidate Next's library cache. After pointer update, use the existing authenticated editor's normal save of unchanged CURRENT fields, with no replacement video supplied. `tryUpdateGuide` preserves current media when replacement video is absent; it calls `clearLibraryCache()` and revalidates `/library/mechanics`. Re-read live row before unchanged-save so another session's content is not reverted.03 used the analogous exercise save, reloaded and observed the new poster.
6. Reload exact detail URL, inspect poster BEFORE starting playback (a paused loaded video shows a video frame rather than proving its poster), then start and check repeat enabled. Do not wait for a full repeat cycle. Native/offline client refresh requires separate verification; do not claim device parity from DB/web success.

Existing APIs/helpers: `/api/library/video-url` gets authorized playback addresses; `/api/library/upload-url` supports `kind:'thumbnail'`; ThumbnailFixer captures/puts a JPEG then invokes setGuideThumbnail/setExerciseThumbnail. **That helper is shown only when thumbUrl is absent**, so Step-back with a present poster will not have its button. Its automatic frame is15% of duration, capped at2s,640px; captureThumbnail supports an explicit time internally, but there is no supported time picker in that button. It is not an appropriate way to deliberately select the best existing poster without extra work.

**Preservation caveat:** existing setGuideThumbnail/setExerciseThumbnail delete the old poster after changing the pointer. Full replacement-video editor saves can delete old video+poster. They are not the preservation-first procedure03 used. Avoid those delete paths; use the conditional thumbnail-only operation above, followed by normal content save without a replacement video to refresh cache. `scripts/shoot-trim/apply.mjs` is exercise-only and also updates videoPath: DO NOT use it for a mechanics poster-only request.

## Environment audit facts and limits

- Workspace03 HEAD remains aa9d8984, dirty shared checkout preserved; fetched remote ref at audit: e2d6a33895ea9c7d44ba72ecf31b41adc7421c55. Do not equate local HEAD with production.
- Local components/library-video.tsx, components/thumbnail-fixer.tsx, lib/capture-thumbnail.ts, lib/exercise-video-review-server.ts, and both library client files byte-match that fetched ref. app/actions/content.ts as a whole does NOT; relevant deployed-ref setGuideThumbnail was independently read and still deletes the old poster. This is source-ref evidence, not deployment attestation for every line.
- Production exact exercise detail and Step-back detail were actually inspected in03's authenticated browser. Both OWN players expose play/pause, position, repeat enabled,1x speed and enlarge controls. Both clients pass source path, thumbUrl and aspect into the same LibraryVideo -> OwnedExercisePlayer; reference path uses YouTubeExercisePlayer. No need for a separate mechanics player.
- Production Step-back editor actually has main elements/stage/equipment/display order and lacks exercise prescription controls. Existing complete poster means no ThumbnailFixer button. This is a UI difference, not evidence of an absent poster data path.
- Critical identity:95d8dd7e-6969-4d30-a207-afc89322912f is the video asset identifier, NOT its MechanicsGuide id. Read-only live resolution returned guide id54acde57-f93a-4012-a632-46221b7f23b8, title 스텝백 스로우 드릴, OWN, reference id null, video+poster present, visible, aspect null (default16:9), focusPoints 드리프트/스로잉, equipment 야구공, stage 통합, sortOrder0. Correct URL: https://dugout-baseball.com/library/mechanics?review=54acde57-f93a-4012-a632-46221b7f23b8 . Resolve/verify again immediately before any write.
-03 did NOT alter Step-back, choose its poster, approve its footage or verify its full source/native app. Audit tab closed; exercise currentP024 and human status preserved.04 owns the newly authorized content/poster edits and must verify actual results before reporting parity.04-specific source trims remain collected until complete review per latest human instruction.

## Subsequent04 delivery received; no extra UI tests requested

After the initial snapshot above,04 reported: source/prior poster backed up; real4.5s frame uploaded as a new unique JPEG; conditional MechanicsGuide.thumbPath-only change and uploaded hash verified; description saved with the four aligned headings and beginner instructions; editor save cleared cache; production reload displayed new description/poster with loop enabled; full row readback showed only description/thumbPath changed. Current guide/human decisions preserved; native refresh unverified. This is04's delivery evidence, distinct from03's earlier independent UI/source audit.03 did not repeat product/UI tests after receiving it. No further product or schema work is needed to achieve the described review path.

## Read these exact records

- `docs/reviews/handoff/exercise/yunho/checkpoint.json`: current rules, current item and standing_review_conditions (latest pre_human_correction supersedes old candidate phrases).
- `docs/reviews/handoff/exercise/yunho/video-records.json`: actual before/after and verification; P024/P025/P050 are recent examples.
- `docs/reviews/handoff/exercise/yunho/THUMBNAILS-20261116.json`:14 OWN poster selections/verification, no private URLs.
- `docs/reviews/handoff/exercise/yunho/MACBOOK-GUIDE.md`: transfer guide; latest checkpoint overrides historical current-item prose.
- `docs/reviews/handoff/README.md`: receive/save/readback/review-only publish.04 keeps its own mechanics checkpoint and video records; do not copy exercise completion counts.
- `docs/shoot/video-review-current-workflow.md`: common baseline; later per-user instructions above control candidate authority, owned poster scope and04 trim timing.
