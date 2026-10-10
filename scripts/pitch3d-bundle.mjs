/**
 * GPU 함수용 엔진 묶기(설계 pitch-3d-quality.md E-P7) — lib/pitch-3d · lib/pose · lib/pitch-3d/v2 의 TS 를 services/pitch3d-gpu/engine/ 으로
 * 복사하고 '@/lib/…' 를 상대 경로(.ts)로 바꾼다. esbuild 같은 묶기 도구 없이, node 22+ 의 타입 벗기기(--experimental-strip-types)로 그대로 돈다.
 * engine/ 은 만들어지는 폴더라 git 에 올리지 않는다(.gitignore) — `modal deploy` 전에 이 스크립트를 돌린다.
 *
 *   node scripts/pitch3d-bundle.mjs            묶는다
 *   node scripts/pitch3d-bundle.mjs --check    묶은 뒤, 합성 투수 하나를 묶음 실행기(run-node.ts fit)와 앱의 엔진 둘로 돌려 결과 JSON 이 같은지 본다
 */
import { execFileSync } from 'node:child_process';
import {
  cpSync,
  existsSync,
  mkdirSync,
  readFileSync,
  rmSync,
  writeFileSync,
} from 'node:fs';
import { dirname, join, relative, resolve } from 'node:path';
import { pathToFileURL } from 'node:url';

const ROOT = resolve(import.meta.dirname, '..');
const OUT = join(ROOT, 'services', 'pitch3d-gpu', 'engine');
const FILES = [
  'lib/pitch-3d/analyze.ts',
  'lib/pitch-3d/camera.ts',
  'lib/pitch-3d/linalg.ts',
  'lib/pitch-3d/metrics.ts',
  'lib/pitch-3d/motion.ts',
  'lib/pitch-3d/v2/contract.ts',
  'lib/pitch-3d/v2/track.ts',
  'lib/pitch-3d/v2/clean2d.ts',
  'lib/pitch-3d/v2/fit.ts',
  'lib/pitch-3d/v2/run-node.ts',
  'lib/pitch-3d/v2/joint-map.json',
  'lib/pitch-3d/v2/motion-template.ts',
  'lib/pitch-3d/v2/motion-template.json',
  'lib/pitch-3d/v2/MOTION-TEMPLATE-LICENSE.md',
  'lib/pose/types.ts',
  'lib/pose/detect.ts',
];

rmSync(OUT, { recursive: true, force: true });
mkdirSync(OUT, { recursive: true });
let imports = 0;
for (const rel of FILES) {
  const src = join(ROOT, rel);
  const dst = join(OUT, rel);
  mkdirSync(dirname(dst), { recursive: true });
  if (!rel.endsWith('.ts')) {
    cpSync(src, dst);
    continue;
  }
  let code = readFileSync(src, 'utf8');
  code = code.replace(/from '@\/(lib\/[^']+)'/g, (_, target) => {
    imports++;
    const file = FILES.includes(`${target}.ts`) ? `${target}.ts` : target;
    if (!FILES.includes(file))
      throw new Error(`${rel} 이 묶음에 없는 ${target} 을 부른다 — FILES 에 더할 것`);
    let p = relative(dirname(rel), file).replace(/\\/g, '/');
    if (!p.startsWith('.')) p = './' + p;
    return `from '${p}'`;
  });
  if (/from '@\//.test(code)) throw new Error(`${rel}: 못 바꾼 '@/' 가 남았다`);
  writeFileSync(dst, code);
}
writeFileSync(
  join(OUT, 'package.json'),
  JSON.stringify({ type: 'module', private: true }, null, 2) + '\n'
);
writeFileSync(
  join(OUT, 'README.txt'),
  '만들어지는 폴더 — scripts/pitch3d-bundle.mjs 가 lib/pitch-3d · lib/pose 를 복사한 것. 손으로 고치지 않는다.\n'
);
console.log(
  `묶음: ${FILES.length}개 파일 · 바꾼 import ${imports}개 → ${relative(ROOT, OUT)}`
);

if (process.argv.includes('--check')) {
  /* 합성 입력을 앱 쪽 엔진으로 만들어 두 길로 돌린다 */
  const tmp = join(OUT, '.check');
  mkdirSync(tmp, { recursive: true });
  const mk = join(tmp, 'make.mts');
  writeFileSync(
    mk,
    `import { writeFileSync } from 'node:fs';
import { runFit } from '${pathToFileURL(join(ROOT, 'lib/pitch-3d/v2/run-node.ts')).href}';
import { base, cameras, realistic } from '${pathToFileURL(join(ROOT, 'scripts/pitch-lab/synth.mts')).href}';
import { makeV2Track } from '${pathToFileURL(join(ROOT, 'scripts/pitch-lab/synth-v2.mts')).href}';
const sc = { ...base, ...realistic, name: 'bundle' };
const { side, back } = cameras(sc);
const s = makeV2Track(sc, side, sc.side, 'side', 91);
const b = makeV2Track(sc, back, sc.back, 'back', 92);
const input = { side: s.track, back: b.track, hand: 'R', jobId: '2b0c7c1e-8f7a-4d1e-9a51-0c9d2f3e4a5b', poseModel: 'synth', screenRecorded: true, slowmoFps: 240 };
writeFileSync(process.argv[2], JSON.stringify(input));
writeFileSync(process.argv[3], runFit(input));
`
  );
  const inPath = join(tmp, 'in.json');
  const appOut = join(tmp, 'app.json');
  const bundleOut = join(tmp, 'bundle.json');
  const node = process.execPath;
  execFileSync(
    node,
    [
      '--import',
      pathToFileURL(join(ROOT, 'scripts/alias-register.mjs')).href,
      mk,
      inPath,
      appOut,
    ],
    { stdio: ['ignore', 'inherit', 'inherit'] }
  );
  execFileSync(
    node,
    [
      '--experimental-strip-types',
      '--no-warnings',
      join(OUT, 'lib/pitch-3d/v2/run-node.ts'),
      'fit',
      inPath,
      bundleOut,
    ],
    {
      stdio: ['ignore', 'inherit', 'inherit'],
    }
  );
  const a = readFileSync(appOut, 'utf8');
  const b = readFileSync(bundleOut, 'utf8');
  const parsed = JSON.parse(b);
  if (a !== b) {
    console.error('확인 실패: 묶음 실행기와 앱 엔진의 결과가 다르다');
    process.exit(1);
  }
  console.log(
    `확인: 같은 결과(${parsed.ok ? `장면 ${parsed.t.length}` : parsed.code}, ${Math.round(b.length / 1024)}KB)`
  );
  rmSync(tmp, { recursive: true, force: true });
  if (!existsSync(join(OUT, 'lib/pitch-3d/v2/run-node.ts'))) process.exit(1);
}
