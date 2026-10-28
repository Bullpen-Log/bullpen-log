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

/*
 * 해외(미국 · 일본) 덕아웃은 게시판을 나누지 않고 피드 하나 + 고르개 셋(2026-10-28, 설계 5-7) — 사람이 적을 때 판을 나누면 다 비어 보여서.
 * 새 표 없이 지금 게시판 · 말머리 짝을 쓴다(폼 질문 = 질문 · 내 폼 봐 주세요, 훈련 기록 = 자유 · 내 기록, 투수 팁 = 자유 · 팁). 한국은 그대로(게시판 넷).
 */
export const OVERSEAS_KINDS = [
  { key: 'form', label: '폼 질문', category: 'question', tag: 'form', what: '투구 영상을 올리고 폼에 대해 물어봐요.', example: '릴리스 때 팔이 늦게 나오는 것 같아요' },
  { key: 'log', label: '훈련 기록', category: 'free', tag: 'record', what: '오늘 한 훈련과 그날의 감각을 나눠요.', example: '불펜 40구, 슬라이더 감이 돌아왔어요' },
  { key: 'tip', label: '투수 팁', category: 'free', tag: 'tip', what: '도움이 된 드릴 · 훈련 경험을 소개해요.', example: '팔이 편해진 밴드 루틴 공유해요' },
] as const;
export type OverseasKind = (typeof OVERSEAS_KINDS)[number];
export const overseasKindOf = (category: string | null | undefined, tag: string | null | undefined): OverseasKind | null =>
  OVERSEAS_KINDS.find((k) => k.category === category && k.tag === tag) ?? null;
export const overseasKindByKey = (key: unknown): OverseasKind | null => OVERSEAS_KINDS.find((k) => k.key === key) ?? null;
/** 해외 덕아웃 이름 — 한국이면 null(게시판 넷 그대로) */
export const overseasDugoutName = (user: { country?: string | null } | null | undefined): string | null => {
  const c = dugoutOf(user);
  return c === 'kr' ? null : `${COUNTRY_LABEL[c]} 덕아웃`;
};
