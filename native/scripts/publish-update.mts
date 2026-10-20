/**
 * 새 앱 화면 코드 업데이트를 R2 에 올린다(lib/app-update.ts 의 꼴) — GitHub ios-native.yml 이 main 푸시마다 부른다.
 *   node scripts/publish-update.mts publish --dist <expo export 폴더> --runtime <바닥 판> [--commit <sha>]
 *   node scripts/publish-update.mts has-binary --runtime <바닥 판>   → 'true' | 'false' (그 바닥 판 앱을 구운 적 있나)
 *   node scripts/publish-update.mts mark-binary --runtime <바닥 판> --build <빌드 번호>
 * 열쇠는 R2_* 환경변수(GitHub 비밀). 파일은 내용 주소(updates/files/<sha256>)라 바뀐 것만 올라간다.
 */
import { createHash, randomUUID } from 'node:crypto';
import { execFileSync } from 'node:child_process';
import { readFileSync } from 'node:fs';
import { join } from 'node:path';
import { fileKeyOf, latestKeyOf, type StoredAsset, type StoredUpdate } from '../../lib/app-update.ts';
import { r2Env, r2Exists, r2Put } from '../../lib/r2.ts';

const [cmd, ...rest] = process.argv.slice(2);
const arg = (name: string) => {
  const i = rest.indexOf(`--${name}`);
  return i >= 0 ? rest[i + 1] : undefined;
};
const env = r2Env();
if (!env) {
  console.log('::warning title=앱 업데이트::R2 열쇠(R2_*)가 없어 건너뛴다');
  if (cmd === 'has-binary') console.log('false');
  process.exit(0);
}
const runtime = arg('runtime');
if (!runtime) throw new Error('--runtime 이 없다');
const binaryKey = `updates/${runtime.replace(/[^\w.-]/g, '_')}/binary.json`;

const TYPES: Record<string, string> = {
  png: 'image/png', jpg: 'image/jpeg', jpeg: 'image/jpeg', gif: 'image/gif', webp: 'image/webp', svg: 'image/svg+xml',
  ttf: 'font/ttf', otf: 'font/otf', json: 'application/json', mp4: 'video/mp4', glb: 'model/gltf-binary',
};

async function asset(dist: string, path: string, ext: string | null): Promise<StoredAsset> {
  const bytes = readFileSync(join(dist, path));
  const sha = createHash('sha256').update(bytes).digest();
  const r2Key = fileKeyOf(sha.toString('hex'));
  const contentType = ext ? (TYPES[ext] ?? 'application/octet-stream') : 'application/javascript';
  if (!(await r2Exists(env!, r2Key))) await r2Put(env!, r2Key, bytes, contentType);
  return {
    key: createHash('md5').update(bytes).digest('hex'),
    hash: sha.toString('base64url'),
    r2Key,
    contentType,
    ...(ext ? { fileExtension: `.${ext}` } : {}),
  };
}

if (cmd === 'has-binary') {
  console.log((await r2Exists(env, binaryKey)) ? 'true' : 'false');
} else if (cmd === 'mark-binary') {
  await r2Put(env, binaryKey, JSON.stringify({ runtime, build: arg('build') ?? null, at: new Date().toISOString() }), 'application/json');
  console.log(`바닥 판 ${runtime} 앱을 구웠다고 적음`);
} else if (cmd === 'publish') {
  const dist = arg('dist');
  if (!dist) throw new Error('--dist 가 없다');
  const meta = JSON.parse(readFileSync(join(dist, 'metadata.json'), 'utf8')).fileMetadata.ios as { bundle: string; assets: { path: string; ext: string }[] };
  const launchAsset = await asset(dist, meta.bundle, null);
  const assets: StoredAsset[] = [];
  for (const a of meta.assets) assets.push(await asset(dist, a.path, a.ext));
  /* Constants.expoConfig — 업데이트로 켠 앱은 앱 안 설정 대신 이것을 읽는다 */
  const expoClient = JSON.parse(execFileSync('npx', ['expo', 'config', '--type', 'public', '--json'], { encoding: 'utf8' }));
  const update: StoredUpdate = {
    id: randomUUID(),
    createdAt: new Date().toISOString(),
    runtimeVersion: runtime,
    launchAsset,
    assets,
    expoClient,
    commit: arg('commit'),
  };
  const body = JSON.stringify(update);
  await r2Put(env, `updates/${runtime.replace(/[^\w.-]/g, '_')}/${update.id}.json`, body, 'application/json');
  await r2Put(env, latestKeyOf(runtime), body, 'application/json');
  console.log(`::notice title=앱 업데이트 올림::바닥 판 ${runtime.slice(0, 12)} · ${update.id} · 그림 ${assets.length}개 — 사용자가 앱을 다시 켜면 받는다`);
} else {
  throw new Error(`모르는 명령 ${cmd}`);
}
