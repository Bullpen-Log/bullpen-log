/**
 * 엔진 2.0(거리 자) 셀프테스트 — 물리로 날린 공을 그린 합성 장면으로 analyze-distance.ts 가 알려진 구속을 맞히나.
 *
 *   npm run velocity:engine2-test
 *
 * 장면: 세로 720×1280 · 60fps · 2배 줌 초점거리. 배경은 고정 무늬 + 장면마다 잡음, 공은 위가 밝고 아래가 그늘진 원(지름 = f·73mm/깊이)을
 * 노출 2ms 동안 겹쳐 그린다. 공은 카메라 앞 1m 에서 출발해 공기저항 · 중력 · 양력으로 날아가 거리 D 의 그물에 닿으면 튄다.
 * 정답 = 깊이 1m(릴리스)에서의 수평 속력 — 엔진의 대표 구속과 같은 정의.
 */
import { analyzeByDistance } from '../lib/velocity-engine/analyze-distance.ts';
import { DRAG_K } from '../lib/velocity-engine/trajectory-fit.ts';

const W = 720;
const H = 1280;
const FPS = 60;
const F = (1920 / 2 / Math.tan((59.8 / 2) * (Math.PI / 180))) * 2 * (W / 1080);
const R_BALL = 0.0365;

let failed = 0;
let passed = 0;
const check = (ok: boolean, msg: string) => {
  if (ok) passed++;
  else failed++;
  console.log(`  ${ok ? '✅' : '❌'} ${msg}`);
};

/** 결정적 난수 */
function rng(seed: number) {
  let s = seed >>> 0;
  return () => ((s = (s * 1664525 + 1013904223) >>> 0) / 4294967296);
}

type Scene = {
  kmh: number;
  /** 위로 던진 각(°, 세상 기준) */
  launchDeg: number;
  /** 옆으로(°) */
  sideDeg: number;
  /** 카메라 → 그물(m) */
  D: number;
  /** 카메라가 아래로 숙인 각(°) */
  tiltDeg: number;
  /** 흰 천 — 이 깊이(m)부터 공 뒤 배경이 공처럼 밝다(덩어리로는 안 보이고 그늘진 아래 반달만 남는다) */
  whiteFromM?: number;
  /** 공을 아예 안 그린다(헛것 거부) */
  noBall?: boolean;
  seed: number;
};

/** 공의 3차원 길(카메라 좌표, y 아래 · z 앞) — 시각별 자리. 정답 속도도 */
function flight(sc: Scene) {
  const tilt = (sc.tiltDeg * Math.PI) / 180;
  /* 세상 → 카메라: 카메라가 아래로 φ 숙임. 세상 위(+up)는 카메라 (0, −cosφ, −sinφ), 세상 앞(수평)은 (0, −sinφ, cosφ) */
  const up: [number, number, number] = [0, -Math.cos(tilt), -Math.sin(tilt)];
  const fwd: [number, number, number] = [0, -Math.sin(tilt), Math.cos(tilt)];
  const v0 = sc.kmh / 3.6;
  const la = (sc.launchDeg * Math.PI) / 180;
  const sa = (sc.sideDeg * Math.PI) / 180;
  const vH = v0 * Math.cos(la);
  let v: [number, number, number] = [
    vH * Math.sin(sa),
    vH * Math.cos(sa) * fwd[1] + v0 * Math.sin(la) * up[1],
    vH * Math.cos(sa) * fwd[2] + v0 * Math.sin(la) * up[2],
  ];
  /* 중력 9.81 아래 + 회전 양력 2.5 위 = 세상 아래로 7.3 */
  const aDown = 7.3;
  const g: [number, number, number] = [0, -up[1] * aDown, -up[2] * aDown];
  let p: [number, number, number] = [0.32, -0.18, 1.0];
  const out: { t: number; p: [number, number, number] }[] = [];
  const dt = 0.0005;
  let t = 0;
  let bounced = false;
  while (t < 1.6) {
    out.push({ t, p: [...p] as [number, number, number] });
    const sp = Math.hypot(...v);
    const a: [number, number, number] = [g[0] - DRAG_K * sp * v[0], g[1] - DRAG_K * sp * v[1], g[2] - DRAG_K * sp * v[2]];
    v = [v[0] + a[0] * dt, v[1] + a[1] * dt, v[2] + a[2] * dt];
    p = [p[0] + v[0] * dt, p[1] + v[1] * dt, p[2] + v[2] * dt];
    if (!bounced && p[2] >= sc.D) {
      /* 그물에 닿아 튄다 — 앞으로 가던 것이 0.2배로 되돌아오고 옆 · 아래로 조금 */
      bounced = true;
      v = [v[0] * 0.3 - 1.5, v[1] * 0.3 + 2, -v[2] * 0.2];
    }
    t += dt;
  }
  return { path: out, truthKmh: vH * 3.6 };
}

function render(sc: Scene) {
  const r = rng(sc.seed);
  /* 고정 배경 — 위는 어두운 벽 · 나무, 아래는 땅. 무늬 덩어리 */
  const bg = new Float32Array(W * H);
  for (let y = 0; y < H; y++)
    for (let x = 0; x < W; x++) bg[y * W + x] = 60 + 50 * (y / H) + 18 * Math.sin(x * 0.05) * Math.sin(y * 0.031);
  for (let k = 0; k < 220; k++) {
    const cx = r() * W;
    const cy = r() * H;
    const rad = 3 + r() * 14;
    const val = 40 + r() * 90;
    for (let y = Math.max(0, Math.floor(cy - rad)); y < Math.min(H, cy + rad); y++)
      for (let x = Math.max(0, Math.floor(cx - rad)); x < Math.min(W, cx + rad); x++)
        if ((x - cx) ** 2 + (y - cy) ** 2 < rad * rad) bg[y * W + x] = val;
  }
  const { path, truthKmh } = flight(sc);
  const at = (t: number) => path[Math.min(path.length - 1, Math.max(0, Math.round(t / 0.0005)))].p;
  /* 흰 천 — 공 길의 먼 쪽(whiteFromM 넘어 그물까지)이 지나는 화면 자리를 덮는다(실내: 포수 뒤 흰 천) */
  let sheet: [number, number, number, number] | null = null;
  if (sc.whiteFromM != null) {
    let x0 = W;
    let y0 = H;
    let x1 = 0;
    let y1 = 0;
    for (const q of path) {
      const [X, Y, Z] = q.p;
      if (Z < sc.whiteFromM || Z > sc.D) continue;
      const u = F * (X / Z) + W / 2;
      const v = F * (Y / Z) + H / 2;
      x0 = Math.min(x0, u);
      y0 = Math.min(y0, v);
      x1 = Math.max(x1, u);
      y1 = Math.max(y1, v);
    }
    sheet = [Math.max(0, Math.floor(x0 - 30)), Math.max(0, Math.floor(y0 - 30)), Math.min(W, Math.ceil(x1 + 30)), Math.min(H, Math.ceil(y1 + 30))];
  }
  const frames: { t: number; luma: Uint8Array }[] = [];
  const t0 = -0.15;
  for (let i = 0; t0 + i / FPS <= 1.4; i++) {
    const t = t0 + i / FPS;
    const img = Float32Array.from(bg);
    /* 흰 천 — 그물 쪽 가운데 띠(공이 지나는 곳) */
    if (sheet) for (let y = sheet[1]; y < sheet[3]; y++) for (let x = sheet[0]; x < sheet[2]; x++) img[y * W + x] = 214;
    if (!sc.noBall && t >= 0) {
      /* 노출 2ms 를 네 번 겹쳐 그린다(번짐) */
      const subs = [0, 0.00067, 0.00133, 0.002];
      const acc = new Float32Array(W * H);
      const cov = new Float32Array(W * H);
      for (const ds of subs) {
        const [X, Y, Z] = at(t + ds);
        if (!(Z > 0.3)) continue;
        const u = F * (X / Z) + W / 2;
        const v = F * (Y / Z) + H / 2;
        const rad = (F * R_BALL) / Z;
        for (let y = Math.max(0, Math.floor(v - rad - 2)); y <= Math.min(H - 1, Math.ceil(v + rad + 2)); y++)
          for (let x = Math.max(0, Math.floor(u - rad - 2)); x <= Math.min(W - 1, Math.ceil(u + rad + 2)); x++) {
            const d = Math.hypot(x - u, y - v);
            const a = Math.min(1, Math.max(0, rad + 0.5 - d));
            if (a <= 0) continue;
            /* 위가 밝고 아래가 그늘 — 흰 천 앞이면 위쪽 반은 천과 같은 밝기 */
            const shade = 222 - 50 * Math.max(0, (y - v) / rad);
            acc[y * W + x] += a * shade;
            cov[y * W + x] += a;
          }
      }
      for (let k = 0; k < W * H; k++) if (cov[k] > 0) {
        const a = cov[k] / subs.length;
        img[k] = img[k] * (1 - a) + (acc[k] / cov[k]) * a;
      }
    }
    const luma = new Uint8Array(W * H);
    for (let k = 0; k < W * H; k++) luma[k] = Math.max(0, Math.min(255, Math.round(img[k] + (r() - 0.5) * 4)));
    frames.push({ t, luma });
  }
  return { frames, truthKmh };
}

function run(name: string, sc: Scene, tolRel: number) {
  if (only && !name.includes(only)) return;
  const { frames, truthKmh } = render(sc);
  const res = analyzeByDistance({
    frames,
    width: W,
    height: H,
    sourceWidth: 1080,
    sourceHeight: 1920,
    focalPx: (F * 1080) / W,
    distanceM: sc.D,
    tiltRad: (sc.tiltDeg * Math.PI) / 180,
    fps: FPS,
  });
  const m = res.measure;
  if (sc.noBall) {
    check(!m.ok, `${name} — 공이 없으면 값을 내지 않는다(${m.ok ? m.kmh : m.code})`);
    return;
  }
  const err = m.ok ? m.kmh / truthKmh - 1 : NaN;
  check(
    m.ok && Math.abs(err) <= tolRel,
    `${name} — 정답 ${truthKmh.toFixed(1)} · 잰 값 ${m.ok ? m.kmh : m.code} (${m.ok ? (err * 100).toFixed(2) + '%' : '-'}, 허용 ±${(tolRel * 100).toFixed(1)}%) · 비행 ${res.distance.flightFrames}장(+${res.distance.extended}) 끝 ${res.distance.impact} ${res.distance.timingMs}ms`
  );
}

console.log('엔진 2.0 셀프테스트(합성 장면)');
const only = process.argv[2];
run('빠른 공 130km/h · 20m', { kmh: 130, launchDeg: -1, sideDeg: -1.2, D: 20, tiltDeg: 0, seed: 1 }, 0.015);
run('보통 105km/h · 18.5m', { kmh: 105, launchDeg: 1, sideDeg: -0.8, D: 18.5, tiltDeg: 0, seed: 2 }, 0.015);
run('띄운 느린 공 80km/h · 위로 11°', { kmh: 80, launchDeg: 11, sideDeg: -1, D: 21.5, tiltDeg: 0, seed: 3 }, 0.02);
run('카메라 4° 숙임 · 115km/h', { kmh: 115, launchDeg: 0, sideDeg: -1, D: 20, tiltDeg: 4, seed: 4 }, 0.015);
run('흰 천 앞에서 사라지는 공 · 100km/h', { kmh: 100, launchDeg: 2, sideDeg: -1, D: 20, tiltDeg: 0, whiteFromM: 12, seed: 5 }, 0.04);
run('공 없음', { kmh: 100, launchDeg: 0, sideDeg: 0, D: 20, tiltDeg: 0, noBall: true, seed: 6 }, 0);

console.log(`\n${'═'.repeat(50)}\n통과 ${passed} / 실패 ${failed}\n${'═'.repeat(50)}`);
if (failed) process.exit(1);
