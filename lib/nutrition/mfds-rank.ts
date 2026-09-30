import type { MfdsItem } from '@/lib/nutrition/mfds-parse';

/**
 * 식약처 음식 검색 — 무엇을 부르고 어떤 순서로 보여줄지(순수 계산, 서버 · 시험 공용).
 *
 * 식약처는 이름에 검색어가 '들어간' 줄을 DB 순서(음식 → 가공식품 → 원재료)로 준다. 1쪽만 받으면 '바나나'에
 * 바나나크림도넛이 1위고 생바나나는 1,835개 중 마지막 쪽이다. 그래서 (1) 품목대표 거름 · 마지막 쪽 · 표준 표기로
 * 몇 번 더 부르고 (2) 이름이 검색어와 맞는 정도로 다시 줄 세우고 (3) 같은 음식 여러 줄을 한 줄로 접는다.
 *
 * 규칙은 2026-09-30 에 검색어 50개(쌀밥 · 계란 · 닭가슴살 · 김치찌개 · 빅맥 · 프로틴…)의 정답 순서를 매기고 채점하며
 * 다듬었다 — 받은 순서 그대로일 때 1위 적중 36%(NDCG@5 0.28) → 96%(0.72), 검색 한 번에 호출 평균 2.6번.
 * 부르는 쪽은 lib/nutrition/mfds.ts, 시험은 scripts/nutrition-selftest.mts.
 *
 * 1) 호출 — 2차례, 따로 '수 세기' 호출은 없다(1차 응답의 totalCount 가 곧 수다).
 *    1차: 검색어 품목대표 1쪽 + 검색어 1쪽 + 표준 표기 · 조리 앞말 뗀 재료(한 글자면 '김,') · 동물+부위('닭고기, 다리')
 *         · 분류 말('견과') · 다른 말 표의 말.
 *    2차: 품목대표 >100 → 품목대표 마지막 쪽 + '검색어,' / 품목대표 ≤2 · 전체 >100 → 일반 마지막 쪽 /
 *         재료 말의 품목대표 >100(counts 로 앎) → '재료,' / 전체 <30 → 붙여 쓴 말 품목대표 · 띄어 쓴 원래 말 ·
 *         '흰우유'의 '우유' 품목대표.   (마지막 쪽 번호 = ceil(그 말 · 그 거름의 totalCount / 100))
 * 2) 순위 — 이름이 검색어와 얼마나 맞나(정확 > 대표명 > 원재료 둘째 칸 > 상품 앞 낱말 > '~검색어' > '검색어~'
 *    > 상세명 > 대표명 속 > 상세명 속 > 우연 일치)
 *    + 재료 낱말이면 '재료 그 자체'(원재료 생것·삶은것, 음식 '달걀_삶은것', '참치통조림')를 맨 앞, 말한 조리 상태를 먼저
 *    + 품목대표(표준값) 우대 + 담기 곤란한 줄(소스·양념·기름·가루·'~용' 부품, 포장 전체 1회 중량,
 *      탄·지 빈칸, 간식이 아닌 말의 과자·빙과)은 뒤로. 모든 줄이 우연 일치뿐이면 빈 결과.
 * 3) 중복 접기 — 같은 음식 여러 줄을 한 줄로(rankMfds 는 대표만 돌려준다).
 *    · 이름이 같으면 값이 달라도 하나: 음식 품목대표 D1~D7 판, 같은 이름의 가공·원재료 품목대표,
 *      '달걀_삶은것'(D) ~ '달걀, 삶은것'(R).
 *    · 상품 · 메뉴의 판 이름(크기 · 온도 · 수량 괄호만 뺌) + 제조사가 같고 영양이 가까우면(±10%) 하나.
 *      맛 · 구성 괄호('(딸기)' '(쌀제외)')는 다른 상품.
 *    · 네 영양값이 반올림 차이까지 같으면: 품목대표끼리(이름이 닮았을 때), 또는 판 이름이 같은 줄(0kcal 포함).
 *      다른 이름의 상품끼리는 값이 같아도 접지 않는다.
 * 모든 규칙은 이름 모양 · 분류 · 영양값만 본다(특정 식품코드나 검색어를 박지 않는다 — 다른 말 표는 일반 지식만, 작게).
 * 같은 입력이면 같은 순서: 줄을 FOOD_CD 순으로 세운 뒤 점수를 매긴다(응답을 합친 순서와 무관, 동점은 FOOD_CD 순).
 * 입력은 바꾸지 않는다.
 *
 * 알려진 한계: 브랜드 이름(맥도날드 · 스타벅스)은 음식 이름에 없어 안 나온다. 중간 쪽에만 있는 상품(코카콜라 · 흰 우유
 * 상품)은 닿지 않는다. 인기를 몰라 같은 값어치면 식품코드 순이다. 새 말을 고칠 때는 다른 말 표를 늘리기보다 일반 규칙으로.
 */

/** 식약처 호출 하나 — 검색할 말, 거름('품목대표' 또는 없음), 쪽(100개 단위, 'last' = 마지막 쪽) */
export type MfdsCall = { term: string; cls: '품목대표' | ''; page: number | 'last' };

/** 1차 응답에서 읽은 수 — total · repTotal 은 검색어(1차의 첫 두 호출)의 것, counts 는 '<말>|<거름>' 마다 */
export type MfdsCounts = {
  total?: number | string | null;
  repTotal?: number | string | null;
  counts?: Record<string, number | string | null | undefined> | null;
};

/* ───────────── 말 다듬기 ───────────── */

/** 비교용: 공백을 없애고 소문자로(한글 모양은 tidy · parseName 에서 한 번 NFC 로 맞춘 뒤에 쓴다) */
const squash = (s: unknown) =>
  String(s ?? '')
    .toLowerCase()
    .replace(/\s+/g, '');
/** 괄호 속 없애기 — '구운것(팬)' → '구운것' */
const noParen = (s: unknown) => String(s ?? '').replace(/\([^)]*\)/g, '');
/** 한글 모양 맞추기 — 맥에서 복사한 말은 자모가 풀린 NFD 로 온다('바나나' 한 글자가 코드 2~3개). 비교 · 호출 전에 NFC 로 */
const nfc = (s: unknown) => String(s ?? '').normalize('NFC');
/** 보이지 않는 글자(폭 없는 공백 · BOM · 방향 표시 · 줄바꿈 가능 표시) */
const INVISIBLE_RE = /[\u00AD\u200B-\u200F\u2060\uFEFF]/g;
/** 검색어 길이 한도 — 붙여넣은 긴 글이 그대로 API 로 가지 않게 */
const MAX_QUERY = 40;
/** 끝에 붙은 수량 말 — '바나나 한 개' '밥 두 공기' '우유 200ml' 는 음식 이름만 찾는다 */
const QUANTITY_TAIL_RE =
  /\s*(?:\d+(?:\.\d+)?|한|두|세|네|다섯|반)\s*(?:개|공기|그릇|잔|컵|조각|쪽|알|봉지|봉|팩|캔|병|인분|장|줄|모|마리|큰술|작은술|g|kg|ml|l)$/i;
const ONE_HANGUL_RE = /^[가-힣]$/;

/**
 * 검색어 정리 → { text: 부를 말, spaced: 붙이기 전 말(띄어 쓴 원래 이름으로 한 번 더 부를 때) }.
 * - NFC, 보이지 않는 글자 · 앞뒤 구분자(',' '_' '/' '.') 지우기, 길이 40 자, 끝의 수량 말 떼기.
 * - 모든 낱말이 한 글자면('김 치 찌 개') 띄어쓰기 실수로 보고 다 붙인다.
 * - 한 글자 낱말이 섞여 있으면 그 낱말만 옆 낱말에 붙인다('닭 가슴살 소시지' → '닭가슴살 소시지', 끝이면 앞에: '구운 김' → '구운김').
 *   식약처 이름에는 띄어 쓴 두 글자 이상 낱말이 많아서('닭가슴살 소시지') 다 붙이면 오히려 놓친다.
 */
function tidyParts(q: string) {
  let t = nfc(q).replace(INVISIBLE_RE, '').replace(/\s+/g, ' ').trim();
  t = t
    .replace(/^[\s,_/.·]+|[\s,_/.·]+$/g, '')
    .slice(0, MAX_QUERY)
    .trim();
  const noQty = t.replace(QUANTITY_TAIL_RE, '').trim();
  if (noQty) t = noQty;
  const ws = t.split(' ').filter(Boolean);
  if (ws.length < 2 || !ws.some((w) => ONE_HANGUL_RE.test(w)))
    return { text: t, spaced: t };
  if (ws.every((w) => ONE_HANGUL_RE.test(w)))
    return { text: ws.join(''), spaced: ws.join('') }; // 띄어 쓴 꼴은 버린다
  const out: string[] = [];
  for (let i = 0; i < ws.length; i++) {
    if (ONE_HANGUL_RE.test(ws[i]) && i + 1 < ws.length) ws[i + 1] = ws[i] + ws[i + 1];
    else if (ONE_HANGUL_RE.test(ws[i]) && out.length) out[out.length - 1] += ws[i];
    else out.push(ws[i]);
  }
  return { text: out.join(' '), spaced: t };
}

/* ───────────── 다른 말 표(일반 지식, 작게) ───────────── */
// 표는 모두 Map — 보통 객체면 'constructor' '__proto__' 같은 검색어가 Object 의 내장 값을 꺼낸다

/** 식약처 표준 표기로 바꿔 부를 부분 문자열 — 식약처는 표준어로만 적는다 */
const SPELLING: [string, string][] = [
  ['계란', '달걀'], // 달걀 품목대표 99개, 계란 품목대표에는 달걀 자체가 없다
  ['짜장', '자장'], // 100g 기준 자장면은 '자장면'에만 있다
  ['까스', '가스'], // 돈까스 품목대표 0개, 돈가스 17개
  ['쥬스', '주스'],
  ['쇠고기', '소고기'], // 식약처 원재료 이름은 '소고기, …'
  ['오뎅', '어묵'],
  ['케익', '케이크'],
  ['소세지', '소시지'],
];
/** 말 끝 표기 — '참치캔' '꽁치캔'은 식약처가 '참치통조림'으로 적는다 */
const SPELLING_TAIL: [RegExp, string][] = [[/(.{2,})캔$/, '$1통조림']];
/** 낱말 전체가 같을 때만 바꾸는 말 — '그릭요거트'는 식약처도 요거트로 적는다 */
const SPELLING_WHOLE = new Map([
  ['요거트', '요구르트'], // 플레인 요구르트 대표는 '요구르트'로만 나온다
  ['요플레', '요구르트'],
]);
/** 영어로 친 흔한 음식(일반 지식, 작게) — 식약처 이름은 한글뿐이라 영어는 0건이다 */
const ENGLISH = new Map([
  ['banana', '바나나'],
  ['apple', '사과'],
  ['egg', '달걀'],
  ['eggs', '달걀'],
  ['milk', '우유'],
  ['rice', '쌀밥'],
  ['coke', '콜라'],
  ['cola', '콜라'],
  ['coffee', '커피'],
  ['americano', '아메리카노'],
  ['latte', '라떼'],
  ['yogurt', '요구르트'],
  ['tofu', '두부'],
  ['bread', '빵'],
  ['beef', '소고기'],
  ['pork', '돼지고기'],
  ['salmon', '연어'],
  ['tuna', '참치'],
  ['potato', '감자'],
  ['sweetpotato', '고구마'],
  ['ramen', '라면'],
  ['pizza', '피자'],
  ['burger', '햄버거'],
  ['hamburger', '햄버거'],
  ['protein', '프로틴'],
  ['oatmeal', '오트밀'],
  ['cereal', '시리얼'],
]);

/** 식약처가 다른 이름으로 적는 음식 — 원래 말과 함께 한 번 더 부른다(뜻이 같은 표준명 · 흔한 다른 이름) */
type Related = { term: string; cls: MfdsCall['cls']; side?: boolean };
const RELATED = new Map<string, Related[]>([
  ['흰밥', [{ term: '쌀밥', cls: '품목대표' }]], // 기본형 쌀밥은 '쌀밥' 품목대표에만
  ['공깃밥', [{ term: '쌀밥', cls: '품목대표' }]],
  ['공기밥', [{ term: '쌀밥', cls: '품목대표' }]],
  ['백미밥', [{ term: '쌀밥', cls: '품목대표' }]],
  ['밥', [{ term: '쌀밥', cls: '품목대표' }]], // 한 글자 '밥'은 모든 밥 요리에 걸린다 — 기본은 쌀밥
  ['치킨', [{ term: '닭튀김', cls: '품목대표' }]], // 표준명 '닭튀김'
  ['후라이드치킨', [{ term: '닭튀김', cls: '품목대표' }]],
  ['프라이드치킨', [{ term: '닭튀김', cls: '품목대표' }]],
  ['닭도리탕', [{ term: '닭볶음탕', cls: '품목대표' }]], // 표준명 '닭볶음탕'
  ['참치', [{ term: '다랑어', cls: '품목대표', side: true }]], // 생참치는 '다랑어, 참다랑어, 생것' — 곁말: 참치는 대개 참치캔이라 한 단계 뒤
  [
    '프로틴',
    [
      { term: '프로틴 음료', cls: '' }, // 단백질 음료·보충제는 '프로틴' 전체의 중간 쪽이라 닿지 않는다(음료 · 분말 두 갈래)
      { term: '웨이프로틴', cls: '' },
    ],
  ],
  [
    '스포츠음료',
    [
      { term: '이온', cls: '품목대표' }, // '스포츠음료'는 0건, 표준 '이온 음료'
      { term: '포카리', cls: '' }, // 이 갈래의 대표 상품은 이름으로만 나온다
    ],
  ],
  [
    '이온음료',
    [
      { term: '이온', cls: '품목대표' },
      { term: '포카리', cls: '' },
    ],
  ],
]);

/**
 * 동물 + 부위('닭가슴살' '닭다리' '돼지목살') → 식약처 원재료 이름 '<동물>고기, <부위>'.
 * 소는 부위가 '소고기, 한우, 등심'처럼 등급 칸 뒤에 와서, 오리는 부위 칸이 없어서('오리고기, 생것, 껍질 포함') 뺀다
 */
const ANIMAL = new Map([
  ['돼지', '돼지고기'],
  ['닭', '닭고기'],
]);
const PART = new Map([
  ['가슴살', '가슴'], // 식약처는 '닭고기, 가슴, 생것'으로 적는다
  ['가슴', '가슴'],
  ['다리', '다리'],
  ['다리살', '다리'],
  ['날개', '날개'],
  ['안심', '안심'],
  ['등심', '등심'],
  ['목살', '목심'], // 식약처 표준 부위명은 '목심'('돼지고기, 목심, 생것')
  ['목심', '목심'],
  ['앞다리', '앞다리'],
  ['뒷다리', '뒷다리'],
  // '갈비'는 넣지 않는다 — 닭갈비 · 돼지갈비는 부위가 아니라 요리 이름
]);
function animalPart(s: string) {
  for (const [a, meat] of ANIMAL) {
    const part = s.startsWith(a) ? PART.get(s.slice(a.length)) : undefined;
    if (part) return `${meat}, ${part}`;
  }
  return '';
}

/** 앞에 붙어 '종류'만 말하는 글자 — '흰우유' '햇감자'는 우유 · 감자 그 자체(생-은 생크림 · 생선처럼 한 낱말이 많아 뺀다) */
const DESCRIPTOR_PREFIX_RE = /^(흰|햇)([가-힣]{2,})$/;

/** '견과류'·'채소류' 같은 분류 말 — '류'를 뗀 말로도 부른다(식약처는 '모둠견과'처럼 적는다). '석류'처럼 류가 이름의 일부인 말은 빼려고 목록으로 */
const CATEGORY_RYU_RE =
  /^(견과|채소|야채|과일|과채|해조|버섯|과자|음료|김치|젓갈|유제품|해산물|조개|갑각|생선|나물|장아찌|어패|잡곡|곡물|유지)류$/;

/** '구운계란'·'삶은고구마'처럼 조리법이 앞에 붙은 말 → 재료 이름과 조리 상태로 나눈다 */
const COOK_PREFIX: [string, string][] = [
  ['삶은', '삶은것'],
  ['구운', '구운것'],
  ['튀긴', '튀긴것'],
  ['볶은', '볶은것'],
  ['데친', '데친것'],
  ['말린', '말린것'],
  ['익힌', '익힌것'],
  ['군', '구운것'], // 군고구마 → 고구마, 구운것 (군밤처럼 남는 말이 한 글자면 떼지 않는다)
  ['찐', '찐것'],
];

function applySpelling(s: string) {
  const whole = SPELLING_WHOLE.get(squash(s));
  if (whole) return whole;
  let out = s;
  for (const [a, b] of SPELLING) out = out.split(a).join(b);
  for (const [re, to] of SPELLING_TAIL) out = out.replace(re, to);
  return out;
}

/**
 * 검색어 → { base: 부를 말, spaced: 띄어 쓴 원래 말, terms: 이름 맞출 말들, calls: 1차에 더 부를 호출,
 *            later: 수를 보고 2차에 부를 수 있는 호출, materials: 재료 말(std · core), state: 원하는 조리 상태 }
 */
function understand(q: string) {
  const tp = tidyParts(q);
  // 영어로 친 흔한 음식은 한글 이름으로 바꿔 처음부터 그 말로 부른다
  const base = ENGLISH.get(squash(tp.text)) ?? tp.text;
  const spaced = base === tp.text ? tp.spaced : base;
  const terms = new Set<string>([base]);
  const calls: MfdsCall[] = [];
  const later: MfdsCall[] = [];
  let state = '';
  let core = base;
  // 조리법 앞말 떼기: 재료 이름 품목대표를 부르고, 그 조리 상태를 앞에 둔다.
  // 남는 말이 한 글자여도 원래 띄어 썼으면('구운 김') 뗀다
  const firstWord = spaced.split(' ')[0];
  for (const [pre, st] of COOK_PREFIX) {
    const rest = base.startsWith(pre) ? base.slice(pre.length).trim() : '';
    if (rest.length >= 2 || (rest.length === 1 && firstWord === pre)) {
      core = rest;
      state = st;
      break;
    }
  }
  const std = applySpelling(core);
  if (core !== base || std !== core) {
    terms.add(core);
    terms.add(std);
    // 한 글자 재료 말('구운 김'의 김)은 품목대표 1쪽이 그 글자가 든 요리(김밥 · 김치…)로만 찬다 → '김,' 은 원재료 이름만 건다
    calls.push({ term: std.length === 1 ? `${std},` : std, cls: '품목대표', page: 1 });
  }
  // '흰우유' '햇감자' — 전체 말이 거의 안 걸리면(2차) 뒤 말(우유)의 품목대표를 부른다
  const desc = std.match(DESCRIPTOR_PREFIX_RE);
  if (desc) {
    terms.add(desc[2]);
    later.push({ term: desc[2], cls: '품목대표', page: 1 });
  }
  // 동물 + 부위 → '<동물>고기, <부위>' 원재료 이름
  const ap = animalPart(squash(std));
  if (ap) {
    terms.add(ap);
    calls.push({ term: ap, cls: '품목대표', page: 1 });
  }
  const ryu = std.match(CATEGORY_RYU_RE);
  if (ryu) {
    terms.add(ryu[1]);
    calls.push({ term: ryu[1], cls: '품목대표', page: 1 });
  }
  const side = new Set<string>();
  for (const r of RELATED.get(squash(std)) ?? []) {
    terms.add(r.term);
    if (r.side) side.add(squash(r.term));
    calls.push({ term: r.term, cls: r.cls, page: 1 });
  }
  const seen = new Set([`${base}|품목대표`, `${base}|`]);
  const keep = (c: MfdsCall) => {
    const k = `${c.term}|${c.cls}`;
    if (seen.has(k)) return false;
    seen.add(k);
    return true;
  };
  const first = calls.filter(keep);
  return {
    base,
    spaced,
    state,
    terms: [...terms].filter(Boolean),
    side,
    calls: first,
    later: later.filter(keep),
    // 재료 말 — 조리 앞말을 떼거나 표기를 바꾼 말(쇠고기 → 소고기). 2차 규칙을 이 말의 수로도 고른다
    materials: [...new Set([core, std])].filter(
      (m) => m && m !== base && !/[, ]/.test(m)
    ),
  };
}

/* ───────────── 호출 ───────────── */

/** 수 읽기 — '1,835' 같은 문자열도, 모르면 NaN */
const countOf = (v: unknown) =>
  v == null || v === '' ? NaN : Number(String(v).replace(/,/g, ''));

/**
 * 1차 호출(수를 모를 때 한꺼번에): 검색어 품목대표 1쪽(대표 음식·원재료) + 검색어 1쪽(상품) + 다른 말.
 * 앞의 두 응답의 totalCount 가 곧 info.repTotal · info.total 이다.
 */
export function firstRound(q: string): MfdsCall[] {
  const u = understand(q);
  if (!u.base) return [];
  return [
    { term: u.base, cls: '품목대표', page: 1 },
    { term: u.base, cls: '', page: 1 },
    ...u.calls,
  ];
}

/**
 * 2차 호출(1차 응답의 수를 보고 더 부를 것만). info = { total, repTotal, counts? }
 *   total · repTotal — 1차 검색어(base) 일반 · 품목대표 응답의 totalCount. 모르면(없음 · NaN · null) 2차를 고르지 않는다.
 *   counts — 선택: 1차 다른 호출들의 totalCount { '<term>|<cls>': n } (재료 말의 품목대표 수로 2차를 고를 때).
 * 'last' 는 그 말 · 그 거름의 마지막 쪽 = ceil(totalCount / 100).
 */
export function secondRound(q: string, info?: MfdsCounts | null): MfdsCall[] {
  const u = understand(q);
  if (!u.base) return [];
  const total = countOf(info?.total);
  const repTotal = countOf(info?.repTotal);
  const calls: MfdsCall[] = [];
  if (Number.isFinite(repTotal) && repTotal > 100) {
    // 품목대표 1쪽이 요리로만 찬다 → 원재료(R)·가공 대표(P)가 몰린 마지막 쪽
    calls.push({ term: u.base, cls: '품목대표', page: 'last' });
    // R 이 100개를 넘으면 마지막 쪽에도 일반형이 없다 → '검색어,' 는 '재료, 부위, 조리' 이름만 건다
    if (!/[, ]/.test(u.base))
      calls.push({ term: `${u.base},`, cls: '품목대표', page: 1 });
  } else if (
    Number.isFinite(repTotal) &&
    Number.isFinite(total) &&
    repTotal <= 2 &&
    total > 100
  ) {
    // 상품형 말: 실제 상품(가공식품 P)은 DB 순서상 뒤라 마지막 쪽에 있다
    calls.push({ term: u.base, cls: '', page: 'last' });
  }
  // 재료 말(쇠고기 → 소고기, 삶은 돼지고기 → 돼지고기)의 품목대표가 100개를 넘으면 그 말의 원재료 이름만 따로
  for (const m of u.materials) {
    const n = countOf(info?.counts?.[`${m}|품목대표`]);
    if (Number.isFinite(n) && n > 100)
      calls.push({ term: `${m},`, cls: '품목대표', page: 1 });
  }
  if (Number.isFinite(total) && total < 30) {
    // '김치 찌개' '닭가슴살 소시지' 처럼 띄어 쳐서 거의 안 걸리면 붙여 쓴 말의 품목대표(식약처 요리 이름은 대개 붙여 쓴다)
    const glued = u.base.replace(/\s+/g, '');
    if (glued !== u.base) calls.push({ term: glued, cls: '품목대표', page: 1 });
    // 한 글자 낱말을 붙였는데 거의 안 걸리면 띄어 쓴 원래 이름('순 현미밥' '계란 쏙 사치마')으로 한 번 더
    if (u.spaced !== u.base) calls.push({ term: u.spaced, cls: '', page: 1 });
    // '흰우유' 처럼 전체 말이 거의 없으면 뒤 말(우유)의 대표를(전체 말 자체가 대표명이면 부르지 않는다)
    if (!(Number.isFinite(repTotal) && repTotal > 2)) calls.push(...u.later);
  }
  const first = new Set(firstRound(q).map((c) => `${c.term}|${c.cls}|${c.page}`));
  const seen = new Set<string>();
  return calls.filter((c) => {
    const k = `${c.term}|${c.cls}|${c.page}`;
    if (first.has(k) || seen.has(k)) return false;
    seen.add(k);
    return true;
  });
}

/* ───────────── 줄 읽기 ───────────── */

/** 영양값 읽기 — 빈 문자열 · 공백만 · '-' 는 모름(null). Number(' ') 는 0 이라 먼저 걸러야 한다 */
const num = (v: unknown) => {
  const s = String(v ?? '').trim();
  if (s === '' || s === '-') return null;
  const n = Number(s.replace(/,/g, ''));
  return Number.isFinite(n) ? n : null;
};

/** 1회 중량 '1,680.000g' → 1680 ('.' 같은 값은 모름) */
const amount = (v: unknown) => {
  const m = String(v ?? '')
    .replace(/,/g, '')
    .match(/\d+(?:\.\d+)?/);
  const n = m ? Number(m[0]) : NaN;
  return Number.isFinite(n) ? n : null;
};

/** 조리 상태 말 — 원재료성 이름의 한 칸('생것') 또는 음식 상세명 앞('찐고구마') */
const STATE_RE =
  /^(생것|삶은것|찐것|구운것|튀긴것|볶은것|데친것|말린것|익힌것|끓인것|조린것|절인것|냉동|동결건조|훈제|플레인)$/;
const STATE_HEAD_RE = /^(찐|삶은|구운|군|튀긴|볶은|데친)/;
const HEAD_STATE: Record<string, string> = {
  찐: '찐것',
  삶은: '삶은것',
  구운: '구운것',
  군: '구운것',
  튀긴: '튀긴것',
  볶은: '볶은것',
  데친: '데친것',
};
/** 기본 상태 — 투수가 담는 것은 대개 날것·삶은 것·찐 것·구운 것, 요구르트 같은 가공 재료는 '플레인' */
const STATE_BONUS: Record<string, number> = {
  생것: 6,
  삶은것: 5,
  찐것: 5,
  플레인: 5,
  구운것: 4,
};
/** 서로 대신해도 되는 가까운 조리 상태(물로 익힘) */
const NEAR_STATE = new Set([
  '찐것|삶은것',
  '삶은것|찐것',
  '익힌것|삶은것',
  '삶은것|익힌것',
  '익힌것|찐것',
  '찐것|익힌것',
]);

/** 담기 곤란한 줄: 소스·양념·기름·가루 등(이름 끝) */
const CONDIMENT_RE =
  /(소스|양념|양념장|스톡|가루|분말|다대기|육수|드레싱|기름|전용유|시즈닝|조미료|농축액|엑기스|원액|베이스|오일)$/;
/**
 * 검색어 바로 뒤에 붙으면 그 음식의 '부품'이 되는 말 — 떡볶이떡, 햄버거빵, 치킨무, 아보카도유(기름).
 * 꼬리 전체가 이 말일 때만 본다('오이무침'의 무, '떡볶이'의 떡, '자장면'은 부품이 아니다).
 */
const PART_TAIL_RE = /^(떡|빵|번|패티|면|사리|무|유)$/;
/** 꼬리가 이 말로 시작하면 부품·양념 — '삼각김밥용 김', '치킨소스맛', '라면스프용' */
const PART_LEAD_RE = /^(용|소스|양념|가루|분말|시즈닝|다대기|육수|스톡|전용유|기름)/;
/** 재료 낱말 뒤의 이 말은 부품이 아니라 그 재료로 만든 음식(감자빵 · 고구마떡 · 메밀면) — 조금만 뒤로 */
const MADE_FROM_RE = /^(떡|빵|번|면)$/;
/** 조리 말 — 한 글자 검색어가 이 말의 끝 글자일 뿐인 이름('감자튀김'의 김, '콩나물'의 물)은 우연 일치 */
const COOK_WORD_RE = /(튀김|볶음|구이|조림|무침|나물|부침|찌개|전골|국물)$/;
/** 상품 이름의 기본 맛 표시 */
const PLAIN_RE = /(플레인|무가당|오리지널|오리지날)/;
/** 재료 뒤에 붙어 '저장 가공한 그 재료'가 되는 말 — 참치통조림 · 연어훈제 */
const PRESERVED_RE = /^(통조림|캔|훈제)$/;
/** 간식 분류(FOOD_CD 앞 네 자리) — 과자·빵·떡, 빙과, 초콜릿, 당류 */
const SNACK_CLASS = new Set(['P101', 'P102', 'P103', 'P104']);
/** 요리 변형 가운데 두루 쓰는 것 — '샐러드_채소' '순두부찌개_모듬' */
const GENERIC_VARIANT_RE = /^(채소|야채|모둠|모듬|혼합|기본|일반|보통)$/;
/** 가장 흔한 품종(일반 지식, 작게) — 감자는 수미, 사과는 부사(후지). 품종별로만 있는 재료에서 대표로 쓴다 */
const COMMON_VARIETY = new Set(['수미', '부사', '후지']);
/** 부위 가운데 가장 일반형 — 소·돼지고기의 '살코기' */
const GENERIC_PART_RE = /^(살코기|일반|보통)$/;
/** 검색어가 얹히는 주식·간식 — '계란 덮밥' '연어롤' '바나나빵'은 그 재료의 대표 요리가 아니다 */
const CARRIER_RE =
  /^(밥|덮밥|볶음밥|비빔밥|죽|국수|김밥|롤|초밥|빵|떡|샌드위치|버거|피자|라면|면|만두|과자|케이크|쿠키)$/;
/** '검색어 + 음식 종류 말'이면 그 종류의 음식 — '초코우유 마카롱'은 마카롱 */
const FOOD_NOUN_RE =
  /(마카롱|케이크|케익|빵|쿠키|과자|비스켓|비스킷|크래커|젤리|캔디|사탕|아이스크림|도넛|와플|스낵|칩|칩스|푸딩|파이|떡|라떼|스무디|빙수|샌드|샌드위치|머핀|타르트|버거|피자|라면|스프|수프|바|크런치|잼|어묵|도시락|샐러드|만두)$/;

/** 메뉴 이름에서 뜻을 바꾸지 않는 낱말(온도 · 크기 · 매장 표기) — '아메리카노 아이스(ICED) (Tall)'도 아메리카노 */
const NEUTRAL_WORDS = new Set([
  '아이스',
  '핫',
  'ice',
  'iced',
  'hot',
  '카페',
  'tall',
  'grande',
  'venti',
  'short',
  'regular',
  '레귤러',
]);

type Parsed = ReturnType<typeof parseName>;

function parseName(raw: unknown) {
  const name = nfc(raw).replace(INVISIBLE_RE, '').trim(); // 식약처 이름도 NFD 로 올 수 있다
  // '대표명_상세'(음식) · '재료, 부위, 조리'(원재료성) · '이름/변형'(가공 대표) 을 한꺼번에 나눈다
  const parts = name
    .split(/[_,/]/)
    .map((s) => s.trim())
    .filter(Boolean);
  const first = parts[0] ?? '';
  const aliases = [...first.matchAll(/\(([^)]*)\)/g)]
    .map((m) => squash(m[1]))
    .filter(Boolean);
  const head = squash(noParen(first));
  const details = parts
    .slice(1)
    .map((p) => squash(noParen(p)))
    .filter(Boolean);
  // 띄어 쓴 낱말(상품 이름 '에너지바 K 크런치넛' 처럼 구분자가 없을 때 쓴다)
  const words = noParen(first)
    .split(/[\s&+]+/)
    .map(squash)
    .filter(Boolean);
  // 첫 상세명에서 뜻 없는 낱말을 뺀 것 — 프랜차이즈 메뉴 판을 한 메뉴로 맞춰 본다
  const detailCore = squash(
    noParen(parts[1] ?? '')
      .split(/\s+/)
      .filter((w) => !NEUTRAL_WORDS.has(w.toLowerCase()))
      .join('')
  );
  return {
    name,
    parts,
    head,
    aliases,
    details,
    words,
    detailCore,
    full: squash(noParen(name)).replace(/[_,/]/g, ''),
    flat: squash(name),
  };
}

/** 조리 상태 찾기 — 원재료성은 아무 칸이나('연어, 구운것, 소금첨가'), 음식은 '찐고구마'꼴도 */
function stateOf(p: Parsed) {
  for (let i = p.details.length - 1; i >= 0; i--) {
    const m = p.details[i].match(STATE_RE);
    if (m) return m[1];
  }
  for (const d of p.details) {
    const mm = d.match(STATE_HEAD_RE);
    if (mm && d.slice(mm[1].length) === p.head) return HEAD_STATE[mm[1]];
  }
  return '';
}

/* 이름이 검색어와 맞는 정도 */
const EXACT = 100; // 이름 = 검색어('쌀밥', '돼지고기볶음(제육볶음)'의 괄호 별칭)
const HEAD = 85; // 대표명 = 검색어('김치찌개_참치', '바나나, 생것', '에너지바 저당')
const LEADWORD = 73; // 상품 이름 앞 낱말 = 검색어('에너지바 저당')
const SUBTYPE = 80; // 원재료성 둘째 칸 = 검색어 — '돼지고기, 삼겹살, 생것'은 삼겹살 그 자체('재료, 부위, 조리')
const KIND = 70; // 대표명이 검색어로 끝남 — 검색어의 한 종류('소불고기', '가나초코우유')
const COMPOUND = 60; // 대표명이 검색어로 시작 — 검색어로 만든 것('달걀말이', '바나나칩')
const DETAIL_EXACT = 50; // 상세명 한 칸 = 검색어('커피_아메리카노', '김밥_참치')
const INHEAD = 45; // 대표명 중간에 검색어('딸기바나나 스무디')
const DETAIL = 30; // 상세명에만 들어 있음
const WEAK = 15; // 한 글자가 붙어 다른 낱말이 된 우연 일치('멥쌀밥'의 쌀밥, '염소고기'의 소고기, '콜라비'의 콜라)
const NONE = 0;

/** 앞에 한 글자만 붙을 때 흔히 '종류'를 뜻하는 글자(흰쌀밥 · 찐감자 · 소불고기 · 컵라면 · 햇감자) */
const ONE_CHAR_KIND = new Set(
  '흰찐군생햇왕통백흑찰쌀밀콩알물소닭돈양오게굴김떡묵팥보컵'.split('')
);
/** 뒤에 한 글자만 붙어 먹을거리가 되는 글자(바나나빵 · 김치국 · 감자칩 · 딸기잼 · 감자전) */
const ONE_CHAR_FOOD = new Set('빵떡국밥죽면차즙칩잼탕전찜회채묵젓술장볶쌈김'.split(''));

/** 낱말 w 의 i 자리에서 맞은 검색어 t 가 우연인가 */
function weakAt(w: string, i: number, t: string) {
  if (t.length === 1) {
    // 한 글자 말('배' '감' '김'): 낱말 첫머리에서 먹을거리 글자가 아닌 글자가 붙으면 다른 낱말(배추 · 감자 · 김치 — 김밥 · 배즙은 인정),
    // 이름 끝의 조리 말 끝 글자면('감자튀김' '콩나물') 우연. 앞 글자 규칙은 쓰지 않는다(꿀떡 · 곶감은 그 종류)
    const startWord = i === 0 && w.length > 1 && !ONE_CHAR_FOOD.has(w[1]);
    const cookTail = i === w.length - 1 && i > 0 && COOK_WORD_RE.test(w);
    return startWord || cookTail;
  }
  const pre = w.slice(0, i);
  const post = w.slice(i + t.length);
  const weakPre = pre.length === 1 && !ONE_CHAR_KIND.has(pre);
  const weakPost = pre.length === 0 && post.length === 1 && !ONE_CHAR_FOOD.has(post);
  return weakPre || weakPost;
}

/** 한 낱말 속 모든 일치가 우연인가(상세명 '뱀장어/비콜라'의 콜라) */
function weakIn(w: string, t: string) {
  if (t.length > 3) return false;
  let hits = 0;
  for (let i = w.indexOf(t); i >= 0; i = w.indexOf(t, i + 1)) {
    hits += 1;
    if (!weakAt(w, i, t)) return false;
  }
  return hits > 0;
}

/**
 * 검색어가 이름 낱말 속에 '우연히' 든 것뿐인가 — 1~3글자 검색어가 모든 자리에서
 * 앞에 한 글자(종류 글자 말고)가 붙거나('먼치킨' '염소고기'), 낱말 첫머리에서 뒤에 한 글자(먹을거리 글자 말고)만 붙었다('콜라비' '피자두').
 * 한 글자 검색어는 weakAt 의 따로 규칙(배추 · 감자튀김)
 */
function accidental(p: Parsed, t: string) {
  if (t.length > 3) return false;
  let hits = 0;
  for (const w of p.words) {
    for (let i = w.indexOf(t); i >= 0; i = w.indexOf(t, i + 1)) {
      hits += 1;
      if (!weakAt(w, i, t)) return false;
    }
  }
  // 낱말 사이에 걸친 일치('단백질 쉐이크')는 우연이 아니다 — 대표명 속 일치 수가 낱말 속 일치 수와 같아야
  let inHead = 0;
  for (let i = p.head.indexOf(t); i >= 0; i = p.head.indexOf(t, i + 1)) inHead += 1;
  return hits > 0 && hits === inHead;
}

function levelFor(p: Parsed, term: string, grp: string) {
  const t = squash(term);
  if (!t) return NONE;
  if (t.includes(',')) {
    // '닭고기, 가슴' 같은 원재료성 앞부분 — 칸 단위로 맞춘다
    const tp = t.split(',').filter(Boolean);
    if (!tp.length) return NONE; // ',' 만 친 말 — [].every() 가 참이 되어 모든 줄이 맞는 것을 막는다
    const ip = [p.head, ...p.details];
    if (tp.every((x, i) => ip[i] === x)) return ip.length === tp.length ? EXACT : HEAD;
    return p.flat.includes(t) ? DETAIL : NONE;
  }
  // 괄호 별칭은 음식·원재료만('닭볶음(닭갈비)'). 상품 괄호는 맛·재료 표기('나주오란다(견과류)')
  const aliases = grp === 'P' ? [] : p.aliases;
  // 식약처 이름을 밑줄 · 괄호까지 그대로 친 말('김밥_참치' '달걀부침(달걀후라이)')도 정확 일치
  if (p.full === t || p.flat === t || (p.details.length === 0 && aliases.includes(t)))
    return EXACT;
  if (p.head === t || aliases.includes(t)) return HEAD;
  // 상품 이름 '에너지바 저당' '단백질 쉐이크 곡물맛' — 앞 낱말이 검색어면 그 상품의 변형(음식 D 는 끝 낱말이 요리라 제외)
  if (grp === 'P' && p.words.length > 1) {
    let joined = '';
    for (let i = 0; i < p.words.length - 1; i++) {
      joined += p.words[i];
      // 뒤 낱말에 음식 종류 말이 있으면('그릭요거트 케이크 베리') 그 종류의 음식
      if (joined === t)
        return p.words.slice(i + 1).some((w) => FOOD_NOUN_RE.test(w))
          ? COMPOUND
          : LEADWORD;
      if (joined.length >= t.length) break;
    }
  }
  // 우연 일치는 대표명 규칙을 건너뛰고 상세명만 본다(없으면 WEAK)
  const weak = accidental(p, t);
  if (!weak && p.head.endsWith(t)) return KIND;
  if (!weak && p.head.startsWith(t)) return COMPOUND;
  // 원재료 둘째 칸 = 검색어는 '재료, 부위, 조리'(돼지고기, 삼겹살, 생것) 꼴이거나 상세가 그 한 칸뿐일 때('귀리, 오트밀'
  // '우유, 저지방우유')만 그 음식 자체. '과자, 떡, 팽화'(상태 없이 칸이 더 붙음)와 '율무, 죽'(한 글자 말은 음식 갈래 이름)은 상세명 일치
  if (
    grp === 'R' &&
    p.details[0] === t &&
    (stateOf(p) || (p.details.length === 1 && t.length >= 2))
  )
    return SUBTYPE;
  if (p.details.some((d) => d === t)) return DETAIL_EXACT;
  // 상품 이름 가운데 띄어 쓴 한 낱말이 검색어('셀렉스 프로틴 음료 오리지널') — 그 상품의 종류를 말한다.
  // 뒤에 음식 종류 말이 오면('비건 프로틴 쿠키') 검색어를 넣은 다른 음식
  const wi = grp === 'P' ? p.words.indexOf(t) : -1;
  if (wi >= 0)
    return p.words.slice(wi + 1).some((w) => FOOD_NOUN_RE.test(w)) ? INHEAD : KIND;
  if (!weak && p.head.includes(t)) return INHEAD;
  // 상세명 속 일치 — 그 일치가 모두 우연이면('뱀장어/비콜라'의 콜라) 약하게
  const inDetail = p.details.filter((d) => d.includes(t));
  if (inDetail.length) return inDetail.every((d) => weakIn(d, t)) ? WEAK : DETAIL;
  if (weak) return WEAK;
  if (p.flat.includes(t)) return DETAIL;
  return NONE;
}

type Understood = ReturnType<typeof understand>;
type Desc = ReturnType<typeof describe>;

function describe(it: MfdsItem, idx: number, u: Understood) {
  const cd = String(it.FOOD_CD ?? '');
  const grp = String(it.DB_GRP_CM || cd[0] || '').charAt(0);
  const p = parseName(it.FOOD_NM_KR);
  const kcal = num(it.AMT_NUM1);
  const carb = num(it.AMT_NUM6);
  const prot = num(it.AMT_NUM3);
  const fat = num(it.AMT_NUM4);
  let level = NONE;
  let term = '';
  for (const t of u.terms) {
    const l = levelFor(p, t, grp);
    // 같은 정도면 곁말보다 원래 말·표준어로 맞춘 것으로 본다
    if (
      l > level ||
      (l === level && l > NONE && u.side.has(term) && !u.side.has(squash(t)))
    ) {
      level = l;
      term = squash(t);
    }
  }
  return {
    it,
    idx,
    cd,
    grp, // D 음식 · P 가공식품 · R 원재료성
    side: u.side.has(term), // 곁말(참치 → 다랑어)로만 맞은 줄
    series: grp === 'D' ? Number(cd[1]) || 0 : 0, // D1·D3 = 100g 판, D4~D7 = 100mL 판, D2 = 프랜차이즈·상용
    seq: Number(cd.split('-').pop()) || 0, // FOOD_CD 끝 번호 — 같은 이름이면 0001 이 기본 판
    perMl: /ml/i.test(String(it.SERVING_SIZE ?? '')),
    isRep: it.DB_CLASS_NM === '품목대표',
    p,
    state: stateOf(p),
    level,
    term,
    kcal,
    carb,
    prot,
    fat,
    hasCF: carb != null && fat != null,
    serving: amount(it.Z10500),
    // 중복 접기용: 제조사(법인·공장 표기 뺌), 판 이름, 이름 글자 모음
    maker: makerKey(it.MAKER_NM),
    vname: variantName(p.name),
    chars: new Set(p.full),
    // 중복 찾기용 네 영양값(kcal·탄·단·지) — 하나라도 비면 비교하지 않는다(0kcal 은 fold 에서 이름이 같을 때만 쓴다)
    nut:
      kcal != null && kcal >= 0 && carb != null && prot != null && fat != null
        ? [kcal, carb, prot, fat]
        : null,
    // 아래 둘은 순위를 매길 때 채운다(rankedGroups · fold)
    score: 0,
    hasTwin: false,
  };
}

/* ───────────── 검색어 성격 ───────────── */

/**
 * 음식·원재료 품목대표의 첫 상세명이 검색어('커피_아메리카노') — 검색어가 그 대표명의 한 메뉴일 수 있는 줄.
 * 한 글자 말(밥 · 죽 · 떡 · 국)은 음식 갈래 이름이라 한 대표명의 메뉴가 아니다('율무, 죽')
 */
const menuLike = (d: Desc) =>
  d.grp !== 'P' &&
  d.isRep &&
  (d.level === DETAIL_EXACT || d.level === SUBTYPE) &&
  d.term.length >= 2 &&
  d.p.details[0] === d.term;

type Ctx = ReturnType<typeof analyze>;

function analyze(ds: Desc[], u: Understood) {
  // 재료 낱말인가: 원재료(R) 가운데 대표명이 검색어인 줄이 있고, 이름이 딱 같은 요리(D)가 없다
  //   (우유·바나나·달걀·감자 = 재료, 라면·피자·김치찌개 = 요리)
  const rawForms = ds.filter(
    (d) => d.grp === 'R' && (d.level === EXACT || d.level === HEAD)
  );
  const dishExact = ds.some((d) => d.grp === 'D' && d.level === EXACT);
  const ingredient = rawForms.length > 0 && !dishExact;
  // 기본 상태(생것·삶은것…)가 붙은 원재료 줄 가운데 가장 짧은 이름의 칸 수 — 이보다 긴 이름은 품종·부위·부분
  const canon = rawForms.filter((d) => STATE_BONUS[d.state]);
  const canonParts = canon.length ? Math.min(...canon.map((d) => d.p.parts.length)) : 0;
  // 상세명 = 검색어인 음식 대표가 모두 한 대표명 아래면('커피_아메리카노', '버거_빅맥 버거') 검색어는 그 대표명의 한 메뉴.
  // 여러 대표명에 흩어지면('호떡_견과류', '멸치볶음_견과류', '김밥_참치') 검색어는 재료로 들어간 것
  //   (첫 상세만 본다 — '돼지고기볶음_돼지고기_짜장'의 짜장은 양념 이름)
  const detailHeads = new Set(ds.filter((d) => menuLike(d)).map((d) => d.p.head));
  // 검색어로 시작하는 요리 대표('자장면' '자장밥')가 있으면 검색어는 그 요리들의 앞말 — 다른 대표명의 한 메뉴('돼지고기볶음_짜장')가 아니다
  const dishCompound = ds.some((d) => d.isRep && d.grp === 'D' && d.level === COMPOUND);
  // 원재료 이름의 앞부분 모음 — 어떤 줄 이름이 다른 줄 이름의 앞부분이면 그 줄은 세부 줄들의 '부모'
  const parents = new Set<string>();
  for (const d of rawForms)
    for (let k = 1; k < d.p.parts.length; k++)
      parents.add(d.p.parts.slice(0, k).map(squash).join(','));
  // 이름이 잘 맞는 가공 품목대표의 분류(P119 우유·요구르트, P106 두부…) — 같은 분류의 상품이 '진짜' 그 음식이다
  //   ('그릭요거트' 대표가 P119 이면 P119 그릭요거트 상품 > P101 그릭요거트 케이크)
  const repCats = new Set(
    ds
      .filter((d) => d.grp === 'P' && d.isRep && d.level >= KIND)
      .map((d) => d.cd.slice(0, 4))
  );
  // 검색어 자체이거나 그 종류인 대표(닻)가 있는데 그중 간식 분류가 없으면, 과자·빵·빙과·초콜릿 상품은 곁가지('그릭요거트 쿠키')
  const anchors = ds.filter((d) => d.isRep && d.level >= KIND);
  const snackAside =
    anchors.length > 0 && !anchors.some((d) => SNACK_CLASS.has(d.cd.slice(0, 4)));
  return {
    q: squash(u.base),
    terms: u.terms.map(squash),
    ingredient,
    dishExact,
    canonParts,
    state: u.state,
    // 검색어 자체가 대표명인 품목대표('돈가스', '돈가스_치즈')가 있으면 '김밥_돈가스'의 돈가스는 재료다
    menuUnderOneHead:
      detailHeads.size === 1 &&
      !ds.some((d) => d.isRep && d.level >= HEAD) &&
      !dishCompound,
    menuHead: detailHeads.size === 1 ? [...detailHeads][0] : '',
    repCats,
    snackAside,
    parents,
    // 이름이 검색어 그대로인 품목대표(괄호 별칭 말고)
    namedReps: ds.filter(
      (x) =>
        x.isRep && x.level === EXACT && (x.p.full === x.term || x.p.flat === x.term)
    ),
    // 상품 가운데 1회 중량이 적힌 몫
    servingShare:
      ds.filter((d) => !d.isRep && d.serving != null).length /
      Math.max(1, ds.filter((d) => !d.isRep).length),
  };
}

/* ───────────── 점수 ───────────── */

function score(d: Desc, ctx: Ctx) {
  const { p } = d;
  let s = d.level;
  // 괄호 별칭으로만 정확 일치한 줄('토스트(식빵)')은 이름 그대로인 같은 갈래 대표('식빵')가 따로 있으면 그 대표의 곁 —
  // 단 그 대표가 100mL 판뿐이고 별칭 줄이 100g 판이면('돼지고기볶음(제육볶음)' ↔ 제육볶음 D4~D7) 별칭 줄이 기본이다
  const aliasOnly = d.level === EXACT && p.full !== d.term && p.flat !== d.term;
  if (aliasOnly && ctx.namedReps.some((x) => x.grp === d.grp && (!x.perMl || d.perMl)))
    s = HEAD;
  // 상세 없는 요리 이름('달걀말이') 또는 '달걀찜_달걀만'. 단 '계란 덮밥' '연어롤' 처럼 검색어가 밥·빵에 얹힌 것은 빼고
  const plainDish =
    (p.details.length === 0 ||
      p.details.every((x) => ctx.terms.some((t) => x === t || x === `${t}만`))) &&
    !CARRIER_RE.test(p.head.slice((d.term || '').length));

  if (ctx.ingredient) {
    // ── 재료 낱말(우유·바나나·달걀·감자): '재료 그 자체'를 맨 앞으로 ──
    const rawForm = d.grp === 'R' && (d.level === EXACT || d.level === HEAD);
    const dishState = d.grp === 'D' && d.level === HEAD && STATE_BONUS[d.state];
    const repSame = d.grp === 'P' && d.isRep && d.level === EXACT; // 가공 대표 이름 = 검색어(원재료 줄과 같은 표준값을 옮긴 가공 대표)
    if (rawForm) {
      if (ctx.canonParts) {
        // 기본 상태 줄(생것·삶은것…)이 있으면 그것이 기본형. 품종·부위·부분이 더 붙을수록 한 칸마다 크게 뒤로.
        // 기본 상태가 아닌 원재료('연어, 훈제' '달걀, 스크램블드에그')는 '~검색어' 한 종류와 같은 값어치
        const extra = Math.max(0, p.parts.length - ctx.canonParts);
        // (상태 말도 없는 '재료, 가공품' 줄은 그보다 한 걸음 뒤 — 품종 생것 '감자, 수미, 생것'보다 아래)
        s =
          (STATE_BONUS[d.state]
            ? 105 + STATE_BONUS[d.state]
            : d.state
              ? KIND
              : KIND - 5) -
          45 * extra;
      } else {
        // 기본 상태 줄이 없는 재료(우유·두부·김치): 원재료 이름 전체가 기본형
        s = 105;
        const isParent = ctx.parents.has(p.parts.map(squash).join(','));
        if (p.details.length === 0) s += 5; // '우유' '두부' 처럼 상세 없는 이름
        if (p.details[0] && p.details[0].endsWith(p.head)) s += 3; // '두부, 순두부' '우유, 저지방우유' — 그 재료의 한 종류
        if (isParent)
          s += 2; // 아래에 세부 줄이 달린 줄('김치, 배추 김치' ← '…, 가을 재배')이 일반형
        // 첫 상세가 재료의 한 종류도 아니고 부모 줄도 아니면('샌드위치, 소고기' '시리얼, 옥수수') 속재료를 붙인 변형
        else if (p.details[0] && !p.details[0].endsWith(p.head)) s -= 20;
        s -= 3 * Math.max(0, p.details.length - 1);
      }
      if (p.details.some((x) => GENERIC_PART_RE.test(x))) s += 2; // '돼지고기, 살코기, 생것' — 부위 가운데 가장 일반형
      if (p.details.some((x) => COMMON_VARIETY.has(x))) s += 3; // '감자, 수미, 생것' — 일반형이 없을 때 가장 흔한 품종
      // 가운데 칸 괄호('한우(1+등급)' '양지(업진살)')는 더 좁힌 등급·부위라 크게, 끝 칸 괄호('구운것(팬)')는 조금
      s -= 8 * p.parts.slice(0, -1).filter((x) => x.includes('(')).length;
      if (p.parts.length > 1 && p.parts[p.parts.length - 1].includes('(')) s -= 3;
    } else if (dishState) {
      // '달걀_삶은것' '고구마_찐고구마' — 1회 중량이 있는 '재료 그 자체'(흰자·노른자처럼 더 붙으면 뒤로)
      const extra = Math.max(0, p.parts.length - 2);
      s = 105 + STATE_BONUS[d.state] + 3 - 45 * extra;
    } else if (repSame) {
      s = 110;
    } else if (
      d.grp === 'R' &&
      d.isRep &&
      d.level === COMPOUND &&
      PRESERVED_RE.test(p.head.slice(d.term.length))
    ) {
      // 원재료 대표 '참치통조림' '연어훈제' — 재료를 먹기 좋게 저장 가공한 그 재료 자체('달걀_삶은것'과 같은 자리)
      s = 105 + 3;
    } else if (d.level === LEADWORD) {
      // 재료 낱말 뒤에 말이 붙은 상품('고구마 말랭이')은 그 재료로 만든 다른 음식
      s = COMPOUND;
    } else if (d.level === SUBTYPE) {
      // 재료 자체의 원재료 줄이 따로 있으면 '당면, 고구마, …' '수제비면, 감자, …'는 그 재료로 만든 다른 것
      s = DETAIL_EXACT;
    } else if (
      d.grp === 'D' &&
      d.isRep &&
      d.level === COMPOUND &&
      plainDish &&
      !ctx.state
    ) {
      // '달걀말이' '연어구이' '감자튀김' — 그 재료로 만든 대표 요리(상세 없는 이름)
      s += 12;
    }
    // '구운계란' 처럼 조리 상태를 말했으면 그 상태를 앞, 다른 상태는 뒤.
    // '재료 그 자체' 줄은 상태가 다르면 품종·부위 한 칸만큼(−45) 뒤 — '삶은고구마'면 '고구마, 밤고구마, 삶은것' > '고구마, 생것'.
    // 찐것 ↔ 삶은것은 가까운 상태라 조금만(찐고구마는 삶은고구마 대신 먹어도 된다)
    // (같은 상태 +8 은 기본형 자리(HEAD 이상)만 — 흰자·노른자 같은 부분 줄까지 올리지 않는다)
    if (ctx.state && d.state) {
      const self = rawForm || dishState;
      if (d.state === ctx.state) {
        if (s >= HEAD) s += 8;
      } else if (self) s -= NEAR_STATE.has(`${d.state}|${ctx.state}`) ? 5 : 45;
      else if (s >= HEAD) s -= 15;
    }
  } else if (menuLike(d) && ctx.menuUnderOneHead) {
    // 요리·메뉴 이름이면 '커피_아메리카노'의 상세명이 곧 그 음식이다(재료 낱말이면 '김밥_참치'는 재료로 든 것)
    s = HEAD;
  } else if (
    d.grp === 'D' &&
    !d.isRep &&
    ctx.menuUnderOneHead &&
    p.head === ctx.menuHead &&
    p.detailCore === ctx.q
  ) {
    // 같은 대표명 아래 프랜차이즈 메뉴('커피_아메리카노 아이스(ICED)')도 그 메뉴 자체 — 봉지 커피 같은 다른 상품보다 앞
    s = HEAD;
  } else if (ctx.dishExact && d.grp === 'P' && d.isRep && d.level === EXACT) {
    // 요리 이름이 딱 같은 음식(D)이 있으면 같은 이름의 가공 대표('라면' 마른 면, 냉동 '피자')는 그 요리의 한 변형 자리
    s = HEAD - 3;
  } else if (d.level === SUBTYPE) {
    // 부위·품종 이름('삼겹살' → '돼지고기, 삼겹살, 생것'): 생것·삶은것 같은 기본 상태를 앞에
    s += STATE_BONUS[d.state] ?? 0;
    // 부위 칸의 괄호가 다른 부위면('삼겹살(갈매기살)') 다른 음식이라 크게, 같은 말('삼겹살(삼겹살)')이면 괄호 없는 이름 바로 뒤
    const partParens = [...(p.parts[1] ?? '').matchAll(/\(([^)]*)\)/g)].map((m) =>
      squash(m[1])
    );
    for (const x of partParens) s -= x === d.term ? 1 : 20;
    // 다른 칸 괄호('구운것(팬)')는 조금
    s -= 3 * ([p.parts[0], ...p.parts.slice(2)].join('').match(/\(/g) ?? []).length;
  }

  // 요리 변형 '냉면_물냉면'(상세가 대표명의 한 종류)이 '냉면_회냉면_홍어'(상세가 더 붙음)보다 기본에 가깝다
  if (d.level === HEAD && d.grp !== 'R' && d.isRep && p.details.length) {
    if (p.details[0].endsWith(p.head)) s += 3;
    // 두루 쓰는 변형('샐러드_채소' '순두부찌개_모듬')은 여러 변형 가운데 기본형에 가깝다
    if (GENERIC_VARIANT_RE.test(p.details[0])) s += 4;
    s -= 3 * (p.details.length - 1);
  }

  // 상품 이름 앞 낱말 = 검색어라도 대표와 다른 가공 분류면(대표는 음료인데 상품은 과자) 검색어로 만든 다른 음식
  if (d.level === LEADWORD && ctx.repCats.size && !ctx.repCats.has(d.cd.slice(0, 4)))
    s -= LEADWORD - COMPOUND;

  // 맛 첨가('가공우유, 초코맛')는 그 재료 자체가 아니다
  if (p.details.some((x) => /맛$/.test(x))) s -= 6;

  // 소스·양념·기름·가루 — 먹는 음식이 아니라 재료(검색어 자체가 소스면 그대로)
  const condimentQuery = CONDIMENT_RE.test(ctx.q);
  if (!condimentQuery && d.level !== EXACT) {
    const tail = p.details[p.details.length - 1] ?? '';
    // 대표명 끝('샐러드 드레싱, 프렌치'), 원재료 끝 칸('달걀, 가루'), 상품 이름 끝('돈까스 전용유')
    if (
      CONDIMENT_RE.test(p.head) ||
      (d.grp === 'R' && CONDIMENT_RE.test(tail)) ||
      (d.grp === 'P' && CONDIMENT_RE.test(p.full))
    )
      s -= 45;
    // 검색어 바로 뒤에 부품 말이 붙은 것 — 떡볶이떡, 햄버거빵, 치킨무, 삼각김밥용 김.
    // 요리 품목대표(D)는 그 자체가 음식이라 부품이 아니다('자장면' '단팥빵')
    else if (d.term && !(d.grp === 'D' && d.isRep) && p.head.startsWith(d.term)) {
      const rest = p.head.slice(d.term.length);
      if (PART_LEAD_RE.test(rest)) s -= 45;
      // 재료 낱말(감자 · 고구마)의 빵·떡·면은 그 재료로 만든 음식이라 조금만 뒤로
      else if (PART_TAIL_RE.test(rest))
        s -= ctx.ingredient && MADE_FROM_RE.test(rest) ? 10 : 45;
    }
  }

  if (d.isRep) {
    // 품목대표(표준값)가 같은 값어치면 상품보다 앞
    s += 20;
    // 음식 D: 100g 판이 100mL 판보다 담기 쉽다(1회 64.9mL 같은 값이 섞임)
    if (d.grp === 'D' && !d.perMl) s += 3;
  } else {
    // 상품 이름이 검색어와 똑같아도 한 회사 제품 — 대표의 표준 변형('순두부찌개_김치') 바로 아래
    if (d.level === EXACT) s = HEAD + 15;
    // 대표와 같은 가공 분류의 상품이 '진짜' 그 음식(그릭요거트 대표 P119 → P119 상품 > P101 그릭요거트 케이크)
    if (d.grp === 'P' && ctx.repCats.size)
      s += ctx.repCats.has(d.cd.slice(0, 4)) ? 6 : -6;
    // 간식이 아닌 말에 붙은 과자·빵·빙과·초콜릿 상품('그릭요거트 아이스크림')은 뒤로.
    // 이름이 검색어로 끝나는 간식 상품('아망디오쇼콜라')은 대개 다른 낱말이라 더 뒤로
    if (ctx.snackAside && SNACK_CLASS.has(d.cd.slice(0, 4)))
      s -= d.level >= KIND ? 25 : 12;
    // 같은 검색 결과의 상품 다수가 1회 중량을 적었는데 이 줄만 비었으면(파우더 · 대용량 자료) 조금 뒤
    if (d.serving == null && ctx.servingShare > 0.5) s -= 3;
    // 상품의 기본 맛(플레인·무가당·오리지널)이 맛 변형보다 앞
    if (PLAIN_RE.test(p.full)) s += 4;
    // 상품 이름은 검색어 말고 붙은 글자가 적을수록 그 상품의 기본형(단백질 쉐이크 곡물맛 > 단백질 쉐이크 하루픽 뉴욕치즈케이크맛)
    if (d.level < HEAD && d.level >= INHEAD && d.term)
      s -= Math.min(8, 0.5 * Math.max(0, p.full.length - d.term.length));
    // 1회 중량이 한 번 먹는 양(고체 ≤350g, 음료 ≤500mL)이면 담기 쉽고, 포장 전체(고체 500g 넘음, 1kg · 1L 이상)면 곤란.
    // 음료 600mL 병은 흔한 한 병이라 1L 까지는 감점하지 않는다
    if (d.serving != null) {
      if (d.serving >= 5 && d.serving <= (d.perMl ? 500 : 350)) s += 3;
      else if (d.serving >= 1000) s -= 8;
      else if (d.serving > 500 && !d.perMl) s -= 5;
    }
  }
  // 조리 상태까지 말한 검색어 그대로 맞는 줄(상품 '구운계란' '직화구운계란')은 재료로 만든 다른 요리보다 앞
  //   (상품 정확 일치 점수를 정한 뒤에 더한다 — 앞에서 더하면 그 대입에 덮어써진다)
  if (ctx.ingredient && ctx.state && d.term === ctx.q) s += 20;
  // 탄수화물·지방이 빈 자료(프랜차이즈 수집 자료) — 같은 값어치면 뒤
  if (!d.hasCF) s -= 6;
  // 프랜차이즈 메뉴(D2)는 크기 표기 괄호('(L)' '(Tall)')가 적은 기본 판이 먼저
  if (d.grp === 'D' && d.series === 2)
    s -= p.parts.slice(1).join(' ').split('(').length - 1;
  // 곁말로만 맞은 줄(참치 → 생참치 '다랑어')은 친 말의 기본 뜻(참치캔) 한 단계 뒤
  if (d.side) s -= 12;
  return s;
}

/* ───────────── 중복 접기 ───────────── */

/** 이름이 닮았나 — 글자 모음이 작은 쪽의 절반 이상 겹치면(글자 모음은 describe 에서 줄마다 한 번만 만든다) */
function similar(a: Desc, b: Desc) {
  const [A, B] = a.chars.size <= b.chars.size ? [a.chars, b.chars] : [b.chars, a.chars];
  let common = 0;
  for (const c of A) if (B.has(c)) common += 1;
  return common >= Math.max(2, Math.ceil(A.size / 2));
}

/** 크기·온도·수량 괄호 — 같은 상품의 판 표시일 뿐('(L)' '(Tall)' '(ICED)' '(500mL)' '(10개입)'). 맛·구성 괄호('(딸기)')는 남긴다 */
const SIZE_PAREN_RE =
  /\(\s*(?:l|r|s|m|j|v|ex|tall|grande|venti|short|mini\s*venti|max|large|regular|small|medium|iced|hot|아이스|핫|\d+(?:\.\d+)?\s*(?:g|kg|ml|l|개입|개|입|매|봉|팩|리터|인분))\s*\)/gi;
/** 판 이름 — 크기·온도 괄호만 빼고 공백·구분자를 없앤 이름(중복 접기 열쇠) */
const variantName = (name: unknown) =>
  squash(String(name ?? '').replace(SIZE_PAREN_RE, '')).replace(/[_,/]/g, '');

/** 같은 이름 음식 판 순서: 100g 판(D3, D1) → 100mL 판(D4~D7) */
const SERIES_ORDER: Record<number, number> = {
  3: 0,
  1: 1,
  4: 2,
  5: 3,
  6: 4,
  7: 5,
  2: 6,
};
const seriesRank = (d: Desc) => (d.grp === 'D' ? (SERIES_ORDER[d.series] ?? 9) : 0);

/**
 * 묶음의 대표 고르기 — 점수 → 원재료성 표준값과 같은 줄 → F 계열이 아닌 가공 대표 → 이름 칸이 적은 줄 → 원재료(R)
 * → (음식끼리) 100g 판 · 끝 번호 0001 · D3>D1>D4… → 작은 1회 중량(포장 전체보다 1회분) → 받은 순서
 */
function better(a: Desc, b: Desc) {
  if (a.score !== b.score) return a.score > b.score;
  if (a.hasTwin !== b.hasTwin) return a.hasTwin;
  // 같은 이름 가공 대표 둘: 끝 번호가 F 계열(-F007-001)이 아닌 쪽이 원재료성 표준값을 옮긴 판이다
  const fa = /-F\d/.test(a.cd);
  const fb = /-F\d/.test(b.cd);
  if (fa !== fb) return !fa;
  // 이름 칸이 적은 쪽('바나나칩' > '바나나칩, 튀긴것'), 그다음 원재료성 표준값(R)
  if (a.p.parts.length !== b.p.parts.length) return a.p.parts.length < b.p.parts.length;
  if ((a.grp === 'R') !== (b.grp === 'R')) return a.grp === 'R';
  if (a.grp === 'D' && b.grp === 'D') {
    if (a.perMl !== b.perMl) return !a.perMl;
    if (a.perMl && b.perMl) {
      // 100mL 판끼리: 1회 64.9mL 처럼 한 그릇이 안 되는 이상한 판은 뒤, 그다음 열량이 높은 판
      // (물을 덜 섞은 값 — 국물 수준 19kcal 판보다 실제로 먹는 꼴에 가깝다)
      const oa = (a.serving ?? 0) >= 90;
      const ob = (b.serving ?? 0) >= 90;
      if (oa !== ob) return oa;
      if (a.kcal !== b.kcal) return (a.kcal ?? 0) > (b.kcal ?? 0);
    }
    if (a.seq !== b.seq) return a.seq < b.seq;
    const sa = seriesRank(a);
    const sb = seriesRank(b);
    if (sa !== sb) return sa < sb;
  }
  // 포장 전체(600g)보다 1회분(40g) — 둘 다 한 번 먹을 양이면 가르지 않는다
  const pa = (a.serving ?? 0) > 500;
  const pb = (b.serving ?? 0) > 500;
  if (pa !== pb) return pb;
  return a.idx < b.idx;
}

/** 제조사에서 법인 표기·공장 이름을 뺀다: '매일유업㈜ 광주공장' · '매일유업(주)영동공장' → '매일유업' */
function makerKey(m: unknown) {
  return nfc(m)
    .replace(/\(주\)|㈜|주식회사|\(유\)|유한회사|농업회사법인|\s/g, '')
    .replace(/(제\d+)?([가-힣]{2})?(공장|사업장)$/, '');
}

/** 영양이 '같은 상품의 다른 판'이라 볼 만큼 가까운가 — kcal ±10%(작으면 ±5), 탄·단·지 ±10%(작으면 ±1g). 모르는 값은 가르지 않는다 */
function nutClose(x: Desc, y: Desc) {
  const pairs: [number | null, number | null, number][] = [
    [x.kcal, y.kcal, 5],
    [x.carb, y.carb, 1],
    [x.prot, y.prot, 1],
    [x.fat, y.fat, 1],
  ];
  return pairs.every(
    ([a, b, abs]) =>
      a == null || b == null || Math.abs(a - b) <= Math.max(abs, 0.1 * Math.max(a, b))
  );
}

/** (다) 네 영양값이 옮겨 적은 반올림 차이까지만 다른가(kcal ±1, 탄·단·지 ±0.05: '바나나칩' 517·69.32 ↔ '바나나칩, 튀긴것' 516·69.28) */
const nutSame = (x: number[], y: number[]) =>
  Math.abs(x[0] - y[0]) <= 1 &&
  [1, 2, 3].every((k) => Math.abs(x[k] - y[k]) <= 0.05 + 1e-9);

function fold(ds: Desc[]) {
  // union-find 로 묶는다
  const parent = ds.map((_, i) => i);
  const find = (i: number): number =>
    parent[i] === i ? i : (parent[i] = find(parent[i]));
  const join = (i: number, j: number) => {
    const a = find(i);
    const b = find(j);
    if (a !== b) parent[Math.max(a, b)] = Math.min(a, b);
  };
  const push = <K>(map: Map<K, number[]>, key: K, i: number) => {
    const list = map.get(key);
    if (list) list.push(i);
    else map.set(key, [i]);
  };
  const byName = new Map<string, number[]>(); // 이름이 같으면 값이 달라도 한 음식인 열쇠
  const byVariant = new Map<string, number[]>(); // 이름 · 제조사가 같아도 영양이 가까울 때만 한 음식인 열쇠
  ds.forEach((d, i) => {
    // (마) 상품·메뉴: 판 이름(크기·온도·수량 괄호만 뺌) + 제조사(법인·공장 표기 뺌)가 같으면 한 줄
    //   — 크기 판('아메리카노 아이스(ICED) (L)'/'(R)'), 공장만 다른 같은 상품('셀렉스 … 광주공장'/'영동공장').
    //   맛·구성 괄호('모찌전용그릭요거트(딸기)'/'(애플망고)', '…밀키트(쌀제외)')는 이름에 남아 다른 상품이다
    if (!d.isRep && d.maker) push(byVariant, `M|${d.vname}|${d.maker}`, i);
    if (!d.isRep) return;
    // (가) 음식 품목대표 같은 이름 — D1~D7 판(100g · 100mL 기준이라 값이 달라도 한 음식)
    // (나) 가공·원재료 품목대표 같은 이름(값만 조금 다른 판 — 초코우유 84 · 71kcal)
    push(byName, `${d.grp === 'D' ? 'D' : 'N'}|${d.p.flat}`, i);
    // (라) 같은 개념: '달걀_삶은것'(D) ~ '달걀, 삶은것'(R) — 대표명 + 조리 상태만 있는 이름
    if (d.state && d.p.details.length === 1 && (d.grp === 'D' || d.grp === 'R'))
      push(byName, `S|${d.p.head}|${d.state}`, i);
  });
  for (const list of byName.values())
    for (let k = 1; k < list.length; k++) join(list[0], list[k]);
  // (마)는 영양이 가까운 판끼리만 잇는다 — 이름·제조사가 같아도 기준량이 다른 자료(150 · 500kcal)는 따로 보인다
  for (const list of byVariant.values())
    for (let k = 1; k < list.length; k++) {
      const j = list.slice(0, k).find((x) => nutClose(ds[x], ds[list[k]]));
      if (j !== undefined) join(j, list[k]);
    }
  // (다) 네 영양값이 같고 이름이 닮음 — 품목대표끼리(P 대표 ↔ R 복제), 같은 제조사 상품끼리(공장·표기만 다름),
  //   판 이름까지 같은 줄(제조사만 다른 '나랑드사이다', 0kcal 포함). 다른 제조사의 다른 이름 상품은 값이 같아도
  //   다른 상품이다(브랜드 · 맛으로 찾는 사람에게 그 상품이 사라진다).
  //   (탄수화물이 0.2 만 달라도 '우유' ↔ '우유, 유당분해우유' 처럼 다른 음식일 수 있어 더 느슨하게 하지 않는다)
  const byNut = new Map<string, number[]>();
  ds.forEach((d, i) => {
    if (!d.nut) return;
    const nk = d.nut
      .slice(1)
      .map((v) => v.toFixed(1))
      .join('|'); // 탄·단·지 소수 한 자리로 먼저 나눈다
    push(byNut, `${nk}|n:${d.vname}`, i);
    if (d.nut[0] === 0) return; // 0kcal(물 · 제로 음료)은 이름이 같을 때만 — '닮은 이름'이면 서로 다른 음료가 다 붙는다
    // 이름이 달라도 접는 것은 품목대표끼리만(P 대표 ↔ R 복제). 같은 회사라도 이름이 다른 상품('햇반 윤기가득쌀밥' ·
    // '찰기가득쌀밥')은 값이 같아도 다른 상품 — 공장만 다른 같은 상품은 이름이 같아 위 칸이나 (마)에서 접힌다.
    // (칸을 품목대표 · 이름별로 나누므로 한 영양 칸에 상품이 몰려도 비교 짝 수가 O(k²) 로 커지지 않는다)
    if (d.isRep) push(byNut, `${nk}|rep`, i);
  });
  for (const [key, list] of byNut) {
    const sameName = key.includes('|n:');
    // 한 칸이 64줄을 넘는 것은 비정상 입력(실제 최대 14줄) — 짝 비교(O(k²))를 건너뛰어 서버 한 요청이 오래 걸리지 않게
    if (list.length > 64) continue;
    for (let a = 0; a < list.length; a++)
      for (let b = a + 1; b < list.length; b++) {
        const x = ds[list[a]];
        const y = ds[list[b]];
        if (!x.nut || !y.nut || !nutSame(x.nut, y.nut) || (!sameName && !similar(x, y)))
          continue;
        join(list[a], list[b]);
        if (x.grp === 'R' || y.grp === 'R') x.hasTwin = y.hasTwin = true; // 원재료성 표준값과 같은 줄
      }
  }

  const groups = new Map<number, number[]>();
  ds.forEach((d, i) => push(groups, find(i), i));
  const reps: { d: Desc; score: number }[] = [];
  for (const idxs of groups.values()) {
    const g = idxs.map((i) => ds[i]);
    let best = g[0];
    for (const d of g) if (better(d, best)) best = d;
    // 같은 개념의 음식(D, 1회 중량 있음)과 원재료(R)가 묶이면 앱에서 바로 담기는 음식 쪽을 대표로
    if (best.grp === 'R') {
      const dish = g.find(
        (d) =>
          d.grp === 'D' &&
          d.state === best.state &&
          d.p.head === best.p.head &&
          d.serving
      );
      if (dish) best = dish;
    }
    // 묶음 점수는 가장 높은 줄의 점수(대표를 1회 중량 때문에 바꿔도 자리는 그대로)
    reps.push({ d: best, score: Math.max(...g.map((d) => d.score)) });
  }
  return reps;
}

/* ───────────── 순위 ───────────── */

/** FOOD_CD 비교(같은 코드는 없다 — 호출을 합칠 때 FOOD_CD 로 한 번 거른다) */
const cmpCode = (a: MfdsItem, b: MfdsItem) => {
  const x = String(a.FOOD_CD ?? '');
  const y = String(b.FOOD_CD ?? '');
  return x < y ? -1 : x > y ? 1 : 0;
};

function rankedGroups(q: string, items: readonly MfdsItem[]) {
  const u = understand(q);
  // 빈 줄 · 객체가 아닌 줄은 건너뛴다(한 호출 응답이 깨져도 나머지로 순위를 낸다)
  const rows = Array.isArray(items)
    ? items.filter((x) => x && typeof x === 'object')
    : [];
  // 줄을 FOOD_CD 순으로 먼저 세운다 — 응답을 합친 순서(도착 순 · 재시도)가 달라도 같은 결과(동점은 FOOD_CD 순 = 식약처 DB 순서 D→P→R)
  rows.sort(cmpCode);
  if (!u.base || !rows.length) return [];
  const ds = rows.map((it, i) => describe(it, i, u));
  // 모든 줄이 우연 일치 이하('바니나' → '갈바니나 음료')면 맞는 음식이 없는 것 — 엉뚱한 목록 대신 빈 결과(앱 기본 목록만 보인다)
  if (!ds.some((d) => d.level > WEAK)) return [];
  const ctx = analyze(ds, u);
  for (const d of ds) d.score = score(d, ctx);
  const reps = fold(ds);
  // 점수 높은 순, 동점은 받은 순서(식약처 DB 순서) — 같은 입력이면 늘 같은 순서
  reps.sort((a, b) => b.score - a.score || a.d.idx - b.d.idx);
  return reps;
}

/**
 * 모은 줄(FOOD_CD 로 한 번 거른 합집합) → 보여줄 순서. 접힌 줄(같은 음식의 다른 판)은 빼고 대표 한 줄만 —
 * 담기에는 한 줄이면 충분하다. 새 배열을 돌려주고 입력은 바꾸지 않는다.
 */
export function rankMfds(q: string, items: readonly MfdsItem[]): MfdsItem[] {
  return rankedGroups(q, items).map((x) => x.d.it);
}
