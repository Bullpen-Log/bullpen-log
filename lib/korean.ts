/**
 * 한국어 조사 붙이기.
 *
 * 이름을 변수로 받아 문장을 만들 때, 조사를 글자로 박아 두면 반드시 틀린다.
 * 실제로 화면에 "벤치이 있으면 27개를 더 할 수 있습니다"가 나왔다 — 장비 이름
 * 뒤에 '이'를 고정해 두었기 때문이다. 받침이 없는 말에는 '가'가 붙어야 한다.
 *
 * 앞말에 받침이 있으면 앞것(을·이·은·과·으로), 없으면 뒷것(를·가·는·와·로)을 쓴다.
 * 'ㄹ' 받침만 예외라서 '으로'가 아니라 '로'가 붙는다 — 서울로, 케이블로.
 */

/** 쓸 수 있는 조사 짝. 앞이 받침 있을 때, 뒤가 없을 때. */
const PAIRS = {
  '을/를': ['을', '를'],
  '이/가': ['이', '가'],
  '은/는': ['은', '는'],
  '와/과': ['과', '와'],
  '으로/로': ['으로', '로'],
} as const;

export type JosaPair = keyof typeof PAIRS;

/*
 * 숫자를 한국어로 읽었을 때 마지막 음절에 받침이 있는가.
 * 영(ㅇ)·일(ㄹ)·삼(ㅁ)·육(ㄱ)·칠(ㄹ)·팔(ㄹ) 은 있고, 이·사·오·구 는 없다.
 */
const DIGIT_HAS_BATCHIM: Record<string, boolean> = {
  '0': true,
  '1': true,
  '2': false,
  '3': true,
  '4': false,
  '5': false,
  '6': true,
  '7': true,
  '8': true,
  '9': false,
};

/*
 * 알파벳을 한국어로 읽었을 때 받침이 있는가.
 * 엘(ㄹ)·엠(ㅁ)·엔(ㄴ)·알(ㄹ)처럼 있는 것과, 비·시·디처럼 없는 것을 가른다.
 * TRX 를 '티알엑스'로 읽으면 '스'로 끝나 받침이 없다 — 그래서 'TRX가'다.
 */
const LETTER_HAS_BATCHIM: Record<string, boolean> = {
  a: false, // 에이
  b: false, // 비
  c: false, // 시
  d: false, // 디
  e: false, // 이
  f: false, // 에프
  g: false, // 지
  h: false, // 에이치
  i: false, // 아이
  j: false, // 제이
  k: false, // 케이
  l: true, // 엘
  m: true, // 엠
  n: true, // 엔
  o: false, // 오
  p: false, // 피
  q: false, // 큐
  r: true, // 알
  s: false, // 에스
  t: false, // 티
  u: false, // 유
  v: false, // 브이
  w: false, // 더블유
  x: false, // 엑스
  y: false, // 와이
  z: false, // 지
};

/**
 * 마지막 글자에 받침이 있는가.
 *
 * 판단할 수 없는 글자(기호·한자·이모지 등)로 끝나면 null 을 돌려준다.
 * 그때는 부르는 쪽에서 받침이 있는 쪽을 쓴다 — 둘 중 하나는 틀리므로,
 * 적어도 더 자주 맞는 쪽으로 기운다.
 */
export function hasBatchim(word: string): boolean | null {
  const last = word.trim().slice(-1);
  if (!last) return null;

  const code = last.charCodeAt(0);

  // 한글 음절 — (코드 - 가) % 28 이 0이 아니면 받침이 있다
  if (code >= 0xac00 && code <= 0xd7a3) return (code - 0xac00) % 28 !== 0;

  if (last >= '0' && last <= '9') return DIGIT_HAS_BATCHIM[last];

  const lower = last.toLowerCase();
  if (lower >= 'a' && lower <= 'z') return LETTER_HAS_BATCHIM[lower];

  return null;
}

/**
 * 앞말에 맞는 조사 하나를 고른다.
 *
 *   josa('벤치', '이/가')   → '가'
 *   josa('철봉', '이/가')   → '이'
 *   josa('케이블', '으로/로') → '로'
 */
export function josa(word: string, pair: JosaPair): string {
  const [withBatchim, withoutBatchim] = PAIRS[pair];
  const batchim = hasBatchim(word);

  // 'ㄹ' 받침은 '으로'가 아니라 '로'를 쓴다 — 케이블로, 덤벨로
  if (pair === '으로/로' && batchim) {
    const last = word.trim().slice(-1).charCodeAt(0);
    const isRieul =
      last >= 0xac00 && last <= 0xd7a3 && (last - 0xac00) % 28 === 8;
    if (isRieul) return withoutBatchim;
  }

  return batchim === false ? withoutBatchim : withBatchim;
}

/** 이름과 조사를 붙여 돌려준다 — `withJosa('벤치', '이/가')` → '벤치가' */
export function withJosa(word: string, pair: JosaPair): string {
  return `${word}${josa(word, pair)}`;
}

/* ------------------------------- 이름 찾기 ------------------------------- */

/**
 * 검색용으로 다듬은 글자.
 *
 * 띄어쓰기를 지우고 소문자로 내린다. 등록된 이름이 '덤벨 프레스'라고 해서
 * 찾는 사람도 꼭 그렇게 띄어 쓰지는 않는다 — '덤벨프레스'라고 붙여 치면
 * 하나도 안 나왔다. 사이에 낀 공백은 이름의 일부가 아니라 표기 습관이다.
 *
 * 영문도 같이 내린다. 'TRX'를 'trx'로 쳐도 찾아야 한다.
 */
export function searchKey(text: string): string {
  return text.replace(/\s+/g, '').toLowerCase();
}

/**
 * 찾는 말이 이름 안에 있는가.
 *
 * 양쪽에서 띄어쓰기를 지우고 견주므로, 어느 쪽을 붙여 쓰든 찾아진다.
 *   '덤벨프레스'  → 덤벨 프레스  ✓
 *   '덤벨 프레스' → 덤벨프레스   ✓
 */
export function matchesSearch(text: string, query: string): boolean {
  const q = searchKey(query);
  return q === '' || searchKey(text).includes(q);
}
