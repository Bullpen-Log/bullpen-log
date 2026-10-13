/**
 * 마커 정답지로 3D 엔진 채점 — 명령 하나(7단계). 엔진을 고칠 때마다 돌려 기준(results-2026-10-12/score-baseline.json)보다 나빠졌는지 본다.
 *
 *   npm run pitch3d:marker-score            채점만(나빠지면 실패로 끝남)
 *   npm run pitch3d:marker-score -- --save  지금 값을 새 기준으로 저장(좋아졌을 때만 — 사람이 판단)
 *
 * 영상 · 2D · 정답 자료는 저장소 밖(MARKER_SESSION, 기본 ~/bullpen-marker-lab/2026-10-12 — README '다시 돌리는 차례')이라 없으면 건너뛴다.
 * 파이썬은 MARKER_PY(기본: 세션 위 .venv). 엔진 입력에는 이 촬영이 1배라 초점 사전을 준다(bench.py FOCAL_PRIOR).
 */
import { execFileSync, spawn } from 'node:child_process';
import { existsSync, readFileSync, writeFileSync } from 'node:fs';
import { homedir } from 'node:os';
import { dirname, join } from 'node:path';
import { fileURLToPath } from 'node:url';

const HERE = dirname(fileURLToPath(import.meta.url));
const REPO = join(HERE, '..', '..', '..', '..');
const SESSION = process.env.MARKER_SESSION ?? join(homedir(), 'bullpen-marker-lab', '2026-10-12');
const PY = process.env.MARKER_PY ?? join(SESSION, '..', '.venv', 'bin', 'python');
const BASE = join(HERE, 'results-2026-10-12', 'score-baseline.json');
/** 이만큼(비율) 넘게 나빠지면 실패 */
const TOL = 0.03;

if (!existsSync(join(SESSION, 'work', 'kp')) || !existsSync(PY)) {
  console.log(`건너뜀 — 마커 자료가 없다(${SESSION}). selfcal/README.md '다시 돌리는 차례'`);
  process.exit(0);
}
const ALL = Array.from({ length: 16 }, (_, i) => i + 1);
const py = (...args) => execFileSync(PY, [join(HERE, 'bench.py'), ...args], { cwd: SESSION, stdio: ['ignore', 'pipe', 'pipe'] }).toString();

console.log('1/3 엔진 입력 만들기');
py('tracks', ALL.join(','));
console.log('2/3 엔진 돌리기(투구 16개 함께)');
await Promise.all(
  ALL.map(
    (p) =>
      new Promise((res) => {
        const dir = join(SESSION, 'work', 'bench', `p${String(p).padStart(2, '0')}`);
        const ch = spawn(process.execPath, ['--import', join(REPO, 'scripts', 'alias-register.mjs'), join(REPO, 'scripts', 'pitch-lab', 'markers', 'mocap-fit.mts'), dir], { stdio: 'ignore' });
        ch.on('close', res);
      })
  )
);
const ok = ALL.filter((p) => {
  const f = join(SESSION, 'work', 'bench', `p${String(p).padStart(2, '0')}`, 'result.json');
  return existsSync(f) && JSON.parse(readFileSync(f, 'utf8')).ok;
});
console.log(`3/3 채점(성공 ${ok.length}/16: ${ok.join(',')})`);
const report = py('score', ok.join(','), 'work/cal16b.json', 'work/world.json', 'now');
console.log(report.split('\n').filter((l) => !l.startsWith('objc')).join('\n'));
const now = JSON.parse(readFileSync(join(SESSION, 'work', 'bench', 'score-now.json'), 'utf8')).summary;
/* 골반 돌림 · 상하체 분리(골반 앞뒤 스티커 정답 — pelvis_score.py) */
const pel = execFileSync(PY, [join(HERE, 'pelvis_score.py'), ok.join(',')], { cwd: SESSION, stdio: ['ignore', 'pipe', 'pipe'] })
  .toString()
  .split('\n')
  .filter((l) => !l.startsWith('objc'));
console.log(pel.filter((l) => !l.startsWith('{')).join('\n'));
const ps = JSON.parse(pel.filter((l) => l.startsWith('{')).pop() ?? '{}');
now.pelvis_med_deg = ps.pelvis_med;
now.sep_med_deg = ps.sep_med;
/* 레이백(어깨 외회전) 최대 — 네 대 교차(K4) 대비 오차 가운데 · 25° 넘게 튄 장면(layback_check.py) */
const lb = execFileSync(PY, [join(HERE, 'layback_check.py'), ok.join(',')], { cwd: SESSION, env: { ...process.env, QUIET: '1' }, stdio: ['ignore', 'pipe', 'pipe'] })
  .toString()
  .split('\n')
  .filter((l) => !l.startsWith('objc'));
console.log(lb.filter((l) => l.startsWith('레이백')).join('\n'));
const ls = JSON.parse(lb.filter((l) => l.startsWith('{')).pop() ?? '{}');
now.layback_med_deg = ls.layback_med;
now.layback_jumps = ls.layback_jumps;
const keys = ['k4_median_cm', 'k4_mean_cm', 'k4_p90_cm', 'wrist_accel_p90_cm', 'mk_std_cm', 'pelvis_med_deg', 'sep_med_deg', 'layback_med_deg', 'layback_jumps'];
if (process.argv.includes('--save')) {
  writeFileSync(BASE, JSON.stringify({ ...now, savedAt: new Date().toISOString() }, null, 1) + '\n');
  console.log('새 기준 저장', BASE);
  process.exit(0);
}
if (!existsSync(BASE)) {
  console.log('기준 파일이 없다 — --save 로 만든다');
  process.exit(0);
}
const base = JSON.parse(readFileSync(BASE, 'utf8'));
let bad = 0;
console.log('\n기준과 비교(작을수록 좋다):');
for (const k of keys) {
  if (base[k] == null || now[k] == null) continue;
  const worse = now[k] > base[k] * (1 + TOL);
  if (worse) bad++;
  console.log(`  ${worse ? '나빠짐' : '  OK  '} ${k} ${base[k].toFixed(2)} → ${now[k].toFixed(2)}`);
}
if (now.pitches.length < base.pitches.length) {
  bad++;
  console.log(`  나빠짐 엔진이 성공한 투구 ${base.pitches.length} → ${now.pitches.length}`);
}
process.exit(bad ? 1 : 0);
