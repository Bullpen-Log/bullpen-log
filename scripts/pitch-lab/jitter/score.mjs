/**
 * 실험실 샘플 떨림 검사 — 엔진(lib/pitch-3d) · 화면 모델(v2/display · kinematics)을 고칠 때마다 돌려 기준(baseline.json)보다 떨림이 늘었는지 본다.
 *   npm run pitch3d:jitter                 검사(기준과 비교, 나빠지면 끝 코드 1)
 *   npm run pitch3d:jitter -- --save       지금 값을 새 기준으로(좋아졌거나 까닭을 알 때만 — 사람이 판단)
 *   npm run pitch3d:jitter -- --fetch      새 샘플 영상 받기(.env) + 2D 뽑기(Modal GPU, pose_modal.py) 뒤 검사
 * 자료(영상 · 2D · 엔진 입력 · 결과)는 저장소 밖 LAB_DIR(기본 ~/bullpen-marker-lab/labsamples — 선수 이름이 있어 커밋 안 함). 없으면 건너뛴다.
 *
 * 실패 셋 — 2026-10-13 실험실 샘플 1 떨림에서 배운 것:
 *  1 샘플 · 구간의 화면 떨림(관절별 p90 의 가장 큰 값 · 가운데 값)이 기준보다 10% 넘게, 0.2%p 넘게 늘었다 — 한 곳을 고치면 카메라 보정이 흔들려
 *    다른 구간이 나빠질 수 있다(세트 자세 고침이 공 놓은 뒤를 3.4 → 7.4% 로).
 *  2 화면 트랙이 원 결과보다 더 떠는 관절이 새로 생겼다(화면 > 원 × 1.25 + 0.3%) — 화면 모델은 다듬기만 해야 한다(편 팔 비틀림을 거꾸로 이어 손이 휘둘림).
 *  3 기준 때 되던 샘플이 실패한다.
 *  4 화면의 이상한 움직임(순간 튐 · 사람 한계 넘는 빠르기 · 뒤로 꺾인 무릎 · 분리 75° 넘음, measure.mts oddities)이나 인형 방향(골반 ·
 *    가슴 · 머리 · 두 손 · 두 발)의 순간 튐 · 빠르기 넘음, 마디 꺾임 · 앞발 휘두름(mannequinOddities)이 늘었다.
 */
import { spawn, spawnSync } from 'node:child_process';
import { existsSync, readFileSync, writeFileSync } from 'node:fs';
import { homedir, cpus } from 'node:os';
import { dirname, join } from 'node:path';
import { fileURLToPath, pathToFileURL } from 'node:url';

const HERE = dirname(fileURLToPath(import.meta.url));
const REPO = join(HERE, '..', '..', '..');
const LAB = process.env.LAB_DIR ?? join(homedir(), 'bullpen-marker-lab', 'labsamples');
const VENV = process.env.MARKER_VENV ?? join(homedir(), 'bullpen-marker-lab', '.venv', 'bin');
const BASE = join(HERE, 'baseline.json');
const TOL = 0.1;
const TOL_ABS = 0.2;
const AMP = (disp, raw) => disp > raw * 1.25 + 0.3;
const PHASE_KO = { prep: '준비', lift: '들기', stride: '착지', follow: '뒤' };
const run = (cmd, args, opts = {}) => {
  const r = spawnSync(cmd, args, { stdio: 'inherit', ...opts });
  if (r.status !== 0) throw new Error(`${cmd} ${args.join(' ')} 실패(${r.status})`);
};

if (process.argv.includes('--fetch')) {
  run(process.execPath, ['--env-file=.env', join(HERE, 'fetch.mjs'), LAB], { cwd: REPO });
  run(join(VENV, 'modal'), ['run', join(REPO, 'scripts/pitch-lab/markers/selfcal/pose_modal.py')], { cwd: LAB });
}
const manifest = join(LAB, 'jitter', 'samples.json');
if (!existsSync(manifest)) {
  console.log(`건너뜀 — 샘플 자료가 없다(${LAB}). 처음이면 --fetch`);
  process.exit(0);
}
run(join(VENV, 'python'), [join(HERE, 'tracks.py'), LAB]);
const keys = Object.keys(JSON.parse(readFileSync(manifest, 'utf8')))
  .filter((k) => existsSync(join(LAB, 'jitter', k, 'tracks.json')))
  .sort();
console.log(`엔진 돌리기(샘플 ${keys.length}개 함께)`);
const limit = Math.max(1, Math.min(keys.length, cpus().length - 1));
const queue = [...keys];
await Promise.all(
  Array.from({ length: limit }, async () => {
    for (let k = queue.shift(); k; k = queue.shift()) {
      const dir = join(LAB, 'jitter', k);
      await new Promise((res) =>
        spawn(process.execPath, ['--import', pathToFileURL(join(REPO, 'scripts/alias-register.mjs')).href, join(REPO, 'scripts/pitch-lab/markers/mocap-fit.mts'), dir], {
          stdio: 'ignore',
        }).on('close', res)
      );
    }
  })
);
const lines = spawnSync(
  process.execPath,
  ['--import', pathToFileURL(join(REPO, 'scripts/alias-register.mjs')).href, join(HERE, 'measure.mts'), ...keys.map((k) => join(LAB, 'jitter', k, 'result.json'))],
  { encoding: 'utf8', maxBuffer: 64 << 20 }
).stdout.trim().split('\n');

/* 샘플 → 구간 → { max, med, amp } (화면 기준) · odd(이상한 움직임 장면 수, 화면 · 원), 실패한 샘플은 { failed } */
const now = {};
const odd = {};
keys.forEach((k, i) => {
  const m = JSON.parse(lines[i] ?? '{"failed":"measure"}');
  if (m.failed) return void (now[k] = { failed: m.failed });
  odd[k] = m.odd;
  now[k] = Object.fromEntries(
    Object.entries(m.phases).map(([p, joints]) => {
      const disp = Object.values(joints).map(([d]) => d).sort((a, b) => a - b);
      const amp = Object.entries(joints).filter(([, [d, r]]) => AMP(d, r)).map(([n]) => n).sort();
      return [p, { max: disp.at(-1), med: disp[disp.length >> 1], amp }];
    })
  );
});
console.log('\n화면 떨림(키 대비 %, 관절별 p90 의 가장 큰 값 / 가운데 값) · 화면이 원 결과보다 더 떠는 관절');
for (const k of keys) {
  const s = now[k];
  console.log(
    `  ${k.padEnd(9)} ` +
      (s.failed
        ? `실패 ${s.failed}`
        : Object.entries(s)
            .map(([p, v]) => `${PHASE_KO[p]} ${v.max.toFixed(1)}/${v.med.toFixed(2)}${v.amp.length ? ` [${v.amp.join(',')}]` : ''}`)
            .join(' · '))
  );
}
const ODD = ['pop', 'speed', 'knee', 'sep'];
const ODD_KO = { pop: '순간 튐', speed: '빠르기 넘음', knee: '뒤로 꺾인 무릎', sep: '분리 75° 넘음' };
const MAN_KO = { pop: '방향 순간 튐', speed: '방향 빠르기 넘음', kink: '꺾임', whip: '앞발 휘두름', stretch: '다리 늘어남' };
const oddLine = (o) => ODD.map((x) => `${ODD_KO[x]} ${o[x]}`).join(' · ');
console.log('\n이상한 움직임(장면 수) — 화면 / 원 결과');
for (const k of keys)
  if (odd[k]) {
    const where = Object.entries(odd[k].disp.where).sort((a, b) => b[1] - a[1]).slice(0, 3).map(([w, c]) => `${w} ${c}`).join(', ');
    console.log(`  ${k.padEnd(9)} 화면 ${oddLine(odd[k].disp)} / 원 ${oddLine(odd[k].raw)}${where ? `  [${where}]` : ''}`);
    const mw = Object.entries(odd[k].man.where).sort((a, b) => b[1] - a[1]).slice(0, 3).map(([w, c]) => `${w} ${c}`).join(', ');
    console.log(`  ${''.padEnd(9)} 인형 방향 순간 튐 ${odd[k].man.pop} · 빠르기 넘음 ${odd[k].man.speed} · 꺾임 ${odd[k].man.kink} · 앞발 휘두름 ${odd[k].man.whip} · 다리 늘어남 ${odd[k].man.stretch}${mw ? `  [${mw}]` : ''}`);
  }
if (process.argv.includes('--save')) {
  const strip = (o) => Object.fromEntries(ODD.map((x) => [x, o[x]]));
  const oddSave = Object.fromEntries(
    Object.entries(odd).map(([k, o]) => [k, { disp: strip(o.disp), raw: strip(o.raw), man: { pop: o.man.pop, speed: o.man.speed, kink: o.man.kink, whip: o.man.whip, stretch: o.man.stretch } }])
  );
  writeFileSync(BASE, JSON.stringify({ savedAt: new Date().toISOString(), samples: now, odd: oddSave }, null, 1) + '\n');
  console.log('새 기준 저장', BASE);
  process.exit(0);
}
if (!existsSync(BASE)) {
  console.log('기준 파일이 없다 — --save 로 만든다');
  process.exit(0);
}
const baseAll = JSON.parse(readFileSync(BASE, 'utf8'));
const base = baseAll.samples;
const bad = [];
for (const [k, b] of Object.entries(base)) {
  const s = now[k];
  if (!s) continue; // 이 기기에 없는 샘플
  if (b.failed) continue;
  if (s.failed) {
    bad.push(`${k} 엔진 실패(${s.failed}) — 기준 때는 됐다`);
    continue;
  }
  for (const [p, v] of Object.entries(b)) {
    const n = s[p];
    if (!n) continue;
    for (const f of ['max', 'med'])
      if (n[f] > v[f] * (1 + TOL) && n[f] - v[f] > TOL_ABS)
        bad.push(`${k} ${PHASE_KO[p]} 떨림 ${f === 'max' ? '가장 큰' : '가운데'} ${v[f].toFixed(2)} → ${n[f].toFixed(2)}`);
    const added = n.amp.filter((j) => !v.amp.includes(j));
    if (added.length) bad.push(`${k} ${PHASE_KO[p]} 화면이 원 결과보다 더 떪: ${added.join(', ')}`);
  }
}
/* 4 화면의 이상한 움직임이 늘었다(샘플마다 종류별 2장면 넘게) */
for (const [k, b] of Object.entries(baseAll.odd ?? {})) {
  if (!odd[k]) continue;
  for (const x of ODD)
    if (odd[k].disp[x] > b.disp[x] + 2) bad.push(`${k} 화면 ${ODD_KO[x]} ${b.disp[x]} → ${odd[k].disp[x]}`);
  for (const x of ['pop', 'speed', 'kink', 'whip', 'stretch'])
    if (b.man?.[x] != null && odd[k].man[x] > b.man[x] + 2) bad.push(`${k} 인형 ${MAN_KO[x]} ${b.man[x]} → ${odd[k].man[x]}`);
}
console.log(bad.length ? `\n나빠짐 ${bad.length}:\n  ${bad.join('\n  ')}` : '\n기준과 비교: 나빠진 곳 없음');
process.exit(bad.length ? 1 : 0);
