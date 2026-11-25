import type { WikiArticle } from '@/lib/wiki/types';

/**
 * 본문 속 낯선 말 찾기 — 정해 둔 글(설명 문단)의 글자 한 덩어리에만 쓴다. 화면 전체 · HTML 을 바꾸지 않는다.
 *
 * 돌려주는 조각을 차례로 이으면 넣은 글과 한 글자도 다르지 않다(원문 그대로). 링크는 조각 위에 화면이 씌운다.
 *
 * - 긴 이름부터 본다('저항 밴드'가 '밴드'보다 먼저).
 * - 영어는 앞뒤가 영문자 · 숫자가 아니어야(대소문자 무시). 'isometric' 이 'isometrics' 안에서 걸리지 않는다.
 * - 한국어는 앞 글자가 글자 · 숫자가 아니어야('데드리프트' 안의 '드리프트'는 안 걸림), 뒤는 끝 · 공백 · 문장부호 또는
 *   검토한 조사(을 · 를 · 이 · 가 · 에서 …) 다음에 끝이어야.
 * - 뜻이 여럿인 말(drop · 드롭 · hold · set …)은 글의 autoLink 에 없어 저절로 걸리지 않는다. 화면이 explicit 으로 글 번호를 주면 그 말만 걸린다.
 * - 한 문단에서 같은 글은 한 번만, 전체 링크는 maxLinks 개까지 — 읽는 흐름을 끊지 않게.
 */

export type WikiTermIndexEntry = { term: string; id: string; latin: boolean; pattern: RegExp };

export type WikiProseSegment = { text: string; id?: undefined } | { text: string; id: string; term: string };

/** 한국어 낱말 뒤에 붙어도 되는 조사 · 어미(검토 목록). 긴 것부터 */
export const KOREAN_PARTICLES: readonly string[] = [
  '이라고', '이라는', '이에요', '에서는', '으로는', '에서도', '으로도', '이나', '이랑', '이고', '이며', '이에', '이다', '라고', '라는', '예요',
  '에서', '으로', '까지', '부터', '처럼', '보다', '에게', '하고', '만큼', '와', '과', '을', '를', '이', '가', '은', '는', '에', '로', '의', '도', '만', '나', '랑',
];

/* 글자 · 숫자 — 앱(Hermes)에서도 같게 돌도록 \p{…} 대신 범위로 적는다(라틴 · 그리스 · 키릴 · 가나 · 한자 · 한글) */
const WORD = /[0-9A-Za-zÀ-ɏͰ-ϿЀ-ӿ぀-ヿㄱ-ㆎ一-鿿가-힣]/;
const LATIN_WORD = /[A-Za-z0-9]/;

function escape(s: string) {
  return s.replace(/[.*+?^${}()|[\]\\]/g, '\\$&');
}

/** 이름 하나를 찾는 식 — 띄어쓰기는 한 칸 이상 공백, 붙임표는 붙임표 · 공백 · 없음 모두 */
function termPattern(term: string): RegExp {
  const body = term
    .trim()
    .split(/(\s+|-)/)
    .map((p) => (/^\s+$/.test(p) ? '\\s+' : p === '-' ? '[-\\s]?' : escape(p)))
    .join('');
  return new RegExp(body, 'iy');
}

export function buildTermIndex(articles: readonly WikiArticle[]): WikiTermIndexEntry[] {
  const entries: WikiTermIndexEntry[] = [];
  for (const a of articles) {
    for (const term of a.autoLink) entries.push({ term, id: a.id, latin: !/[^\x00-\x7F]/.test(term), pattern: termPattern(term) });
  }
  return entries.sort((x, y) => y.term.length - x.term.length || x.term.localeCompare(y.term) || x.id.localeCompare(y.id));
}

function leftOk(text: string, i: number, latin: boolean) {
  if (i === 0) return true;
  const prev = text[i - 1];
  return latin ? !LATIN_WORD.test(prev) : !WORD.test(prev);
}

/** 끝 위치 j 뒤가 낱말 경계인가(한국어는 검토한 조사 하나 뒤의 경계까지 허용) */
function rightOk(text: string, j: number, latin: boolean): boolean {
  if (j >= text.length) return true;
  const next = text[j];
  if (latin) return !LATIN_WORD.test(next);
  if (!WORD.test(next)) return true;
  for (const p of KOREAN_PARTICLES) {
    if (text.startsWith(p, j)) {
      const k = j + p.length;
      if (k >= text.length || !WORD.test(text[k])) return true;
    }
  }
  return false;
}

export type MatchOptions = {
  /** 이 글들은 연결하지 않는다(읽고 있는 글 자신 등) */
  exclude?: readonly string[];
  /** 뜻이 여럿인 말을 이 문단에서만 지정된 글로 연결한다. */
  explicit?: readonly { term: string; id: string }[];
  /** 한 문단에 걸 수 있는 링크 수(기본 3) */
  maxLinks?: number;
};

export function matchWikiTerms(text: string, index: readonly WikiTermIndexEntry[], opts: MatchOptions = {}): WikiProseSegment[] {
  const exclude = new Set(opts.exclude ?? []);
  const max = opts.maxLinks ?? 3;
  const explicit: WikiTermIndexEntry[] = (opts.explicit ?? []).map((x) => ({
    term: x.term,
    id: x.id,
    latin: !/[^\x00-\x7F]/.test(x.term),
    pattern: termPattern(x.term),
  }));
  /* 글 번호를 준 말이 먼저 — 그다음 긴 이름부터 */
  const entries = [...explicit.sort((a, b) => b.term.length - a.term.length), ...index].filter((e) => !exclude.has(e.id));
  const used = new Set<string>();
  const out: WikiProseSegment[] = [];
  let plainStart = 0;
  let links = 0;
  let i = 0;
  while (i < text.length && links < max) {
    let hit: { entry: WikiTermIndexEntry; end: number } | null = null;
    for (const entry of entries) {
      if (used.has(entry.id)) continue;
      if (!leftOk(text, i, entry.latin)) continue;
      entry.pattern.lastIndex = i;
      const m = entry.pattern.exec(text);
      if (!m) continue;
      const end = i + m[0].length;
      if (!rightOk(text, end, entry.latin)) continue;
      hit = { entry, end };
      break;
    }
    if (!hit) {
      i += 1;
      continue;
    }
    if (i > plainStart) out.push({ text: text.slice(plainStart, i) });
    out.push({ text: text.slice(i, hit.end), id: hit.entry.id, term: hit.entry.term });
    used.add(hit.entry.id);
    links += 1;
    i = hit.end;
    plainStart = i;
  }
  if (plainStart < text.length) out.push({ text: text.slice(plainStart) });
  return out;
}
