/**
 * 스피드건 짝 비교표 — 받아 둔 영상을 앱과 같은 조건(넣은 거리 20m · 공 알림 시각 둘레 앞 0.25 ~ 뒤 1.45초, 알림이 없으면 영상 전체 훑기)으로
 * 재고, 앱 화면 규칙(믿음 '높음'만 기록 · 흔들림을 바로잡은 '보통'도 · 세션 거리 보정 · 세션 거리로 공 크기 다시 판정)을 묶음마다 적용해
 * 스피드건과 견준다. DB 에는 쓰지 않는다. 엔진을 고칠 때 전 · 후를 이 표로 본다(2026-10-16 오후 인식률 작업에서 만듦).
 *
 *   node scripts/velocity-lab/gun-table.mjs --files=2026-10-03,2026-10-06 --live=2026-10-07,2026-10-09 --rec=rec-49def374
 *   … --trig=<ball-trigger 출력 파일>(카메라 앱 영상의 공 · 후보 알림 시각을 씨앗으로) --engine=<복사본> --json=<파일> --tilt=0.035
 *
 *   --files : <날짜>/clips + manifest.json(download.mjs — 폰 카메라 앱으로 찍어 올린 파일, 화각은 파일의 렌즈 정보)
 *   --live  : <날짜>/live + manifest.json + .analysis.json(download.mjs --live — 앱 카메라 클립, 씨앗 = 공 알림 시각 clipEventSec)
 *   --rec   : download-recording.mjs 로 받은 녹화 폴더(cuts.json — 조각 파일 · 손에서 떠난 때 · 스피드건)
 *
 * 화면 규칙은 앱(velocity-screen.tsx)을 따라 묶음(날짜 · 녹화) 하나를 한 세션으로 본다. 세션 거리는 깨끗한 공 셋부터의 가운데 값이고, 공을
 * 받은 차례로 걸리는 앱과 달리 끝의 값으로 한 번에 옮긴다(견주는 도구다).
 */
import { readFileSync, writeFileSync, existsSync } from 'node:fs';
import { join } from 'node:path';
import { open, LAB, argOf } from './cdp.mjs';
import { sessionCorrection } from '../../lib/velocity-session-distance.ts';
import { SPEED_DISTANCE_EXPONENT, END_SIZE_AGREE } from '../../lib/velocity-engine/analyze-distance.ts';
import { INPUT_SIZE_MISMATCH } from '../../lib/velocity-engine/validate.ts';

const list = (k) => argOf(k, '').split(',').filter(Boolean);
const TILT = Number(argOf('tilt', '0.035'));
const BASE = 20;

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
    /* 앱이 엔진에 넘긴 거리(줄자 세션이면 그 값) — 20m 이 아니면 줄자 세션으로 보고 그 거리로 묶는다(세션 거리 보정 없음 · 공 크기 10% 판정) */
    const dist = an.distance?.inputDistM ?? BASE;
    S.push({ group: dist !== BASE ? `${d}@${dist}m` : d, path: join(LAB, d, 'live', e.file), name: e.file, gun: e.gun, seed: e.clipEventSec, fov: (2 * Math.atan(long / 2 / fp) * 180) / Math.PI, dist, tape: dist !== BASE });
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

const c = await open({ port: Number(argOf('port', 9451)), engine: argOf('engine') });
console.log('엔진', c.version, '· 영상', S.length);
const out = [];
for (const s of S) {
  await c.setFile(s.path);
  const r = await c.evaluate(`(async () => {
    const AV = window.__m['analyze-video'], VL = window.__m['video-lens'];
    const file = document.querySelector('input[type=file]').files[0];
    const fov = ${s.fov ?? 'null'} ?? VL.videoFovFor(await VL.readVideoLens(file)) ?? 32.1;
    const seed = ${s.seed ?? 'null'};
    const range = seed != null ? { startSec: Math.max(0, seed - 0.25), endSec: seed + 1.45, seedT: seed } : {};
    try {
      const res = await AV.analyzeVideo({ file, ...range, fps: 60, fovDeg: fov, approach: 'receding', distanceM: ${s.dist ?? BASE}, distanceAuto: ${argOf('auto', '0') === '1'}, fovKnown: ${s.fov != null}, tiltRad: ${TILT} });
      const m = res.measure, d = res.distance ?? {};
      return { ok: m.ok, code: m.ok ? null : m.code, kmh: m.ok ? m.kmh : null, conf: m.ok ? m.confidence : null, frames: m.ok ? m.detail.frames : null,
        preConf: d.preSize?.confidence ?? null, why: d.why ?? null, size: d.sizeDistM ?? null, slope: d.sizeSlope ?? null, ext: d.extended ?? 0,
        impact: d.impact ?? null, stab: !!d.stabilized, decoded: res.video?.timing?.decoded ?? null,
        se: m.ok ? m.detail.startSeKmh : null, start: m.ok ? m.detail.startKmh : null, endSize: d.endSizeRatio ?? null, first: d.firstDepthM ?? null, shaky: !!d.shaky };
    } catch (e) { return { error: String(e?.message ?? e) }; }
  })()`);
  const o = { ...s, ...r };
  out.push(o);
  console.log(
    o.group.padEnd(14), o.name.padEnd(22), '건', String(o.gun).padStart(3), '|',
    o.ok ? `${o.kmh.toFixed(1)} ${o.conf}${o.why ? ` ${o.why}` : ''} · 공 크기 ${o.size}m · 이어 ${o.ext} · 끝 ${o.impact}` : `못 잼 ${o.code ?? o.error}`
  );
}
await c.close();
const jsonOut = argOf('json', '');
if (jsonOut) writeFileSync(jsonOut, JSON.stringify(out, null, 1));

/* 화면 규칙 — 묶음 하나를 한 세션으로 */
const all = [];
let rec = 0;
console.log('\n묶음별(세션 거리 보정 · 기록 규칙 적용, 차이 = 화면 값 − 건)');
for (const g of [...new Set(out.map((o) => o.group))]) {
  const rs = out.filter((o) => o.group === g);
  const tape = rs.some((o) => o.tape);
  const corr = tape ? null : sessionCorrection(
    rs.filter((o) => o.ok).map((o) => ({ sizeDistM: o.size, sizeSlope: o.slope, extended: o.ext, impact: o.impact, confidence: o.preConf ?? o.conf, frames: o.frames })),
    BASE,
    SPEED_DISTANCE_EXPONENT
  );
  const ref = tape ? rs[0].dist : corr?.apply ? corr.m : BASE;
  const errs = [];
  for (const o of rs) {
    if (!o.ok) continue;
    let conf = o.preConf ?? o.conf;
    const off = o.size ? Math.abs(o.size / ref - 1) : 0;
    /* 세션 거리가 걸렸으면 그 기준은 믿을 만하다 — 튕긴 공도 10%(엔진 judgeSize strict, 2.7.6) */
    if (off > INPUT_SIZE_MISMATCH || ((tape || corr?.apply) && off > END_SIZE_AGREE) || (o.impact === 'end' && (o.size == null || off > END_SIZE_AGREE))) conf = 'low';
    if (conf === 'high' || (conf === 'medium' && o.stab)) errs.push(o.kmh * (corr?.k ?? 1) - o.gun);
  }
  rec += errs.length;
  all.push(...errs);
  const mae = errs.length ? errs.reduce((a, e) => a + Math.abs(e), 0) / errs.length : NaN;
  const mean = errs.length ? errs.reduce((a, e) => a + e, 0) / errs.length : NaN;
  console.log(
    `${g}: 기록 ${errs.length}/${rs.length} · 세션 거리 ${corr ? `${corr.m}m${corr.apply ? ' 적용' : ''}` : '-'} · MAE ${mae.toFixed(1)} · 평균 ${mean >= 0 ? '+' : ''}${mean.toFixed(1)} · [${errs.map((e) => e.toFixed(1)).join(', ')}]`
  );
}
const abs = all.map(Math.abs).sort((a, b) => a - b);
console.log(
  `전체: 기록 ${rec}/${out.length}(${Math.round((rec / out.length) * 100)}%) · MAE ${(abs.reduce((a, b) => a + b, 0) / abs.length).toFixed(2)} · 90% ${abs[Math.max(0, Math.ceil(abs.length * 0.9) - 1)]?.toFixed(1)}`
);
process.exit(0);
