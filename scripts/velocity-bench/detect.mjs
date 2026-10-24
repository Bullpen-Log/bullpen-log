/**
 * 구속 시험대 — 공 찾기 단계(TODO-bench Task 6). 세션 녹화 통째에서 던진 공을 몇 개 찾고 헛 알림을 몇 번 내나. DB 에 쓰지 않는다.
 *
 *   node scripts/velocity-bench/detect.mjs [--group=1023] [--json=<파일>]
 *
 * 던진 공 = 녹화 컷(cuts.json — 사람이 본 손 떠난 때). 셋을 견준다:
 *   app   — 앱이 그날 실제로 남긴 시도 기록(cuts.json attempts, 녹화 시각) — 공 알림(ball) · 후보(seed) · 움직임(motion) · 훑기(sweep)
 *   trig  — 폰 공 알림(MotionTrigger)을 맥 시험대(scripts/velocity-lab/ball-trigger)로 — 조각을 한 흐름으로 이어 먹인다
 *   net   — 학습 모델 훑기(locateThrow 'net', public/velocity-detector/ball-v1.onnx)를 조각마다 — 앱 훑기는 5초마다 지난 창이라 비슷하다
 *   live  — 학습 모델 알림을 늘 켬(SPEC-detect D1 — CoreML, 맥 시험대 ball-trigger --net, 장면 둘에 하나). --model=<.mlmodelc>(기본
 *           ~/bullpen-velocity-lab/models/v1/BallNet.mlmodelc, 없으면 이 칸 없이). 지연 = 알림 시각 − 던진 때.
 * 알림이 던진 때 ±MATCH_SEC 안이면 찾음, 어느 던짐과도 안 맞으면 헛 알림.
 */
import { execFileSync } from 'node:child_process';
import { existsSync, readFileSync, writeFileSync } from 'node:fs';
import { join } from 'node:path';
import { open, LAB, REPO, argOf } from '../velocity-lab/cdp.mjs';
import { FIXTURES, recDirs } from './fixtures.mjs';

const MATCH_SEC = 0.6;
const MODEL = argOf('model', join(LAB, 'models/v1/BallNet.mlmodelc'));
const groups = argOf('group', '1023').split(',');
const recs = FIXTURES.groups.filter((g) => groups.includes(g.id) && g.kind === 'rec').flatMap((g) => recDirs(g));

const c = await open({ port: Number(argOf('port', 9491)) });
const model = readFileSync(join(REPO, 'public/velocity-detector/ball-v1.onnx')).toString('base64');
await c.evaluate(`(() => {
  const b = Uint8Array.from(atob(${JSON.stringify(model)}), (x) => x.charCodeAt(0));
  window.__m['ball-net'].configureBallNet({ modelUrl: URL.createObjectURL(new Blob([b])) });
})()`);

const out = [];
for (const dir of recs) {
  const j = JSON.parse(readFileSync(join(LAB, dir, 'cuts.json'), 'utf8'));
  const parts = j.parts.filter((p) => p.durationSec);
  const throws = j.cuts.map((cut) => {
    const p = parts.find((q) => q.file === cut.file);
    return { t: p.offsetSec + cut.eventSec, gun: cut.gun };
  });
  /* 폰 공 알림 — 조각을 이어 한 흐름으로 */
  const useLive = existsSync(MODEL);
  const trigOut = execFileSync(
    join(REPO, 'scripts/velocity-lab/ball-trigger/run.sh'),
    ['--concat', ...(useLive ? [`--net=${MODEL}`] : []), ...parts.map((p) => `${join(LAB, dir, p.file)}@${p.offsetSec}`)],
    { encoding: 'utf8', maxBuffer: 1 << 26 }
  );
  const live = trigOut
    .split('\n')
    .map((l) => l.match(/^NET ([\d.-]+) (\d+) ([\d.]+)/))
    .filter(Boolean)
    .map((m) => ({ t: Number(m[1]), n: Number(m[2]), score: Number(m[3]) }));
  const liveMs = trigOut.match(/^NETMS ([\d.]+)/m)?.[1];
  const trig = trigOut
    .split('\n')
    .map((l) => l.match(/^HIT (\w+) ([\d.-]+)/))
    .filter(Boolean)
    .map((m) => ({ kind: m[1], t: Number(m[2]) }))
    .filter((h) => h.kind !== 'end');
  /* 학습 모델 훑기 — 조각마다 */
  const net = [];
  for (const p of parts) {
    await c.setFile(join(LAB, dir, p.file));
    const r = await c.evaluate(`(async () => {
      const file = document.querySelector('input[type=file]').files[0];
      return await window.__m['analyze-video'].locateThrow({ file, detector: 'net', frameGapSec: 1 / 60 });
    })()`);
    if (r?.accepted) net.push({ t: p.offsetSec + r.ballT, peak: r.peak });
  }
  /* 조각이 겹쳐 같은 공을 두 번 찾으면 하나로 */
  const netU = net.filter((h, i) => !net.slice(0, i).some((q) => Math.abs(q.t - h.t) < 0.3));
  const app = j.attempts ?? [];
  const near = (hs, t) => hs.filter((h) => Math.abs(h.t - t) <= MATCH_SEC);
  const rows = throws.map((th) => ({
    ...th,
    app: near(app, th.t).map((h) => h.kind + (h.ok ? '✓' : '')).join(',') || '-',
    trig: near(trig, th.t).map((h) => h.kind).join(',') || '-',
    net: near(netU, th.t).length ? '공' : '-',
    live: useLive ? (near(live, th.t).length ? '공' : '-') : null,
    liveLag: useLive ? (near(live, th.t)[0]?.t ?? NaN) - th.t : null,
  }));
  const stray = (hs) => hs.filter((h) => !throws.some((th) => Math.abs(h.t - th.t) <= MATCH_SEC)).length;
  const rec = {
    dir,
    seconds: Math.round(parts.at(-1).offsetSec + parts.at(-1).durationSec),
    throws: rows,
    found: {
      app: rows.filter((r) => r.app !== '-').length,
      trigBall: rows.filter((r) => /ball|seed/.test(r.trig)).length,
      trigAny: rows.filter((r) => r.trig !== '-').length,
      net: rows.filter((r) => r.net !== '-').length,
      live: rows.filter((r) => r.live === '공').length,
    },
    stray: { app: stray(app), trig: stray(trig), net: stray(netU), live: useLive ? stray(live) : 0 },
    lags: rows.map((r) => r.liveLag).filter((v) => Number.isFinite(v)),
    liveMs: liveMs ? Number(liveMs) : null,
  };
  out.push(rec);
  console.log(`\n${dir} — ${rec.seconds}초 · 던짐 ${rows.length}`);
  for (const r of rows)
    console.log(`  ${r.t.toFixed(1).padStart(6)}초 건 ${String(r.gun ?? '-').padStart(3)} | 앱 ${r.app.padEnd(12)} 공 알림 ${r.trig.padEnd(12)} 모델 훑기 ${r.net}${useLive ? ` · 모델 알림 ${r.live}${Number.isFinite(r.liveLag) ? ` ${r.liveLag >= 0 ? '+' : ''}${r.liveLag.toFixed(2)}초` : ''}` : ''}`);
  console.log(`  찾음 — 앱 ${rec.found.app} · 공 알림(공 · 후보) ${rec.found.trigBall} · 공 알림(움직임 포함) ${rec.found.trigAny} · 모델 훑기 ${rec.found.net}${useLive ? ` · 모델 알림 ${rec.found.live}` : ''} | 헛 알림 — 앱 ${rec.stray.app} · 공 알림 ${rec.stray.trig} · 모델 훑기 ${rec.stray.net}${useLive ? ` · 모델 알림 ${rec.stray.live}` : ''}`);
}
await c.close();
const sum = (k, s) => out.reduce((a, r) => a + r[k][s], 0);
const n = out.reduce((a, r) => a + r.throws.length, 0);
const min = out.reduce((a, r) => a + r.seconds, 0) / 60;
console.log(`\n전체 던짐 ${n} · ${min.toFixed(1)}분 | 찾음 — 앱 ${sum('found', 'app')} · 공 알림(공 · 후보) ${sum('found', 'trigBall')} · 공 알림(움직임 포함) ${sum('found', 'trigAny')} · 모델 훑기 ${sum('found', 'net')} · 모델 알림 ${sum('found', 'live')}`);
console.log(`헛 알림(분당) — 앱 ${(sum('stray', 'app') / min).toFixed(1)} · 공 알림 ${(sum('stray', 'trig') / min).toFixed(1)} · 모델 훑기 ${(sum('stray', 'net') / min).toFixed(1)} · 모델 알림 ${(sum('stray', 'live') / min).toFixed(1)}`);
const lags = out.flatMap((r) => r.lags).sort((a, b) => a - b);
if (lags.length)
  console.log(`모델 알림 지연(알림 − 던진 때) — 가운데 ${lags[lags.length >> 1].toFixed(2)}초 · 90% ${lags[Math.min(lags.length - 1, Math.ceil(lags.length * 0.9) - 1)].toFixed(2)}초 · 모델 한 번 ${out.find((r) => r.liveMs)?.liveMs ?? '-'}ms(이 맥)`);
const jsonOut = argOf('json', '');
if (jsonOut) writeFileSync(jsonOut, JSON.stringify(out, null, 1));
process.exit(0);
