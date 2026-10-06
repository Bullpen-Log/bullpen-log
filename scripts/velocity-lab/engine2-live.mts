/**
 * 엔진 2.0 실시간 되돌려 보기 — 2배 줌 영상 19개의 장면을 카메라처럼 실시간 판단(LiveMeter, 거리 측정 담기)에 흘려, 던짐을
 * 알아채고 1.3초 담아 계산 워커와 같은 함수(analyzeJob)로 잰다. 앱의 '실시간 녹화 → 바로 계산'과 같은 길(워커 · 화면만 빼고).
 *
 *   node scripts/velocity-lab/engine2-live.mts            # 19개 · 720 · 60fps
 *   node scripts/velocity-lab/engine2-live.mts 132_6a345288
 *   node scripts/velocity-lab/engine2-live.mts --zoom1      # 1배 줌 흉내(2배 영상을 반으로 줄여 가운데에, 둘레는 회색)
 *
 * 장면은 engine2-lab.mts 와 같은 밝기 묶음(저장소 밖 ~/bullpen-velocity-lab/proto2/frames).
 */
import { openSync, readFileSync, readSync } from 'node:fs';
import { homedir } from 'node:os';
import { join } from 'node:path';
import {
  analyzeJob,
  DISTANCE_METER_CONFIG,
  LiveMeter,
  type CaptureJob,
  type MeterEvent,
} from '../../lib/velocity-engine/live-meter.ts';

const DIR = process.env.VELO_FRAMES ?? join(homedir(), 'bullpen-velocity-lab/proto2/frames');
const RELEASE: Record<string, number> = {
  '076_2d9a838b': 0.25, '077_9f8a61e5': 0.42, '079_67dc9bfd': 0.21, '085_118b04f6': 0.42, '100_48eb0bc2': 0.24,
  '100_d538e2c9': 0.24, '111_65a9d1cf': 0.13, '113_54461aa6': 0.21, '119_cb90aea5': 0.1, '121_39a06194': 0.22,
  '124_d0908680': 0.17, '129_215ca2b7': 0.13, '132_6a345288': 0.16, '086_49e9817d': 0.27, '098_92cac0e7': 0.1,
  '102_17f8f7ba': 1.46, '111_0098e212': 0.62, '114_cc85c282': 0.22, '119_334def29': 0.35,
};
const INDOOR = ['086', '098', '102', '111_0', '114', '119_3'];
const venue = (n: string) => (INDOOR.some((p) => n.startsWith(p)) ? '실내' : '밖');
const TILT_DEG: Record<string, number> = { '076': 3.6, '077': 3.6, '079': 3.6, '085': 3.6, '100': 3.6, '113': 3.6 };
const W = 720;
const H = 1280;
const ZOOM1 = process.argv.includes('--zoom1');
const FOCAL_SRC = ((1920 / 2 / Math.tan((59.8 / 2) * (Math.PI / 180))) * 2) / (ZOOM1 ? 2 : 1);
const D = 21.5;

function down(src: Uint8Array, w: number, h: number): Uint8Array {
  const out = new Uint8Array(W * H);
  /* 1배 흉내: 가운데 반(W/2 × H/2)에 2배 장면 전체를 줄여 넣는다 */
  const [ox, oy, cw, ch] = ZOOM1 ? [W / 4, H / 4, W / 2, H / 2] : [0, 0, W, H];
  if (ZOOM1) out.fill(110);
  const kx = w / cw;
  const ky = h / ch;
  for (let y = oy; y < oy + ch; y++)
    for (let x = ox; x < ox + cw; x++) {
      const sx = (x - ox + 0.5) * kx - 0.5;
      const sy = (y - oy + 0.5) * ky - 0.5;
      const x0 = Math.max(0, Math.floor(sx));
      const y0 = Math.max(0, Math.floor(sy));
      const x1 = Math.min(w - 1, x0 + 1);
      const y1 = Math.min(h - 1, y0 + 1);
      const fx = sx - x0;
      const fy = sy - y0;
      out[y * W + x] = Math.round(
        (src[y0 * w + x0] * (1 - fx) + src[y0 * w + x1] * fx) * (1 - fy) + (src[y1 * w + x0] * (1 - fx) + src[y1 * w + x1] * fx) * fy
      );
    }
  return out;
}

const names = process.argv.slice(2).filter((a) => !a.startsWith('--'));
const list = names.length ? names : Object.keys(RELEASE);
type Row = { name: string; gun: number; kmh: number | null; info: string };
const rows: Row[] = [];
for (const name of list) {
  const meta = JSON.parse(readFileSync(join(DIR, name + '.json'), 'utf8')) as { w: number; h: number; n: number; t: number[] };
  const fd = openSync(join(DIR, name + '.y8'), 'r');
  const size = meta.w * meta.h;
  const frame = (i: number) => {
    const b = Buffer.allocUnsafe(size);
    readSync(fd, b, 0, size, i * size);
    return down(new Uint8Array(b.buffer, b.byteOffset, size), meta.w, meta.h);
  };
  const meter = new LiveMeter(W, H, 'receding', { focalPx: FOCAL_SRC * (W / meta.w), ...DISTANCE_METER_CONFIG });
  const jobs: CaptureJob[] = [];
  const take = (evs: MeterEvent[]) => {
    for (const e of evs)
      if (e.kind === 'capture') {
        jobs.push(e.job);
        meter.finish(false);
      }
  };
  take(meter.arm());
  const p = 1 / 60;
  const first = frame(1);
  /* 던지기 전 1초는 첫 장면 그대로(삼각대 · 배경 준비) — 장면 0 은 잘라 붙인 자리라 1 부터 */
  for (let q = 60; q >= 1; q--) take(meter.push({ t: meta.t[1] - q * p, luma: first }));
  for (let i = 1; i < meta.n; i++) take(meter.push({ t: meta.t[i], luma: i === 1 ? first : frame(i) }));
  let t = meta.t[meta.n - 1];
  const last = frame(meta.n - 1);
  for (let q = 0; q < 120 && meter.getStatus() === 'capturing'; q++) take(meter.push({ t: (t += p), luma: last }));
  const gun = Number(name.slice(0, 3));
  const rel = RELEASE[name];
  const job = jobs.find((j) => j.ball && Math.abs(j.ball.t - rel) < 0.3) ?? jobs[0];
  if (!job) {
    rows.push({ name, gun, kmh: null, info: `못 알아챔(일감 ${jobs.length})` });
    console.log(`${name.padEnd(13)} ${venue(name)} 건 ${gun}  못 알아챔 — 일감 ${jobs.length}`);
    continue;
  }
  const a0 = performance.now();
  const res = analyzeJob(job, {
    width: W,
    height: H,
    sourceWidth: meta.w,
    sourceHeight: meta.h,
    fovDeg: ZOOM1 ? 59.8 : 32.1,
    focalPx: FOCAL_SRC,
    approach: 'receding',
    releaseDistanceM: null,
    distanceM: D,
    tiltRad: ((TILT_DEG[name.slice(0, 3)] ?? 0) * Math.PI) / 180,
  });
  const ms = performance.now() - a0;
  const m = res.measure;
  const d = (res as unknown as { distance?: { flightFrames: number; extended: number; impact: string } }).distance;
  rows.push({ name, gun, kmh: m.ok ? m.kmh : null, info: '' });
  console.log(
    `${name.padEnd(13)} ${venue(name)} 건 ${String(gun).padStart(3)}  알아챔 ${job.ball ? ((job.ball.t - rel) * 1000).toFixed(0) + 'ms' : 'motion'} · 담은 ${job.frames.length}장(${(job.frames[job.frames.length - 1].t - job.frames[0].t).toFixed(2)}초) · 일감 ${jobs.length}  ${m.ok ? `${m.kmh} ±${m.errorKmh} ${m.confidence}` : m.code}  비행 ${d?.flightFrames}(+${d?.extended}) ${d?.impact} 계산 ${ms.toFixed(0)}ms`
  );
}
const med = (a: number[]) => {
  const b = [...a].sort((x, y) => x - y);
  return b.length % 2 ? b[b.length >> 1] : (b[b.length / 2 - 1] + b[b.length / 2]) / 2;
};
for (const v of ['밖', '실내']) {
  const errs: number[] = [];
  let fails = 0;
  const vs = rows.filter((q) => venue(q.name) === v);
  for (const r of vs) {
    const others = vs.filter((q) => q !== r && q.kmh != null && !q.name.startsWith('111_6'));
    if (r.kmh == null || others.length < 2) {
      fails++;
      continue;
    }
    /* 같은 장소 나머지 영상으로 맞춘 거리 배율 */
    const k = med(others.map((q) => q.gun / (q.kmh as number)));
    const e = r.kmh * k - r.gun;
    if (!r.name.startsWith('111_6')) errs.push(e);
  }
  if (vs.length)
    console.log(
      `${v}: 잼 ${vs.length - fails}/${vs.length}` +
        (errs.length
          ? ` · LOO MAE ${(errs.reduce((a, x) => a + Math.abs(x), 0) / errs.length).toFixed(1)} · 최대 ${Math.max(...errs.map(Math.abs)).toFixed(1)}`
          : '')
    );
}
