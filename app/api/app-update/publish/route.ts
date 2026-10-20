import { randomUUID } from 'node:crypto';
import { NextResponse } from 'next/server';
import { binaryKeyOf, fileKeyOf, historyKeyOf, latestKeyOf, type StoredUpdate } from '@/lib/app-update';
import { exists, listNewest, readText, uploadTarget, writeJson } from '@/lib/app-update-store';
import { hasAppUpdateToken } from '@/lib/build-token';

/**
 * GitHub 굽기(native/scripts/publish-update.mts)가 앱 업데이트를 올리는 곳 — 앱 업데이트 전용 열쇠로만(lib/build-token.ts hasAppUpdateToken). 열쇠가 없으면 404.
 *   has-binary  { runtime }                     → { built }      그 바닥 판 앱을 구운 적 있나
 *   prepare     { files: [sha256 hex, …] }     → { uploads }    아직 없는 파일만 1회용 올릴 주소(파일은 굽기가 바로 올린다)
 *   commit      { update: StoredUpdate }        → { ok, skipped? } 기록 · 최신 표시. 화면 코드가 지금 최신과 같으면 새로 안 만든다(skipped)
 *   history     { runtime }                     → { latest, updates } 지금 최신 · 지난 업데이트(새것부터 15개)
 *   rollback    { runtime, to }                 → { ok, id }     지난 업데이트 to 를 새 번호 · 새 시각으로 다시 올린다(앱은 새 번호라 받는다)
 *   mark-binary { runtime, build }             → { ok }
 */
const HEX = /^[0-9a-f]{64}$/;
const RUNTIME = /^[\w.-]{1,128}$/;
const ID = /^[\w-]{1,64}$/;

async function readUpdate(key: string): Promise<StoredUpdate | null> {
  const text = await readText(key);
  return text ? (JSON.parse(text) as StoredUpdate) : null;
}
const summary = (u: StoredUpdate) => ({ id: u.id, createdAt: u.createdAt, commit: u.commit ?? null, hash: u.launchAsset.hash });

/** 기록 · 최신 표시 — 화면 코드(launchAsset)가 지금 최신과 같으면 새 업데이트를 만들지 않는다(바뀐 게 없는 푸시) */
async function commit(u: StoredUpdate) {
  const latest = await readUpdate(latestKeyOf(u.runtimeVersion));
  if (latest?.launchAsset.hash === u.launchAsset.hash) return NextResponse.json({ ok: true, skipped: true, id: latest.id });
  /* 파일이 다 올라갔는지 — 하나라도 없으면 앱이 받다 실패한다 */
  const all = [u.launchAsset, ...(u.assets ?? [])];
  const have = await Promise.all(all.map((a) => exists(a.path)));
  const gone = all.find((_, i) => !have[i]);
  if (gone) return NextResponse.json({ error: `파일이 없어요 ${gone.path}` }, { status: 400 });
  await writeJson(historyKeyOf(u.runtimeVersion, u.id), u);
  await writeJson(latestKeyOf(u.runtimeVersion), u);
  return NextResponse.json({ ok: true, id: u.id });
}

export async function POST(req: Request) {
  if (!hasAppUpdateToken(req)) return NextResponse.json({ error: 'not found' }, { status: 404 });
  const body = (await req.json().catch(() => null)) as Record<string, unknown> | null;
  const op = body?.op;
  const runtime = typeof body?.runtime === 'string' && RUNTIME.test(body.runtime) ? body.runtime : null;
  if (op === 'has-binary' && runtime) {
    return NextResponse.json({ built: await exists(binaryKeyOf(runtime)) });
  }
  if (op === 'prepare' && Array.isArray(body?.files) && body.files.length <= 500 && body.files.every((f) => typeof f === 'string' && HEX.test(f))) {
    const files = body.files as string[];
    const have = await Promise.all(files.map((sha) => exists(fileKeyOf(sha))));
    const missing = files.filter((_, i) => !have[i]);
    const urls = await Promise.all(missing.map((sha) => uploadTarget(fileKeyOf(sha))));
    return NextResponse.json({ uploads: Object.fromEntries(missing.map((sha, i) => [sha, urls[i]])) });
  }
  if (op === 'commit' && body?.update && typeof body.update === 'object') {
    const u = body.update as StoredUpdate;
    if (typeof u.id !== 'string' || !RUNTIME.test(u.runtimeVersion ?? '') || !u.launchAsset?.path?.startsWith('updates/files/')) {
      return NextResponse.json({ error: '업데이트 모양이 틀려요' }, { status: 400 });
    }
    return commit(u);
  }
  if (op === 'history' && runtime) {
    const folder = latestKeyOf(runtime).replace(/\/latest\.json$/, '');
    const names = (await listNewest(folder, 100)).filter((n) => n.endsWith('.json') && n !== 'latest.json' && n !== 'binary.json').slice(0, 15);
    const [latest, ...updates] = await Promise.all([readUpdate(latestKeyOf(runtime)), ...names.map((n) => readUpdate(`${folder}/${n}`))]);
    return NextResponse.json({ latest: latest && summary(latest), updates: updates.filter((u): u is StoredUpdate => !!u).map(summary) });
  }
  if (op === 'rollback' && runtime && typeof body?.to === 'string' && ID.test(body.to)) {
    const old = await readUpdate(historyKeyOf(runtime, body.to));
    if (!old) return NextResponse.json({ error: `그 업데이트가 없어요 ${body.to}` }, { status: 400 });
    /* 새 번호 · 새 시각 — 이미 더 새 업데이트를 받은 앱도 '새것'으로 보고 이것으로 옮겨 간다 */
    return commit({ ...old, id: randomUUID(), createdAt: new Date().toISOString(), commit: `rollback:${old.id}${old.commit ? `@${old.commit}` : ''}` });
  }
  if (op === 'mark-binary' && runtime) {
    await writeJson(binaryKeyOf(runtime), { runtime, build: body?.build ?? null, at: new Date().toISOString() });
    return NextResponse.json({ ok: true });
  }
  return NextResponse.json({ error: '모르는 요청' }, { status: 400 });
}
