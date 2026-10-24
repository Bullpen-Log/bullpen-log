import 'server-only';

/**
 * 덕아웃 홈의 '야구 소식'(2026-10-23 금윤호: "메인 홈에서 야구 소식, 경기 결과, 야구 뉴스가 뜨게") — 서버에서만 읽고 몇 분씩 기억해 둔다.
 *
 * 경기 결과 · 일정: 네이버 스포츠 일정(api-gw.sports.naver.com/schedule/games, KBO · MLB · NPB) — 공식 공개 API 가 아니다. 모양이 바뀌거나 막히면 빈 목록을 돌려주고
 *   화면은 그 칸을 숨긴다(홈이 깨지지 않게). 점수 · 팀 이름 같은 사실만 쓰고 팀 엠블럼 그림은 가져오지 않는다(우리 색 원으로 그림).
 * 뉴스: 네이버 검색 API(공식, developers.naver.com — 열쇠 NAVER_CLIENT_ID · NAVER_CLIENT_SECRET). 열쇠가 없으면 null → 뉴스 칸을 숨긴다.
 *   제목 · 언론사 · 시각 · 원문 링크만 쓴다(본문은 옮기지 않는다).
 * Google 뉴스 RSS 는 '개인 · 비상업 읽기 전용' 약관이라 쓰지 않는다.
 */

export type League = 'kbo' | 'mlb' | 'npb';
export const LEAGUES: { key: League; label: string }[] = [
  { key: 'kbo', label: 'KBO' },
  { key: 'mlb', label: 'MLB' },
  { key: 'npb', label: 'NPB' },
];
export function isLeague(v: unknown): v is League {
  return LEAGUES.some((l) => l.key === v);
}

export type Game = {
  id: string;
  league: League;
  /** 'YYYY-MM-DD' (한국 시각) */
  date: string;
  /** 'HH:MM' (한국 시각) */
  time: string;
  away: { code: string; name: string; score: number | null; starter: string | null };
  home: { code: string; name: string; score: number | null; starter: string | null };
  status: 'before' | 'live' | 'result' | 'cancel';
  /** '9회말' · '연기' 같은 네이버 표시 그대로 */
  info: string;
  winner: 'home' | 'away' | 'draw' | null;
  stadium: string | null;
  /** 끝난 경기의 승 · 패 투수 */
  winPitcher: string | null;
  losePitcher: string | null;
};

export type NewsItem = { title: string; url: string; source: string; at: string };

const GAMES_REVALIDATE = 300;
const NEWS_REVALIDATE = 600;
const TIMEOUT_MS = 5000;

const CATEGORY: Record<League, string> = {
  kbo: 'upperCategoryId=kbaseball&categoryId=kbo',
  mlb: 'upperCategoryId=wbaseball&categoryId=mlb',
  npb: 'upperCategoryId=wbaseball&categoryId=npb',
};

/** 한국 날짜 'YYYY-MM-DD' — 오늘에서 offsetDays 만큼 */
export function kstDateKey(offsetDays = 0): string {
  const d = new Date(Date.now() + 9 * 3_600_000 + offsetDays * 86_400_000);
  return d.toISOString().slice(0, 10);
}

/** 'YYYY-MM-DD' 에 날 수를 더한다 */
export function addDays(key: string, n: number): string {
  const d = new Date(`${key}T00:00:00Z`);
  d.setUTCDate(d.getUTCDate() + n);
  return d.toISOString().slice(0, 10);
}

async function fetchJson(url: string, init: RequestInit & { next?: { revalidate: number } }) {
  const ctl = new AbortController();
  const t = setTimeout(() => ctl.abort(), TIMEOUT_MS);
  try {
    const res = await fetch(url, { ...init, signal: ctl.signal });
    if (!res.ok) return null;
    return (await res.json()) as unknown;
  } catch {
    return null;
  } finally {
    clearTimeout(t);
  }
}

type RawGame = {
  gameId?: string;
  gameDateTime?: string;
  stadium?: string | null;
  homeTeamCode?: string;
  homeTeamName?: string;
  homeTeamScore?: number;
  awayTeamCode?: string;
  awayTeamName?: string;
  awayTeamScore?: number;
  winner?: string;
  statusCode?: string;
  statusInfo?: string;
  cancel?: boolean;
  homeStarterName?: string | null;
  awayStarterName?: string | null;
  winPitcherName?: string | null;
  losePitcherName?: string | null;
};

const name = (v: string | null | undefined) => (v && v.trim() ? v.trim() : null);

function toGame(g: RawGame, league: League): Game | null {
  if (!g.gameId || !g.gameDateTime || !g.homeTeamName || !g.awayTeamName) return null;
  const cancel = g.cancel === true || g.statusCode === 'CANCEL';
  const status: Game['status'] = cancel
    ? 'cancel'
    : g.statusCode === 'RESULT'
      ? 'result'
      : g.statusCode === 'STARTED'
        ? 'live'
        : 'before';
  const scored = status === 'result' || status === 'live';
  return {
    id: g.gameId,
    league,
    date: g.gameDateTime.slice(0, 10),
    time: g.gameDateTime.slice(11, 16),
    away: {
      code: g.awayTeamCode ?? '',
      name: g.awayTeamName,
      score: scored ? (g.awayTeamScore ?? 0) : null,
      starter: name(g.awayStarterName),
    },
    home: {
      code: g.homeTeamCode ?? '',
      name: g.homeTeamName,
      score: scored ? (g.homeTeamScore ?? 0) : null,
      starter: name(g.homeStarterName),
    },
    status,
    info: g.statusInfo ?? '',
    winner:
      status !== 'result' ? null : g.winner === 'HOME' ? 'home' : g.winner === 'AWAY' ? 'away' : 'draw',
    stadium: name(g.stadium),
    winPitcher: status === 'result' ? name(g.winPitcherName) : null,
    losePitcher: status === 'result' ? name(g.losePitcherName) : null,
  };
}

/** 한 리그의 [from, to] 경기(한국 날짜) — 시각 차례. 실패하면 빈 목록 */
export async function loadGames(league: League, from: string, to: string): Promise<Game[]> {
  const url =
    `https://api-gw.sports.naver.com/schedule/games?fields=basic,schedule,baseball&${CATEGORY[league]}` +
    `&fromDate=${from}&toDate=${to}&size=200`;
  const json = (await fetchJson(url, {
    headers: { 'User-Agent': 'Mozilla/5.0', Referer: 'https://m.sports.naver.com/' },
    next: { revalidate: GAMES_REVALIDATE },
  })) as { result?: { games?: RawGame[] } } | null;
  return (json?.result?.games ?? [])
    .map((g) => toGame(g, league))
    .filter((g): g is Game => !!g)
    .sort((a, b) => `${a.date}${a.time}`.localeCompare(`${b.date}${b.time}`));
}

/**
 * 홈의 작은 경기 칸(2026-10-24 금윤호: "하루 전 경기 · 오늘 · 내일 예정 경기까지만, 예정 경기는 선발투수, NPB 도") — 리그마다 어제 · 오늘 · 내일.
 */
export async function loadHomeGames(): Promise<Record<League, Game[]>> {
  const from = kstDateKey(-1);
  const to = kstDateKey(1);
  const [kbo, mlb, npb] = await Promise.all(LEAGUES.map((l) => loadGames(l.key, from, to)));
  return { kbo, mlb, npb };
}

const SOURCES: [RegExp, string][] = [
  [/yna\.co\.kr/, '연합뉴스'],
  [/newsis\.com/, '뉴시스'],
  [/news1\.kr/, '뉴스1'],
  [/osen\.co\.kr/, 'OSEN'],
  [/sportsseoul\.com/, '스포츠서울'],
  [/sports\.chosun\.com|sportschosun/, '스포츠조선'],
  [/sports\.donga\.com/, '스포츠동아'],
  [/isplus\.com/, '일간스포츠'],
  [/starnewskorea\.com/, '스타뉴스'],
  [/mydaily\.co\.kr/, '마이데일리'],
  [/xportsnews\.com/, '엑스포츠뉴스'],
  [/spotvnews\.co\.kr/, 'SPOTV뉴스'],
  [/sportalkorea\.com/, '스포탈코리아'],
  [/mk\.co\.kr/, '매일경제'],
  [/hankyung\.com/, '한국경제'],
  [/chosun\.com/, '조선일보'],
  [/joongang\.co\.kr/, '중앙일보'],
  [/donga\.com/, '동아일보'],
  [/hani\.co\.kr/, '한겨레'],
  [/naver\.com/, '네이버 뉴스'],
];

function sourceOf(url: string): string {
  const hit = SOURCES.find(([re]) => re.test(url));
  if (hit) return hit[1];
  try {
    return new URL(url).hostname.replace(/^www\./, '');
  } catch {
    return '';
  }
}

function plain(html: string): string {
  return html
    .replace(/<[^>]*>/g, '')
    .replace(/&quot;/g, '"')
    .replace(/&#39;|&apos;/g, "'")
    .replace(/&lt;/g, '<')
    .replace(/&gt;/g, '>')
    .replace(/&amp;/g, '&')
    .trim();
}

/** 야구 뉴스(최신순) — 네이버 검색 API 열쇠가 없으면 null(칸을 숨긴다) */
export async function loadBaseballNews(n = 8): Promise<NewsItem[] | null> {
  const id = process.env.NAVER_CLIENT_ID;
  const secret = process.env.NAVER_CLIENT_SECRET;
  if (!id || !secret) return null;
  const q = encodeURIComponent('프로야구');
  const json = (await fetchJson(
    `https://openapi.naver.com/v1/search/news.json?query=${q}&display=${Math.min(n * 2, 30)}&sort=date`,
    {
      headers: { 'X-Naver-Client-Id': id, 'X-Naver-Client-Secret': secret },
      next: { revalidate: NEWS_REVALIDATE },
    }
  )) as { items?: { title?: string; originallink?: string; link?: string; pubDate?: string }[] } | null;
  if (!json) return [];
  const seen = new Set<string>();
  const out: NewsItem[] = [];
  for (const it of json.items ?? []) {
    const title = plain(it.title ?? '');
    const url = it.originallink || it.link || '';
    const at = it.pubDate ? new Date(it.pubDate) : null;
    if (!title || !url.startsWith('http') || !at || Number.isNaN(at.getTime())) continue;
    /* 같은 기사가 여러 매체로 — 제목 앞 20자가 같으면 하나만 */
    const key = title.replace(/\s/g, '').slice(0, 20);
    if (seen.has(key)) continue;
    seen.add(key);
    out.push({ title, url, source: sourceOf(url), at: at.toISOString() });
    if (out.length >= n) break;
  }
  return out;
}
