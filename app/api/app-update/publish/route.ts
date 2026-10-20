import { NextResponse } from 'next/server';
import { binaryKeyOf, fileKeyOf, historyKeyOf, latestKeyOf, type StoredUpdate } from '@/lib/app-update';
import { exists, uploadTarget, writeJson } from '@/lib/app-update-store';
import { hasBuildToken } from '@/lib/build-token';

/**
 * GitHub 굽기(native/scripts/publish-update.mts)가 앱 업데이트를 올리는 곳 — 굽기 전용 열쇠로만(lib/build-token.ts). 열쇠가 없으면 404.
 *   has-binary  { runtime }                     → { built }      그 바닥 판 앱을 구운 적 있나
 *   prepare     { files: [sha256 hex, …] }     → { uploads }    아직 없는 파일만 1회용 올릴 주소(파일은 굽기가 바로 올린다)
 *   commit      { update: StoredUpdate }        → { ok }         기록 · 최신 표시
 *   mark-binary { runtime, build }             → { ok }
 */
const HEX = /^[0-9a-f]{64}$/;
const RUNTIME = /^[\w.-]{1,128}$/;

export async function POST(req: Request) {
  if (!hasBuildToken(req)) return NextResponse.json({ error: 'not found' }, { status: 404 });
  const body = (await req.json().catch(() => null)) as Record<string, unknown> | null;
  const op = body?.op;
  if (op === 'has-binary' && typeof body?.runtime === 'string' && RUNTIME.test(body.runtime)) {
    return NextResponse.json({ built: await exists(binaryKeyOf(body.runtime)) });
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
    /* 파일이 다 올라갔는지 — 하나라도 없으면 앱이 받다 실패한다 */
    const all = [u.launchAsset, ...(u.assets ?? [])];
    const have = await Promise.all(all.map((a) => exists(a.path)));
    const gone = all.find((_, i) => !have[i]);
    if (gone) return NextResponse.json({ error: `파일이 없어요 ${gone.path}` }, { status: 400 });
    await writeJson(historyKeyOf(u.runtimeVersion, u.id), u);
    await writeJson(latestKeyOf(u.runtimeVersion), u);
    return NextResponse.json({ ok: true });
  }
  if (op === 'mark-binary' && typeof body?.runtime === 'string' && RUNTIME.test(body.runtime)) {
    await writeJson(binaryKeyOf(body.runtime), { runtime: body.runtime, build: body.build ?? null, at: new Date().toISOString() });
    return NextResponse.json({ ok: true });
  }
  return NextResponse.json({ error: '모르는 요청' }, { status: 400 });
}
