/**
 * 팀 · 레슨장 영상 재생 주소 기억 · 다시 받기 횟수 — 순수(시험: scripts/native-org-video-selftest.mts). org/video.tsx 가 쓴다.
 *
 * 2026-10-26: 예전엔 경로만으로 주소 문자열을 앱이 켜진 동안 쥐어, 앱을 오래 켜 둔 뒤 재생기를 다시 만들면 죽은 주소를 썼고, 로그아웃 · 다른 사람 ·
 * 다른 조직 범위에서도 같은 주소를 다시 썼다.
 * - 서버 주소 수명은 60분(lib/storage.ts PLAYBACK_TTL_SECONDS)이고 서버가 같은 주소를 30분까지 돌려준다(URL_REUSE_MS) — 받은 주소는 적어도 30분은 산다.
 *   앱은 받은 때부터 KEEP_MS(20분)까지만 쓰고, 그 뒤엔 새로 받는다(그 안에 재생기를 다시 만들어도 10분 넘게 남는다).
 * - 열쇠는 계정 세대 · 범위(코치 = 조직, 선수 = 회원) · 경로 — 로그아웃하면 세대가 올라 앞 계정 주소를 안 쓰고, 권한은 서버가 주소를 줄 때마다 본다.
 * - 재생 중 주소가 죽으면(오류) 새로 받아 이어 튼다 — 한 영상에서 RETRY_MAX 번까지(끝없이 다시 받지 않게). 넘으면 '다시 불러오기'를 누를 때만.
 */
export const KEEP_MS = 20 * 60_000;
export const RETRY_MAX = 2;

export function createUrlCache({ epoch, now = Date.now, keepMs = KEEP_MS }: { epoch: () => number; now?: () => number; keepMs?: number }) {
  const m = new Map<string, { uri: string; at: number }>();
  const key = (scope: string, path: string) => `${epoch()}|${scope}|${path}`;
  return {
    get(scope: string, path: string): string | null {
      const k = key(scope, path);
      const e = m.get(k);
      if (!e) return null;
      if (now() - e.at >= keepMs) {
        m.delete(k);
        return null;
      }
      return e.uri;
    },
    set(scope: string, path: string, uri: string) {
      const t = now();
      /* 지난 것은 둘 때 치운다 */
      for (const [k, e] of m) if (t - e.at >= keepMs) m.delete(k);
      m.set(key(scope, path), { uri, at: t });
    },
    /** 이 주소가 죽었다 — 다음엔 새로 받는다 */
    forget(scope: string, path: string) {
      m.delete(key(scope, path));
    },
  };
}

/** 재생 오류 뒤 저절로 다시 받는 횟수 — 영상 하나(화면에 붙은 동안)마다 */
export function createRetry(max = RETRY_MAX) {
  let used = 0;
  return {
    take(): boolean {
      if (used >= max) return false;
      used++;
      return true;
    },
    /** 사용자가 '다시 불러오기'를 누름 */
    reset() {
      used = 0;
    },
  };
}
