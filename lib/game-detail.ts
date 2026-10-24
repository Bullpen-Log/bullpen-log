import 'server-only';
import { fetchJson, isLeague, toGame, type Game, type League, type RawGame } from '@/lib/baseball-feed';

/**
 * 경기 하나의 자세한 기록(2026-10-24 금윤호: "경기를 선택했을 때 들어가서 그 경기의 기록을 자세히") — 화면은 app/(dugout)/baseball/[id].
 * 네이버 스포츠 경기 정보(/schedule/games/{id}) + 기록(/record). 공식 공개 API 가 아니라 모양이 바뀌거나 막히면 빈 칸으로(화면은 '기록이 아직 없어요').
 * KBO 는 이닝별 점수 · R H E B · 주요 기록(결승타 · 홈런 …)까지, MLB · NPB 는 타자 · 투수 · 안타 · 실책 합계만 준다 — 두 모양을 하나로 맞춘다.
 */
export type BatterLine = {
  order: string;
  name: string;
  pos: string;
  ab: number;
  run: number;
  hit: number;
  rbi: number;
  hr: number;
  bb: number;
  so: number;
  avg: string;
};
export type PitcherLine = {
  name: string;
  result: string;
  inn: string;
  hit: number;
  run: number;
  er: number;
  bb: number;
  so: number;
  hr: number;
  era: string;
};
export type TeamTotals = { r: number | null; h: number | null; e: number | null; b: number | null };
export type GameDetail = {
  game: Game;
  /** 이닝별 점수(KBO) — 없으면 null */
  innings: { away: (number | null)[]; home: (number | null)[] } | null;
  totals: { away: TeamTotals; home: TeamTotals } | null;
  batters: { away: BatterLine[]; home: BatterLine[] };
  pitchers: { away: PitcherLine[]; home: PitcherLine[] };
  /** 결승타 · 홈런 · 2루타 · 심판 … */
  notes: { label: string; text: string }[];
};

const REVALIDATE = 60;
const HEADERS = { 'User-Agent': 'Mozilla/5.0', Referer: 'https://m.sports.naver.com/' };

export function isGameId(v: string): boolean {
  return /^[A-Za-z0-9]{8,32}$/.test(v);
}

const num = (v: unknown): number => (typeof v === 'number' ? v : Number(v) || 0);
const str = (v: unknown): string => (v == null ? '' : String(v));

type Raw = Record<string, unknown>;

function batter(b: Raw): BatterLine {
  return {
    order: str(b.batOrder),
    name: str(b.name),
    pos: str(b.posName ?? b.pos),
    ab: num(b.ab),
    run: num(b.run),
    hit: num(b.hit),
    rbi: num(b.rbi),
    hr: num(b.hr),
    bb: num(b.bb),
    so: num(b.so ?? b.kk),
    avg: str(b.hra ?? b.avg),
  };
}
function pitcher(p: Raw): PitcherLine {
  return {
    name: str(p.name),
    result: str(p.wls),
    inn: str(p.inn),
    hit: num(p.hit),
    run: num(p.r),
    er: num(p.er),
    bb: num(p.bb),
    so: num(p.so ?? p.kk),
    hr: num(p.hr),
    era: str(p.era),
  };
}
const list = (v: unknown): Raw[] => (Array.isArray(v) ? (v as Raw[]) : []);

export async function loadGameDetail(id: string): Promise<GameDetail | null> {
  if (!isGameId(id)) return null;
  const base = `https://api-gw.sports.naver.com/schedule/games/${id}`;
  const [info, record] = await Promise.all([
    fetchJson(base, { headers: HEADERS, next: { revalidate: REVALIDATE } }) as Promise<{
      result?: { game?: RawGame & { categoryId?: string } };
    } | null>,
    fetchJson(`${base}/record`, { headers: HEADERS, next: { revalidate: REVALIDATE } }) as Promise<{
      result?: { recordData?: Raw };
    } | null>,
  ]);
  const raw = info?.result?.game;
  if (!raw) return null;
  const league: League = isLeague(raw.categoryId) ? raw.categoryId : 'kbo';
  const game = toGame(raw, league);
  if (!game) return null;
  const r = record?.result?.recordData ?? {};

  /* KBO 모양 */
  const sb = r.scoreBoard as { inn?: { away?: unknown[]; home?: unknown[] }; rheb?: Record<'away' | 'home', Raw> } | undefined;
  const box = r.battersBoxscore as Record<string, unknown> | undefined;
  const pbox = r.pitchersBoxscore as Record<string, unknown> | undefined;
  /* MLB · NPB 모양 */
  const keyAway = r.awayKeyStat as Raw | undefined;
  const keyHome = r.homeKeyStat as Raw | undefined;

  const innNum = (v: unknown) => (v === '' || v == null || v === '-' ? null : num(v));
  const innings =
    sb?.inn && Array.isArray(sb.inn.away) && Array.isArray(sb.inn.home)
      ? { away: sb.inn.away.map(innNum), home: sb.inn.home.map(innNum) }
      : null;
  const totals = sb?.rheb
    ? {
        away: { r: num(sb.rheb.away?.r), h: num(sb.rheb.away?.h), e: num(sb.rheb.away?.e), b: num(sb.rheb.away?.b) },
        home: { r: num(sb.rheb.home?.r), h: num(sb.rheb.home?.h), e: num(sb.rheb.home?.e), b: num(sb.rheb.home?.b) },
      }
    : keyAway && keyHome
      ? {
          away: { r: game.away.score, h: num(keyAway.hit), e: num(keyAway.err), b: null },
          home: { r: game.home.score, h: num(keyHome.hit), e: num(keyHome.err), b: null },
        }
      : null;

  return {
    game,
    innings,
    totals,
    batters: {
      away: list(box?.away ?? r.awayBatter).map(batter),
      home: list(box?.home ?? r.homeBatter).map(batter),
    },
    pitchers: {
      away: list(pbox?.away ?? r.awayPitcher).map(pitcher),
      home: list(pbox?.home ?? r.homePitcher).map(pitcher),
    },
    notes: list(r.etcRecords)
      .map((n) => ({ label: str(n.how), text: str(n.result) }))
      .filter((n) => n.label && n.text),
  };
}
