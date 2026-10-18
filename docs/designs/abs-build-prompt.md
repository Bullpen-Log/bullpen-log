# ABS(폰 한 대 볼 · 스트라이크 자동 판정) — 구축 프롬프트(2026-10-18, 금윤호)

앞 문서 `abs-single-camera.md`(와 claude.ai '불펜로그 ABS 계획서')는 "시스템이 되는가"를 따진 계획이고, 이 문서는 "어떻게 만드나"의 구축 지시다.
사용자 규칙으로 프롬프트 본문은 영어. 사용자가 정할 것 여덟(앞 문서 끝)에 답이 오면 §0 DECISIONS 에 채워 Claude 세션에 그대로 넘긴다.

**한눈에(한국어)**: 순수 계산(규칙 · 존 · 플레이트 보정 · 깊이 단서 · 통과 순간 · 판정)을 `lib/abs/` 에 시험과 함께 먼저 만들고 → 합성 시험대로 오차를 숫자로
확인(검문 1) → 플레이트 자동 찾기 → 구속 측정 흐름 안에 ABS 모드 · 판정 카드 · 히트맵 → 마지막에 구속 엔진 인자(깊이 닻)를 한 커밋으로만 손댄다.
P0 실험(폰 두 대)이 검문이고, 못 지나면 '좌우 판정 + 높이 넓은 띠'로 제품을 다시 잡는다. DB 변경 없음.

---

## The prompt

```
# Build Bullpen Log ABS (single-phone automatic ball/strike calling)

You are building the ABS feature in the Bullpen Log repository (Next.js, Prisma, Supabase, Capacitor iOS shell).
Read these first, in this order, before writing any code:
1. `AGENTS.md`, `HANDOFF.md`, `docs/claude/geum-yunho.md` (repo rules; the DB rules are absolute).
2. `docs/designs/abs-single-camera.md` (feasibility plan: geometry, error budget, decisions).
3. `lib/velocity-engine/trajectory-fit.ts`, `lib/velocity-engine/analyze-distance.ts`, `lib/velocity-setup.ts`,
   `lib/velocity-analysis.ts`, `lib/velocity-sync.ts`, `components/velocity/pitch-result.tsx`, `components/velocity/clip-player.tsx`,
   `scripts/velocity-accuracy.mts`, `scripts/velocity-lab/engine2-lab.mts`.
4. `mobile/ios/App/App/DualCameraPlugin.swift` (read only; do not edit; it is the other developer's area).

## 0. DECISIONS (filled by the owner; if a line is blank, use the default in parentheses and say so in the commit body)
- RULE_SET: ______ (default: KBO 2025: top 55.75 %, bottom 27.04 % of batter height, width = plate 43.18 cm + 2 cm each side, judged at the plate midpoint plane; MLB 2026 as a second table)
- CAMERA_POSITIONS_V1: ______ (default: behind-pitcher only; behind-catcher is P5)
- VERDICT_DISPLAY: ______ (default: binary strike/ball + distance to the nearest zone edge in cm + '경계' badge inside the uncertainty band; never a third state)
- FEATURE_NAME_KO: ______ (default: 'ABS')
- BATTER_HEIGHT_MODE: ______ (default: one height per session; batters assigned afterwards from the saved trajectory and re-judged instantly)
- INCLUDE_3D_VIEW_V1: ______ (default: no; P3 optional +3 h; the 2D clip overlay ships first)
- ENTRY_POINT: ______ (default: a mode inside the existing velocity measurement flow, not a new top-level tab)
- VALIDATION_SHOOT_DATE: ______ (default: add two phones to the 2026-10-18 marker shoot: one behind the pitcher per spec, one 240 fps side camera on the plate-front line)

## 1. Non-negotiable constraints
- One camera. Never design around a second device. The side 240 fps camera exists only in the validation protocol, never in the product.
- No database schema change in v1. ABS writes only to the existing `VelocityPitch.zone` (1–9 cell), `VelocityPitch.result` ('strike' | 'ball'), and
  `VelocityPitch.analysis` JSON under a new optional key `abs` (§3.6). `VelocitySession` is reused as-is; the ABS session is a new value of the existing `sessionType`
  string (confirm the allowed values in `lib/velocity-meta.ts` and extend that list, not the column).
- Never run `prisma migrate dev`, `prisma db push`, `prisma migrate reset`, or `npm run build`. Build check is `npx next build` only.
- The velocity engine files (`lib/velocity-engine/*`, `components/velocity/*`, `app/(session)/velocity/*`, `app/(app)/admin/velocity/*`) are being edited concurrently by
  the main session (engine 2.5.x). Rule: all new logic is pure and lives in `lib/abs/` and `components/abs/`. Touch engine files only in P2-final, with the smallest
  additive, optional parameters, in a single commit, and write a `HANDOFF.md` entry to 김민 listing every engine line changed and why.
- Shared production DB: never create test accounts or rows. Verify screens through a temporary `app/dev-preview-abs` route fed with fixture data; delete the route and
  restart the dev server when done (`preview_start` → `bullpen-log-dev`).
- Korean UI text, 해요체, no em dashes in screen strings, no '뉴스', no coaching-organisation names. Icons only from `@/components/icon`.
- Accuracy honesty: every number shown carries its uncertainty. Bands: lateral 3 cm, vertical 6 cm until P4 replaces them with measured 2σ.
- Batter height is used ONLY to compute the zone top/bottom. Ball height is measured, never predicted from height.

## 2. Architecture

### 2.1 Pure library `lib/abs/` (no DOM, no Prisma; runs under node for tests)
- `rules.ts`: rule tables. `export const RULES: Record<RuleSetId, RuleSet>` with
  `{ id, label, topPct, bottomPct, plateWidthM: 0.4318, sideMarginM, judgePlane: 'mid' | 'front' | 'both', ballCountsIf: 'any-part' | 'center' }`,
  `DEFAULT_RULE = 'kbo-2025'`, `ABS_CLIP_RETENTION_DAYS = 30`. Comments cite the source and date and carry '보도 기준, 원문 대조 필요' until the owner confirms.
- `zone.ts`: zone geometry in world metres, not pixels.
  - `zoneWorld(heightCm, rule): ZoneBox` → `{ left, right, bottom, top, zFront, zMid, zBack }`. Frame: origin = plate rear apex at ground, x toward first base, y up,
    z toward the pitcher. Plate depth 0.4318 m (apex to front edge); zMid = half depth.
  - `cellOf(x, y, box): 1..9` with the same numbering as `lib/velocity-setup.ts zoneOfPoint` (read it; keep identical numbering as seen from the camera).
  - `edgeDistance(x, y, box): { dx, dy, inside }` signed distances to the nearest vertical and horizontal edges (negative = inside).
- `calib.ts`: camera-to-world calibration from the plate.
  - Input: five plate corners in frame coordinates (0..1), focal length (px, source resolution), source size, optional tilt (rad) from the device level.
  - Solve a planar homography ground plane ↔ image (plate on the ground, known dimensions: front edge 43.18 cm, sides 21.59 cm, diagonals 30.48 cm). DLT + 2–3 Gauss-Newton
    refinement steps. Return `{ H, Hinv, camera: { position: [x,y,z], R }, residualPx, ok }`. Reject if residual > 1.5 px, camera height outside 0.5–3 m, or distance outside 10–30 m.
  - `projectWorld(p, calib): [u, v]`, `rayFromPixel(u, v, calib): { origin, dir }`, `groundPointFromPixel(u, v, calib): [x, 0, z] | null`.
- `depth.ts`: the depth cues, each returning `{ D, sigma } | null`, and `fuseDepth(cues[])` = inverse-variance weighted mean with a χ² consistency check
  (cues disagreeing by > 3σ: drop the outlier and widen σ by 1.5×).
  1. `depthFromPlateWidth(platePx, focalPx)` (σ 0.3 m; always available when the plate is detected).
  2. `depthFromCatcherFeet(footPixels, calib)` (feet on the ground plane → mitt z ≈ feet z + 0.35 m; σ 0.2 m).
  3. `depthFromPitcherFoot(landingFootPixel, calib)` (landing foot ground point → release depth; with the fit's depth ratio gives D; σ 0.2 m).
  4. `depthFromParallax(fit)` (when the camera is ≥ 0.7 m off the pitcher–plate line the fit's own scale becomes informative; return it if its σ < 0.3 m, else null).
- `cross.ts`: plate-crossing instant and 3D crossing point.
  - Input: a `TrajectoryFit` (normalised depth, te depth = 1), depth scale `D` (m at te) with σ, the calibration, the rule's judge plane.
  - Convert the fit to world metres via the camera pose and `D`; find `tCross` where the ball centre reaches `z = zPlane` by bisection on `positionAt(t)`; return
    `{ tCross, point: [x, y, z], sigma: { x, y }, frameGap, extrapolated }`. σ propagates from `fit.covariance` plus σ(D) × local slope (dy/dz ≈ 0.11–0.19 near the plate).
  - Handle: ball never reaching the plane (null + reason), ball caught before the plane (extrapolate ≤ 2 frames, flag `extrapolated`).
- `judge.ts`: `judge(cross, box, rule, bands): Verdict` where
  `Verdict = { call: 'strike' | 'ball', cell: 1..9 | null, dxCm, dyCm, edgeCm, borderline, confidence: 'high' | 'medium' | 'low', reasons: string[] }`.
  Strike when the ball (radius 3.65 cm if `ballCountsIf === 'any-part'`) overlaps the box at the judge plane. `borderline` when |edgeCm| < band.
  Confidence: high = calibration residual ≤ 1 px, ≥ 2 agreeing depth cues, ball ≥ 8 px; medium = one cue or ball 5–8 px (digital 2× phones); low otherwise.
  Low confidence never hides the verdict; it adds a reason string.
- `events.ts`: `classifyPitch(track, cross): 'pitch' | 'contact' | 'unknown'`. Contact = direction reversal or lateral velocity jump > 15 m/s within 3 frames of tCross, or
  the blob vanishing ≥ 2 frames before the plane with a new blob appearing off-axis. Contact → no verdict ('타격'). Swing-and-miss is indistinguishable from a take by the ball alone.
- `stability.ts`: tripod drift monitor. Re-detect plate corners every N seconds; if moved > 2 px mark the session `recalibrate` and widen bands ×1.5 until re-detection succeeds.
- `index.ts`: `absFromAnalysis(analysisJson, heightCm, rule): AbsResult`, the glue that reproduces a verdict from stored data (re-judging needs no video).

### 2.2 Plate detection `lib/abs/plate-detect.ts` (pure, luma plane in)
- Input: one luma frame (Uint8, width, height) and a search window (current zone rect region ±50 %).
- Steps: adaptive bright threshold, connected components, polygon approximation, keep 5-vertex convex polygons matching the pentagon prior (two parallel sides, apex away
  from camera), pick the largest in the window, refine corners with sub-pixel edge fitting.
- Output `{ corners: [u,v][5], score, ok }` in source-frame 0..1 coordinates. Below the score threshold → `ok: false`, UI falls back to manual drag.
- Budget: < 40 ms on a 1080×1920 frame downsampled to 540 wide. Worker wrapper `components/abs/plate-worker.ts` following `lib/velocity-engine/luma.worker.ts`.

### 2.3 Engine touches (P2-final only, additive, optional)
- `trajectory-fit.ts` `FitOptions`: add `anchors?: { t: number; depth: number; sigma: number }[]`, extra residual terms pulling normalised depth at t toward a value.
  Undefined → byte-identical output. Add a test asserting identity on the existing fixtures without anchors.
- `analyze-distance.ts` `DistanceInput`: add `depthCues?: DepthCue[]`. When present the fused depth replaces `distanceM`; `DistanceReport.distanceSource` gains
  `'fused'` (extend the union, never rename). Nothing else changes.
- `lib/velocity-analysis.ts` `AnalysisJson`: add optional `abs?: AbsAnalysis` (§3.6). `lib/velocity-sync.ts sanitizeAnalysis` must keep the new numeric fields.
- `lib/velocity-setup.ts`: add `absHeightCm?: number | null`, `absRule?: RuleSetId` to `VelocitySetup` (localStorage only). Zone defaults unchanged.
- Do NOT modify `DualCameraPlugin.swift`. 120 fps, if wanted, is requested from the web side via the existing `preferFps`.

### 2.4 UI `components/abs/` and the velocity flow
- Entry: in the velocity setup's session-type step add 'ABS 라이브 배팅' (FEATURE_NAME_KO). It adds two setup steps after camera position:
  1. `HeightStep`: batter height (cm, `inputMode="numeric"`, 120–210, prefilled from `User.heightCm` when the user is the batter), rule picker collapsed (default KBO).
  2. `PlateStep`: live viewfinder; `PlateFinder` runs plate-detect every 500 ms and draws the pentagon plus the zone box projected into the image (`projectWorld` on the
     8 box corners). Buttons '이 자리로' · '직접 맞추기'(magnifier + drag the five corners) · '다시 찾기'. Calibration quality as a green/amber dot, not a number.
- Measurement: reuse the existing screen. `pitch-result.tsx` gets an optional `abs?: Verdict` prop rendering `VerdictCard`: big S / B (sky / white), edge text
  ('바깥쪽 4 cm 빠짐' / '안쪽 2 cm'), 9-cell mini grid with the crossing dot, '경계' badge when borderline, '타격' on contact, one confidence reason line.
  The clip player draws the projected zone polygon at the crossing frame (new optional `zonePolygon` prop alongside `zoneRect`).
- Session summary (`session-summary.tsx`): `AbsSummary` with strike %, 9-cell heatmap (`components/abs/heatmap.tsx`: counts per cell + borderline dots), S/B on list rows.
- Day view (`pitch-log/velocity-section.tsx`): S/B chip per pitch; tap opens the same result dialog.
- Re-judge: `app/actions/abs.ts` `rejudgePitch(pitchId, heightCm, rule)` reads `analysis.abs`, recomputes via `absFromAnalysis`, writes `zone` · `result` · `analysis.abs.verdict`. Owner only.
- Optional (INCLUDE_3D_VIEW_V1): `components/abs/zone-3d.tsx`, three.js scene (plate, zone box, trajectory tube, crossing marker, orbit drag), loaded with `dynamic()` on open,
  reusing stage conventions from `app/(app)/videos/lab/[id]/mannequin/` (lights, shadows, `scene.background = null`).
- All strings Korean 해요체; tap targets ≥ 44 px; use `Segmented` · `Button` · `CHIP_BASE` from `components/velocity/kit.tsx`.

### 2.5 Privacy and disclosure
- Session start sheet, one line: '타자 · 포수가 영상에 찍혀요. 세션 영상은 N일 뒤 지워져요.' (N = `ABS_CLIP_RETENTION_DAYS`).
- Add an ABS paragraph to `app/(legal)/privacy/privacy-content.tsx` (격식체, like the rest). Never name batters; use '타자 1 · 2 · 3'.

## 3. Data contracts
- 3.1 Types `RuleSet` · `ZoneBox` · `Calib` · `DepthCue` · `Crossing` · `Verdict` · `AbsAnalysis` exported from `lib/abs/index.ts`.
- 3.2 Frame coordinates 0..1 of the source frame, origin top-left (same as `ZoneRect`). World: metres, origin plate apex, x first base, y up, z toward pitcher.
- 3.3 Cell numbering equals `zoneOfPoint`; a test checks agreement on 1,000 random points.
- 3.4 `VelocityPitch.zone` = cell or null when the ball missed the box; `result` = 'strike' | 'ball'; contact → both null and `analysis.abs.event = 'contact'`.
- 3.5 `VelocitySession.sessionType` gains 'abs' (extend the list and label in `lib/velocity-meta.ts`).
- 3.6 `AnalysisJson.abs` (all numbers finite; `sanitizeAnalysis` keeps them):
  abs: {
    v: 1, rule: RuleSetId, heightCm: number,
    calib: { corners: number[][] /*5×2 frame 0..1*/, residualPx, camPos: [x,y,z], focalPx, tiltRad },
    depth: { D, sigma, cues: { kind: 'plate'|'catcher'|'pitcher'|'parallax', D, sigma, used: boolean }[] },
    cross: { t, x, y, z, sigmaX, sigmaY, frameGap, extrapolated } | null,
    event: 'pitch' | 'contact' | 'unknown',
    verdict: { call, cell, dxCm, dyCm, edgeCm, borderline, confidence, reasons: string[] } | null,
    bands: { lateralCm, verticalCm },
    drift: { movedPx, recalibrated }
  }

## 4. Phases, gates, time (Claude time; owner shoots listed separately)

### P0: experiment protocol, synthetic bench, occlusion ratio (3 h + 1 owner shoot)
1. `docs/designs/abs-p0-protocol.md`: two phones, 30–50 pitches, real catcher, clap sync, grid board at the plate; what to measure (RMS crossing-frame gap < 0.3 frames,
   both adjacent frames visible > 90 %, pitcher occlusion fraction of the zone during follow-through). Include a printable checklist for the owner.
2. Synthetic bench `scripts/abs-bench.mts` (`npm run abs:bench`): extend the generator of `scripts/velocity-accuracy.mts` with a plate at 21.5 m, ground plane, camera pose
   (height 1.2–1.6 m, lateral offset 0–1.2 m, tilt 0–6°), 300 pitches over 90–150 km/h, release height 1.6–2.1 m, lateral aim ±0.5 m. Run the full chain
   (detect → track → fit → depth → cross → judge). Report lateral/vertical error (mean, p50, p95), verdict agreement %, borderline rate, per-cue depth error. `--json` for diffs. < 60 s.
3. Occlusion study: a 230 px pitcher silhouette at 5–7 m on a follow-through path; % of frames with the zone centre occluded at lateral offset 0 / 0.5 / 1.0 m.
   This number sets the recommended tripod offset in the setup tips.
GATE 1: crossing-gap RMS < 0.3 frames AND visibility > 90 % (shoot) AND synthetic p95 lateral ≤ 2 cm, vertical ≤ 3 cm (normal scenarios).
If the gap criterion fails: reposition the product as 'lateral call + wide vertical band', set `bands.verticalCm` from the measured gap, then continue.

### P1: rules, zone, calibration, plate detection, drift (6 h)
- Implement `rules.ts` · `zone.ts` · `calib.ts` · `plate-detect.ts` · `stability.ts` with `scripts/abs-selftest.mts` (`npm run abs:test`, via `scripts/alias-register.mjs`):
  homography round-trip < 0.05 px; pose recovery within 2 cm / 0.1° on synthetic plates with 0.3 px corner noise; detector on 50 rendered plates (rotation ±10°, perspective,
  luma 60–240, dirt noise) ≥ 96 % detection, corner error ≤ 0.5 px; cell parity test; rule table sanity. One commit per module, numbers in the commit body.

### P2: judging engine (10 h)
- `depth.ts` · `cross.ts` · `judge.ts` · `events.ts` · `index.ts` + tests: crossing on 500 synthetic trajectories (error vs truth, extrapolation flags), depth fusion with
  disagreeing cues, 60 synthetic contact/take cases (false 'ball' on contact = 0), re-judge determinism.
- P2-final: the engine touches (§2.3) in ONE commit with byte-identity tests on the no-anchor path, then the `HANDOFF.md` entry to 김민.
- Run `npm run velocity:engine2-test` · `velocity:accuracy -- --json` · `velocity:test` before and after; outputs must be identical except new fields.

### P3: UI (4 h, +3 h with 3D)
- Steps, finder, verdict card, heatmap, summary, day chip, re-judge action, privacy sheet. Verify in `app/dev-preview-abs` at 375×812 and 1536×700 with fixtures
  (overflow check: `getBoundingClientRect().right <= innerWidth`), dark theme, `impeccable detect --json` = 0 on changed files. Delete the route; restart the dev server.

### P4: validation and tuning (4 h + 2 owner shoots)
- `scripts/abs-score.mts`: load marker-rig recordings (`scripts/pitch-lab/markers/selfcal` layout + the side 240 fps camera), compute true crossing points, score app verdicts:
  agreement ≥ 95 % outside the 3/6 cm bands, vertical bias ≤ 1.5 cm. Replace default bands with measured 2σ. Record results in `abs-single-camera.md` §검증.
- Live batting: compare with a human umpire; disagreement ≤ 10 %, zero 'ball' calls on contact.
GATE 2: both met → drop the '참고' badge from the summary; otherwise keep it and list the failing cases.

### P5: second pass (≈12 h, separate approval)
- Behind-catcher position, 120 fps via `preferFps`, front-plane judging ('both'), automatic height from the batter's bounding box at setup.

## 5. Working rules for the session
- Pure modules first; UI last; engine edits last and smallest. Each phase ends with a Korean commit message stating what changed and the measured numbers.
- Before each phase `git fetch` → `git pull --ff-only`; re-read `HANDOFF.md` if it changed.
- After each phase update `docs/claude/geum-yunho.md` item 20 and any changed number in `docs/designs/abs-single-camera.md`. Push only when the owner says "올려줘".
- Ask the owner only at the gates or when a DECISIONS line is blank. Otherwise take the default, state it in the commit body, continue.
- When something cannot be done (no camera, no Mac, blocked tool) say so first with the alternative, and continue on what does not depend on it.
- Report format (ADHD style, Korean): first line = result or next action; numbered steps ≤ 5; concrete hours; restate state (commit hash, unpushed count); end with one next action.

## 6. Definition of done (v1)
- `npm run abs:test` green; `npm run abs:bench` within GATE 1; `velocity:*` tests byte-identical on legacy paths; `npx tsc --noEmit` clean; eslint clean on changed files.
- A real iPhone 15 Pro Max session shows: plate auto-detected, zone drawn, each pitch judged within 2 s of arrival, S/B + edge distance + cell, heatmap in the summary,
  verdict reproducible from `analysis.abs` without video.
- `HANDOFF.md` entry for 김민 listing engine changes; privacy text updated; no new DB migration.
```
