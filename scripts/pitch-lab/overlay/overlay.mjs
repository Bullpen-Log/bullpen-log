/**
 * 겹쳐 보기 — 원본 두 영상 위에 AI 2D(빨강) · 엔진(파랑) · 화면 인형(초록)을 장면별로 그려 이상한 움직임이 어느 단계 탓인지 가른다.
 *   npm run pitch3d:overlay -- <샘플> [부위=arm|glove|lead|back] [시작 끝 걸음]
 * 기본 구간 = 착지와 공 놓기 사이 가운데 ~ 공 놓기 뒤 착지~놓기의 ⅓, 12장. 자료는 떨림 검사(pitch3d:jitter)와 같은 LAB_DIR —
 * 엔진 결과는 그 검사가 만든 jitter/<샘플>/result.json 을 쓰니, 엔진을 고쳤으면 검사를 먼저 돌린다. 그림은 jitter/<샘플>/overlay-<부위>.png.
 */
import { spawnSync } from 'node:child_process';
import { existsSync, readFileSync } from 'node:fs';
import { homedir } from 'node:os';
import { dirname, join } from 'node:path';
import { fileURLToPath } from 'node:url';

const HERE = dirname(fileURLToPath(import.meta.url));
const REPO = join(HERE, '..', '..', '..');
const LAB = process.env.LAB_DIR ?? join(homedir(), 'bullpen-marker-lab', 'labsamples');
const VENV = process.env.MARKER_VENV ?? join(homedir(), 'bullpen-marker-lab', '.venv', 'bin');
const [key, part = 'arm', ...range] = process.argv.slice(2);
const dir = join(LAB, 'jitter', key ?? '');
if (!key || !existsSync(join(dir, 'result.json'))) {
  console.log(`샘플 결과가 없다(${dir}) — npm run pitch3d:jitter 를 먼저`);
  process.exit(1);
}
const meta = JSON.parse(readFileSync(join(LAB, 'jitter', 'samples.json'), 'utf8'))[key] ?? {};
const res = JSON.parse(readFileSync(join(dir, 'result.json'), 'utf8'));
const ev = res.events;
const span = ev.release - ev.footPlant;
const [a, b0, st] = range.length === 3 ? range.map(Number) : [ev.footPlant + (span >> 1), ev.release + Math.round(span / 3), 0];
const b = Math.min(b0, res.t.length - 1);
const step = Number(st) || Math.max(1, Math.round((b - a) / 11));
const pts = join(dir, 'overlay-points.json');
const png = join(dir, `overlay-${part}.png`);
const run = (cmd, args) => {
  const r = spawnSync(cmd, args, { stdio: 'inherit', cwd: REPO });
  if (r.status !== 0) process.exit(r.status ?? 1);
};
run(process.execPath, ['--import', './scripts/alias-register.mjs', join(HERE, 'points.mts'), dir, pts, String((meta.heightCm ?? 180) / 100)]);
run(join(VENV, 'python'), [join(HERE, 'draw.py'), pts, join(LAB, 'videos', `${key}_side.mov`), join(LAB, 'videos', `${key}_back.mov`), png, part, String(a), String(b), String(step)]);
console.log(png);
