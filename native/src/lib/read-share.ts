/**
 * 같은 읽기를 겹쳐 부르면 하나로 — lib/rpc.ts 가 읽기(load · fetch · get) 마다 쓴다. 순수(시험: scripts/native-read-share-selftest.mts).
 * 가는 중인 읽기가 떠난 뒤에 쓰기가 있었으면(wrote) 합치지 않고 새로 부른다 — 저장 직후 옛 값을 받지 않게.
 */
export function createReadShare() {
  const going = new Map<string, { gen: number; p: Promise<unknown> }>();
  let gen = 0;
  return {
    /** 서버에 썼다 */
    wrote() {
      gen++;
    },
    run<T>(key: string, start: () => Promise<T>): Promise<T> {
      const g = going.get(key);
      if (g && g.gen === gen) return g.p as Promise<T>;
      const p: Promise<T> = start().finally(() => {
        if (going.get(key)?.p === p) going.delete(key);
      });
      going.set(key, { gen, p });
      return p;
    },
  };
}
