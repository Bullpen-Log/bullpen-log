/**
 * 새 앱 화면 코드 업데이트를 올린다(lib/app-update.ts 의 꼴) — GitHub ios-native.yml 이 main 푸시마다 부른다.
 *   node scripts/publish-update.mts publish --dist <expo export 폴더> --runtime <바닥 판> [--commit <sha>]
 *   node scripts/publish-update.mts has-binary --runtime <바닥 판>   → 'true' | 'false' (그 바닥 판 앱을 구운 적 있나)
 *   node scripts/publish-update.mts mark-binary --runtime <바닥 판> --build <빌드 번호>
 * 저장소 열쇠는 안 갖는다 — 사이트 /api/app-update/publish 를 굽기 전용 열쇠(LIBRARY_BUNDLE_TOKEN)로 불러 1회용 주소를 받고 파일은 저장소에 바로 올린다.
 * 같은 푸시로 사이트가 아직 배포 중이면(새 주소 404) 30초씩 20번 다시 묻는다. 파일은 내용 주소라 바뀐 것만 올라간다.
 */
import { createHash, randomUUID } from 'node:crypto';
import { execFileSync } from 'node:child_process';
import { readFileSync } from 'node:fs';
import { join } from 'node:path';
import { fileKeyOf, type StoredAsset, type StoredUpdate } from '../../lib/app-update.ts';

const SITE = process.env.BP_SITE_URL ?? 'https://bullpen-log.vercel.app';
const token = process.env.LIBRARY_BUNDLE_TOKEN;
const [cmd, ...rest] = process.argv.slice(2);
const arg = (name: string) => {
  const i = rest.indexOf(`--${name}`);
  return i >= 0 ? rest[i + 1] : undefined;
};
if (!token) {
  console.log('::warning title=앱 업데이트::LIBRARY_BUNDLE_TOKEN 이 없어 건너뛴다');
  if (cmd === 'has-binary') console.log('false');
  process.exit(0);
}
const runtime = arg('runtime');
if (!runtime) throw new Error('--runtime 이 없다');

async function call<T>(body: Record<string, unknown>): Promise<T> {
  for (let i = 0; i < 20; i++) {
    const res = await fetch(`${SITE}/api/app-update/publish`, {
      method: 'POST',
      headers: { authorization: `Bearer ${token}`, 'content-type': 'application/json' },
      body: JSON.stringify(body),
    }).catch(() => null);
    if (res?.ok) return (await res.json()) as T;
    if (res && res.status === 400) throw new Error(`사이트가 거절: ${await res.text()}`);
    console.log(`사이트 응답 ${res?.status ?? '연결 실패'} — 30초 뒤 다시(배포 중일 수 있음)`);
    await new Promise((r) => setTimeout(r, 30_000));
  }
  throw new Error('사이트에 못 닿음');
}

const TYPES: Record<string, string> = {
  png: 'image/png', jpg: 'image/jpeg', jpeg: 'image/jpeg', gif: 'image/gif', webp: 'image/webp', svg: 'image/svg+xml',
  ttf: 'font/ttf', otf: 'font/otf', json: 'application/json', mp4: 'video/mp4', glb: 'model/gltf-binary',
};

if (cmd === 'has-binary') {
  const { built } = await call<{ built: boolean }>({ op: 'has-binary', runtime });
  console.log(built ? 'true' : 'false');
} else if (cmd === 'mark-binary') {
  await call({ op: 'mark-binary', runtime, build: arg('build') ?? null });
  console.log(`바닥 판 ${runtime} 앱을 구웠다고 적음`);
} else if (cmd === 'publish') {
  const dist = arg('dist');
  if (!dist) throw new Error('--dist 가 없다');
  const meta = JSON.parse(readFileSync(join(dist, 'metadata.json'), 'utf8')).fileMetadata.ios as { bundle: string; assets: { path: string; ext: string }[] };
  const files = [{ path: meta.bundle, ext: null as string | null }, ...meta.assets.map((a) => ({ path: a.path, ext: a.ext }))].map((f) => {
    const bytes = readFileSync(join(dist, f.path));
    const sha = createHash('sha256').update(bytes).digest();
    const asset: StoredAsset = {
      key: createHash('md5').update(bytes).digest('hex'),
      hash: sha.toString('base64url'),
      path: fileKeyOf(sha.toString('hex')),
      contentType: f.ext ? (TYPES[f.ext] ?? 'application/octet-stream') : 'application/javascript',
      ...(f.ext ? { fileExtension: `.${f.ext}` } : {}),
    };
    return { asset, bytes, sha: sha.toString('hex') };
  });
  const { uploads } = await call<{ uploads: Record<string, string> }>({ op: 'prepare', files: [...new Set(files.map((f) => f.sha))] });
  for (const f of files) {
    const url = uploads[f.sha];
    if (!url) continue;
    delete uploads[f.sha];
    const res = await fetch(url, { method: 'PUT', body: f.bytes, headers: { 'content-type': f.asset.contentType } });
    if (!res.ok) throw new Error(`올리기 ${res.status} ${f.asset.path}: ${(await res.text()).slice(0, 200)}`);
  }
  /* Constants.expoConfig — 업데이트로 켠 앱은 앱 안 설정 대신 이것을 읽는다 */
  const expoClient = JSON.parse(execFileSync('npx', ['expo', 'config', '--type', 'public', '--json'], { encoding: 'utf8' }));
  const [launch, ...assets] = files.map((f) => f.asset);
  const update: StoredUpdate = {
    id: randomUUID(),
    createdAt: new Date().toISOString(),
    runtimeVersion: runtime,
    launchAsset: launch,
    assets,
    expoClient,
    commit: arg('commit'),
  };
  await call({ op: 'commit', update });
  console.log(`::notice title=앱 업데이트 올림::바닥 판 ${runtime.slice(0, 12)} · ${update.id} · 파일 ${files.length}개(새로 올린 것만 올라감) — 사용자가 앱을 다시 켜면 받는다`);
} else {
  throw new Error(`모르는 명령 ${cmd}`);
}
