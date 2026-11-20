import { randomBytes } from 'node:crypto';
import { link, lstat, mkdir, open, readdir, readFile, stat, unlink } from 'node:fs/promises';
import path from 'node:path';
import { OP_FOLDER, OP_NAME } from '@/lib/review-evidence/model';
import type { EvidenceObjectStore, ListItem, ReadResult } from '@/lib/review-evidence/store';

/**
 * EX-REF04 — 내 컴퓨터 미리보기 · 시험용 폴더 저장소('server-only' 없음 — 시험이 같이 쓴다).
 * 운영(NODE_ENV=production)에서는 storage.ts 가 이 갈래를 쓰지 않는다. 폴더 밖 열쇠는 거절한다.
 * 파일 시스템 호출마다 turbopackIgnore 를 단다 — 없으면 빌드가 프로젝트 전체를 서버 묶음에 싣는다(lib/admin-references/local-source.ts 와 같은 방식).
 * '없을 때만 만들기'는 다 쓴 임시 파일을 link 로 제 이름에 붙여서 — 먼저 붙인 하나만 남고, 읽는 쪽은 반쯤 쓴 본문을 보지 않는다.
 * 목록은 저장소 목록 v2 와 같은 약속(이름 차례 + 다음 쪽 표 = 마지막으로 돌려준 이름)이다. 임시 파일(.tmp-)과 하위 폴더는 세지 않는다.
 * 항목을 확인하지 못하면(그새 사라진 파일 말고) 그 쪽은 'unavailable' — 조용히 빼지 않는다.
 */
export function localEvidenceStore(dir: string): EvidenceObjectStore {
  const root = path.resolve(/*turbopackIgnore: true*/ dir);
  const folder = path.join(root, ...OP_FOLDER.split('/'));
  const inside = (key: string): string | null => {
    if (!key.startsWith(OP_FOLDER + '/')) return null;
    const name = key.slice(OP_FOLDER.length + 1);
    if (!OP_NAME.test(name)) return null;
    const p = path.join(folder, name);
    return p.startsWith(folder + path.sep) ? p : null;
  };
  return {
    async createOnly(key, body) {
      const p = inside(key);
      if (!p) return 'error';
      await mkdir(/*turbopackIgnore: true*/ folder, { recursive: true });
      /* 다 쓴 임시 파일을 제 이름으로 '연결'한다(link 는 이미 있으면 실패) — 읽는 쪽이 반쯤 쓴 본문을 보지 않는다 */
      const tmp = path.join(folder, `.tmp-${process.pid}-${randomBytes(8).toString('hex')}`);
      try {
        const fh = await open(/*turbopackIgnore: true*/ tmp, 'wx', 0o600);
        try {
          await fh.writeFile(body, 'utf8');
          await fh.sync();
        } finally {
          await fh.close();
        }
        try {
          await link(/*turbopackIgnore: true*/ tmp, /*turbopackIgnore: true*/ p);
          return 'created';
        } catch (e) {
          return (e as { code?: string }).code === 'EEXIST' ? 'exists' : 'error';
        }
      } catch {
        return 'error';
      } finally {
        await unlink(/*turbopackIgnore: true*/ tmp).catch(() => {});
      }
    },
    async read(key, maxBytes): Promise<ReadResult> {
      const p = inside(key);
      if (!p) return { ok: false, reason: 'missing' };
      try {
        const st = await stat(/*turbopackIgnore: true*/ p);
        if (st.size > maxBytes) return { ok: false, reason: 'too_large' };
        return { ok: true, text: await readFile(/*turbopackIgnore: true*/ p, 'utf8') };
      } catch (e) {
        return { ok: false, reason: (e as { code?: string }).code === 'ENOENT' ? 'missing' : 'unavailable' };
      }
    },
    async list(cursor, limit) {
      let names: string[];
      try {
        names = await readdir(/*turbopackIgnore: true*/ folder);
      } catch (e) {
        if ((e as { code?: string }).code === 'ENOENT') return { ok: true, items: [], nextCursor: null, hasNext: false };
        return { ok: false, reason: 'unavailable' };
      }
      /* 이름 차례(글자 단위) — 다음 쪽 표(cursor)보다 큰 이름만. 묻는 사이에 생긴 파일도 표 뒤에 있으면 나온다 */
      const after = names.filter((n) => !n.startsWith('.tmp-') && (cursor === null || n > cursor)).sort((a, b) => (a < b ? -1 : a > b ? 1 : 0));
      const items: ListItem[] = [];
      let i = 0;
      for (; i < after.length && items.length < limit; i++) {
        const name = after[i];
        const p = path.join(folder, name);
        try {
          const st = await stat(/*turbopackIgnore: true*/ p);
          if (st.isFile()) items.push({ name, size: st.size, etag: String(st.mtimeMs) });
        } catch (e) {
          /*
           * 그새 사라진 파일만 건너뛴다(그 이름 자체가 없음 — lstat 으로 한 번 더 확인).
           * 그 밖의 실패(권한 · 고리 링크 · 가리키는 곳이 없는 링크 · 입출력)는 조용히 빼지 않고 이 쪽 전체를 실패로 돌린다 —
           * 빼면 목록이 '다 모았다'면서 기록을 잃는다. 실패한 쪽은 store.ts 가 몇 번 다시 묻고, 그래도 안 되면 전체 실패.
           */
          if ((e as { code?: string }).code !== 'ENOENT') return { ok: false, reason: 'unavailable' };
          try {
            await lstat(/*turbopackIgnore: true*/ p);
            return { ok: false, reason: 'unavailable' };
          } catch (le) {
            if ((le as { code?: string }).code !== 'ENOENT') return { ok: false, reason: 'unavailable' };
          }
        }
      }
      /* 한도를 채워 멈췄으면 남은 이름이 있다 — 그때 마지막으로 본 이름 = 마지막으로 돌려준 이름이 다음 쪽 표 */
      const hasNext = i < after.length;
      return { ok: true, items, nextCursor: hasNext ? (after[i - 1] ?? null) : null, hasNext };
    },
  };
}
