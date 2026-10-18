/**
 * ABS P2 셀프테스트 — 깊이 단서 합치기 · 타격 가리기 · 측정 직후 판정(judgePitch) · 저장 모양(sanitize) · 재판정(absFromAnalysis). `npm run abs:test` 가 같이 돈다.
 */
import { fitTrajectory, type PinholeCamera, type TrackPoint } from '../lib/velocity-engine/trajectory-fit.ts';
import {
  absFromAnalysis,
  ballInZone,
  calibFromPlate,
  classifyPitch,
  fuseDepth,
  judgePitch,
  mittCue,
  PLATE_CORNERS_WORLD,
  poseFromAngles,
  projectWorld,
  RULES,
  sanitizeAbs,
  sanitizeFitSnapshot,
  worldToCam,
  zoneWorld,
  judgePlaneZ,
  type Calib,
  type DepthCue,
  type FitSnapshot,
  type Vec3,
} from '../lib/abs/index.ts';

let pass = 0;
let fail = 0;
function check(name: string, ok: boolean, detail = '') {
  if (ok) pass++;
  else {
    fail++;
    console.log(`  ✗ ${name}${detail ? ' — ' + detail : ''}`);
  }
}
const near = (a: number, b: number, eps: number) => Math.abs(a - b) <= eps;

/* ---- 깊이 합치기 ---- */
{
  const cues: DepthCue[] = [
    { kind: 'mitt', D: 22.0, sigma: 0.2, used: false },
    { kind: 'ball', D: 22.4, sigma: 0.9, used: false },
  ];
  const f = fuseDepth(cues);
  check('두 단서 가중 평균(미트 쪽)', f.D > 22.0 && f.D < 22.1 && f.sigma < 0.2, `${f.D.toFixed(3)} ± ${f.sigma.toFixed(3)}`);
  check('둘 다 씀', f.cues.every((c) => c.used));
  const g = fuseDepth([
    { kind: 'mitt', D: 22.0, sigma: 0.2, used: false },
    { kind: 'input', D: 25.0, sigma: 0.15, used: false },
  ]);
  check('3σ 넘게 어긋나면 하나를 뺀다', g.cues.filter((c) => c.used).length === 1);
  check('남은 단서 하나면 σ 1.5배', g.sigma > 0.2, g.sigma.toFixed(3));
  check('단서 없음 → NaN', Number.isNaN(fuseDepth([]).D));
}

/* ---- 공통 합성: 진짜 궤적 → 관측 → 맞춤 → 스냅샷 ---- */
const CAM: PinholeCamera = { f: 2790, cx: 540, cy: 960 };
const camPos: Vec3 = [0.5, 1.4, 22.4];
const tilt = Math.atan2(0.4, 22.4);
const truePose = poseFromAngles(camPos, tilt, 0, 0);
const trueCal: Calib = { pose: truePose, focalPx: CAM.f, cx: CAM.cx, cy: CAM.cy, plateDepthM: 0, cameraHeightM: 0, cameraDistanceM: 0, lateralOffsetM: 0, ok: true, reasons: [] };
const rule = RULES['kbo-2025'];
const box = zoneWorld(178, rule);
const zPlane = judgePlaneZ(box, rule);

function synth(release: Vec3, v0: Vec3) {
  const K = 0.006;
  const dt = 0.0005;
  const truth: { t: number; p: Vec3 }[] = [];
  let p = release;
  let v = v0;
  for (let t = 0; p[2] > -0.6; t += dt) {
    const sp = Math.hypot(...v);
    truth.push({ t, p });
    p = [p[0] + v[0] * dt, p[1] + v[1] * dt, p[2] + v[2] * dt];
    v = [v[0] - K * sp * v[0] * dt, v[1] + (-9.81 - K * sp * v[1]) * dt, v[2] - K * sp * v[2] * dt];
  }
  const times: number[] = [];
  for (let t = 0.04; t < truth[truth.length - 1].t; t += 1 / 60) times.push(t);
  const pts: TrackPoint[] = times.map((t) => {
    const pc = worldToCam(truth[Math.round(t / dt)].p, truePose);
    return { t, u: CAM.cx + (CAM.f * pc[0]) / pc[2], v: CAM.cy + (CAM.f * pc[1]) / pc[2], sigma: 0.5, diam: (CAM.f * 0.073) / pc[2] };
  });
  const te = times[times.length - 1] + 0.5 / 60;
  const Dtrue = worldToCam(truth[Math.min(truth.length - 1, Math.round(te / dt))].p, truePose)[2];
  const fit = fitTrajectory(pts, te, CAM, { dragScaleM: Dtrue, tilt });
  const snap: FitSnapshot = { p: fit.p, te, dragScaleM: Dtrue, tiltRad: tilt, cam: CAM, cov: fit.covariance };
  const i = truth.findIndex((s) => s.p[2] <= zPlane);
  return { snap, pts, times, truth: truth[i], Dtrue };
}

const L = projectWorld(PLATE_CORNERS_WORLD[0], trueCal)!;
const R = projectWorld(PLATE_CORNERS_WORLD[1], trueCal)!;
const calibInput = { frontLeft: L, frontRight: R, focalPx: CAM.f, width: 1080, height: 1920, tiltDown: tilt, roll: 0 };

/* ---- 타격 가리기 ---- */
{
  const s = synth([0.4, 1.85, 16.9], [-0.6, 1.1, -38]);
  const obs = s.pts.map((o) => ({ t: o.t, u: o.u, v: o.v }));
  const proj = (t: number): [number, number] => {
    const [u, v] = fitTrajectoryProject(s.snap, t);
    return [u, v];
  };
  const tCross = s.truth.t;
  check('안 친 공 = pitch', classifyPitch(obs, proj, tCross, 1 / 60) === 'pitch');
  /* 통과 뒤 관측을 옆으로 40px 튀게 — 타격 */
  const hit = obs.map((o) => (o.t > tCross ? { ...o, u: o.u + 40, v: o.v - 30 } : o));
  check('튄 공 = contact', classifyPitch(hit, proj, tCross, 1 / 60) === 'contact');
  const cut = obs.filter((o) => o.t <= tCross);
  check('통과 뒤 관측 없음 = unknown', classifyPitch(cut, proj, tCross, 1 / 60) === 'unknown');
}

function fitTrajectoryProject(s: FitSnapshot, t: number): [number, number] {
  const { fit } = fitFrom(s);
  const [u, v] = fit.project(t);
  return [u, v];
}
import { fitFromSnapshot as fitFrom } from '../lib/abs/analysis.ts';

/* ---- 측정 직후 판정 · 재판정 · 저장 모양 ---- */
{
  const s = synth([0.4, 1.85, 16.9], [-0.6, 1.1, -38]);
  const cal = calibFromPlate(calibInput);
  check('보정 ok', cal.ok, cal.reasons.join(','));
  /* 미트 단서가 실제 Dtrue 와 얼마나 가깝나(사전값 0.6m 뒤) */
  const mc = mittCue(cal, 'rebound');
  check('미트 단서가 진짜 끝 깊이와 0.4m 안', near(mc.D, s.Dtrue, 0.4), `${mc.D.toFixed(2)} vs ${s.Dtrue.toFixed(2)}`);
  const abs = judgePitch({
    fit: s.snap,
    impact: 'rebound',
    sizeDistM: s.Dtrue * 1.02,
    obs: s.pts.map((o) => ({ t: o.t, u: o.u, v: o.v })),
    calib: calibInput,
    heightCm: 178,
    rule: 'kbo-2025',
    batter: 1,
    ballDiamPx: 10,
  });
  check('판정이 나왔다', abs.verdict != null && abs.cross != null, abs.reason ?? '');
  if (abs.cross && abs.verdict) {
    const trueStrike = ballInZone(s.truth.p[0], s.truth.p[1], box, rule);
    check('판정 = 정답', (abs.verdict.call === 'strike') === trueStrike, `${abs.verdict.call} vs ${trueStrike}`);
    check('통과점 좌우 2cm 안', near(abs.cross.x, s.truth.p[0], 0.02), `${((abs.cross.x - s.truth.p[0]) * 100).toFixed(1)}cm`);
    check('통과점 높이 6cm 안(미트 사전값 σ 0.2)', near(abs.cross.y, s.truth.p[1], 0.06), `${((abs.cross.y - s.truth.p[1]) * 100).toFixed(1)}cm`);
    check('event = pitch', abs.event === 'pitch');
    check('깊이 단서 둘 다 씀', abs.depth.cues.filter((c) => c.used).length === 2);
  }
  /* 저장 모양 — 숫자만 걸러도 판정 · 보정이 남는다 */
  const saved = sanitizeAbs(JSON.parse(JSON.stringify(abs)));
  check('sanitizeAbs 가 판정을 지킴', saved?.verdict?.call === abs.verdict?.call && saved?.cross != null);
  check('sanitizeAbs 쓰레기 → null', sanitizeAbs({ rule: 'x' }) == null && sanitizeAbs(null) == null);
  const snapSaved = sanitizeFitSnapshot(JSON.parse(JSON.stringify(s.snap)));
  check('sanitizeFitSnapshot 왕복', snapSaved != null && snapSaved.p.length === 7 && snapSaved.cov?.length === 7);
  check('저장 크기 3KB 안', JSON.stringify({ abs: saved, fit: snapSaved }).length < 3000, String(JSON.stringify({ abs: saved, fit: snapSaved }).length));
  /* 재판정 — 저장된 것으로 다른 신장 */
  const analysis = {
    distance: { fit: snapSaved, impact: 'rebound' as const, sizeDistM: s.Dtrue * 1.02, inputDistM: null },
    track: s.pts.map((o) => [o.t, o.u, o.v, o.diam ?? 10]),
    abs: saved,
  };
  const again = absFromAnalysis(analysis, 178, 'kbo-2025');
  check('재판정이 같은 결과', again?.verdict?.call === abs.verdict?.call && again != null && near(again.cross!.y, abs.cross!.y, 0.005));
  const tall = absFromAnalysis(analysis, 205, 'kbo-2025');
  const short = absFromAnalysis(analysis, 140, 'kbo-2025');
  check('신장을 바꾸면 존이 바뀜(통과점은 그대로)', tall != null && short != null && near(tall.cross!.y, again!.cross!.y, 1e-6) && tall.verdict!.dyCm !== short.verdict!.dyCm);
  /* 미트 단서만(공 크기 없음) → 단서 하나 → 믿음 내려감 */
  const one = judgePitch({ ...{ fit: s.snap, impact: 'end' as const, sizeDistM: null, obs: [], calib: calibInput, heightCm: 178, rule: 'kbo-2025' as const, batter: 1 } });
  check('단서 하나 · 관측 없음 → 믿음 낮음 · event unknown', one.verdict?.confidence !== 'high' && one.event === 'unknown');
}

/* ---- 플레이트 못 가는 공 ---- */
{
  const s = synth([0.4, 1.85, 16.9], [-0.6, 1.1, -38]);
  /* 관측을 앞 절반만 쓰고(te 가 비행 중간) 끝 깊이를 10m 라고 믿게 하면 공은 창(te + 0.15초) 안에 플레이트까지 못 간다 */
  const half = s.pts.slice(0, Math.floor(s.pts.length / 2));
  const te = half[half.length - 1].t + 0.5 / 60;
  const Dh = 10;
  const fit = fitTrajectory(half, te, CAM, { dragScaleM: Dh, tilt });
  const abs = judgePitch({
    fit: { p: fit.p, te, dragScaleM: Dh, tiltRad: tilt, cam: CAM, cov: fit.covariance },
    impact: 'end',
    sizeDistM: null,
    inputDistM: Dh,
    obs: half.map((o) => ({ t: o.t, u: o.u, v: o.v })),
    calib: calibInput,
    heightCm: 178,
    rule: 'kbo-2025',
    batter: 1,
  });
  check('플레이트 못 간 공은 판정 없음 + 까닭', abs.verdict == null && abs.reason != null, abs.reason ?? 'null');
}

console.log(`abs:test(P2) ${pass} 통과 · ${fail} 실패`);
if (fail) process.exit(1);
