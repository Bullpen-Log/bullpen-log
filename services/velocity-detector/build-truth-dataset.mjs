/**
 * 공 감지 학습 자료 3판 — 지름 라벨을 '스피드건으로 되짚은 진짜 공 크기'로(2026-10-22 밤).
 *
 * 1판 라벨의 지름은 엔진 밝기 덩어리라 진짜보다 1.08~1.18배(장면 앞 → 뒤로 커짐) · 공마다 ±8% 흔들린다. 그 치우침을 모델이 그대로 배웠다(ball-v1).
 * 여기서는 엔진이 맞춘 3D 궤적(fit — 장면마다 상대 깊이)과 스피드건 값으로 그 공의 실제 거리를 되짚고, 장면마다 지름 = f · 공 지름 / 깊이 로 정답을 만든다.
 *   Dg = 엔진이 쓴 거리 × (건 ÷ 엔진 값)^(1/1.076)  — 엔진 구속은 거리^1.076 에 비례(2.8.0 에서 잼)
 *   진짜 지름(분석 px) = f · 0.0732 / (상대 깊이 × Dg)
 * 사람이 가장자리를 찍지 않아도 된다. 대신 스피드건 오차(±1~2km/h ≈ ±1.5%)가 공마다 라벨 치우침으로 남는다.
 *
 *   1) node scripts/velocity-lab/gun-table.mjs … --dump=1 --json=<덤프>        (스피드건 짝을 재며 track · fit · 분석 크기를 남김)
 *   2) node services/velocity-detector/build-truth-dataset.mjs --dumps=<덤프>,<덤프> [--out=~/bullpen-velocity-lab/detector-v3]
 *   3) modal volume put … detector-v3 /detector-v3 → modal run train.py --dataset detector-v3 --test-groups … --tag v3a
 *
 * 결과 꼴은 1판과 같다(labels.json clips[].frames[].ball = [x, y, 지름] 그림 px). clips[] 에 group · Dg · cam · trueScale 을 더 싣는다(평가용).
 */
import { mkdirSync, readFileSync, writeFileSync } from 'node:fs';
import { homedir } from 'node:os';
import { join, resolve } from 'node:path';
import { pathToFileURL } from 'node:url';

const REPO = resolve(import.meta.dirname, '../..');
const { open, argOf } = await import(pathToFileURL(join(REPO, 'scripts/velocity-lab/cdp.mjs')).href);
const { trajectoryState } = await import(pathToFileURL(join(REPO, 'lib/velocity-engine/trajectory-fit.ts')).href);
const OUT = resolve(argOf('out', join(homedir(), 'bullpen-velocity-lab', 'detector-v3')));
const DUMPS = argOf('dumps', '').split(',').filter(Boolean);
const LONG = Number(argOf('long', 960));
const BEFORE = 0.3;
const AFTER = 0.2;
const BALL_M = 0.0732;
const SPEED_POWER = 1.076;
if (!DUMPS.length) throw new Error('--dumps=<gun-table --dump=1 JSON>,… 를 주세요');
mkdirSync(join(OUT, 'images'), { recursive: true });

/* 스피드건이 있고 잰 공만 — 흔들린 공은 궤적 깊이가 덜 믿겨 뺀다 */
const balls = DUMPS.flatMap((p) => JSON.parse(readFileSync(p, 'utf8'))).filter(
  (o) => o.ok && o.gun != null && o.track?.length >= 8 && o.fit && !o.shaky
);
console.log('공', balls.length);

const c = await open({ port: 9533 });
const mb = readFileSync(join(REPO, 'node_modules/mediabunny/dist/bundles/mediabunny.mjs'), 'utf8');
await c.evaluate(`globalThis.__MB_URL = URL.createObjectURL(new Blob([${JSON.stringify(mb)}], { type: 'text/javascript' })); 1`);

const clips = [];
for (const [n, o] of balls.entries()) {
  const { p, te, dragScaleM, tiltRad, cam } = o.fit;
  const Dg = o.usedDist * (o.gun / o.kmh) ** (1 / SPEED_POWER);
  const truth = o.track.map((b) => {
    const z = trajectoryState(p, te, b.t, { dragScaleM, tilt: tiltRad })[2];
    return { t: b.t, x: b.x, y: b.y, d: (cam.f * BALL_M) / (z * Dg), blob: b.diameterPx };
  });
  const t0 = truth[0].t;
  const t1 = truth[truth.length - 1].t;
  await c.setFile(o.path);
  const r = await c.evaluate(`(async () => {
    const MB = await import(globalThis.__MB_URL);
    const file = document.querySelector('input[type=file]').files[0];
    const input = new MB.Input({ source: new MB.BlobSource(file), formats: MB.ALL_FORMATS });
    const track = await input.getPrimaryVideoTrack();
    const [W, H] = await Promise.all([track.getDisplayWidth(), track.getDisplayHeight()]);
    const s = ${LONG} / Math.max(W, H);
    const w = Math.round(W * s), h = Math.round(H * s);
    const cv = document.createElement('canvas'); cv.width = w; cv.height = h;
    const g = cv.getContext('2d');
    const lo = ${t0 - BEFORE}, hi = ${t1 + AFTER};
    const frames = [];
    for await (const sm of new MB.VideoSampleSink(track).samples(Math.max(0, lo), hi)) {
      if (sm.timestamp < lo || sm.timestamp > hi) { sm.close(); continue; }
      sm.draw(g, 0, 0, w, h);
      frames.push({ t: sm.timestamp, jpg: cv.toDataURL('image/jpeg', 0.92).slice(23) });
      sm.close();
    }
    input.dispose();
    return { w, h, s, W, H, frames };
  })()`);
  /* 분석 px → 그림 px */
  const k = r.s * (Math.max(o.sw, o.sh) / Math.max(o.aw, o.ah));
  const id = `${o.group.replace(/[@/]/g, '_')}_${String(n).padStart(3, '0')}_${o.name.replace(/\.[^.]+$/, '')}`;
  const dir = join(OUT, 'images', id);
  mkdirSync(dir, { recursive: true });
  const dt = 1 / 60;
  const at = (t) => {
    let best = null;
    for (const q of truth) if (Math.abs(q.t - t) < 0.6 * dt && (!best || Math.abs(q.t - t) < Math.abs(best.t - t))) best = q;
    if (best) return best;
    /* 엔진이 건너뛴 장면(공 길 안, 앞뒤 3장 안) — 자리는 선으로, 지름은 궤적 그대로 */
    const a = [...truth].reverse().find((q) => q.t < t);
    const b = truth.find((q) => q.t > t);
    if (!a || !b || b.t - a.t > 4 * dt) return null;
    const u = (t - a.t) / (b.t - a.t);
    const z = trajectoryState(p, te, t, { dragScaleM, tilt: tiltRad })[2];
    return { t, x: a.x + (b.x - a.x) * u, y: a.y + (b.y - a.y) * u, d: (cam.f * BALL_M) / (z * Dg), blob: null };
  };
  const frames = r.frames.map((f, i) => {
    const file = `${String(i).padStart(3, '0')}.jpg`;
    writeFileSync(join(dir, file), Buffer.from(f.jpg, 'base64'));
    const q = at(f.t);
    return {
      i,
      t: +f.t.toFixed(4),
      file,
      ball: q ? [+(q.x * k).toFixed(1), +(q.y * k).toFixed(1), +(q.d * k).toFixed(2)] : null,
      blob: q?.blob != null ? +(q.blob * k).toFixed(2) : null,
    };
  });
  clips.push({
    id,
    date: o.group,
    group: o.group.replace(/@.*/, ''),
    session: o.group,
    gun: o.gun,
    kmh: o.kmh,
    conf: o.conf,
    usedDist: o.usedDist,
    Dg,
    cam,
    fit: { p, te, dragScaleM, tiltRad },
    imgScale: k,
    w: r.w,
    h: r.h,
    sourceW: r.W,
    sourceH: r.H,
    te,
    frames,
  });
  console.log(id.padEnd(48), `장면 ${frames.length} 공 ${frames.filter((f) => f.ball).length} · 건 ${o.gun} 엔진 ${o.kmh} · Dg ${Dg.toFixed(1)}m`);
}
writeFileSync(join(OUT, 'labels.json'), JSON.stringify({ engine: c.version, long: LONG, truth: 'gun', clips }, null, 1));
console.log('저장', OUT, '클립', clips.length, '장면', clips.reduce((a, x) => a + x.frames.length, 0), '공 장면', clips.reduce((a, x) => a + x.frames.filter((f) => f.ball).length, 0));
await c.close();
