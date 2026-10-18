/**
 * ABS 순수 계산 셀프테스트 — `npm run abs:test`
 * 규칙표 · 존 상자 · 칸 번호(zoneOfPoint 와 같은지) · 가장자리 거리 · 카메라 자세 왕복 · 통과점(합성 궤적 정답 대비) · 판정.
 */
import { fitTrajectory, type PinholeCamera, type TrackPoint } from '../lib/velocity-engine/trajectory-fit.ts';
import { zoneOfPoint } from '../lib/velocity-setup.ts';
import {
  AVERAGE_HEIGHT_CM,
  ballInZone,
  behindPitcherPose,
  camToWorld,
  cellOf,
  DEFAULT_BANDS,
  edgeDistance,
  findCrossing,
  judge,
  judgePlaneZ,
  RULES,
  type Vec3,
  verdictText,
  worldToCam,
  zoneWorld,
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

/* 규칙표 */
for (const r of Object.values(RULES)) {
  check(`${r.id} 위 > 아래`, r.topPct > r.bottomPct);
  check(`${r.id} 비율 범위`, r.bottomPct > 0.2 && r.topPct < 0.65);
}
check('평균 신장 범위', AVERAGE_HEIGHT_CM >= 160 && AVERAGE_HEIGHT_CM <= 185);

/* 존 상자 — 180cm KBO: 아래 48.7 · 위 100.4cm, 좌우 ±(21.59 + 2) */
const rule = RULES['kbo-2025'];
const box = zoneWorld(180, rule);
check('존 아래 48.7cm', near(box.bottom, 0.4867, 0.001), String(box.bottom));
check('존 위 100.4cm', near(box.top, 1.0035, 0.001), String(box.top));
check('존 반폭 23.6cm', near(box.right, 0.2359, 0.0005));
check('중간면 z', near(judgePlaneZ(box, rule), 0.2155, 0.001));

/* 칸 번호 = zoneOfPoint (투수 뒤 · 포수 뒤) — 1,000점 */
{
  let s = 12345;
  const rnd = () => ((s = (s * 1103515245 + 12345) & 0x7fffffff) / 0x7fffffff);
  const rect = { x: 0.3, y: 0.4, w: 0.2, h: 0.27 };
  let mismatch = 0;
  for (let i = 0; i < 1000; i++) {
    const u = rnd() * 1.3 - 0.15;
    const v = rnd() * 1.3 - 0.15;
    const x = box.left + u * (box.right - box.left);
    const y = box.top - v * (box.top - box.bottom);
    for (const pos of ['behind-pitcher', 'behind-catcher'] as const) {
      const a = cellOf(x, y, box, pos);
      const b = zoneOfPoint(rect.x + u * rect.w, rect.y + v * rect.h, rect, pos);
      if (a !== b) mismatch++;
    }
  }
  check('칸 번호가 zoneOfPoint 와 같다(2,000)', mismatch === 0, `어긋남 ${mismatch}`);
  check('왼쪽 위 = 1', cellOf(box.left + 0.01, box.top - 0.01, box) === 1);
  check('오른쪽 아래 = 9', cellOf(box.right - 0.01, box.bottom + 0.01, box) === 9);
  check('가운데 = 5', cellOf(0, (box.top + box.bottom) / 2, box) === 5);
}

/* 가장자리 거리 · 공 일부 규칙 */
{
  const e = edgeDistance(box.right + 0.05, (box.top + box.bottom) / 2, box);
  check('오른쪽 5cm 밖', near(e.dx, 0.05, 1e-9) && !e.inside && near(e.edge, 0.05, 1e-9));
  const e2 = edgeDistance(0, box.bottom + 0.02, box);
  check('아래 2cm 안(아래 가장자리에서 위로 2cm)', e2.inside && near(e2.dy, 0.02, 1e-9) && near(e2.edge, -0.02, 1e-9));
  const e3 = edgeDistance(0, box.top - 0.02, box);
  check('위 2cm 안(위 가장자리에서 아래로 2cm)', e3.inside && near(e3.dy, -0.02, 1e-9) && near(e3.edge, -0.02, 1e-9));
  check('중심 3cm 밖도 공 일부 걸침 = 스트라이크', ballInZone(box.right + 0.03, 0.7, box, rule));
  check('중심 4cm 밖은 볼', !ballInZone(box.right + 0.04, 0.7, box, rule));
  check('높이 밖 위로 5cm 는 볼', !ballInZone(0, box.top + 0.05, box, rule));
}

/* 카메라 자세 왕복 · 방향 */
{
  const pose = behindPitcherPose([0.5, 1.4, 22.4], 0.02, -0.02);
  const p: Vec3 = [0.1, 0.8, 0.2];
  const back = camToWorld(worldToCam(p, pose), pose);
  check('세상 → 카메라 → 세상', back.every((v, i) => near(v, p[i], 1e-9)));
  const pc = worldToCam([0.3, 1.4, 0], behindPitcherPose([0, 1.4, 22.4], 0, 0));
  check('플레이트 쪽이 앞(깊이 +)', near(pc[2], 22.4, 1e-9));
  check('+x(1루)가 화면 오른쪽', pc[0] > 0.29);
  const down = worldToCam([0, 0.4, 0], behindPitcherPose([0, 1.4, 22.4], 0, 0));
  check('낮은 점이 화면 아래(yc +)', down[1] > 0.99);
}

/* 통과점 — 합성 궤적을 카메라에 비춰 되맞추고 정답과 견준다(잡음 없음 → 1cm 안) */
{
  const CAM: PinholeCamera = { f: 2790, cx: 540, cy: 960 };
  const camPos: Vec3 = [0.5, 1.4, 22.4];
  const tilt = Math.atan2(0.4, 22.4);
  const yaw = Math.atan2(-0.5, 22.4);
  const pose = behindPitcherPose(camPos, tilt, yaw);
  /* 진짜 궤적(세상): 릴리스 (0.4, 1.85, 16.9), 속도 38m/s 거의 −z, 중력 + 공기저항 */
  const K = 0.006;
  const pts: TrackPoint[] = [];
  const truthAt: { t: number; p: Vec3 }[] = [];
  let p: Vec3 = [0.4, 1.85, 16.9];
  let v: Vec3 = [-0.6, 1.1, -38];
  const dt = 0.0005;
  for (let t = 0; p[2] > -0.6; t += dt) {
    const sp = Math.hypot(...v);
    const a: Vec3 = [-K * sp * v[0], -9.81 - K * sp * v[1], -K * sp * v[2]];
    truthAt.push({ t, p });
    p = [p[0] + v[0] * dt, p[1] + v[1] * dt, p[2] + v[2] * dt];
    v = [v[0] + a[0] * dt, v[1] + a[1] * dt, v[2] + a[2] * dt];
  }
  const zPlane = judgePlaneZ(box, rule);
  const idx = truthAt.findIndex((s) => s.p[2] <= zPlane);
  const truth = truthAt[idx];
  const times: number[] = [];
  for (let t = 0.04; t < truthAt[truthAt.length - 1].t; t += 1 / 60) times.push(t);
  for (const t of times) {
    const s = truthAt[Math.round(t / dt)];
    const pc = worldToCam(s.p, pose);
    pts.push({ t, u: CAM.cx + (CAM.f * pc[0]) / pc[2], v: CAM.cy + (CAM.f * pc[1]) / pc[2], sigma: 0.5, diam: (CAM.f * 0.073) / pc[2] });
  }
  const te = times[times.length - 1] + 0.5 / 60;
  const D = worldToCam(truthAt[Math.min(truthAt.length - 1, Math.round(te / dt))].p, pose)[2];
  const opts = { dragScaleM: D, tilt };
  const fit = fitTrajectory(pts, te, CAM, opts);
  const c = findCrossing(fit, opts, D, 0.2, pose, zPlane, times);
  check('통과점을 찾았다', c.t != null);
  if (c.t != null) {
    check('통과 시각 0.1장 안', near(c.t, truth.t, 0.1 / 60), `${((c.t - truth.t) * 60).toFixed(3)}장`);
    check('통과점 좌우 1cm 안', near(c.point[0], truth.p[0], 0.01), `${((c.point[0] - truth.p[0]) * 100).toFixed(2)}cm`);
    check('통과점 높이 1cm 안', near(c.point[1], truth.p[1], 0.01), `${((c.point[1] - truth.p[1]) * 100).toFixed(2)}cm`);
    check('깊이 σ 0.2m → 높이 σ 1.5~5cm', c.sigmaY > 0.015 && c.sigmaY < 0.05, `${(c.sigmaY * 100).toFixed(1)}cm`);
    check('옆 0.5m 카메라: 좌우 σ 가 높이 σ 보다 작다', c.sigmaX < c.sigmaY);
    check('외삽 아님', !c.extrapolated);
    const vd = judge(c, box, rule, DEFAULT_BANDS, { calibResidualPx: 0.5, depthCuesAgreeing: 2, ballDiamPx: 10 });
    check('판정이 정답과 같다', (vd.call === 'strike') === ballInZone(truth.p[0], truth.p[1], box, rule));
    check('믿음 높음', vd.confidence === 'high', vd.confidence + ' ' + vd.reasons.join(','));
    /* 외삽 — 마지막 6장을 빼면 플레이트 앞에서 끝나 외삽 표시 */
    const cut = times.slice(0, -6);
    const fit2 = fitTrajectory(pts.slice(0, -6), cut[cut.length - 1] + 0.5 / 60, CAM, opts);
    const c2 = findCrossing(fit2, opts, worldToCam(truthAt[Math.round((cut[cut.length - 1] + 0.5 / 60) / dt)].p, pose)[2], 0.2, pose, zPlane, cut);
    check('가림 외삽 표시', c2.t != null && c2.extrapolated);
    if (c2.t != null) {
      const vd2 = judge(c2, box, rule, DEFAULT_BANDS, { calibResidualPx: 0.5, depthCuesAgreeing: 2, ballDiamPx: 10 });
      check('외삽이면 믿음 내려감', vd2.confidence !== 'high');
    }
  }
  /* 단서 하나 · 작은 공 → 믿음 낮음, 글 */
  if (c.t != null) {
    const low = judge(c, box, rule, DEFAULT_BANDS, { calibResidualPx: 0.5, depthCuesAgreeing: 1, ballDiamPx: 4 });
    check('단서 하나 + 공 4px = 낮음', low.confidence === 'low');
    const t1 = verdictText({ ...low, call: 'ball', dxCm: 4.2, dyCm: 1, edgeCm: 4.2 });
    check("글 '바깥쪽 4cm 빠짐'", t1 === '바깥쪽 4cm 빠짐', t1);
    const t2 = verdictText({ ...low, call: 'ball', dxCm: 1, dyCm: -5.4, edgeCm: 5.4 });
    check("글 '낮아서 5cm 빠짐'", t2 === '낮아서 5cm 빠짐', t2);
    const t3 = verdictText({ ...low, call: 'strike', dxCm: -2, dyCm: -8, edgeCm: -2 });
    check("글 '안쪽 2cm'", t3 === '안쪽 2cm', t3);
  }
}

console.log(`abs:test ${pass} 통과 · ${fail} 실패`);
if (fail) process.exit(1);
