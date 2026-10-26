/**
 * 화면 읽기(community/parts.tsx useLoad)의 요청 차례 · 계정 세대 · 받아 둔 값 — 순수(시험: scripts/native-load-core-selftest.mts).
 *
 * 2026-10-26 점검에서 찾은 것:
 * - 계정이 바뀐 뒤 앞 계정의 늦은 답이 받아 둔 값에 들어가, 다음 계정이 같은 목록을 열면 앞사람 것이 보일 수 있었다(받아 둔 값에 '답이 온 때'의 세대를
 *   붙였다). 요청을 시작한 때의 세대를 쥐고, 답이 올 때 세대가 다르면 화면에도 받아 둔 값에도 안 쓴다.
 * - 같은 인자로 두 번 부르면(돌아올 때 새로 받기 + 당겨서 새로고침) 늦게 시작한 요청의 답이 먼저 오고 앞 요청의 답이 뒤에 와 화면이 옛 값으로
 *   돌아갔다(인자만 견줬다). 요청마다 번호를 붙여 화면은 마지막에 시작한 요청의 답(성공 · 실패 모두)만, 받아 둔 값은 더 늦게 시작한 요청이 이미
 *   쓴 것을 덮지 않는다.
 * - 화면을 닫은 뒤 끝난 새로고침은 화면에 안 쓴다(close).
 */
export type Token = { readonly n: number; readonly epoch: number };

/** 받아 둔 값(앱을 켠 동안 · 같은 로그인) — action + 인자마다 */
export function createLoadCache<D>({ epoch, lastWriteAt, now = Date.now }: { epoch: () => number; lastWriteAt: () => number; now?: () => number }) {
  const seen = new Map<string, { epoch: number; n: number; at: number; data: D }>();
  let order = 0;
  return {
    /** 요청을 시작한다 — 번호와 지금 계정 세대 */
    start(): Token {
      return { n: ++order, epoch: epoch() };
    },
    /** 받은 값을 둔다 — 계정 세대가 그대로이고, 더 늦게 시작한 요청이 이미 둔 값이 없을 때만 */
    remember(key: string, t: Token, data: D): boolean {
      if (t.epoch !== epoch()) return false;
      const cur = seen.get(key);
      if (cur && cur.epoch === t.epoch && cur.n > t.n) return false;
      seen.set(key, { epoch: t.epoch, n: t.n, at: now(), data });
      return true;
    },
    /** 받아 둔 값 — 같은 계정 세대이고, 그 뒤에 서버에 쓴 것이 없을 때만 */
    recall(key: string): D | null {
      const m = seen.get(key);
      return m && m.epoch === epoch() && m.at >= lastWriteAt() ? m.data : null;
    },
  };
}

/** 한 화면의 요청 차례 — 마지막에 시작한 요청 · 같은 계정 세대 · 화면이 붙어 있는 동안만 화면에 쓴다 */
export function createLatest(epoch: () => number) {
  let last = 0;
  let open = true;
  return {
    begin(t: Token) {
      last = t.n;
    },
    current(t: Token): boolean {
      return open && t.n === last && t.epoch === epoch();
    },
    /** 화면이 닫힘 — 그 뒤에 오는 답은 버린다 */
    close() {
      open = false;
    },
    /** 다시 붙음(개발 모드의 효과 두 번 돌기) */
    reopen() {
      open = true;
    },
  };
}
