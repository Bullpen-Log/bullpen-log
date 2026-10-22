/**
 * 마커 정답지로 3D 엔진 채점 — 명령 하나(7단계). 엔진을 고칠 때마다 돌려 촬영마다 기준(results-<날짜>/score-baseline.json)보다 나빠졌는지 본다.
 *
 *   npm run pitch3d:marker-score            채점만(어느 촬영이든 나빠지면 실패로 끝남)
 *   npm run pitch3d:marker-score -- --save  지금 값을 새 기준으로 저장(좋아졌을 때만 — 사람이 판단)
 *   … -- --only=10-21                       한 촬영만
 *
 * 촬영 둘(사람 둘): 10-12 김민 16구(카메라 넷) · 10-21 정강민 10구(1~5구 셋 · 6~10구 넷, 4차 — README '4차 촬영').
 * 영상 · 2D · 정답 자료는 저장소 밖(~/bullpen-marker-lab/<날짜> — MARKER_SESSION 으로 10-12 자리를 바꿀 수 있다)이라 없는 촬영은 건너뛴다.
 * 파이썬은 MARKER_PY(기본: 세션 위 .venv). 엔진 입력은 서버처럼 기종 · fps(DEVICES)와 1배 초점 사전(bench.py FOCAL_PRIOR)을 넣는다.
 */
import { execFileSync, spawn } from 'node:child_process';
import { existsSync, readFileSync, writeFileSync } from 'node:fs';
import { homedir } from 'node:os';
import { dirname, join } from 'node:path';
import { fileURLToPath, pathToFileURL } from 'node:url';

const HERE = dirname(fileURLToPath(import.meta.url));
const REPO = join(HERE, '..', '..', '..', '..');
const LAB = join(homedir(), 'bullpen-marker-lab');
/** 이만큼(비율) 넘게 나빠지면 실패 */
const TOL = 0.03;
const range = (a, b) => Array.from({ length: b - a + 1 }, (_, i) => a + i);

/*
 * 촬영마다: 세션 폴더 · 묶음(투구 · 보정 · 배율 · 카메라) · 기종(영상 원본의 com.apple.quicktime.model 과 트랙 fps) · 키 · 덤 채점.
 * 10-21 의 보정은 관절만으로 푼 것(스티커 다듬기는 투수판 확인에서 나빠짐), 배율은 투수판 긴 변 61cm.
 */
const SETS = [
  {
    name: '10-12',
    session: process.env.MARKER_SESSION ?? join(LAB, '2026-10-12'),
    base: join(HERE, 'results-2026-10-12', 'score-baseline.json'),
    groups: [{ ps: range(1, 16), cal: 'work/cal16b.json', world: 'work/world.json', cams: '1234', tag: 'now' }],
    devices: { side: { model: 'iPad (10th generation)', fps: 240 }, back: { model: 'iPhone 15 Pro Max', fps: 240 } },
    env: {},
    heightM: 1.8,
    extras: true, // 골반 · 분리(골반 앞뒤 스티커 정답 pelvis_score.py) · 레이백(layback_check.py) — 이 촬영의 스티커 31개에 맞춘 것
  },
  {
    name: '10-21',
    session: join(LAB, '2026-10-21'),
    base: join(HERE, 'results-2026-10-21', 'score-baseline.json'),
    groups: [
      { ps: range(1, 5), cal: join(HERE, 'results-2026-10-21', 'calG1_kp2.json'), world: join(HERE, 'results-2026-10-21', 'world_G1.json'), cams: '123', tag: 'nowG1' },
      { ps: range(6, 10), cal: join(HERE, 'results-2026-10-21', 'calG2_kp2.json'), world: join(HERE, 'results-2026-10-21', 'world_G2.json'), cams: '1234', tag: 'nowG2' },
    ],
    devices: { side: { model: 'iPhone 15 Pro Max', fps: 240 }, back: { model: 'iPhone 11', fps: 240 } },
    env: { HEIGHT_M: '1.88', MARKER_SET: 'v4' },
    heightM: 1.88,
    extras: false,
  },
];

const pad = (p) => String(p).padStart(2, '0');
const save = process.argv.includes('--save');
const only = process.argv.find((a) => a.startsWith('--only='))?.slice(7);
let bad = 0;
let ran = 0;

for (const S of SETS.filter((s) => !only || s.name === only)) {
  const PY =
    process.env.MARKER_PY ?? [join(S.session, '..', '.venv', 'bin', 'python'), join(S.session, '..', '.venv', 'Scripts', 'python.exe')].find((p) => existsSync(p)) ?? '';
  if (!existsSync(join(S.session, 'work', 'kp')) || !existsSync(PY)) {
    console.log(`[${S.name}] 건너뜀 — 마커 자료가 없다(${S.session}). selfcal/README.md`);
    continue;
  }
  ran++;
  const all = S.groups.flatMap((g) => g.ps);
  const py = (script, args, env = {}) =>
    execFileSync(PY, [join(HERE, script), ...args], { cwd: S.session, env: { ...process.env, ...S.env, ...env }, stdio: ['ignore', 'pipe', 'pipe'] })
      .toString()
      .split('\n')
      .filter((l) => !l.startsWith('objc'));

  console.log(`\n===== ${S.name} — 1/3 엔진 입력 만들기`);
  py('bench.py', ['tracks', all.join(',')]);
  for (const p of all) {
    const f = join(S.session, 'work', 'bench', `p${pad(p)}`, 'tracks.json');
    if (!existsSync(f)) continue;
    const tr = JSON.parse(readFileSync(f, 'utf8'));
    tr.meta.devices = S.devices;
    writeFileSync(f, JSON.stringify(tr));
  }
  console.log(`[${S.name}] 2/3 엔진 돌리기(투구 ${all.length}개 함께)`);
  await Promise.all(
    all.map(
      (p) =>
        new Promise((res) => {
          const dir = join(S.session, 'work', 'bench', `p${pad(p)}`);
          const ch = spawn(process.execPath, ['--import', pathToFileURL(join(REPO, 'scripts', 'alias-register.mjs')).href, join(REPO, 'scripts', 'pitch-lab', 'markers', 'mocap-fit.mts'), dir], { stdio: 'ignore' });
          ch.on('close', res);
        })
    )
  );
  const okOf = (ps) =>
    ps.filter((p) => {
      const f = join(S.session, 'work', 'bench', `p${pad(p)}`, 'result.json');
      return existsSync(f) && JSON.parse(readFileSync(f, 'utf8')).ok;
    });
  const ok = okOf(all);
  console.log(`[${S.name}] 3/3 채점(성공 ${ok.length}/${all.length}: ${ok.join(',')})`);
  const rows = [];
  for (const g of S.groups) {
    const gok = okOf(g.ps);
    if (!gok.length) continue;
    const out = py('bench.py', ['score', gok.join(','), g.cal, g.world, g.tag], { MARKER_CAMS: g.cams });
    console.log(out.join('\n'));
    rows.push(...JSON.parse(readFileSync(join(S.session, 'work', 'bench', `score-${g.tag}.json`), 'utf8')).rows);
  }
  // 묶음이 여럿이면(10-21) 줄을 합쳐 요약을 다시 낸다 — bench.py 의 summary 와 같은 셈
  const cm = rows.filter((r) => r[1] === 'K4').map((r) => r[4] * 100);
  const wa = rows.filter((r) => r[1] === 'K4' && (r[2] === 'lWr' || r[2] === 'rWr') && r[3] === '팔 가속').map((r) => r[4] * 100);
  const q = (v, p) => {
    const s = [...v].sort((a, b) => a - b);
    const i = (s.length - 1) * p;
    return s[Math.floor(i)] + (s[Math.ceil(i)] - s[Math.floor(i)]) * (i - Math.floor(i));
  };
  const now = {
    pitches: ok,
    k4_median_cm: q(cm, 0.5),
    k4_mean_cm: cm.reduce((a, b) => a + b, 0) / cm.length,
    k4_p90_cm: q(cm, 0.9),
    wrist_accel_p90_cm: wa.length ? q(wa, 0.9) : null,
  };
  /* 착지 맞춤 — 착지 단추 때 인형 앞발이 떠 있는 높이(landing.mts, 가운데 cm) */
  const land = execFileSync(
    process.execPath,
    ['--import', pathToFileURL(join(REPO, 'scripts', 'alias-register.mjs')).href, join(HERE, 'landing.mts'), join(S.session, 'work', 'bench'), String(S.heightM), ok.join(',')],
    { stdio: ['ignore', 'pipe', 'ignore'] }
  )
    .toString()
    .trim()
    .split('\n')
    .pop();
  now.landing_air_cm = JSON.parse(land ?? '{}').median_cm ?? null;
  console.log(`[${S.name}] 착지 단추 때 인형 앞발 높이 가운데 ${now.landing_air_cm}cm`);
  if (S.groups.length === 1) now.mk_std_cm = JSON.parse(readFileSync(join(S.session, 'work', 'bench', `score-${S.groups[0].tag}.json`), 'utf8')).summary.mk_std_cm;
  if (S.extras) {
    /* 골반 돌림 · 상하체 분리(골반 앞뒤 스티커 정답 — pelvis_score.py) */
    const pel = py('pelvis_score.py', [ok.join(',')]);
    console.log(pel.filter((l) => !l.startsWith('{')).join('\n'));
    const ps = JSON.parse(pel.filter((l) => l.startsWith('{')).pop() ?? '{}');
    now.pelvis_med_deg = ps.pelvis_med;
    now.sep_med_deg = ps.sep_med;
    /* 레이백(어깨 외회전) 최대 — 네 대 교차(K4) 대비 오차 가운데 · 25° 넘게 튄 장면(layback_check.py) */
    const lb = py('layback_check.py', [ok.join(',')], { QUIET: '1' });
    console.log(lb.filter((l) => l.startsWith('레이백')).join('\n'));
    const ls = JSON.parse(lb.filter((l) => l.startsWith('{')).pop() ?? '{}');
    now.layback_med_deg = ls.layback_med;
    now.layback_jumps = ls.layback_jumps;
  }
  if (save) {
    writeFileSync(S.base, JSON.stringify({ ...now, savedAt: new Date().toISOString() }, null, 1) + '\n');
    console.log(`[${S.name}] 새 기준 저장`, S.base);
    continue;
  }
  if (!existsSync(S.base)) {
    console.log(`[${S.name}] 기준 파일이 없다 — --save 로 만든다`);
    continue;
  }
  const base = JSON.parse(readFileSync(S.base, 'utf8'));
  console.log(`\n[${S.name}] 기준과 비교(작을수록 좋다):`);
  for (const k of ['k4_median_cm', 'k4_mean_cm', 'k4_p90_cm', 'wrist_accel_p90_cm', 'mk_std_cm', 'pelvis_med_deg', 'sep_med_deg', 'layback_med_deg', 'layback_jumps']) {
    if (base[k] == null || now[k] == null) continue;
    const worse = now[k] > base[k] * (1 + TOL);
    if (worse) bad++;
    console.log(`  ${worse ? '나빠짐' : '  OK  '} ${k} ${base[k].toFixed(2)} → ${now[k].toFixed(2)}`);
  }
  /* 착지 맞춤은 비율이 아니라 0.5cm 넘게 더 뜨면 실패(기준이 0.5cm 쯤이라 3% 는 너무 좁다) */
  if (base.landing_air_cm != null && now.landing_air_cm != null) {
    const worse = now.landing_air_cm > base.landing_air_cm + 0.5;
    if (worse) bad++;
    console.log(`  ${worse ? '나빠짐' : '  OK  '} landing_air_cm ${base.landing_air_cm.toFixed(2)} → ${now.landing_air_cm.toFixed(2)}`);
  }
  if (now.pitches.length < base.pitches.length) {
    bad++;
    console.log(`  나빠짐 엔진이 성공한 투구 ${base.pitches.length} → ${now.pitches.length}`);
  }
}
if (!ran) console.log('채점할 마커 자료가 없다 — 건너뜀');
process.exit(bad ? 1 : 0);
