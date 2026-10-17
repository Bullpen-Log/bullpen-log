/**
 * 커뮤니티(/community, 2026-10-17 1판 — 틀) — 글 · 댓글 · 좋아요 · 신고. 구분 값 · 한도는 여기 한 곳.
 * 화면은 app/(app)/community, 관리자(신고 · 가리기)는 app/(app)/admin/community, 동작은 app/actions/community.ts.
 */

export const POST_CATEGORIES = [
  { key: 'free', label: '자유' },
  { key: 'question', label: '질문' },
  { key: 'record', label: '기록 자랑' },
  { key: 'tip', label: '팁 · 노하우' },
] as const;
export type PostCategory = (typeof POST_CATEGORIES)[number]['key'];
export function isPostCategory(v: unknown): v is PostCategory {
  return POST_CATEGORIES.some((c) => c.key === v);
}
export function postCategoryLabel(key: string) {
  return POST_CATEGORIES.find((c) => c.key === key)?.label ?? '자유';
}

export const REPORT_REASONS = [
  { key: 'spam', label: '광고 · 도배' },
  { key: 'abuse', label: '욕설 · 비하' },
  { key: 'privacy', label: '개인정보 노출' },
  { key: 'other', label: '기타' },
] as const;
export type ReportReason = (typeof REPORT_REASONS)[number]['key'];
export function isReportReason(v: unknown): v is ReportReason {
  return REPORT_REASONS.some((r) => r.key === v);
}
export function reportReasonLabel(key: string) {
  return REPORT_REASONS.find((r) => r.key === key)?.label ?? '기타';
}

export const POST_TITLE_MAX = 80;
export const POST_BODY_MAX = 5000;
export const COMMENT_BODY_MAX = 1000;
/** 한 번에 보이는 글 수(더 보기로 다음 장) */
export const POSTS_PER_PAGE = 20;

/** 목록 정렬 */
export const POST_SORTS = [
  { key: 'new', label: '최신' },
  { key: 'hot', label: '인기' },
] as const;
export type PostSort = (typeof POST_SORTS)[number]['key'];
