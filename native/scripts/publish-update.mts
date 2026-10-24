/**
 * 새 앱 화면 코드 업데이트를 올린다(lib/app-update.ts 의 꼴) — GitHub ios-native.yml 이 main 푸시마다 부른다.
 *   node scripts/publish-update.mts publish --dist <expo export 폴더> --runtime <바닥 판> [--commit <sha>]
 *   node scripts/publish-update.mts has-binary --runtime <바닥 판>   → 'true' | 'false' (그 바닥 판 앱을 구운 적 있나)
 *   node scripts/publish-update.mts mark-binary --runtime <바닥 판> --build <빌드 번호>
 *   node scripts/publish-update.mts history --runtime <바닥 판>               → 지금 최신 · 지난 업데이트(새것부터)
 *   node scripts/publish-update.mts rollback --runtime <바닥 판> --to <업데이트 id>
 *       → 지난 업데이트를 새 번호 · 새 시각으로 다시 올린다(사용자 앱이 다음에 켤 때 그것으로 옮겨 간다). 다음 main 푸시가 오면 그 코드로 다시 덮인다.
 * 화면 코드가 지금 최신과 같으면(바뀐 게 없는 푸시) 사이트가 새 업데이트를 안 만든다.
 * 저장소 열쇠는 안 갖는다 — 사이트 /api/app-update/publish 를 앱 업데이트 열쇠(APP_UPDATE_TOKEN, 없으면 LIBRARY_BUNDLE_TOKEN)로 불러
 * 1회용 주소를 받고 파일은 저장소에 바로 올린다. 손으로 부를 때는 BP_SITE_URL · APP_UPDATE_TOKEN 을 환경에 둔다.
 * 같은 푸시로 사이트가 아직 배포 중이면(새 주소 404) 30초씩 20번 다시 묻는다. 파일은 내용 주소라 바뀐 것만 올라간다.
 */
import { createHash, randomUUID } from 'node:crypto';
import { execFileSync } from 'node:child_process';
import { readFileSync } from 'node:fs';
import { join } from 'node:path';
import { fileKeyOf, type StoredAsset, type StoredUpdate } from '../../lib/app-update.ts';

const SITE = process.env.BP_SITE_URL ?? 'https://dugout-baseball.com';
const token = process.env.APP_UPDATE_TOKEN || process.env.LIBRARY_BUNDLE_TOKEN;
const [cmd, ...rest] = process.argv.slice(2);
const arg = (name: string) => {
  const i = rest.indexOf(`--${name}`);
  return i >= 0 ? rest[i + 1] : undefined;
};
if (!token) {
  console.log('::warning title=앱 업데이트::APP_UPDATE_TOKEN(또는 LIBRARY_BUNDLE_TOKEN)이 없어 건너뛴다');
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
} else if (cmd === 'history') {
  type Row = { id: string; createdAt: string; commit: string | null; hash: string };
  const { latest, updates } = await call<{ latest: Row | null; updates: Row[] }>({ op: 'history', runtime });
  console.log(`지금 최신: ${latest ? `${latest.id} · ${latest.createdAt} · ${latest.commit ?? '-'}` : '없음'}`);
  for (const u of updates) console.log(`${u.hash === latest?.hash ? '*' : ' '} ${u.id}  ${u.createdAt}  ${u.commit ?? '-'}`);
} else if (cmd === 'rollback') {
  const to = arg('to');
  if (!to) throw new Error('--to <업데이트 id> 가 없다');
  const { id, skipped } = await call<{ id: string; skipped?: boolean }>({ op: 'rollback', runtime, to });
  console.log(skipped ? `이미 그 화면 코드가 최신이다(${id}) — 그대로 둠` : `되돌림 — ${to} 를 새 업데이트 ${id} 로 올렸다. 사용자 앱은 다음에 켤 때 받는다`);
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
  const { skipped } = await call<{ skipped?: boolean }>({ op: 'commit', update });
  if (skipped) console.log(`::notice title=앱 업데이트 건너뜀::바닥 판 ${runtime.slice(0, 12)} — 화면 코드가 지금 최신과 같다`);
  else console.log(`::notice title=앱 업데이트 올림::바닥 판 ${runtime.slice(0, 12)} · ${update.id} · 파일 ${files.length}개(새로 올린 것만 올라감) — 사용자가 앱을 다시 켜면 받는다`);
} else {
  throw new Error(`모르는 명령 ${cmd}`);
}
