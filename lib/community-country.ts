import { COUNTRY_LABEL, countryOf, type Country } from '@/lib/country';

/**
 * 나라별 덕아웃(2026-10-28 김민, docs/designs/overseas-sinker-dugout.md 5-2 · 5-3) — 글은 쓸 때 쓴 사람의 나라(CommunityPost.country)에 박히고,
 * 목록 · 검색 · 인기 · 답 기다리는 질문은 보는 사람의 나라 글만 보인다. 다른 나라 글은 링크로 읽기만 된다(Q5) — 댓글 · 좋아요 · 저장 · 참여 ·
 * 대화는 막고 신고는 연다(안전이 먼저). 나라를 가르는 규칙은 이 파일만 쓴다.
 */

/** 보는 사람의 덕아웃 나라 — 로그인 안 했으면 한국(PC 웹 · 덕아웃 앱은 한국 전용, Q15) */
export const dugoutOf = (user: { country?: string | null } | null | undefined): Country => countryOf(user?.country);

/** 그 글에 쓰기(댓글 · 좋아요 · 저장 · 참여 · 대화)를 해도 되나 — 같은 나라 덕아웃이거나 내 글 */
export const canWriteIn = (post: { country: string; userId: string }, user: { id: string; country?: string | null }) =>
  post.userId === user.id || post.country === dugoutOf(user);

export const OTHER_DUGOUT = '다른 나라 덕아웃 글이라 읽기만 할 수 있어요.';

/** 다른 나라 글에 다는 이름표 — 같은 나라면 null */
export function otherDugoutLabel(post: { country: string }, user: { country?: string | null } | null | undefined): string | null {
  const c = countryOf(post.country);
  return c === dugoutOf(user) ? null : `${COUNTRY_LABEL[c]} 덕아웃 글`;
}
