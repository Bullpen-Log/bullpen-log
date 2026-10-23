/**
 * 구속 시험대 자료 받기 — fixtures.json 의 묶음 중 안 받은 것만 받고(DB · 저장소는 읽기만), 조각 끝에 걸린 녹화 컷은 이어 붙인다.
 *
 *   npm run velocity:bench:fetch                   (= node --env-file=.env scripts/velocity-bench/fetch.mjs)
 *   … -- --refresh                                 녹화 cuts.json 을 DB 에서 다시(스피드건 · 컷을 고쳤을 때)
 *
 * 받기는 지금 도구를 그대로 부른다 — 녹화 scripts/velocity-lab/download-recording.mjs, 앱 클립 · 카메라 앱 파일 download.mjs.
 * 이어 붙이기는 stitch.py(PyAV — ~/bullpen-velocity-lab/.venv, VELOCITY_PY 로 바꿈). 끝에 묶음마다 공 · 스피드건 수를 센다.
 */
import { spawnSync } from 'node:child_process';
import { existsSync, readFileSync, writeFileSync } from 'node:fs';
import { join } from 'node:path';
import { LAB, REPO } from '../velocity-lab/cdp.mjs';
import { FIXTURES, BENCH, loadBalls, recDirs } from './fixtures.mjs';

const refresh = process.argv.includes('--refresh');
const PY = process.env.VELOCITY_PY ?? join(LAB, '.venv/bin/python');
const lab = (s) => join(REPO, 'scripts/velocity-lab', s);

function run(cmd, args) {
  console.log('>', [cmd, ...args].join(' ').replace(REPO + '/', ''));
  const r = spawnSync(cmd, args, { stdio: 'inherit', cwd: REPO });
  if (r.status !== 0) throw new Error(`실패(${r.status}): ${cmd} ${args.join(' ')}`);
}

let fetched = 0;
for (const g of FIXTURES.groups) {
  if (g.kind === 'rec') {
    for (const id of g.recs ?? []) {
      const cj = join(LAB, `rec-${id}`, 'cuts.json');
      const fresh = existsSync(cj) && JSON.parse(readFileSync(cj, 'utf8')).parts;
      if (fresh && !refresh) continue;
      run('node', ['--env-file=.env', lab('download-recording.mjs'), `--id=${id}`]);
      fetched++;
    }
    for (const d of g.dirs ?? []) if (!existsSync(join(LAB, d, 'cuts.json'))) console.warn(`⚠ ${d} 가 없어요 — DB 에 없는 손 묶음이라 받을 수 없음`);
    continue;
  }
  const live = g.kind === 'live';
  if (existsSync(join(LAB, g.date, 'manifest.json')) && existsSync(join(LAB, g.date, live ? 'live' : 'clips'))) continue;
  run('node', ['--env-file=.env', lab('download.mjs'), `--date=${g.date}`, ...(live ? ['--live'] : []), ...(g.fetch ?? [])]);
  fetched++;
}

const jobs = loadBalls()
  .balls.filter((b) => b.stitch && !existsSync(b.path))
  .map((b) => ({ out: b.path, ...b.stitch }));
if (jobs.length) {
  const jf = join(BENCH, 'stitch-jobs.json');
  run('mkdir', ['-p', BENCH]);
  writeFileSync(jf, JSON.stringify(jobs));
  run(PY, [join(REPO, 'scripts/velocity-bench/stitch.py'), jf]);
}

const { balls, missing } = loadBalls();
const gone = balls.filter((b) => !existsSync(b.path));
console.log(`\n받은 것 ${fetched} · 이어 붙인 것 ${jobs.length}${fetched + jobs.length === 0 ? ' — 받을 것 0' : ''}`);
for (const g of FIXTURES.groups) {
  const bs = balls.filter((b) => b.group === g.id);
  console.log(`${g.id.padEnd(8)} ${g.split.padEnd(7)} 공 ${String(bs.length).padStart(2)} · 건 ${String(bs.filter((b) => b.gun != null).length).padStart(2)} · 이음 ${bs.filter((b) => b.stitch).length} · 실제 거리 ${g.trueDistM ?? '-'}`);
}
console.log(`전체 공 ${balls.length} · 건 ${balls.filter((b) => b.gun != null).length}`);
if (missing.length || gone.length) {
  console.error('빠진 것:', [...missing, ...gone.map((b) => b.path)].join('\n  '));
  process.exit(1);
}
