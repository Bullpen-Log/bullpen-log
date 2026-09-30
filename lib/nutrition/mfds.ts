import 'server-only';
import { unstable_cache } from 'next/cache';
import type { Food } from '@/lib/nutrition/meta';
import { pageOf, toFood, type MfdsItem } from '@/lib/nutrition/mfds-parse';
import {
  firstRound,
  rankMfds,
  secondRound,
  type MfdsCall,
} from '@/lib/nutrition/mfds-rank';
import { MFDS_REPS_DATE, findMfdsReps } from '@/lib/nutrition/mfds-reps';
import { mfdsApiKey, mfdsEnabled } from '@/lib/nutrition/mfds-key';

export { mfdsEnabled };

/**
 * 식약처 식품영양성분DB — 공공데이터포털 오픈 API.
 *
 * 음식(찌개·국밥 같은 요리), 가공식품(편의점 도시락·단백질 음료 같은 제품),
 * 원재료(닭가슴살·바나나 같은 재료)를 모두 이름으로 찾는다. 앱의 기본 목록
 * (foods.ts)은 100여 가지뿐이라, 여기서 나머지를 채운다.
 *
 * 인증키가 있어야 한다. 공공데이터포털(data.go.kr)에서 '식품의약품안전처_
 * 식품영양성분DB정보'를 활용신청하면 바로 나온다. 받은 '일반 인증키(Decoding)'를
 * 환경변수 FOOD_API_KEY 에 넣는다(.env 와 Vercel 둘 다). 키가 없으면 이 파일은
 * 빈 목록을 돌려주고, 화면은 기본 목록과 내 음식만으로 돈다.
 *
 * 공공누리 자료라 출처를 밝힌다 — 화면의 검색 결과 밑에 적는다.
 *
 * 주소는 03판이다. 식약처가 2026-09 에 02판을 03판으로 바꿨고, 그 뒤에 받은 키는
 * 02판 주소에서 '등록되지 않은 서비스키'(403, 코드 30)로 거절된다 — 키가 틀린 것처럼
 * 보이지만 주소가 옛것이었다(2026-09-30 확인). 응답 칸(AMT_NUM1 · 3 · 4 · 6, Z10500)은
 * 03판도 같다. 또 거절되면 포털의 API 페이지에서 판 번호부터 본다.
 *
 * ■ 두 군데서 모아 줄 세운다 (2026-09-30)
 *
 * 포털은 이름에 검색어가 든 줄을 DB 순서(음식 → 가공식품 → 원재료)로 준다. 앞 25개만 받던 때는 '바나나'에
 * 도넛 · 마카롱만 나오고 생바나나는 안 나왔다. 무엇을 모으고 어떻게 줄 세울지는 mfds-rank.ts 가 정한다.
 *
 *   품목대표(표준값 8,800줄)  앱에 넣어 둔 것에서 찾는다(mfds-reps.ts) — 바로 나온다.
 *   상품(30만 줄)             포털에 묻는다 — 검색어 1쪽(100줄), 상품 이름 같은 말은 마지막 쪽도.
 *
 * 포털이 느린 까닭(실측): 달라는 줄 수를 채우면 바로 답하고(1초), 못 채우면 DB 끝까지 훑는다(4~6초, 붐비면 더).
 * 그래서 결과가 100줄이 안 되는 말 · 마지막 쪽 · '품목대표만' 같은 거름은 늘 느리다. 품목대표를 넣어 둔 까닭이
 * 이것이고, 화면은 넣어 둔 것부터 먼저 보여 준다(searchMfdsReps) — 포털 몫은 뒤따라온다(searchMfds).
 * 걸리는 시간: 1쪽만 부르는 흔한 말 1~2초, 결과가 적은 말 4~6초, 상품 이름 같은 말(마지막 쪽까지) 8~13초.
 */

const ENDPOINT =
  'https://apis.data.go.kr/1471000/FoodNtrCpntDbInfo03/getFoodNtrCpntDbInq03';

/** 한 쪽의 줄 수 — mfds-rank.ts 의 '마지막 쪽' 셈(ceil(수 / 100))과 짝이다 */
const PAGE_ROWS = 100;

/*
 * 기다리는 시간. 포털은 DB 를 끝까지 훑을 때 4~6초, 여러 호출이 겹치면 그 이상 걸린다(6.5초로 두었을 때
 * '프로틴'의 두 차례가 모두 끊겼다). 두 차례를 다 기다려도 서버 함수의 시간 한도
 * (app/api/nutrition/search 의 maxDuration) 안쪽이게.
 */
const FIRST_TIMEOUT_MS = 9000;
const SECOND_TIMEOUT_MS = 9000;

/** 같은 검색어는 하루 동안 다시 묻지 않는다 — 개발용 키는 하루 호출 수가 정해져 있고 DB 는 드물게 바뀐다 */
const CACHE_SECONDS = 60 * 60 * 24;

/** 맥 · 아이폰에서 온 한글은 자모가 풀려(NFD) 오기도 한다 — 같은 말이 다른 열쇠로 저장되지 않게 */
const cleanQuery = (query: string) =>
  query.normalize('NFC').replace(/\s+/g, ' ').trim();

type Page = { total: number; items: MfdsItem[] };
type PageCall = { term: string; page: number };

const callName = (c: PageCall) => `${c.term}|${c.page}`;

/**
 * 포털에서 한 쪽 받기(거름 없이 이름으로만). 실패하면 null — 까닭은 서버 기록에 남긴다
 * (주소에는 인증키가 들어 있어 주소는 적지 않는다).
 *
 * 포털 응답은 Next 의 fetch 저장에 넣지 않는다. 100줄이 0.3MB 라 크고, 포털이 오류를 200 으로 줄 때
 * 그 오류가 하루 동안 저장돼 버린다. 저장은 다 줄 세운 결과(25줄)로 한다 — 아래 cachedSearch.
 */
async function fetchPage(
  key: string,
  call: PageCall,
  timeoutMs: number
): Promise<Page | null> {
  const url = new URL(ENDPOINT);
  url.searchParams.set('serviceKey', key);
  url.searchParams.set('pageNo', String(call.page));
  url.searchParams.set('numOfRows', String(PAGE_ROWS));
  url.searchParams.set('type', 'json');
  url.searchParams.set('FOOD_NM_KR', call.term);

  try {
    const res = await fetch(url, {
      cache: 'no-store',
      signal: AbortSignal.timeout(timeoutMs),
    });
    if (!res.ok) {
      console.warn(`[mfds] ${callName(call)} — ${res.status} ${res.statusText}`);
      return null;
    }
    const text = await res.text();
    /* 키가 틀리면 json 을 달라고 해도 XML 오류문이 온다 */
    if (!text.trimStart().startsWith('{')) {
      console.warn(
        `[mfds] ${callName(call)} — JSON 이 아닌 응답: ${text.slice(0, 160)}`
      );
      return null;
    }
    const page = pageOf(JSON.parse(text));
    if (!page) {
      console.warn(
        `[mfds] ${callName(call)} — 정상 응답이 아님: ${text.slice(0, 160)}`
      );
    }
    return page;
  } catch (e) {
    console.warn(`[mfds] ${callName(call)} — 실패`, e instanceof Error ? e.message : e);
    return null;
  }
}

/**
 * 검색 한 번에 모으는 줄들 — 식품코드로 한 번 거른 합집합과, 말 · 거름마다의 전체 수.
 * 수는 mfds-rank.ts 가 2차에 무엇을 더 모을지 고르는 데 쓴다('<말>|품목대표' · '<말>|').
 */
function newPool() {
  const rows = new Map<string, MfdsItem>();
  const counts: Record<string, number> = {};
  const add = (items: MfdsItem[]) => {
    for (const it of items) {
      const cd = String(it.FOOD_CD ?? '');
      if (cd && !rows.has(cd)) rows.set(cd, it);
    }
  };
  /** 품목대표는 넣어 둔 것에서 — 쪽이 없다(그 말이 든 것 전부). 그래서 '마지막 쪽'도 같은 것이다 */
  const addReps = (term: string) => {
    const found = findMfdsReps(term);
    counts[`${term}|품목대표`] = found.length;
    add(found);
    /*
     * 넣어 둔 것은 공짜다 — 띄어 쓴 말은 붙인 꼴로도 찾는다. 식약처 요리 이름은 대개 붙여 쓴다
     * ('김치 찌개' → 김치찌개, 표기를 바꾼 '달걀 후라이' → 달걀후라이). 수(counts)는 띄어 쓴 말 그대로 둔다 —
     * 2차에 무엇을 부를지 고르는 기준이 안 바뀌게.
     */
    const glued = term.replace(/\s+/g, '');
    if (glued !== term && !term.includes(',')) add(findMfdsReps(glued));
  };
  return { rows, counts, add, addReps };
}

const isRep = (c: MfdsCall) => c.cls === '품목대표';

const toFoods = (query: string, rows: Map<string, MfdsItem>, limit: number) =>
  rankMfds(query, [...rows.values()])
    .map(toFood)
    .filter((f): f is Food => f !== null)
    .slice(0, limit);

/**
 * 넣어 둔 품목대표에서만 찾기 — 포털을 부르지 않아 바로 나온다.
 * 화면이 이것을 먼저 보여 주고, 상품까지 든 결과(searchMfds)가 오면 바꿔 끼운다.
 */
export function searchMfdsReps(query: string, limit = 25): Food[] {
  const q = cleanQuery(query);
  const first = firstRound(q);
  if (first.length === 0) return [];
  const pool = newPool();
  for (const c of first) if (isRep(c)) pool.addReps(c.term);
  /* 포털의 수(전체 몇 줄)는 아직 모른다 — 품목대표 수만으로 고를 수 있는 2차(많을 때의 '검색어,')만 더한다 */
  const base = first[0].term;
  const second = secondRound(q, {
    repTotal: pool.counts[`${base}|품목대표`],
    counts: pool.counts,
  });
  for (const c of second) if (isRep(c)) pool.addReps(c.term);
  return toFoods(q, pool.rows, limit);
}

/** 다 받지 못한 검색 — 받은 만큼의 결과를 싣고 던져서, 저장(unstable_cache)에는 남지 않게 한다 */
class PartialSearch extends Error {
  constructor(readonly foods: Food[]) {
    super('식약처 검색 일부 실패');
  }
}

async function searchFresh(q: string, limit: number): Promise<Food[]> {
  const key = mfdsApiKey();
  const first = firstRound(q);
  if (!key || first.length === 0) return [];

  let complete = true;
  const pool = newPool();
  const fetched = new Set<string>();
  const fetchAll = async (calls: PageCall[], timeoutMs: number) => {
    const pages = await Promise.all(calls.map((c) => fetchPage(key, c, timeoutMs)));
    calls.forEach((c, i) => {
      fetched.add(callName(c));
      const page = pages[i];
      if (!page) {
        complete = false;
        return;
      }
      if (c.page === 1) pool.counts[`${c.term}|`] = page.total;
      pool.add(page.items);
    });
  };

  /* ── 1차: 품목대표는 넣어 둔 것에서, 상품은 포털 1쪽을 한꺼번에 ── */
  for (const c of first) if (isRep(c)) pool.addReps(c.term);
  await fetchAll(
    first.filter((c) => !isRep(c)).map((c) => ({ term: c.term, page: 1 })),
    FIRST_TIMEOUT_MS
  );

  /* ── 2차: 1차의 수를 보고 더 모을 것(상품 이름 같은 말의 마지막 쪽 · 띄어 쓴 원래 말 등) ── */
  const base = first[0].term;
  const second = secondRound(q, {
    total: pool.counts[`${base}|`],
    repTotal: pool.counts[`${base}|품목대표`],
    counts: pool.counts,
  });
  const more: PageCall[] = [];
  for (const c of second) {
    if (isRep(c)) {
      pool.addReps(c.term);
      continue;
    }
    let page = c.page;
    if (page === 'last') {
      const n = pool.counts[`${c.term}|`];
      if (n === undefined) continue; // 수를 모르면 마지막 쪽도 모른다
      page = Math.max(1, Math.ceil(n / PAGE_ROWS));
    }
    const call = { term: c.term, page };
    if (!fetched.has(callName(call))) more.push(call); // 마지막 쪽이 곧 1쪽이면 이미 받았다
  }
  await fetchAll(more, SECOND_TIMEOUT_MS);

  const foods = toFoods(q, pool.rows, limit);
  if (!complete) throw new PartialSearch(foods);
  return foods;
}

/*
 * 줄 세운 결과를 검색어마다 하루 저장한다(모든 사람이 같이 쓴다 — 음식 자료는 사람마다 다르지 않다).
 * 열쇠의 숫자는 순서 규칙의 판 — mfds-rank.ts 의 규칙이나 음식 변환(mfds-parse.ts)을 바꾸면 올려서
 * 옛 결과가 하루 남지 않게 한다. 넣어 둔 품목대표를 다시 받으면 날짜가 바뀌어 저절로 새로 찾는다.
 */
const cachedSearch = unstable_cache(
  searchFresh,
  ['nutrition-mfds-search-v2', MFDS_REPS_DATE],
  { revalidate: CACHE_SECONDS }
);

/**
 * 포털에 물을 만한 말인가 — 완성된 글자가 하나도 없는 말(치는 중간의 'ㅂ' 'ㅊ')은 묻지 않는다.
 * 그런 말은 포털이 DB 를 끝까지 훑는 호출이 되어 하루 호출 수만 쓴다.
 */
const worthAsking = (q: string) => /[가-힣a-z0-9]/i.test(q);

/**
 * 이름으로 찾기 — 그 음식 자체가 먼저 오게 줄 세운 앞 limit 개(품목대표 + 포털의 상품).
 *
 * 키가 없으면 빈 목록. 포털이 느리거나 오류를 주면 받은 만큼(적어도 넣어 둔 품목대표)으로 줄 세워
 * 돌려주되 저장하지 않는다 — 다음 검색이 다시 묻는다. 어떤 경우에도 searchMfdsReps 보다 적게 주지 않는다
 * (화면이 먼저 받은 표준값을 이 결과로 바꿔 끼운다).
 */
export async function searchMfds(query: string, limit = 25): Promise<Food[]> {
  const q = cleanQuery(query);
  if (!q || !mfdsEnabled()) return [];
  if (!worthAsking(q)) return searchMfdsReps(q, limit);
  try {
    return await cachedSearch(q, limit);
  } catch (e) {
    if (e instanceof PartialSearch) return e.foods;
    console.warn('[mfds] 검색 실패', e instanceof Error ? e.message : e);
    return searchMfdsReps(q, limit);
  }
}
