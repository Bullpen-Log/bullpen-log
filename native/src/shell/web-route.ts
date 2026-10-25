/**
 * 앱이 웹에 보낸 이동과 웹의 '그렸어요' 알림('path')을 짝짓는다 — 앱 껍데기(app/index.tsx)가 쓴다. 순수(시험: scripts/native-web-route-selftest.mts).
 *
 * 왜: 탭을 A → B 로 빨리 옮기면 A 의 알림이 B 를 고른 뒤에 늦게 와서 화면 · 탭 불이 A 로 돌아갔다가 B 로 다시 갔다(2026-10-25 화면 전환 점검).
 *
 * 웹은 보낸 이동마다 알리지 않는다 — 라우터가 중간 이동을 버리거나 합치고(A → B → A 면 마지막 A 만 올 수 있다), 판으로 미끄러지면 그 판의 지난
 * 주소(?view=…)를 알리고, 잠금 · 로그인이면 다른 곳으로 보낸다. 그래서 '보낸 차례대로 하나씩 답이 온다'고 보지 않는다(2026-10-26 2차 점검 — 그렇게
 * 보던 첫 판은 마지막 목적지의 답을 옛 요청의 답으로 잘못 보고 기다림을 남겼다):
 * 1. 알림이 마지막 요청과 같은 곳이면 반영 — 앞선 요청들은 '건너뛴 것'(ghost)으로 잠시 기억해, 뒤늦게 그 답이 오면 무시한다.
 * 2. 앞선 요청과 같은 곳이면 옛 답 → 무시(그 요청까지는 끝난 것으로).
 *    같은 곳 = 길이 같고 보낸 ? 값이 다 들어 있음(웹이 값을 더 붙여도). ? 값이 꼭 같은 요청을 먼저 찾는다 — '/videos' 와 '/videos?view=log' 를
 *    둘 다 보냈을 때 '/videos?view=log' 알림은 뒤의 요청 답이다(? 값이 없는 요청은 아무 ? 값이나 받아 앞 요청에 먼저 걸렸다).
 * 3. 보낸 적 없는 곳 → 웹이 실제로 그곳을 보인다(돌려보냄 · 판의 지난 주소 · 웹 안 이동). 웹이 보이는 곳을 따르고 기다림을 끝낸다 — 기다림을 남기면
 *    4초 뒤 껍데기가 웹과 다른 탭을 칠했다. 마지막 요청이 아직 가는 중이면 그 답이 와서 다시 반영된다.
 * 요청 번호를 웹 다리에 실어 짝짓는 방법은 쓰지 않는다 — 웹은 어느 이동이 지금 주소를 낳았는지 모르고(돌려보냄 · 판 미끄러짐), 사이트와 앱이
 * 따로 배포돼 옛 사이트 · 옛 앱과도 돌아야 한다.
 * 웹이 이미 그 자리면 알림이 안 온다(주소가 안 바뀜) — send 가 false 를 돌려 기다리지 않게 한다.
 * 알림을 영영 못 받는 이동(웹 다리가 없는 화면 등)은 8초 뒤 잊는다.
 */
export type WebLoc = { path: string; search: string };

const FORGET_MS = 8000;
/** 건너뛴 요청의 늦은 답을 무시하는 동안 — 웹 안에서 그곳으로 옮긴 것과 헷갈리지 않게 짧게 */
const GHOST_MS = 2000;
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

/** ? 값까지 꼭 같은 곳인가(차례는 따지지 않음) */
const exactLoc = (got: WebLoc, want: WebLoc) => sameLoc(got, want) && sameLoc(want, got);

export type Arrival = 'apply' | 'stale';
type Sent = { loc: WebLoc; at: number };

export function createWebRoute(now: () => number = Date.now) {
  let sent: Sent[] = [];
  let ghosts: Sent[] = [];
  /** 웹이 마지막으로 알린 자리 */
  let here: WebLoc | null = null;
  const prune = () => {
    const t = now();
    sent = sent.filter((s) => t - s.at < FORGET_MS);
    ghosts = ghosts.filter((s) => t - s.at < GHOST_MS);
  };
  /** 뒤에서부터 — 꼭 같은 곳을 먼저, 없으면 ? 값을 더 붙인 곳 */
  const lastMatch = (list: Sent[], loc: WebLoc) => {
    for (let i = list.length - 1; i >= 0; i--) if (exactLoc(loc, list[i].loc)) return i;
    for (let i = list.length - 1; i >= 0; i--) if (sameLoc(loc, list[i].loc)) return i;
    return -1;
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
      const i = lastMatch(sent, loc);
      /* 앞선 요청들은 웹이 건너뛰었을 수 있다 — 늦게 그 답이 오면 무시하게 잠시 둔다 */
      const skip = () => ghosts.push(...sent.slice(0, i).map((s) => ({ loc: s.loc, at: now() })));
      if (i >= 0 && i === sent.length - 1) {
        skip();
        sent = [];
        return 'apply';
      }
      if (i >= 0) {
        skip();
        sent = sent.slice(i + 1);
        return 'stale';
      }
      const g = lastMatch(ghosts, loc);
      if (g >= 0) {
        ghosts.splice(g, 1);
        return 'stale';
      }
      /* 보낸 적 없는 곳 — 웹이 실제로 보이는 곳을 따른다 */
      sent = [];
      ghosts = [];
      return 'apply';
    },
    /** 아직 답을 못 받은 이동이 있나 */
    waiting(): boolean {
      prune();
      return sent.length > 0;
    },
    /** 웹뷰를 새로 만들 때(다시 불러오기 · 프로세스 죽음) */
    reset() {
      sent = [];
      ghosts = [];
      here = null;
    },
  };
}
