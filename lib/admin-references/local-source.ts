import { createReadStream } from 'node:fs';
import { readFile, realpath, stat } from 'node:fs/promises';
import path from 'node:path';
import { Readable } from 'node:stream';
import { ASSET_PREFIX, STORAGE_PREFIX } from '@/lib/admin-references/schema';
import type { ReferenceSource, SourceRead } from '@/lib/admin-references/load';
import type { AssetFetch } from '@/lib/admin-references/original';

/**
 * EX-REF02 — 열쇠 검사와 내 컴퓨터 미리보기용 폴더 읽기(서버에서만 부른다 — storage.ts). 시험이 직접 부르도록 server-only 를 달지 않았다.
 *
 * 파일 읽기마다 turbopackIgnore 를 단다 — 없으면 빌드가 '이 경로는 어디든 될 수 있다'고 보고 프로젝트 전체를 서버 묶음에 싣는다
 * (npx next build 경고 'Dynamic filesystem access causes tracing of the whole project'). 이 갈래는 운영에서 꺼져 있다(storage.ts localDir).
 */

/** 참고자료 자리 안의 열쇠인가 — '..' · 빈 조각 · 역슬래시 · 다른 폴더는 거절 */
export function isReferenceKey(key: string): boolean {
  if (!key.startsWith(STORAGE_PREFIX)) return false;
  const rest = key.slice(STORAGE_PREFIX.length);
  if (!rest || rest.includes('\\') || rest.includes('\0')) return false;
  return rest.split('/').every((part) => part !== '' && part !== '.' && part !== '..');
}

/** 폴더 안의 실제 파일 자리 — 폴더 밖(.. · 바로가기)이면 null, 없으면 'missing' */
async function confined(dir: string, key: string): Promise<string | null | 'missing'> {
  const root = await realpath(/*turbopackIgnore: true*/ dir);
  const target = path.resolve(/*turbopackIgnore: true*/ root, key.slice(STORAGE_PREFIX.length));
  if (!target.startsWith(root + path.sep)) return null;
  let real: string;
  try {
    real = await realpath(/*turbopackIgnore: true*/ target);
  } catch {
    return 'missing';
  }
  return real.startsWith(root + path.sep) ? real : null;
}

/**
 * 원본 파일(내 컴퓨터 미리보기) — 줄인 한 구간(original.ts normalizeRange)을 그대로 읽어 206 으로. 저장소의 Range 동작을 흉내 낸다.
 * 폴더 안의 assets/ 아래 파일만.
 */
export function localAssetFetch(dir: string): AssetFetch {
  return async (key, range) => {
    const none = { get: () => null };
    if (!isReferenceKey(key) || !key.startsWith(ASSET_PREFIX)) return { status: 400, headers: none, body: null };
    const real = await confined(dir, key);
    if (real === null) return { status: 400, headers: none, body: null };
    if (real === 'missing') return { status: 404, headers: none, body: null };
    const st = await stat(/*turbopackIgnore: true*/ real);
    if (!st.isFile()) return { status: 404, headers: none, body: null };
    const size = st.size;
    const headersOf = (h: Record<string, string>) => ({ get: (n: string) => h[n.toLowerCase()] ?? null });
    const m = range ? /^bytes=(\d*)-(\d*)$/.exec(range) : null;
    if (!m) {
      const body = Readable.toWeb(createReadStream(/*turbopackIgnore: true*/ real)) as ReadableStream<Uint8Array>;
      return { status: 200, headers: headersOf({ 'content-length': String(size) }), body };
    }
    let start: number;
    let end: number;
    if (m[1] === '') {
      start = Math.max(0, size - Number(m[2]));
      end = size - 1;
    } else {
      start = Number(m[1]);
      end = m[2] === '' ? size - 1 : Math.min(Number(m[2]), size - 1);
    }
    if (size === 0 || start >= size || start > end) return { status: 416, headers: headersOf({ 'content-range': `bytes */${size}` }), body: null };
    const body = Readable.toWeb(createReadStream(/*turbopackIgnore: true*/ real, { start, end })) as ReadableStream<Uint8Array>;
    return { status: 206, headers: headersOf({ 'content-range': `bytes ${start}-${end}/${size}`, 'content-length': String(end - start + 1) }), body };
  };
}

/** 폴더 하나 안에서만 읽는다 — 폴더 밖을 가리키는 열쇠 · 바로가기(symlink)는 거절 */
export function localSource(dir: string): ReferenceSource {
  return {
    async read(key, maxBytes): Promise<SourceRead> {
      if (!isReferenceKey(key)) return { ok: false, reason: 'unavailable' };
      try {
        const real = await confined(dir, key);
        if (real === null) return { ok: false, reason: 'unavailable' };
        if (real === 'missing') return { ok: false, reason: 'missing' };
        const st = await stat(/*turbopackIgnore: true*/ real);
        if (!st.isFile()) return { ok: false, reason: 'missing' };
        if (st.size > maxBytes) return { ok: false, reason: 'too_large' };
        return { ok: true, text: await readFile(/*turbopackIgnore: true*/ real, 'utf8') };
      } catch {
        return { ok: false, reason: 'unavailable' };
      }
    },
  };
}
