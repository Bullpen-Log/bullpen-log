/**
 * 검색 · 비교용 글자 다듬기. 저장된 글은 바꾸지 않고 비교할 때만 쓴다.
 * NFKC(전각 · 호환 글자 통일) → 앞뒤 공백 제거 → 소문자 → 여러 칸 공백을 하나로.
 */
export function normalizeWikiText(s: string): string {
  /* 앱 엔진에 normalize 가 없을 때도 돌게 — 없으면 다듬기만 건너뛴다 */
  const n = typeof s.normalize === 'function' ? s.normalize('NFKC') : s;
  return n.trim().toLowerCase().replace(/\s+/g, ' ');
}

/** 띄어쓰기 · 붙임표 · 가운뎃점을 뺀 비교값 — '힙힌지' 와 '힙 힌지', 'plyo-ball' 과 'plyo ball' 을 같게 본다 */
export function compactWikiText(s: string): string {
  return normalizeWikiText(s).replace(/[\s\-‐‑–—·・_/()（）]/g, '');
}

const HANGUL = /[가-힣ㄱ-ㆎ]/;

export function hasHangul(s: string): boolean {
  return HANGUL.test(s);
}

export function isLatinTerm(s: string): boolean {
  return /^[A-Za-z0-9 .\-/]+$/.test(s);
}
