/**
 * 영상 파일 경로 자가 시험 — 장면 시각 표(stts · ctts · elst) · 장면 짚기 · 색 정보 · 렌즈 화각 · 던진 때 찾기 · 구간 정하기.
 *
 *   node scripts/velocity-video-test.mts
 *
 * 파일 없이 moov 상자를 직접 만들어 시험한다(video-fps.ts 의 *FromMoov). 던진 때 찾기는 거친 장면(가로 320)을 그린다.
 */
import {
  frameTableFromMoov,
  fpsFromMoov,
  colorFromMoov,
  planFrameSeeks,
  sampleAt,
  sampleIndexAt,
  transferName,
  isHdr,
} from '../lib/velocity-engine/video-fps.ts';
import { IPHONE_VIDEO_MAIN_FOV_DEG, videoFovFor, videoFovInfo } from '../lib/velocity-engine/video-lens.ts';
import {
  findThrow,
  planThrowWindows,
  coarseGrid,
  denseBandTimes,
  motionPeak,
  COARSE_STEP_MAX,
  SEED_MAX_M,
  THROW_PRE_SEC,
  anchoredBackgroundTimes,
  type ThrowSample,
} from '../lib/velocity-engine/find-throw.ts';
import { focalPxFromFov, BALL_DIAMETER_M } from '../lib/velocity-engine/geometry.ts';

let passed = 0;
let failed = 0;
function check(name: string, ok: boolean, detail = '') {
  if (ok) passed++;
  else failed++;
  console.log(`  ${ok ? '✅' : '❌'} ${name}${detail ? ' — ' + detail : ''}`);
}

/* ───────────────────────── moov 만들기 ───────────────────────── */

function u32(n: number) {
  const b = new Uint8Array(4);
  new DataView(b.buffer).setUint32(0, n >>> 0);
  return b;
}
function i32(n: number) {
  const b = new Uint8Array(4);
  new DataView(b.buffer).setInt32(0, n);
  return b;
}
function i16(n: number) {
  const b = new Uint8Array(2);
  new DataView(b.buffer).setInt16(0, n);
  return b;
}
function u16(n: number) {
  const b = new Uint8Array(2);
  new DataView(b.buffer).setUint16(0, n);
  return b;
}
function cat(...parts: Uint8Array[]) {
  const out = new Uint8Array(parts.reduce((a, p) => a + p.length, 0));
  let at = 0;
  for (const p of parts) {
    out.set(p, at);
    at += p.length;
  }
  return out;
}
function box(type: string, ...body: Uint8Array[]) {
  const b = cat(...body);
  return cat(u32(8 + b.length), new TextEncoder().encode(type), b);
}
const zeros = (n: number) => new Uint8Array(n);

type Track = {
  timescale: number;
  /** 풀기 순서의 장면 길이(눈금) */
  deltas: number[];
  /** 보이는 시각 어긋남(눈금, 풀기 순서) — 없으면 ctts 없음 */
  ctts?: number[];
  cttsVersion?: 0 | 1;
  /** 편집 목록 — [조각 길이(영화 눈금), mediaTime, 배율 정수, 배율 분수] */
  edits?: [number, number, number, number][];
  colr?: { kind: 'nclc' | 'nclx' | 'prof'; p: number; t: number; m: number; full?: boolean };
  dolby?: boolean;
};

function moovOf(tr: Track, movieTimescale = 600): DataView {
  const mvhd = box('mvhd', zeros(4), zeros(4), zeros(4), u32(movieTimescale), zeros(4), zeros(80));
  const mdhd = box('mdhd', zeros(4), zeros(4), zeros(4), u32(tr.timescale), zeros(4), zeros(4));
  const hdlr = box('hdlr', zeros(4), zeros(4), new TextEncoder().encode('vide'), zeros(12), zeros(1));
  /* stts: 이어진 같은 길이는 한 줄로 */
  const runs: [number, number][] = [];
  for (const d of tr.deltas) {
    const last = runs[runs.length - 1];
    if (last && last[1] === d) last[0]++;
    else runs.push([1, d]);
  }
  const stts = box('stts', zeros(4), u32(runs.length), ...runs.flatMap(([n, d]) => [u32(n), u32(d)]));
  const kids: Uint8Array[] = [];
  const colr = tr.colr
    ? box(
        'colr',
        new TextEncoder().encode(tr.colr.kind),
        u16(tr.colr.p),
        u16(tr.colr.t),
        u16(tr.colr.m),
        ...(tr.colr.kind === 'nclx' ? [new Uint8Array([tr.colr.full ? 0x80 : 0])] : [])
      )
    : null;
  const avc1 = box(tr.dolby ? 'hvc1' : 'avc1', zeros(78), box(tr.dolby ? 'hvcC' : 'avcC', zeros(8)), ...(colr ? [colr] : []), ...(tr.dolby ? [box('dvcC', zeros(24))] : []));
  const stsd = box('stsd', zeros(4), u32(1), avc1);
  kids.push(stsd, stts);
  if (tr.ctts) {
    const v = tr.cttsVersion ?? 0;
    kids.push(box('ctts', new Uint8Array([v, 0, 0, 0]), u32(tr.ctts.length), ...tr.ctts.flatMap((o) => [u32(1), i32(o)])));
  }
  const stbl = box('stbl', ...kids);
  const minf = box('minf', box('vmhd', zeros(12)), stbl);
  const mdia = box('mdia', mdhd, hdlr, minf);
  const edts = tr.edits
    ? box('edts', box('elst', zeros(4), u32(tr.edits.length), ...tr.edits.flatMap(([d, m, ri, rf]) => [u32(d), i32(m), i16(ri), i16(rf)])))
    : null;
  const trak = box('trak', box('tkhd', zeros(84)), ...(edts ? [edts] : []), mdia);
  const moov = box('moov', mvhd, trak);
  return new DataView(moov.buffer);
}

/* 아이폰 60fps(600 눈금) — 첫 장면 first 눈금, elevenAt 번째 간격이 11 눈금, 나머지 10 */
function iphone60(n: number, first: number, elevenAt: number): number[] {
  return Array.from({ length: n }, (_, k) => (k === 0 ? first : k === elevenAt ? 11 : 10));
}

console.log('\n장면 시각 표');
{
  /* 1차 보정 9f3f2654 모양: 첫 장면 4 눈금 + 57번째가 11 눈금 → 57 이후 경계가 10i+5 눈금(= (i+0.5)/60) */
  const t = frameTableFromMoov(moovOf({ timescale: 600, deltas: iphone60(126, 4, 57), edits: [[1253, 0, 1, 0]] }))!;
  check('표를 읽는다(126장)', t != null && t.starts.length === 126, `${t?.starts.length}`);
  check('첫 장면 4 눈금 · 둘째 장면 시작 4/600', Math.abs(t.starts[1] - 4 / 600) < 1e-12);
  check('고른 간격으로 본다(10 · 11 눈금)', t.period != null && Math.abs(1 / t.period - 60) < 0.2, `fps ${t.period ? (1 / t.period).toFixed(3) : 'null'}`);
  /* 경계에 딱 걸리는 격자 시각: i=57 → (57.5)/60 = 575/600 = 장면 58 의 시작(4 + 10·57 + 1 = 575) */
  check('경계에 딱 걸리면 뒤 장면', sampleAt(t, 57.5 / 60) === 58, `${sampleAt(t, 57.5 / 60)}`);
  check('끝난 뒤 시각 → 마지막 장면(첫 장면 아님) · 앞 → 첫 장면', sampleAt(t, 99) === -1 && sampleIndexAt(t, 99) === t.starts.length - 1 && sampleIndexAt(t, -1) === 0);
  const plan = planFrameSeeks({ from: 0.15, to: 1.15, fps: 60, table: t, maxFrames: 120 });
  const ks = plan.frames.map((f) => f.sample!);
  const dup = ks.filter((k, i) => i > 0 && k === ks[i - 1]).length;
  const skip = ks.filter((k, i) => i > 0 && k - ks[i - 1] > 1).length;
  check('구간의 장면: 두 번 · 건너뜀 없음', dup === 0 && skip === 0, `${ks.length}장 dup ${dup} skip ${skip}`);
  const minGapTicks = Math.min(
    ...plan.frames.map((f) => {
      const k = f.sample!;
      return Math.min(f.seek - t.starts[k], t.ends[k] - f.seek) * 600;
    })
  );
  check('되감는 시각은 모두 장면 경계에서 3 눈금 넘게', minGapTicks >= 3, `최소 ${minGapTicks.toFixed(2)} 눈금`);
  const gaps = plan.frames.slice(1).map((f, i) => f.t - plan.frames[i].t);
  check('이름표 간격이 고르다(시계)', Math.max(...gaps) - Math.min(...gaps) < 1e-9, `${(Math.min(...gaps) * 1000).toFixed(3)}~${(Math.max(...gaps) * 1000).toFixed(3)}ms`);
  /* 예전 격자와 같은 장면 묶음: 격자 i 마다 그 시각에 보이는 장면 — 표 없는 예전 방식과 장수가 같다 */
  const old = planFrameSeeks({ from: 0.15, to: 1.15, fps: 60, table: null, maxFrames: 120 });
  check('예전 격자와 같은 격자 번호', old.frames.length === plan.frames.length && old.frames.every((f, i) => f.grid === plan.frames[i].grid), `${old.frames.length} vs ${plan.frames.length}`);
  check('fps 는 표와 같다', fpsFromMoov(moovOf({ timescale: 600, deltas: iphone60(126, 4, 57) })) === 60);
}
{
  /* 흔한 경우: 첫 장면이 온전 → 격자 i 는 장면 i, 되감기만 한가운데로 */
  const t = frameTableFromMoov(moovOf({ timescale: 600, deltas: iphone60(84, 10, 60) }))!;
  const plan = planFrameSeeks({ from: 0.35, to: 1.35, fps: 60, table: t, maxFrames: 120 });
  check('온전한 첫 장면: 격자 i = 장면 i', plan.frames.every((f) => f.sample === f.grid), `${plan.frames.length}장`);
}
{
  /* B 장면: 풀기 순서 I P B B P B B … — ctts 판 0(양수), elst mediaTime = 첫 어긋남(2장) — 안드로이드 · ffmpeg 꼴 */
  const n = 30;
  const order: number[] = [0];
  for (let g = 1; g < n; g += 3) order.push(g + 2, g, g + 1);
  const pres = order.slice(0, n);
  const deltas = Array(n).fill(1000);
  /* 보이는 시각 = 표시 차례 × 1000 + 2000(프라이밍), 풀기 시각 = 풀기 차례 × 1000 */
  const ctts = pres.map((p, i) => p * 1000 + 2000 - i * 1000);
  const t = frameTableFromMoov(moovOf({ timescale: 60000, deltas, ctts, edits: [[500, 2000, 1, 0]] }, 1000))!;
  check('B 장면(ctts 판 0) + elst mediaTime 2000 → 첫 장면 0초', t != null && Math.abs(t.starts[0]) < 1e-12 && Math.abs(t.starts[5] - 5 / 60) < 1e-12, t ? `${t.starts.slice(0, 4).map((s) => (s * 60).toFixed(2))}` : 'null');
  check('B 장면: 정렬 뒤 고른 간격', t.period != null && Math.abs(1 / t.period - 60) < 1e-6);
  /* 판 1(음수 어긋남, 프라이밍 없음) */
  const ctts1 = pres.map((p, i) => p * 1000 - i * 1000);
  const t1 = frameTableFromMoov(moovOf({ timescale: 60000, deltas, ctts: ctts1, cttsVersion: 1 }, 1000))!;
  check('ctts 판 1(음수) → 첫 장면 0초', t1 != null && Math.abs(t1.starts[0]) < 1e-12 && Math.abs(t1.starts[7] - 7 / 60) < 1e-12);
}
{
  /* 앞의 빈 조각(0.5초) + 보이는 조각 하나 → 모두 0.5초 늦게 */
  const t = frameTableFromMoov(moovOf({ timescale: 600, deltas: iphone60(60, 10, 99), edits: [[300, -1, 1, 0], [600, 0, 1, 0]] }))!;
  check('앞의 빈 조각만큼 늦춘다', t != null && Math.abs(t.starts[0] - 0.5) < 1e-12 && Math.abs(t.starts[1] - (0.5 + 1 / 60)) < 1e-12);
  /* 보이는 조각이 mediaTime 25 에서 시작(장면 2 의 가운데) → 장면 0 · 1 은 안 보이고, 장면 2 는 반만(5 눈금) */
  const t2 = frameTableFromMoov(moovOf({ timescale: 600, deltas: iphone60(60, 10, 99), edits: [[500, 25, 1, 0]] }))!;
  /* 보이는 것: 장면 2(반) · 3~51 · 52(반, 조각 끝 525 눈금) = 51장, 끝 = 500/600 초 */
  check('mediaTime 이 장면 가운데면 그 장면은 반만 보인다', t2 != null && t2.starts[0] === 0 && Math.abs(t2.ends[0] - 5 / 600) < 1e-12 && t2.starts.length === 51 && Math.abs(t2.ends[50] - 500 / 600) < 1e-12, t2 ? `${t2.starts.length}장, 첫 끝 ${(t2.ends[0] * 600).toFixed(2)}` : 'null');
  check('보이는 조각이 둘이면 표를 안 쓴다(예전 방식)', frameTableFromMoov(moovOf({ timescale: 600, deltas: iphone60(60, 10, 99), edits: [[200, 0, 1, 0], [200, 300, 1, 0]] })) === null);
  check('재생 배율이 1 이 아니면 표를 안 쓴다', frameTableFromMoov(moovOf({ timescale: 600, deltas: iphone60(60, 10, 99), edits: [[300, 0, 2, 0]] })) === null);
  check('배율 분수가 0 이 아니어도 안 쓴다', frameTableFromMoov(moovOf({ timescale: 600, deltas: iphone60(60, 10, 99), edits: [[300, 0, 1, 0x8000]] })) === null);
}
{
  /* 가변 fps(30/60 섞임) → 시계를 펴지 않고 적힌 시각 */
  const deltas = [...Array(20).fill(10), ...Array(20).fill(20), ...Array(20).fill(10)];
  const t = frameTableFromMoov(moovOf({ timescale: 600, deltas }))!;
  check('가변 fps: 고르지 않음 → 적힌 시각의 한가운데', t.period == null && Math.abs(t.clock(25) - (t.starts[25] + t.ends[25]) / 2) < 1e-12);
  /* 한 장 빠짐(240fps 에서 간격 두 배) */
  const d240: number[] = Array.from({ length: 200 }, (_, k) => (k % 2 ? 3 : 2));
  d240[100] = 5;
  const t240 = frameTableFromMoov(moovOf({ timescale: 600, deltas: d240 }))!;
  check('240fps 한 장 빠짐 → 적힌 시각', t240.period == null);
  const r240 = frameTableFromMoov(moovOf({ timescale: 600, deltas: Array.from({ length: 200 }, (_, k) => (k % 2 ? 3 : 2)) }))!;
  check('240fps(600 눈금의 2 · 3) → 고름', r240.period != null && Math.abs(1 / r240.period - 240) < 0.5, r240.period ? `${(1 / r240.period).toFixed(2)}` : 'null');
  const p240 = planFrameSeeks({ from: 0.1, to: 0.6, fps: 240, table: r240, maxFrames: 120 });
  check('240fps 0.5초 → 120장 · 한 장씩(보폭 1)', p240.frames.length === 120 && Math.abs(p240.sampleFps - 240) < 0.5, `${p240.frames.length}장 ${p240.sampleFps.toFixed(1)}fps`);
  const p240b = planFrameSeeks({ from: 0.1, to: 1.1, fps: 240, table: r240, maxFrames: 120 });
  const strideOk = p240b.frames.every((f, i) => i === 0 || f.sample! - p240b.frames[i - 1].sample! === 2);
  check('240fps 1초 → 한 장 건너(보폭 2)', strideOk && Math.abs(p240b.sampleFps - 120) < 0.5, `${p240b.frames.length}장 ${p240b.sampleFps.toFixed(1)}fps`);
  const t90k = frameTableFromMoov(moovOf({ timescale: 90000, deltas: Array.from({ length: 120 }, (_, k) => (k % 2 ? 1502 : 1501)) }))!;
  check('59.94fps(90000 눈금의 1501 · 1502) → 고름', t90k.period != null && Math.abs(1 / t90k.period - 59.94) < 0.01);
}

console.log('\n색 정보');
{
  const sdr = colorFromMoov(moovOf({ timescale: 600, deltas: iphone60(10, 10, 99), colr: { kind: 'nclc', p: 1, t: 1, m: 1 } }));
  check("아이폰 SDR(nclc 1/1/1) → 'bt709'", transferName(sdr) === 'bt709' && !isHdr(sdr) && sdr?.fullRange === null && sdr?.codec === 'avc1');
  const hlg = colorFromMoov(moovOf({ timescale: 600, deltas: iphone60(10, 10, 99), colr: { kind: 'nclx', p: 9, t: 18, m: 9, full: false }, dolby: true }));
  check("아이폰 HDR(nclx 9/18/9 + 돌비 비전) → 'hlg' · HDR", transferName(hlg) === 'hlg' && isHdr(hlg) && hlg?.dolbyVision === true && hlg?.fullRange === false && hlg?.codec === 'hvc1');
  const pq = colorFromMoov(moovOf({ timescale: 600, deltas: iphone60(10, 10, 99), colr: { kind: 'nclx', p: 9, t: 16, m: 9, full: true } }));
  check("PQ(16) → 'pq' · 전 범위", transferName(pq) === 'pq' && pq?.fullRange === true);
  const srgb = colorFromMoov(moovOf({ timescale: 600, deltas: iphone60(10, 10, 99), colr: { kind: 'nclx', p: 1, t: 13, m: 1 } }));
  check("sRGB(13) → 'srgb'", transferName(srgb) === 'srgb');
  const none = colorFromMoov(moovOf({ timescale: 600, deltas: iphone60(10, 10, 99) }));
  check("색 상자 없음 → 'unknown'(SDR 로 본다)", none != null && transferName(none) === 'unknown' && !isHdr(none));
  check("BT.601(6) · BT.2020(14 · 15) → 'bt709'(같은 OETF)", [6, 14, 15].every((tc) => transferName({ ...none!, transfer: tc }) === 'bt709'));
  check('파일 못 읽음(null) → unknown · HDR 아님', transferName(null) === 'unknown' && !isHdr(null));
  /* ICC 프로필('prof')로 적은 색 상자는 번호가 없다 — 모르는 것으로(SDR) 보고 넘어간다 */
  const prof = colorFromMoov(moovOf({ timescale: 600, deltas: iphone60(10, 10, 99), colr: { kind: 'prof', p: 0, t: 0, m: 0 } }));
  check("ICC 프로필 색 상자('prof') → 번호 없음 · 'unknown'", prof != null && prof.transfer === null && transferName(prof) === 'unknown');
}

console.log('\n렌즈 화각');
{
  const L = (focal35: number | null, lens = 'iPhone 15 Pro Max back camera 6.765mm f/1.78') => ({ model: null, lens, focal35 });
  check('24mm → 59.8°(짝으로 맞춘 값, 추정 아님)', videoFovFor(L(24)) === IPHONE_VIDEO_MAIN_FOV_DEG && IPHONE_VIDEO_MAIN_FOV_DEG === 59.8 && videoFovInfo(L(24))?.estimate === false);
  check('26mm → 55.9°(추정)', videoFovFor(L(26)) === 55.9 && videoFovInfo(L(26))?.estimate === true, `${videoFovFor(L(26))}`);
  check('2x 48mm → 32.1°(예전 null → 69° 로 구속이 절반)', videoFovFor(L(48)) === 32.1, `${videoFovFor(L(48))}`);
  check('초광각 13mm · 망원 77 · 120mm → 모름', videoFovFor(L(13)) == null && videoFovFor(L(77)) == null && videoFovFor(L(120)) == null);
  check('앞 카메라 · 안드로이드 → 모름', videoFovFor(L(24, 'iPhone 15 Pro Max front camera')) == null && videoFovFor({ model: 'Pixel 8', lens: 'back', focal35: 24 }) == null);
}

/* ───────────────────────── 던진 때 찾기 · 구간 ───────────────────────── */

const W = 320;
const H = 569;
/** 원본 1080 × 1920, 화각 62° → 가로 320 장면의 초점거리 */
const FOCAL = focalPxFromFov(1920, 62) * (W / 1080);
const K = FOCAL * BALL_DIAMETER_M;

function base(): Float32Array {
  const l = new Float32Array(W * H);
  for (let y = 0; y < H; y++) for (let x = 0; x < W; x++) l[y * W + x] = 60 + ((x * 7 + y * 13) % 17);
  return l;
}
function disc(l: Float32Array, cx: number, cy: number, d: number, v: number) {
  const r = d / 2;
  for (let y = Math.max(0, Math.floor(cy - r - 1)); y <= Math.min(H - 1, Math.ceil(cy + r + 1)); y++) {
    for (let x = Math.max(0, Math.floor(cx - r - 1)); x <= Math.min(W - 1, Math.ceil(cx + r + 1)); x++) {
      const e = Math.min(1, Math.max(0, r + 0.5 - Math.hypot(x - cx, y - cy)));
      if (e > 0) l[y * W + x] = l[y * W + x] * (1 - e) + v * e;
    }
  }
}
function rect(l: Float32Array, x0: number, y0: number, w: number, h: number, v: number) {
  for (let y = Math.max(0, Math.round(y0)); y < Math.min(H, Math.round(y0 + h)); y++)
    for (let x = Math.max(0, Math.round(x0)); x < Math.min(W, Math.round(x0 + w)); x++) l[y * W + x] = v;
}

type Scene = {
  duration: number;
  release: number | null;
  speedMps: number;
  z0: number;
  x0: number;
  y0: number;
  vx: number;
  vy: number;
  swing: [number, number];
  /** 공이 릴리스 뒤 이 시간(초)이 지나면 안 보인다(흰 천 앞으로 들어가 사라지는 공 흉내) */
  hideAfter?: number;
};

function renderAt(s: Scene, times: number[]): ThrowSample[] {
  return times.map((t) => {
    const l = base();
    const sway = t > s.duration - 0.3 ? Math.sin(t * 40) * 4 : 0;
    rect(l, 140 + sway, 330, 40, 50, 215);
    if (t >= s.swing[0] && t <= s.swing[1]) {
      const u = (t - s.swing[0]) / (s.swing[1] - s.swing[0]);
      rect(l, -40 + u * 150, 380 - u * 60, 150, 36, 170);
      disc(l, 110 + u * 150, 390 - u * 60, 70, 150);
    }
    if (s.release != null && t >= s.release && t <= s.release + (s.hideAfter ?? Infinity)) {
      const tau = t - s.release;
      const z = s.z0 + s.speedMps * tau;
      const d = K / z;
      const X = s.x0 + s.vx * tau;
      const Y = s.y0 + s.vy * tau;
      if (d >= 1) disc(l, W / 2 + (X / z) * FOCAL, H / 2 + (Y / z) * FOCAL, d, 215);
    }
    return { t, luma: l };
  });
}
const gridTimes = (dur: number) => coarseGrid(dur).times;
const step = (dur: number) => coarseGrid(dur).step;

console.log('\n던진 때 찾기');
{
  const s: Scene = { duration: 1.5, release: 0.83, speedMps: 33, z0: 2.5, x0: -0.1, y0: -0.25, vx: 0.5, vy: 1.5, swing: [0.1, 0.45] };
  const r = findThrow(renderAt(s, gridTimes(1.5)), W, H, FOCAL);
  check('팔을 크게 휘두른 뒤 던진 공(120km/h) — 공이 처음 보인 장면', r != null && r.t > 0.83 && r.t <= 0.83 + step(1.5) + 1e-9, r ? `찾음 ${r.t.toFixed(3)}초 · 이음 ${r.links} · ${r.seedZ.toFixed(1)}m` : '못 찾음');
  check('prevT = 그 앞 거친 장면', r != null && Math.abs(r.prevT - (r.t - step(1.5))) < 1e-9);
}
{
  const s: Scene = { duration: 3.4, release: 2.1, speedMps: 20, z0: 2.3, x0: 0.05, y0: -0.2, vx: -0.3, vy: 1.0, swing: [0.2, 0.7] };
  const r = findThrow(renderAt(s, gridTimes(3.4)), W, H, FOCAL);
  check('긴 영상(3.4초)의 느린 공(72km/h)', r != null && r.t > 2.1 && r.t <= 2.1 + step(3.4) + 1e-9, r ? `찾음 ${r.t.toFixed(3)}초` : '못 찾음');
}
{
  const s: Scene = { duration: 2.0, release: 1.0, speedMps: 40, z0: 3.2, x0: 0.1, y0: -0.3, vx: 0.8, vy: 1.8, swing: [0.3, 0.8] };
  const r = findThrow(renderAt(s, gridTimes(2.0)), W, H, FOCAL, { seedMaxM: SEED_MAX_M });
  check('빠른 공(144km/h) · 먼 릴리스(3.2m) — 씨앗 거리 제한 안', r != null && r.t > 1.0 && r.t <= 1.0 + step(2.0) + 1e-9, r ? `찾음 ${r.t.toFixed(3)}초 · ${r.seedZ.toFixed(1)}m` : '못 찾음');
}
{
  const s: Scene = { duration: 1.5, release: null, speedMps: 0, z0: 0, x0: 0, y0: 0, vx: 0, vy: 0, swing: [0.3, 0.9] };
  const r = findThrow(renderAt(s, gridTimes(1.5)), W, H, FOCAL);
  check('공 없이 팔만 휘두름 · 흔들리는 천 — 못 찾음', r == null, r ? `잘못 찾음 ${r.t.toFixed(3)}초` : '');
}
{
  const s: Scene = { duration: 1.5, release: 0.8, speedMps: 30, z0: 2.5, x0: -0.85, y0: 0, vx: 0, vy: 0, swing: [0.1, 0.4] };
  const r = findThrow(renderAt(s, gridTimes(1.5)), W, H, FOCAL);
  check('가운데에서 먼 곳에서 나타난 것 — 씨앗 아님', r == null || r.t > 0.8 + 2 * step(1.5), r ? `찾음 ${r.t.toFixed(3)}초` : '못 찾음');
}
{
  const s: Scene = { duration: 1.5, release: 0.6, speedMps: -30, z0: 12, x0: 0.05, y0: 0.1, vx: 0, vy: 0.3, swing: [0.1, 0.3] };
  const r = findThrow(renderAt(s, gridTimes(1.5)), W, H, FOCAL, 'approaching');
  check('다가오는 공 — 커지는 궤적', r != null && r.t >= 0.6 && r.t < 0.6 + 0.4, r ? `찾음 ${r.t.toFixed(3)}초` : '못 찾음');
}
{
  /* 씨앗 거리 제한: 첫 공이 제한보다 멀면 그 궤적은 공으로 보지 않는다(더 먼 뒤 장면도 씨앗이 못 된다) */
  const s: Scene = { duration: 2.0, release: 1.0, speedMps: 40, z0: 3.2, x0: 0.1, y0: -0.3, vx: 0.8, vy: 1.8, swing: [0.3, 0.8] };
  const samples = renderAt(s, gridTimes(2.0));
  const near = findThrow(samples, W, H, FOCAL, { seedMaxM: 6 });
  const cut = findThrow(samples, W, H, FOCAL, { seedMaxM: 3 });
  check('씨앗 거리 제한 — 첫 공 4.1m: 6m 제한이면 찾고 3m 제한이면 못 찾음', near != null && cut == null, `6m ${near ? near.seedZ.toFixed(1) + 'm' : '못 찾음'} · 3m ${cut ? cut.seedZ.toFixed(1) + 'm' : '못 찾음'}`);
}

console.log('\n거친 훑기 · 구간');
{
  const g = coarseGrid(1.5);
  check('짧은 영상: 예전 격자(간격 0.05 · 30장)', Math.abs(g.step - 0.05) < 1e-12 && g.times.length === 30);
  check('짧은 영상: 촘촘한 띠 없음', denseBandTimes(1.5, g.step, 0.7).length === 0);
  const L = coarseGrid(10);
  const band = denseBandTimes(10, L.step, 4.0);
  const all = [...L.times, ...band].sort((a, b) => a - b);
  const inBand = all.filter((t) => t >= 4.0 - 0.6 + L.step && t <= 4.0 + 1.3 - L.step);
  const maxGap = Math.max(...inBand.slice(1).map((t, i) => t - inBand[i]));
  check(`긴 영상(10초): 정점 앞뒤 띠 안 간격 ≤ ${COARSE_STEP_MAX}초`, maxGap <= COARSE_STEP_MAX + 1e-9, `격자 ${L.step.toFixed(3)}초 → 띠 ${maxGap.toFixed(3)}초, 더 꺼냄 ${band.length}장`);
}
{
  /* 긴 영상(6초): 공은 4.2초, 팔은 3.6~3.9초 크게 — 격자만으로는 공이 두 장뿐, 띠를 더하면 찾는다 */
  const s: Scene = { duration: 6, release: 4.2, speedMps: 36, z0: 2.4, x0: 0.05, y0: -0.2, vx: 0.3, vy: 1.2, swing: [3.6, 3.9] };
  const g = coarseGrid(6);
  const uni = renderAt(s, g.times);
  const peak = motionPeak(uni, g.step);
  const band = renderAt(s, denseBandTimes(6, g.step, peak));
  const samples = [...uni, ...band].sort((a, b) => a.t - b.t);
  const plan = planThrowWindows({ duration: 6, approach: 'receding', samples, width: W, height: H, focalPx: FOCAL, peak });
  const ballW = plan.windows[0];
  check('긴 영상 + 띠: 공 구간이 먼저, 릴리스를 담는다', ballW?.kind === 'ball' && ballW.from < 4.2 && ballW.to > 4.2 + 0.5, `정점 ${peak?.toFixed(2)} · 공 ${plan.ball?.t.toFixed(3)} · 구간 ${plan.windows.map((w) => `${w.kind} ${w.from.toFixed(2)}~${w.to.toFixed(2)}`).join(', ')}`);
  check('공 구간 다음에 예전(정점) 구간이 대비책으로', plan.windows.length === 2 && plan.windows[1].kind === 'peak');
}
for (const [z0, want] of [
  [2.5, true],
  [4.6, false],
] as [number, boolean][]) {
  /* 세 장만 보이고 사라지는 궤적(2 이음): 첫 공이 릴리스가 있을 수 있는 거리(4m) 안이면 믿고, 멀면 안 믿는다 → 예전 구간만 */
  const s: Scene = { duration: 3, release: 2.21, speedMps: 30, z0, x0: 0.05, y0: -0.2, vx: 0.2, vy: 1.0, swing: [0.3, 0.5], hideAfter: 0.15 };
  const g = coarseGrid(3);
  const samples = renderAt(s, g.times);
  const peak = motionPeak(samples, g.step);
  const plan = planThrowWindows({ duration: 3, approach: 'receding', samples, width: W, height: H, focalPx: FOCAL, peak });
  const got = plan.ball?.accepted === true && plan.windows[0].kind === 'ball';
  check(
    `2 이음 궤적 · 릴리스 ${z0}m → ${want ? '믿는다' : '안 믿고 예전 구간만'}`,
    plan.ball != null && plan.ball.links === 2 && got === want && (want || (plan.windows.length === 1 && plan.windows[0].kind === 'peak')),
    plan.ball ? `공 ${plan.ball.t.toFixed(3)}초 · 이음 ${plan.ball.links} · 첫 공 ${plan.ball.seedZ.toFixed(1)}m · 구간 ${plan.windows.map((w) => w.kind).join(',')}` : '못 찾음'
  );
}
{
  /* 먼저 던진 공(3 이음)과 뒤에 더 길게 이어지는 헛궤적(5 이음): 확실한 궤적끼리는 먼저 시작한 것 */
  const s: Scene = { duration: 3, release: 0.9, speedMps: 33, z0: 2.5, x0: 0.05, y0: -0.2, vx: 0.2, vy: 1.0, swing: [0.3, 0.5], hideAfter: 0.26 };
  const late: Scene = { ...s, release: 2.0, speedMps: 18, z0: 3.2, x0: -0.1, hideAfter: undefined };
  const g = coarseGrid(3);
  const a = renderAt(s, g.times);
  const b = renderAt(late, g.times);
  /* 두 장면을 겹친다(더 밝은 쪽) */
  const samples = a.map((q, i) => ({ t: q.t, luma: Float32Array.from(q.luma as Float32Array, (v, j) => Math.max(v, (b[i].luma as Float32Array)[j])) }));
  const capped = findThrow(samples, W, H, FOCAL, { seedMaxM: SEED_MAX_M });
  const longest = findThrow(samples, W, H, FOCAL, { seedMaxM: SEED_MAX_M, linkCap: Infinity });
  check(
    '먼저 던진 공(3 이음 이상) vs 늦은 긴 헛궤적 → 먼저 것(이음 수는 3 까지만 센다)',
    capped != null && capped.t > 0.9 && capped.t < 1.0 && capped.links >= 3,
    `고름 ${capped?.t.toFixed(3)}초(${capped?.links}) · 가장 긴 것 ${longest?.t.toFixed(3)}초(${longest?.links})`
  );
}
{
  const s: Scene = { duration: 1.5, release: 0.6, speedMps: -30, z0: 12, x0: 0.05, y0: 0.1, vx: 0, vy: 0.3, swing: [0.1, 0.3] };
  const g = coarseGrid(1.5);
  const samples = renderAt(s, g.times);
  const plan = planThrowWindows({ duration: 1.5, approach: 'approaching', samples, width: W, height: H, focalPx: FOCAL, peak: motionPeak(samples, g.step) });
  check('다가오는 공은 예전 구간(정점 − 0.7초)만', plan.windows.length === 1 && plan.windows[0].kind === 'peak' && plan.ball == null);
}

console.log('\n공 시각에 묶은 배경');
{
  const a = anchoredBackgroundTimes(1.0, 3.0);
  check('처음 · 가운데 · 끝 + 7장 = 10장', a.length === 10 && a[0] === 0 && a[1] === 1.5 && Math.abs(a[2] - 2.95) < 1e-9);
  const inWin = a.slice(3);
  check(
    '7장은 공 구간(prevT − 0.1 부터 1초)을 고르게',
    Math.abs(inWin[0] - (1.0 - THROW_PRE_SEC)) < 1e-9 && Math.abs(inWin[6] - (1.0 - THROW_PRE_SEC + 1)) < 1e-9
  );
  const b = anchoredBackgroundTimes(0.05, 1.2);
  check('영상 밖으로 나가지 않는다', b.every((t) => t >= 0 && t < 1.2));
  check('SEED_MAX_M = 릴리스 4m + 한 간격 · 40m/s = 6.8m', Math.abs(SEED_MAX_M - 6.8) < 1e-9, `${SEED_MAX_M}`);
}

console.log(`\n통과 ${passed} / 실패 ${failed}`);
if (failed) process.exitCode = 1;
