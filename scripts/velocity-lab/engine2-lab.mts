/**
 * 엔진 2.0(거리 자) 실험대 — 2배 줌 · 릴리스가 보이는 영상 19개(포켓 레이더 값이 파일 이름 앞)를 노드에서 바로 잰다.
 *
 * 장면은 미리 뽑아 둔 밝기 묶음을 읽는다(시험 코드의 dump — `<이름>.y8` 원본 해상도 세로 밝기 + `<이름>.json` {w,h,n,t}).
 * 영상은 개인 것이라 저장소 밖에 둔다: 기본 `~/bullpen-velocity-lab/proto2/frames`(환경변수 VELO_FRAMES).
 *
 *   node scripts/velocity-lab/engine2-lab.mts                 # 앱 분석 해상도(짧은 변 720)로 19개
 *   node scripts/velocity-lab/engine2-lab.mts --res=1080       # 원본 해상도
 *   node scripts/velocity-lab/engine2-lab.mts --whole 132_6a345288   # 클립 전체를 넘겨 씨앗을 스스로 찾게
 *   node scripts/velocity-lab/engine2-lab.mts --fk=1.1               # 초점거리를 10% 틀리게 넣었을 때
 *   node scripts/velocity-lab/engine2-lab.mts --auto --d=20          # 거리를 공 크기로 어림(넣은 20m 는 첫 어림) — 스피드건과 바로 견줌
 *
 * 점수: 같은 장소의 나머지 영상으로 거리를 맞춰(LOO — 앱에서는 사용자가 넣는 거리 자리) 스피드건과 견준다.
 * '건 맞춤 D' = 그 영상만으로 스피드건에 맞는 거리(같은 장소면 비슷해야 한다).
 */
import { openSync, readFileSync, readSync } from 'node:fs';
import { homedir } from 'node:os';
import { join } from 'node:path';
import { analyzeByDistance } from '../../lib/velocity-engine/analyze-distance.ts';

const DIR = process.env.VELO_FRAMES ?? join(homedir(), 'bullpen-velocity-lab/proto2/frames');
/** 영상마다 릴리스 짐작 시각(초, 눈으로) — 구간을 앱의 카메라처럼(공 앞 0.15초 ~ 뒤 1.4초) 자른다 */
const RELEASE: Record<string, number> = {
  '076_2d9a838b': 0.25, '077_9f8a61e5': 0.42, '079_67dc9bfd': 0.21, '085_118b04f6': 0.42, '100_48eb0bc2': 0.24,
  '100_d538e2c9': 0.24, '111_65a9d1cf': 0.13, '113_54461aa6': 0.21, '119_cb90aea5': 0.1, '121_39a06194': 0.22,
  '124_d0908680': 0.17, '129_215ca2b7': 0.13, '132_6a345288': 0.16, '086_49e9817d': 0.27, '098_92cac0e7': 0.1,
  '102_17f8f7ba': 1.46, '111_0098e212': 0.62, '114_cc85c282': 0.22, '119_334def29': 0.35,
};
const INDOOR = ['086', '098', '102', '111_0', '114', '119_3'];
/** --tilt: 밖 첫 묶음(076~113)은 카메라가 약 3.6° 아래를 봤다(그물 바닥 높이로 읽음) — 앱에서는 폰 기울기 센서가 준다 */
const TILT_DEG: Record<string, number> = { '076': 3.6, '077': 3.6, '079': 3.6, '085': 3.6, '100': 3.6, '113': 3.6 };
const venue = (n: string) => (INDOOR.some((p) => n.startsWith(p)) ? '실내' : '밖');
/** 2배 줌 화각 — 1배 긴 변 59.8°(1.x 의 아이폰 영상 값)의 절반 탄젠트 */
const FOCAL_FULL =
  (1920 / 2 / Math.tan((59.8 / 2) * (Math.PI / 180))) * 2 * Number((process.argv.find((a) => a.startsWith('--fk=')) ?? '--fk=1').slice(5));

const args = process.argv.slice(2);
const res = Number((args.find((a) => a.startsWith('--res=')) ?? '--res=720').slice(6));
const whole = args.includes('--whole');
const useTilt = args.includes('--tilt');
/** --horiz: 위아래를 뺀 수평 속력으로 견준다(스피드건은 앞으로 가는 성분을 잰다) */
const horiz = args.includes('--horiz');
/** --auto: 거리를 공 크기로 어림한다(analyze-distance autoDistance) — 값을 스피드건과 바로 견준다 */
const auto = args.includes('--auto');
const D = Number((args.find((a) => a.startsWith('--d=')) ?? '--d=21.5').slice(4));
const names = args.filter((a) => !a.startsWith('--'));
/**
 * --shake=A: 손에 든 폰처럼 화면을 흔든다(분석 px, 가장 큰 어긋남 ≈ A) — 1~2Hz 흔들림 + 8~10Hz 떨림, 영상마다 같은 흔들림(이름으로
 * 정함). --roll=도 를 주면 그만큼 돌리기도 한다. 흔들림을 바로잡는 계산(stabilize)을 시험한다.
 */
const SHAKE = Number(
  (args.find((a) => a.startsWith('--shake=')) ?? '--shake=0').slice(8)
);
const ROLL = Number((args.find((a) => a.startsWith('--roll=')) ?? '--roll=0').slice(7));
function shakeAt(name: string, t: number): [number, number, number] {
  let hsh = 2166136261;
  for (const c of name) hsh = Math.imul(hsh ^ c.charCodeAt(0), 16777619) >>> 0;
  const ph = (k: number) => (((hsh >>> (k * 3)) & 1023) / 1024) * 2 * Math.PI;
  const w = (f: number, k: number) => Math.sin(2 * Math.PI * f * t + ph(k));
  const sx = SHAKE * (0.62 * w(1.3, 0) + 0.25 * w(2.1, 1) + 0.13 * w(8.7, 2));
  const sy = SHAKE * (0.62 * w(1.1, 3) + 0.25 * w(2.6, 4) + 0.13 * w(9.4, 5));
  const th = ((ROLL * Math.PI) / 180) * (0.8 * w(1.7, 6) + 0.2 * w(8.1, 7));
  return [sx, sy, th];
}
/** 흔든 장면 — 화면 (x,y) 에 원래 장면의 (x+sx, y+sy)(가운데 둘레로 th 만큼 돌린 자리)를 쌍선형으로 */
function shaken(
  src: Uint8Array,
  w: number,
  h: number,
  [sx, sy, th]: [number, number, number]
): Uint8Array {
  if (!sx && !sy && !th) return src;
  const out = new Uint8Array(w * h);
  const cx = w / 2;
  const cy = h / 2;
  const co = Math.cos(th);
  const sn = Math.sin(th);
  for (let y = 0; y < h; y++)
    for (let x = 0; x < w; x++) {
      const X = Math.min(
        w - 1.001,
        Math.max(0, cx + co * (x - cx) - sn * (y - cy) + sx)
      );
      const Y = Math.min(
        h - 1.001,
        Math.max(0, cy + sn * (x - cx) + co * (y - cy) + sy)
      );
      const x0 = Math.floor(X);
      const y0 = Math.floor(Y);
      const fx = X - x0;
      const fy = Y - y0;
      const p = y0 * w + x0;
      out[y * w + x] = Math.round(
        (src[p] * (1 - fx) + src[p + 1] * fx) * (1 - fy) +
          (src[p + w] * (1 - fx) + src[p + w + 1] * fx) * fy
      );
    }
  return out;
}
const list = names.length ? names : Object.keys(RELEASE);

function load(name: string) {
  const meta = JSON.parse(readFileSync(join(DIR, name + '.json'), 'utf8')) as {
    w: number;
    h: number;
    n: number;
    t: number[];
    /** 원본 영상 크기 — 장면을 분석 해상도로 받아 둔 묶음(브라우저가 꺼낸 장면)이면 있다 */
    src?: [number, number];
  };
  const fd = openSync(join(DIR, name + '.y8'), 'r');
  const size = meta.w * meta.h;
  const frame = (i: number) => {
    const b = Buffer.allocUnsafe(size);
    readSync(fd, b, 0, size, i * size);
    return new Uint8Array(b.buffer, b.byteOffset, size);
  };
  return { ...meta, frame };
}

/** 쌍선형으로 줄이기 — 앱이 캔버스에 그려 읽는 것과 같은 크기 */
function down(src: Uint8Array, w: number, h: number, W: number, H: number): Uint8Array {
  const out = new Uint8Array(W * H);
  const kx = w / W;
  const ky = h / H;
  for (let y = 0; y < H; y++)
    for (let x = 0; x < W; x++) {
      const sx = (x + 0.5) * kx - 0.5;
      const sy = (y + 0.5) * ky - 0.5;
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

type Row = { name: string; gun: number; kmh: number | null; Dgun: number | null; code: string | null; info: string };
const rows: Row[] = [];
for (const name of list) {
  const clip = load(name);
  const W = Math.round((clip.w * res) / Math.min(clip.w, clip.h));
  const H = Math.round((clip.h * res) / Math.min(clip.w, clip.h));
  const rel = RELEASE[name] ?? 0.2;
  const pick = (i: number) => (W === clip.w ? clip.frame(i) : down(clip.frame(i), clip.w, clip.h, W, H));
  const frames = [];
  const bgs = [];
  for (let i = 1; i < clip.n; i++) {
    const t = clip.t[i];
    if (whole || (t >= rel - 0.15 && t <= rel + 1.4))
      frames.push({ t, luma: shaken(pick(i), W, H, shakeAt(name, t)) });
    else if (!whole && t < rel - 0.3 && t >= rel - 1.2)
      bgs.push(shaken(pick(i), W, H, shakeAt(name, t)));
  }
  const r = analyzeByDistance({
    frames,
    backgroundSamples: bgs.slice(-3),
    width: W,
    height: H,
    sourceWidth: clip.src?.[0] ?? clip.w,
    sourceHeight: clip.src?.[1] ?? clip.h,
    focalPx: FOCAL_FULL,
    distanceM: D,
    fps: 60,
    tiltRad: useTilt ? ((TILT_DEG[name.slice(0, 3)] ?? 0) * Math.PI) / 180 : 0,
    autoDistance: auto,
    stabilize: !args.includes('--no-stab'),
  });
  const gun = Number(name.slice(0, 3));
  const m = r.measure;
  const d = r.distance;
  rows.push({
    name,
    gun,
    kmh: m.ok ? (horiz && d.kmhHorizontal && d.kmh3d ? (m.kmh * d.kmhHorizontal) / d.kmh3d : m.kmh) : null,
    Dgun: null,
    code: m.ok ? null : m.code,
    info: `흔들림 ${d.shakePx}${d.stabilized ? `(바로잡음 ${d.stabResidPx})` : ''} te ${d.te?.toFixed(4)} 비행 ${d.flightFrames}장(+${d.extended}) 끝 ${d.impact} 첫깊이 ${d.firstDepthM}m 위로 ${d.launchDeg}° rms ${d.rmsPx} 씨앗 ${d.seeds}@${d.seedFrame} ${d.timingMs}ms`,
  });
  const x = rows[rows.length - 1];
  if (x.kmh != null) x.Dgun = (gun / x.kmh) * d.distanceM;
  if (auto) x.info = `거리 ${d.distanceM}m(${d.distanceSource}) 공크기 ${d.sizeDistM} 차이 ${x.kmh != null ? (x.kmh - gun).toFixed(1) : '-'} · ` + x.info;
  console.log(
    `${name.padEnd(13)} ${venue(name)} 건 ${String(gun).padStart(3)}  ${x.kmh != null ? x.kmh.toFixed(1).padStart(6) : '  못 잼'}  D건 ${x.Dgun != null ? x.Dgun.toFixed(2) : x.code}  ${m.ok ? `±${m.errorKmh} ${m.confidence}` : ''}  ${x.info}`
  );
}
/* 같은 장소 나머지 영상으로 거리를 맞춰 견준다(그물 밑으로 빠진 111_65 는 D 를 정할 때 뺀다) */
const med = (a: number[]) => {
  const b = [...a].sort((x, y) => x - y);
  return b.length % 2 ? b[b.length >> 1] : (b[b.length / 2 - 1] + b[b.length / 2]) / 2;
};
for (const v of auto ? [] : ['밖', '실내']) {
  const errs: number[] = [];
  let fails = 0;
  for (const r of rows.filter((q) => venue(q.name) === v)) {
    const others = rows.filter((q) => q !== r && venue(q.name) === v && q.Dgun != null && !q.name.startsWith('111_6'));
    if (r.Dgun == null || others.length < 2) {
      fails++;
      continue;
    }
    const Dl = med(others.map((q) => q.Dgun as number));
    const e = ((r.kmh as number) * Dl) / D - r.gun;
    if (!r.name.startsWith('111_6')) errs.push(e);
    console.log(`  ${v} ${r.name} LOO ${(((r.kmh as number) * Dl) / D).toFixed(1)} (${e >= 0 ? '+' : ''}${e.toFixed(1)})`);
  }
  if (errs.length)
    console.log(
      `${v}: 잼 ${errs.length + (rows.some((q) => q.name.startsWith('111_6') && venue(q.name) === v && q.Dgun != null) ? 1 : 0)}/${rows.filter((q) => venue(q.name) === v).length} · MAE ${(errs.reduce((a, x) => a + Math.abs(x), 0) / errs.length).toFixed(1)} · 최대 ${Math.max(...errs.map(Math.abs)).toFixed(1)} · 못 잼 ${fails}`
    );
}
/* --auto: 거리를 안 넣었으니 스피드건과 바로 견준다(그물 밑으로 빠진 111_65 는 평균에서 뺀다) */
for (const v of auto ? ['밖', '실내'] : []) {
  const rs = rows.filter((q) => venue(q.name) === v);
  const errs = rs.filter((q) => q.kmh != null && !q.name.startsWith('111_6')).map((q) => (q.kmh as number) - q.gun);
  if (errs.length)
    console.log(
      `${v}: 잼 ${rs.filter((q) => q.kmh != null).length}/${rs.length} · 평균 차이 ${(errs.reduce((a, x) => a + x, 0) / errs.length).toFixed(1)} · MAE ${(errs.reduce((a, x) => a + Math.abs(x), 0) / errs.length).toFixed(1)} · 최대 ${Math.max(...errs.map(Math.abs)).toFixed(1)}`
    );
}
