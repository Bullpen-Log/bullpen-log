/**
 * SmartScout 방식 견주기 — 같은 영상 · 같은 공 길로 (ㄱ) 지금 엔진(끝 깊이 = 넣은 거리 20m, 전체 궤적)과 (ㄴ) SmartScout 방식(장면마다 공 크기로
 * 깊이 z = 배율 · f · 공 지름 ÷ 덩어리 지름, 손을 떠난 뒤 첫 N장(6 · 8 · 12 · 16) 직선 맞춤 속도 — 거리 입력 · 끝 판정 없음)을 스피드건과 견준다.
 * (ㄱ)은 앱처럼 묶음(날짜 · 녹화)마다 깨끗한 공의 공 크기 가운데 값으로 세션 거리를 맞춘 값도 낸다. 16장 못 되는 공은 뺀다. DB 안 씀.
 * SmartScout 은 학습 모델의 꽉 맞는 상자 폭을 쓰고 우리는 밝기 덩어리 지름이라 BLOB_SIZE_RATIO(덩어리 ÷ 실제)로 되돌린다.
 *
 *   node scripts/velocity-lab/ss-compare.mjs --files=2026-10-03,2026-10-06 --live=2026-10-07,2026-10-09 --rec=rec-49def374,rec-gA,rec-gB
 */
import { readFileSync, existsSync } from 'node:fs';
import { join } from 'node:path';
import { open, LAB, argOf } from './cdp.mjs';
import { BLOB_SIZE_RATIO, SPEED_DISTANCE_EXPONENT } from '../../lib/velocity-engine/analyze-distance.ts';
import { BALL_DIAMETER_M } from '../../lib/velocity-engine/geometry.ts';
import { sessionCorrection } from '../../lib/velocity-session-distance.ts';

const list = (k) => argOf(k, '').split(',').filter(Boolean);
const TILT = Number(argOf('tilt', '0.035'));

/* ball-trigger 출력(파일 이름: … 알림 N: ball 0.27s | seed …)에서 파일마다 처음 공 · 후보 시각 */
const trig = {};
const trigPath = argOf('trig', '');
if (trigPath)
  for (const l of readFileSync(trigPath, 'utf8').split('\n')) {
    const m = l.match(/^(\S+): .*알림 \d+: (.*)$/);
    const q = m && m[2].split('|').map((p) => p.trim().match(/^(ball|seed) ([\d.]+)s/)).find(Boolean);
    if (q) trig[m[1]] = Number(q[2]);
  }

const S = [];
for (const d of list('files')) {
  for (const e of JSON.parse(readFileSync(join(LAB, d, 'manifest.json'), 'utf8')))
    if (e.gun != null) S.push({ group: d, path: join(LAB, d, 'clips', e.file), name: e.file, gun: e.gun, seed: trig[e.file] ?? null, fov: null });
}
for (const d of list('live')) {
  for (const e of JSON.parse(readFileSync(join(LAB, d, 'manifest.json'), 'utf8'))) {
    if (e.gun == null) continue;
    const an = JSON.parse(readFileSync(join(LAB, d, 'live', `${e.file}.analysis.json`), 'utf8'));
    const long = Math.max(an.sourceSize?.width ?? e.session.frameW, an.sourceSize?.height ?? e.session.frameH);
    const fp = an.focalPx ?? e.session.focalPx;
    S.push({ group: d, path: join(LAB, d, 'live', e.file), name: e.file, gun: e.gun, seed: e.clipEventSec, fov: (2 * Math.atan(long / 2 / fp) * 180) / Math.PI });
  }
}
for (const r of list('rec')) {
  const j = JSON.parse(readFileSync(join(LAB, r, 'cuts.json'), 'utf8'));
  const fov = j.meta?.fovDeg ?? null;
  j.cuts.forEach((c, i) => {
    if (c.gun != null && existsSync(join(LAB, r, c.file)))
      S.push({ group: r, path: join(LAB, r, c.file), name: `${c.file}#${i + 1}`, gun: c.gun, seed: c.eventSec, fov });
  });
}
if (!S.length) {
  console.error('잴 영상이 없어요 — --files · --live · --rec 를 주세요(README 의 download).');
  process.exit(1);
}

const TILT0 = TILT;
const K_DRAG = 0.006; /* 공기저항 1/m — 엔진과 같은 값(K 0.006) */
const c = await open({ port: Number(argOf('port', 9530)) });
const rows = [];
for (const s of S) {
  await c.setFile(s.path);
  const r = await c.evaluate(`(async () => {
    const AV = window.__m['analyze-video'], VL = window.__m['video-lens'];
    const file = document.querySelector('input[type=file]').files[0];
    const fov = ${s.fov ?? 'null'} ?? VL.videoFovFor(await VL.readVideoLens(file)) ?? 32.1;
    const seed = ${s.seed ?? 'null'};
    const range = seed != null ? { startSec: Math.max(0, seed - 0.25), endSec: seed + 1.45, seedT: seed } : {};
    try {
      const res = await AV.analyzeVideo({ file, ...range, fps: 60, fovDeg: fov, approach: 'receding', distanceM: 20, distanceAuto: false, tiltRad: ${TILT0} });
      const m = res.measure, d = res.distance ?? {};
      return { size: d.sizeDistM ?? null, slope: d.sizeSlope ?? null, ext: d.extended ?? 0, impact: d.impact ?? null, preConf: d.preSize?.confidence ?? null, frames: m.ok ? m.detail.frames : null, ok: m.ok, kmh: m.ok ? m.kmh : null, conf: m.ok ? m.confidence : null, code: m.ok ? null : m.code, fov,
        w: res.analyzeSize.width, h: res.analyzeSize.height, sw: res.sourceSize.width, sh: res.sourceSize.height, fpx: res.focalPx,
        track: (res.track ?? []).map((o) => [o.t, o.x, o.y, o.diameterPx]) };
    } catch (e) { return { error: String(e?.message ?? e) }; }
  })()`);
  rows.push({ ...s, ...r });
}
await c.close();

/* SmartScout 방식 — 첫 N장: 깊이 z = 배율 · f · 지름 ÷ 덩어리, 자리 X = (x − cx) z / f, Y = (y − cy) z / f 를 시간에 직선으로 맞춘 속력 */
function ssSpeed(o, N) {
  if (!o.track || o.track.length < N) return null;
  const f = o.fpx * (o.w / o.sw);
  const cx = o.w / 2, cy = o.h / 2;
  const pts = o.track.slice(0, N).map(([t, x, y, d]) => { const z = (BLOB_SIZE_RATIO * f * BALL_DIAMETER_M) / d; return [t, ((x - cx) * z) / f, ((y - cy) * z) / f, z]; });
  const mt = pts.reduce((a, p) => a + p[0], 0) / N;
  const slope = (k) => { const m = pts.reduce((a, p) => a + p[k], 0) / N; let sxy = 0, sxx = 0; for (const p of pts) { sxy += (p[0] - mt) * (p[k] - m); sxx += (p[0] - mt) ** 2; } return sxy / sxx; };
  const v = Math.hypot(slope(1), slope(2), slope(3));
  const zMid = pts.reduce((a, p) => a + p[3], 0) / N;
  /* 맞춘 속력은 첫 N장 가운데 깊이의 속력 — 스피드건(손을 떠난 때 · 약 1m)으로 옮기면 공기저항만큼 빠르다 */
  return { kmh: v * 3.6, kmhRel: v * 3.6 * Math.exp(K_DRAG * Math.max(0, zMid - 1)), z0: pts[0][3], zN: pts[N - 1][3] };
}

const stat = (es) => { if (!es.length) return '-'; const a = es.map(Math.abs).sort((x, y) => x - y); return `MAE ${(a.reduce((x, y) => x + y, 0) / a.length).toFixed(1)} · 평균 ${(es.reduce((x, y) => x + y, 0) / es.length).toFixed(1)} · 90% ${a[Math.max(0, Math.ceil(a.length * 0.9) - 1)].toFixed(1)}`; };
const NS = [6, 8, 12, 16];
const groups = [...new Set(rows.map((o) => o.group))];
const all = { cur20: [], curSess: [], ...Object.fromEntries(NS.map((n) => [`ss${n}`, []])) };
for (const g of groups) {
  const rs = rows.filter((o) => o.group === g && o.ok);
  /* 앱(기준 18~22m)처럼 묶음의 깨끗한 공들의 공 크기 가운데 값으로 세션 거리 보정 */
  const corr = sessionCorrection(rs.map((o) => ({ sizeDistM: o.size, sizeSlope: o.slope, extended: o.ext, impact: o.impact, confidence: o.preConf ?? o.conf, frames: o.frames })), 20, SPEED_DISTANCE_EXPONENT);
  const k = corr?.apply ? corr.k : 1;
  const line = { cur20: [], curSess: [], ...Object.fromEntries(NS.map((n) => [`ss${n}`, []])) };
  for (const o of rs) {
    const ss = Object.fromEntries(NS.map((n) => [n, ssSpeed(o, n)]));
    if (NS.some((n) => !ss[n])) continue; /* 같은 공끼리 견주게 — 16장 안 되는 공은 뺀다 */
    line.cur20.push(o.kmh - o.gun);
    line.curSess.push(o.kmh * k - o.gun);
    for (const n of NS) line[`ss${n}`].push(ss[n].kmh - o.gun);
  }
  for (const key of Object.keys(all)) all[key].push(...line[key]);
  console.log(`${g.padEnd(13)} 공 ${line.cur20.length} · 세션 거리 ${corr?.apply ? corr.m + 'm' : '-'}\n   지금 20m ${stat(line.cur20)}\n   지금 세션거리 ${stat(line.curSess)}\n` + NS.map((n) => `   SS ${n}장 ${stat(line[`ss${n}`])}`).join('\n'));
}
console.log(`\n전체 공 ${all.cur20.length}\n   지금 20m ${stat(all.cur20)}\n   지금 세션거리 ${stat(all.curSess)}\n` + NS.map((n) => `   SS ${n}장 ${stat(all[`ss${n}`])}`).join('\n'));
process.exit(0);
