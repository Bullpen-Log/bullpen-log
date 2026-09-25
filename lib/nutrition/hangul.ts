/**
 * 한글 음식 이름 찾기 — 초성으로도 찾는다.
 *
 * 휴대폰으로 '닭가슴살'을 치다 보면 받침에서 자주 틀린다. 'ㄷㄱㅅㅅ'만 쳐도
 * 나오게 하면 한 손으로도 빨리 찾는다. 인아웃을 써 본 사람이 가장 불편하다고
 * 꼽은 것이 음식 찾기였다.
 */

const CHOSEONG = [
  'ㄱ',
  'ㄲ',
  'ㄴ',
  'ㄷ',
  'ㄸ',
  'ㄹ',
  'ㅁ',
  'ㅂ',
  'ㅃ',
  'ㅅ',
  'ㅆ',
  'ㅇ',
  'ㅈ',
  'ㅉ',
  'ㅊ',
  'ㅋ',
  'ㅌ',
  'ㅍ',
  'ㅎ',
];

const SYLLABLE_START = 0xac00;
const SYLLABLE_END = 0xd7a3;
/** 초성 하나에 딸린 글자 수 (중성 21 × 종성 28) */
const PER_CHOSEONG = 588;

/** 띄어쓰기를 없애고 영문은 소문자로 */
export function normalize(text: string) {
  return text.replace(/\s+/g, '').toLowerCase();
}

/** '닭가슴살' → 'ㄷㄱㅅㅅ'. 한글이 아닌 글자는 그대로 둔다. */
export function choseong(text: string) {
  let out = '';
  for (const ch of normalize(text)) {
    const code = ch.charCodeAt(0);
    out +=
      code >= SYLLABLE_START && code <= SYLLABLE_END
        ? CHOSEONG[Math.floor((code - SYLLABLE_START) / PER_CHOSEONG)]
        : ch;
  }
  return out;
}

const ONLY_CHOSEONG = /^[ㄱ-ㅎ]+$/;

/**
 * 얼마나 잘 맞나. 0 이면 안 맞는다. 클수록 위에 둔다.
 *
 *   이름과 똑같음 100 · 이름이 이것으로 시작 80 · 이름 안에 있음 60(앞쪽일수록 조금 더)
 *   초성이 똑같음 55 · 초성으로 시작 50 · 초성 안에 있음 40
 */
export function matchScore(name: string, query: string) {
  const q = normalize(query);
  if (!q) return 0;
  const n = normalize(name);
  if (n === q) return 100;
  if (n.startsWith(q)) return 80;
  const at = n.indexOf(q);
  if (at >= 0) return 60 - Math.min(at, 10);
  if (ONLY_CHOSEONG.test(q)) {
    const c = choseong(name);
    if (c === q) return 55;
    if (c.startsWith(q)) return 50;
    if (c.includes(q)) return 40;
  }
  return 0;
}
