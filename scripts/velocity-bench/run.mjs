/**
 * 구속 시험대 실행기 — 엔진 하나로 fixtures 의 공을 앱과 같은 조건으로 재서 결과 JSON 을 낸다. DB 에 쓰지 않는다.
 * 스펙 docs/velocity/redesign/SPEC-bench.md · 계획 PLAN-bench.md.
 *
 *   npm run velocity:bench -- --set=holdout --json=<파일>          지금 엔진(lib/velocity-engine), 확인용 묶음
 *   … --engine=<엔진 폴더 | git:<커밋>> --set=all --group=1023,1021-16 --limit=3 --modes=app,true,true-5,true+5 --port=9481
 *   … --check-repeat=<앞 결과.json>                                  같은 엔진 두 번 — 시각 칸 빼고 같은지(시험대 자신의 시험)
 *
 * 공마다 길(--modes, 기본 app,true):
 *   app    — 앱 그대로: 넣은 거리(줄자 세션이면 그 값, 아니면 20m) · 줄자 아니면 그 거리로 값을 내고 공 크기는 15% 문으로만(엔진 2.9.0 chosenDistance) ·
 *            공 시각 둘레 BALL_RANGE · 숙임 0.035
 *   true   — 실제 거리(폰 → 받는 면)를 넣고 자동 끔 — PitchLab 처럼 거리를 고른 경우. 실제 거리를 모르는 묶음은 건너뜀
 *   true±5 — 실제 거리 ±5%(사용자가 어림한 경우)
 * app 길에는 앱 화면 규칙(app-rules.mjs — 기록할 공 · 세션 거리)을 묶음마다 걸어 shown(화면 값, 기록 안 되면 null)을 싣는다.
 */
import { execSync } from 'node:child_process';
import { existsSync, mkdirSync, readFileSync, writeFileSync } from 'node:fs';
import { join, relative, resolve } from 'node:path';
import { open, REPO, argOf } from '../velocity-lab/cdp.mjs';
import { BALL_RANGE, BENCH, loadBalls } from './fixtures.mjs';
import { screenSession } from './app-rules.mjs';

const TILT = 0.035;
const git = (cmd) => execSync(cmd, { cwd: REPO, encoding: 'utf8' }).trim();
/** --engine=git:<커밋> — 그 커밋의 lib/velocity-engine 을 LAB/bench/engines/<커밋> 에 꺼낸다(작업 트리 · 가지는 안 건드림) */
const engineArg = argOf('engine', 'lib/velocity-engine');
const gitRef = engineArg.startsWith('git:') ? git(`git rev-parse --short ${engineArg.slice(4)}`) : null;
const engineDir = gitRef ? join(BENCH, 'engines', gitRef, 'lib/velocity-engine') : resolve(REPO, engineArg);
if (gitRef && !existsSync(engineDir)) {
  mkdirSync(join(BENCH, 'engines', gitRef), { recursive: true });
  execSync(`git archive ${gitRef} lib/velocity-engine | tar -x -C "${join(BENCH, 'engines', gitRef)}"`, { cwd: REPO });
}
const set = argOf('set', 'holdout');
const groups = argOf('group', '').split(',').filter(Boolean);
const limit = Number(argOf('limit', '0'));
const modes = argOf('modes', 'app,true').split(',');
/* --net=<netseen.json> — 공마다 미리 돌린 모델 봉우리(bench/tools/netseen.py, 입력 416×736 px)를 엔진 공 길 안내(netHits)로 넘긴다 */
const netFile = argOf('net', '');
const netById = netFile ? new Map(JSON.parse(readFileSync(netFile, 'utf8')).map((r) => [r.id, r.hits.map(([t, x, y, d, score]) => ({ t, x: x / 416, y: y / 736, d: d / 416, score }))])) : null;
const jsonOut = argOf('json', '');


const MODES = {
  app: (b) => ({ distanceM: b.inputDistM, distanceAuto: !b.tape, distanceChosen: !b.tape }),
  true: (b) => b.trueDistM && { distanceM: b.trueDistM, distanceAuto: false },
  /* 기준 20m 고정(공 크기 자동 끔) — 실제 거리를 모르는 묶음에서 정밀 크기 거리 · 스피드건에 맞는 거리를 견줄 때 */
  base: () => ({ distanceM: 20, distanceAuto: false }),
  'true-5': (b) => b.trueDistM && { distanceM: b.trueDistM * 0.95, distanceAuto: false },
  'true+5': (b) => b.trueDistM && { distanceM: b.trueDistM * 1.05, distanceAuto: false },
};
for (const m of modes) if (!MODES[m]) throw new Error(`모르는 길: ${m}`);

const { balls: all, missing } = loadBalls();
if (missing.length) {
  console.error('안 받은 묶음이 있어요 — npm run velocity:bench:fetch\n ', missing.join('\n  '));
  process.exit(1);
}
let balls = all.filter((b) => (set === 'all' || b.split === set) && (!groups.length || groups.includes(b.group)));
if (limit) balls = balls.slice(0, limit);
if (!balls.length) throw new Error('잴 공이 없어요');

const c = await open({ port: Number(argOf('port', 9481)), engine: engineDir });
const browser = (await c.send('Browser.getVersion')).product;
const meta = {
  engine: gitRef ? `git:${gitRef}` : relative(REPO, engineDir) || engineDir,
  version: c.version,
  commit: gitRef ?? git('git rev-parse --short HEAD'),
  dirty: !gitRef && engineDir.startsWith(REPO + '/') && git(`git status --porcelain -- "${engineDir}"`) !== '',
  browser,
  set,
  modes,
  ...(netFile ? { net: netFile } : {}),
  at: new Date().toISOString(),
};
console.log(`엔진 ${meta.version}(${meta.engine} · ${meta.commit}${meta.dirty ? ' · 고침 있음' : ''}) · ${browser} · 공 ${balls.length} · 길 ${modes.join(' ')}`);

async function measure(b, opt) {
  await c.setFile(b.path);
  return c.evaluate(`(async () => {
    const AV = window.__m['analyze-video'], VL = window.__m['video-lens'];
    const file = document.querySelector('input[type=file]').files[0];
    const fov = ${b.fov ?? 'null'} ?? VL.videoFovFor(await VL.readVideoLens(file)) ?? 32.1;
    const seed = ${b.seed ?? 'null'};
    const range = seed != null ? { startSec: Math.max(0, seed - ${BALL_RANGE[0]}), endSec: seed + ${BALL_RANGE[1]}, seedT: seed } : {};
    const t0 = performance.now();
    try {
      const res = await AV.analyzeVideo({ file, ...range, fps: 60, fovDeg: fov, approach: 'receding', distanceM: ${opt.distanceM}, distanceAuto: ${opt.distanceAuto}, distanceChosen: ${opt.distanceChosen ?? false}, fovKnown: ${b.fov != null ? 'true' : 'undefined'}, tiltRad: ${TILT}, limbDistance: true, netHits: ${JSON.stringify(netById?.get(b.id) ?? null)} });
      const m = res.measure, d = res.distance ?? {};
      const path = d.path ?? [];
      return { ok: m.ok, code: m.ok ? null : m.code, kmh: m.ok ? m.kmh : null, conf: m.ok ? m.confidence : null, frames: m.ok ? m.detail.frames : null,
        preConf: d.preSize?.confidence ?? null, why: d.why ?? null, size: d.sizeDistM ?? null, slope: d.sizeSlope ?? null, ext: d.extended ?? 0,
        impact: d.impact ?? null, te: d.te ?? null, tStart: path.length ? path[0][0] : null, flight: d.flightFrames ?? null, rms: d.rmsPx ?? null,
        stab: !!d.stabilized, shaky: !!d.shaky, first: d.firstDepthM ?? null, endSize: d.endSizeRatio ?? null, source: d.distanceSource ?? null,
        usedDist: d.distanceM ?? null, guided: !!d.guided, limb: d.limbDistM ?? null, limbN: d.limbFrames ?? null, limbSig: d.limbSigma ?? null, limbWhy: d.limbWhy ?? null, atSize: d.kmhAtSize ?? null, sizeDist: d.sizeDistM ?? null, fov, ms: Math.round(performance.now() - t0) };
    } catch (e) { return { ok: false, error: String(e?.message ?? e), ms: Math.round(performance.now() - t0) }; }
  })()`);
}

const rows = [];
const t0 = Date.now();
for (const b of balls) {
  const row = { id: b.id, group: b.group, split: b.split, gun: b.gun, trueDistM: b.trueDistM, inputDistM: b.inputDistM, tape: b.tape, stitched: !!b.stitch };
  for (const m of modes) {
    const opt = MODES[m](b);
    if (opt) row[m] = await measure(b, opt);
  }
  rows.push(row);
  const say = (m) => (row[m] ? (row[m].ok ? `${m} ${row[m].kmh.toFixed(1)} ${row[m].conf}` : `${m} 못 잼 ${row[m].code ?? row[m].error}`) : '');
  console.log(`${b.id.padEnd(30)} 건 ${String(b.gun ?? '-').padStart(3)} | ${modes.map(say).filter(Boolean).join(' · ')}`);
}
await c.close();

/* 앱 화면 규칙 — 묶음 하나 = 한 세션 */
if (modes.includes('app'))
  for (const g of new Set(rows.map((r) => r.group))) {
    const rs = rows.filter((r) => r.group === g);
    const { shown } = screenSession(rs.map((r) => ({ ...r.app, tape: r.tape, dist: r.inputDistM, _id: r.id })));
    const byId = new Map(shown.map((x) => [x.row._id, x.kmh]));
    for (const r of rs) r.app.shown = byId.get(r.id) ?? null;
  }
meta.seconds = Math.round((Date.now() - t0) / 1000);
console.log(`걸린 시간 ${meta.seconds}초`);

/** 시각 · 걸린 시간 칸을 뺀 결과 — 두 번 돌린 것을 견줄 때 */
const stable = (rs) => JSON.stringify(rs, (k, v) => (k === 'ms' ? undefined : v));
const prev = argOf('check-repeat', '');
if (prev) {
  const a = JSON.parse(readFileSync(prev, 'utf8')).rows;
  const same = stable(a) === stable(rows);
  console.log(same ? '반복: 같음' : '반복: 다름');
  if (!same)
    for (const r of rows) {
      const p = a.find((x) => x.id === r.id);
      if (stable(p) !== stable(r)) console.log('  다른 공', r.id);
    }
  if (!same) process.exitCode = 1;
}
if (jsonOut) {
  writeFileSync(jsonOut, JSON.stringify({ meta, rows }, null, 1));
  console.log('결과', jsonOut);
} else console.log('(--json=<파일> 을 주면 결과를 남긴다)');
