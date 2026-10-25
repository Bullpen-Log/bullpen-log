/**
 * 앱이 웹에 보낸 이동과 웹의 '그렸어요' 알림('path')을 짝짓는다 — 앱 껍데기(app/index.tsx)가 쓴다. 순수(시험: scripts/native-web-route-selftest.mts).
 *
 * 왜: 탭을 A → B 로 빨리 옮기면 A 의 알림이 B 를 고른 뒤에 늦게 와서 화면 · 탭 불이 A 로 돌아갔다가 B 로 다시 갔다(2026-10-25 화면 전환 점검).
 * 웹은 이동을 받은 차례대로 알린다(postMessage 는 차례가 지켜진다). 그래서
 * - 보낸 이동 중 마지막 것의 답 → 반영
 * - 더 새 이동이 아직 가는 중인데 옛 이동의 답 → 무시(그 이동까지는 끝난 것으로 지운다)
 * - 보낸 적 없는 곳 → 사이트가 다른 곳으로 보냈다(잠금이면 첫 설정 · 로그인 풀림이면 로그인) 또는 웹 안에서 옮겼다. 기다리는 이동이 하나면 그 답으로
 *   보고 반영, 여럿이면 가장 오래된 이동의 답으로 보고 무시.
 * 웹이 이미 그 자리면 알림이 안 온다(주소가 안 바뀜) — send 가 false 를 돌려 기다리지 않게 한다.
 * 알림을 영영 못 받는 이동(웹 다리가 없는 화면 등)은 8초 뒤 잊는다.
 */
export type WebLoc = { path: string; search: string };

const FORGET_MS = 8000;
const KEEP = 6;

export const locOf = (href: string): WebLoc => {
  const [path, search = ''] = href.split('?');
  return { path: path || '/', search };
};

/** 받은 곳이 보낸 곳인가 — 길이 같고, 보낸 ? 값이 다 들어 있으면(웹이 값을 더 붙여도 같은 곳) */
export function sameLoc(got: WebLoc, want: WebLoc): boolean {
  if (got.path !== want.path) return false;
  const g = new URLSearchParams(got.search);
  for (const [k, v] of new URLSearchParams(want.search)) if (g.get(k) !== v) return false;
  return true;
}

export type Arrival = 'apply' | 'stale';

export function createWebRoute(now: () => number = Date.now) {
  let sent: { loc: WebLoc; at: number }[] = [];
  /** 웹이 마지막으로 알린 자리 */
  let here: WebLoc | null = null;
  const prune = () => {
    const t = now();
    sent = sent.filter((s) => t - s.at < FORGET_MS);
  };
  return {
    /** 웹이 지금 그 자리인가(가는 중인 이동 없이) — 그러면 옮겨도 알림이 안 온다 */
    at(href: string): boolean {
      prune();
      return !sent.length && here != null && sameLoc(here, locOf(href));
    },
    /** 앱이 웹을 옮긴다 — 알림을 기다려야 하면 true(웹이 이미 그 자리면 false) */
    send(href: string): boolean {
      prune();
      const loc = locOf(href);
      if (!sent.length && here && sameLoc(here, loc)) return false;
      sent.push({ loc, at: now() });
      if (sent.length > KEEP) sent.shift();
      return true;
    },
    /** 웹이 그렸다 — 화면에 반영할지 */
    arrive(loc: WebLoc): Arrival {
      here = loc;
      prune();
      if (!sent.length) return 'apply';
      const i = sent.findIndex((s) => sameLoc(loc, s.loc));
      if (i === sent.length - 1) {
        sent = [];
        return 'apply';
      }
      if (i >= 0) {
        sent = sent.slice(i + 1);
        return 'stale';
      }
      if (sent.length === 1) {
        sent = [];
        return 'apply';
      }
      sent = sent.slice(1);
      return 'stale';
    },
    /** 아직 답을 못 받은 이동이 있나 */
    waiting(): boolean {
      prune();
      return sent.length > 0;
    },
    /** 웹뷰를 새로 만들 때(다시 불러오기 · 프로세스 죽음) */
    reset() {
      sent = [];
      here = null;
    },
  };
}
