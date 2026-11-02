import { Directory, File, Paths } from 'expo-file-system';
import type { FsAdapter } from '~/compare/storage';

/**
 * 비교 문서 파일 손잡이 — 앱 문서 폴더의 `compare/<계정>/`(iCloud 백업 대상, 캐시가 아니라 시스템이 지우지 않는다).
 * 계정 번호는 폴더 이름으로 쓸 수 있는 글자만(다른 글자는 '_') — 다른 계정의 폴더를 읽지 않는다.
 */
export function compareFs(ownerId: string): FsAdapter {
  const safe = ownerId.replace(/[^A-Za-z0-9_-]/g, '_').slice(0, 80) || '_';
  const dir = new Directory(Paths.document, 'compare', safe);
  const ensure = () => {
    if (!dir.exists) dir.create({ intermediates: true, idempotent: true });
  };
  const file = (name: string) => new File(dir, name);
  return {
    async read(name) {
      const f = file(name);
      return f.exists ? await f.text() : null;
    },
    async write(name, text) {
      ensure();
      const f = file(name);
      if (!f.exists) f.create({ overwrite: true });
      await f.write(text);
    },
    async move(from, to) {
      const src = file(from);
      if (!src.exists) throw new Error('nofile');
      await src.move(file(to), { overwrite: true });
    },
    async remove(name) {
      const f = file(name);
      if (f.exists) f.delete();
    },
    async list() {
      if (!dir.exists) return [];
      return dir.list().filter((x): x is File => x instanceof File).map((f) => f.name);
    },
  };
}
