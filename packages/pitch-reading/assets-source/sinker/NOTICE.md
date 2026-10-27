# Sinker samples 3 and 4 motion

Active animation sources: the user-requested **right-handed pitching sample 4 and left-handed pitching sample 3** in Sinker 3D motion analysis. This is a local prototype using that requested sample, not a public release of the source videos or analysis results.

Read only from the existing samples' displayed analyses. No production database or storage content was changed. Preparation reuses Sinker `displayTrack`, `mannequinTrack`, `canonicalFrames`, and `mannequinFrames`, followed by metre/axis conversion into the prototype. Sample 4 analysis event indices are preserved: knee-up 29, first foot contact 237, foot-lock 258, release 304. There are 335 prepared frames. Those event labels are analysis estimates, not independently measured ground truth.

The source starts with the knee raised and ends shortly after release. Playback uses the display-time estimate from the analysis and eases into the last filmed pose; it does not synthesize a complete return to standing. The two right-handed repertoires share sample 4. The left-handed repertoire uses the independently captured left-handed sample 3: knee-up 29, first foot contact 175, foot-lock 207, release 245, 275 prepared frames, display-time step 0.006714060031595534s. The analysis preparation canonicalizes handedness; the prototype restores the recorded left-handed orientation. It does not turn sample 4 into the left-handed action. Pitch trajectories and speeds are synthetic and independent of the source player's pitches.

In prototype 12, original side and back videos for both samples were inspected at the recorded analysis timestamps. The old 55ms wrist retargeting was removed: arms, torso and hand orientation now follow the recorded pose, with one constant whole-pose translation for synthetic release alignment and minimal fixed-length limb corrections. Only the ball uses a final 6ms fingertip roll with a continuous launch tangent. The held and free ball remain one mesh. Fingers open around release. The full source range is retained and the recorded final pose is eased to a stop.

The plant control uses the original foot-lock events (sample 3: 207, sample 4: 258); first-contact estimates (175/237) are also retained in the converted data. Original videos and review frame sheets remain ignored local comparison material and are not included in the runtime bundle.

The bundled `src/data/sinker-sample-3.json` and `sinker-sample-4.json` contain prepared joint positions, segment lengths and event indices. It omits personal labels, video URLs, account identifiers and storage paths. The intermediate preparation is kept locally in the ignored `assets-source/sinker/sample-3-prepared.json` and `sample-4-prepared.json`.

Reproduce with the authorized project's environment and the requested sample path:

```sh
node --env-file=/path/to/project/.env --import /path/to/project/scripts/alias-register.mjs scripts/import-sinker-sample.mjs /path/to/project '<owner>/pitch-lab/<sample-id>' 3
node scripts/convert-sinker-sample.mjs 3
```

The older CMU and OBP comparison material is not used by this animation or included in the active bundle.

For sample 3, the authored synthetic release is near its prepared hand position (0.60, 1.71, 2.20 metres). The captured hand orientation is retained throughout the action; the ball roll does not pull the wrist toward the launch direction. Anatomical limb lengths are preserved. No source videos, personal labels or storage identifiers are bundled.
