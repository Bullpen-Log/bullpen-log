/**
 * ABS P1 셀프테스트 — 플레이트 보정(calib.ts) · 앞변 찾기(plate-detect.ts) · 삼각대 움직임(stability.ts). `npm run abs:test` 가 같이 돈다.
 */
import {
  bandsFor,
  calibFromPlate,
  DEFAULT_BANDS,
  driftInit,
  driftUpdate,
  findPlateFront,
  groundPointFromPixel,
  planePointFromPixel,
  poseFromAngles,
  PLATE_CORNERS_WORLD,
  projectWorld,
  RULES,
  worldToCam,
  zonePolygonPx,
  zoneWorld,
  type Calib,
  type Pixel,
  type Vec3,
} from '../lib/abs/index.ts';

let pass = 0;
let fail = 0;
export function check(name: string, ok: boolean, detail = '') {
  if (ok) pass++;
  else {
    fail++;
    console.log(`  ✗ ${name}${detail ? ' — ' + detail : ''}`);
  }
}
const near = (a: number, b: number, eps: number) => Math.abs(a - b) <= eps;

function rng(seed: number) {
  let s = seed >>> 0;
  const next = () => {
    s = (s + 0x6d2b79f5) >>> 0;
    let t = s;
    t = Math.imul(t ^ (t >>> 15), t | 1);
    t ^= t + Math.imul(t ^ (t >>> 7), t | 61);
    return ((t ^ (t >>> 14)) >>> 0) / 4294967296;
  };
  return { next, uni: (a: number, b: number) => a + (b - a) * next(), gauss: () => Math.sqrt(-2 * Math.log(Math.max(1e-12, next()))) * Math.cos(2 * Math.PI * next()) };
}

const F = 2790;
const W = 1080;
const H = 1920;

/* ---- 보정 왕복: 진짜 자세로 앞변 양끝을 비추고 → calibFromPlate → 자세 · 깊이 · 존 모서리 재투영 ---- */
{
  const r = rng(3);
  let worstPx = 0;
  let worstH = 0;
  const ballErrs: number[] = [];
  for (let i = 0; i < 200; i++) {
    const camPos: Vec3 = [r.uni(-1, 1), r.uni(1.0, 1.8), r.uni(21, 24)];
    const tilt = Math.atan2(camPos[1] - 0.9, camPos[2]) + r.uni(-0.02, 0.02);
    const roll = r.uni(-0.03, 0.03);
    const truth = poseFromAngles(camPos, tilt, roll, 0);
    const trueCal: Calib = { pose: truth, focalPx: F, cx: W / 2, cy: H / 2, plateDepthM: 0, cameraHeightM: 0, cameraDistanceM: 0, lateralOffsetM: 0, ok: true, reasons: [] };
    const L = projectWorld(PLATE_CORNERS_WORLD[0], trueCal)!;
    const R = projectWorld(PLATE_CORNERS_WORLD[1], trueCal)!;
    /* 끝 픽셀 잡음 0.3px · 센서 잡음 0.3° */
    const n = (p: Pixel): Pixel => [p[0] + r.gauss() * 0.3, p[1] + r.gauss() * 0.3];
    const cal = calibFromPlate({ frontLeft: n(L), frontRight: n(R), focalPx: F, width: W, height: H, tiltDown: tilt + r.gauss() * 0.005, roll: roll + r.gauss() * 0.005 });
    if (!cal.ok) {
      check(`보정 ok(${i})`, false, cal.reasons.join(','));
      continue;
    }
    /* 재투영: 플레이트 다섯 모서리 */
    for (const p of PLATE_CORNERS_WORLD) {
      const a = projectWorld(p, trueCal)!;
      const b = projectWorld(p, cal)!;
      worstPx = Math.max(worstPx, Math.hypot(a[0] - b[0], a[1] - b[1]));
    }
    worstH = Math.max(worstH, Math.abs(cal.cameraHeightM - camPos[1]));
    /* 공 높이: 존 가운데 높이 0.75m · z = zMid 인 점을 진짜 자세로 비춘 픽셀을 보정 자세로 되돌리면 몇 cm 어긋나나 */
    const ball: Vec3 = [r.uni(-0.3, 0.3), r.uni(0.4, 1.1), 0.2155];
    const px = projectWorld(ball, trueCal)!;
    const back = planePointFromPixel(px, 0.2155, cal)!;
    ballErrs.push(Math.hypot(back[0] - ball[0], back[1] - ball[1]));
  }
  ballErrs.sort((a, b) => a - b);
  const p95 = ballErrs[Math.floor(ballErrs.length * 0.95)];
  check('보정 재투영 플레이트 모서리 ≤ 1.5px(200 자세)', worstPx <= 1.5, `${worstPx.toFixed(2)}px`);
  check('카메라 높이 오차 최대 ≤ 0.4m(센서 0.3° 3σ · 22m — 높이 자체는 판정에 안 쓴다)', worstH <= 0.4, `${worstH.toFixed(3)}m`);
  check('통과 면 위 공 자리 되돌림 p95 ≤ 1.5cm(센서 오차 대부분 상쇄)', p95 <= 0.015, `p95 ${(p95 * 100).toFixed(2)}cm · 최대 ${(ballErrs[ballErrs.length - 1] * 100).toFixed(2)}`);
}

/* ---- 보정 수치 · 거부 ---- */
{
  /* 높이 1.4m · 21.5m: 수평 밑 각 0.065rad = 숙임 0.0186 + 화면 밑 129px */
  const cal = calibFromPlate({ frontLeft: [512, 1089], frontRight: [568, 1089], focalPx: F, width: W, height: H, tiltDown: 0.0186 });
  check('깊이 ≈ f·W/w = 21.5m', near(cal.plateDepthM, (F * 0.4318) / 56, 0.01), cal.plateDepthM.toFixed(2));
  check('높이 1~2m', cal.cameraHeightM > 1 && cal.cameraHeightM < 2, cal.cameraHeightM.toFixed(2));
  check('ok', cal.ok, cal.reasons.join(','));
  const g = groundPointFromPixel([540, 1089], cal);
  check('앞변 가운데 픽셀 → 지면 점이 (0, 0, 0.43) 근처', g != null && near(g[0], 0, 0.02) && near(g[2], 0.431, 0.1), g ? g.map((v) => v.toFixed(3)).join(',') : 'null');
  const far = calibFromPlate({ frontLeft: [530, 1089], frontRight: [550, 1089], focalPx: F, width: W, height: H, tiltDown: 0.02 });
  check('폭 20px(60m)는 거부', !far.ok);
  const poly = zonePolygonPx(zoneWorld(180, RULES['kbo-2025']), cal);
  check('존 폴리곤 8 + 플레이트 5', poly != null && poly.front.length === 4 && poly.back.length === 4 && poly.plate.length === 5);
  if (poly) {
    const w = poly.front[1][0] - poly.front[0][0];
    check('존 폭 ≈ 61px(47.2cm · 0.77cm/px)', near(w, 61, 3), w.toFixed(1));
    check('존 위가 아래보다 화면 위', poly.front[0][1] < poly.front[3][1]);
  }
  /* 카메라 좌표 방향 — 앞변 왼끝(3루)이 화면 왼쪽 */
  const pc = worldToCam(PLATE_CORNERS_WORLD[0], cal.pose);
  check('3루 쪽 모서리가 화면 왼쪽(xc < 0)', pc[0] < 0);
}

/* ---- 앞변 찾기: 합성 루마 50장 ---- */
{
  const r = rng(11);
  let found = 0;
  let worstErr = 0;
  let sumErr = 0;
  const N = 50;
  for (let i = 0; i < N; i++) {
    const w = 300;
    const h = 300;
    const bg = r.uni(60, 150);
    const plate = Math.min(255, bg + r.uni(60, 110));
    const data = new Float32Array(w * h);
    for (let k = 0; k < data.length; k++) data[k] = bg + r.gauss() * 6 + ((k % w) / w) * r.uni(-20, 20);
    /* 앞변: 가운데 근처, 폭 36~90px, 두께 2.5~6px, 롤 ±3°, 소수점 끝 */
    const pw = r.uni(36, 90);
    const th = r.uni(2.5, 6);
    const cxp = 150 + r.uni(-40, 40);
    const cyp = 150 + r.uni(-40, 40);
    const rollA = r.uni(-0.05, 0.05);
    const L: Pixel = [cxp - (pw / 2) * Math.cos(rollA), cyp - (pw / 2) * Math.sin(rollA)];
    const R: Pixel = [cxp + (pw / 2) * Math.cos(rollA), cyp + (pw / 2) * Math.sin(rollA)];
    /* 4×4 초과 샘플링으로 밝기 채움(가장자리 소수점) */
    for (let y = Math.floor(cyp - 8); y <= cyp + 8; y++)
      for (let x = Math.floor(L[0] - 3); x <= R[0] + 3; x++) {
        let cover = 0;
        for (let sy = 0; sy < 4; sy++)
          for (let sx = 0; sx < 4; sx++) {
            const px = x + (sx + 0.5) / 4;
            const py = y + (sy + 0.5) / 4;
            /* 선분 좌표계 */
            const dx = px - cxp;
            const dy = py - cyp;
            const along = dx * Math.cos(rollA) + dy * Math.sin(rollA);
            const perp = -dx * Math.sin(rollA) + dy * Math.cos(rollA);
            if (Math.abs(along) <= pw / 2 && Math.abs(perp) <= th / 2) cover++;
          }
        if (cover) data[y * w + x] = data[y * w + x] * (1 - cover / 16) + plate * (cover / 16);
      }
    /* 방해물: 포수 미트(밝은 네모 20×20) · 흰 선(가늘고 긴 세로줄) */
    if (r.next() < 0.5) {
      const mx = Math.floor(r.uni(20, 260));
      const my = Math.floor(r.uni(20, 260));
      for (let y = my; y < my + 20; y++) for (let x = mx; x < mx + 20; x++) data[y * w + x] = plate - 10;
    }
    if (r.next() < 0.5) {
      const vx = Math.floor(r.uni(20, 280));
      for (let y = 0; y < h; y++) data[y * w + vx] = plate;
    }
    const res = findPlateFront({ data, width: w, height: h }, { x: 0, y: 0, w, h });
    if (!res.ok) continue;
    const e = Math.max(Math.hypot(res.left[0] - L[0], res.left[1] - L[1]), Math.hypot(res.right[0] - R[0], res.right[1] - R[1]));
    if (e > 3) continue; /* 다른 것을 잡음 — 못 찾은 것으로 셈 */
    found++;
    sumErr += e;
    worstErr = Math.max(worstErr, e);
  }
  check(`앞변 찾기 ≥ 96%(${found}/${N})`, found / N >= 0.96);
  check('끝 오차 평균 ≤ 0.5px', sumErr / Math.max(1, found) <= 0.5, `${(sumErr / Math.max(1, found)).toFixed(2)}px`);
  check('끝 오차 최대 ≤ 1.2px', worstErr <= 1.2, `${worstErr.toFixed(2)}px`);
  /* 플레이트 없는 창은 거부 */
  const flat = new Float32Array(300 * 300).fill(100);
  check('빈 창은 못 찾음', !findPlateFront({ data: flat, width: 300, height: 300 }, { x: 0, y: 0, w: 300, h: 300 }).ok);
  /* 속도: 320×320 창 20번 */
  const t0 = performance.now();
  for (let i = 0; i < 20; i++) findPlateFront({ data: flat, width: 300, height: 300 }, { x: 0, y: 0, w: 300, h: 300 });
  const ms = (performance.now() - t0) / 20;
  check('창 하나 < 40ms', ms < 40, `${ms.toFixed(1)}ms`);
}

/* ---- 삼각대 움직임 ---- */
{
  const ref = { ok: true, left: [500, 1000] as [number, number], right: [556, 1000] as [number, number], thickness: 4, score: 0.9, reason: null };
  let st = driftInit(ref, 0);
  st = driftUpdate(st, { ...ref, left: [501, 1000], right: [557, 1000] }, 5);
  check('1px 밀림은 그대로', !st.recalibrate && near(st.movedPx, 1, 1e-9));
  st = driftUpdate(st, { ...ref, left: [503, 1001], right: [559, 1001] }, 10);
  check('3px 밀림은 다시 보정', st.recalibrate);
  check('띠 1.5배', near(bandsFor(st, DEFAULT_BANDS).verticalCm, 9, 1e-9));
  st = driftUpdate(st, { ...ref, ok: false }, 15);
  check('못 찾으면 misses 만', st.misses === 1 && st.recalibrate);
  st = driftUpdate(st, { ...ref, left: [500, 1000], right: [530, 1000] }, 20);
  check('폭이 다른 조각은 무시', st.misses === 2);
  st = driftUpdate(st, ref, 25);
  check('제자리로 오면 풀림', !st.recalibrate && st.misses === 0);
}

console.log(`abs:test(P1) ${pass} 통과 · ${fail} 실패`);
if (fail) process.exit(1);
