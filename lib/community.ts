/**
 * 커뮤니티(/community, 2026-10-17 1판 — 틀) — 글 · 댓글 · 좋아요 · 신고. 구분 값 · 한도는 여기 한 곳.
 * 화면은 app/(dugout)/community, 관리자(신고 · 가리기)는 app/(app)/admin/community, 동작은 app/actions/community.ts.
 */

/*
 * 게시판 넷(2026-10-24 김민 — docs/designs/dugout-community.md). 사람이 적을 때 잘게 나누면 다 비어 보여 큰 판은 넷, 안에서 말머리로 가른다.
 * 질문 · 답변은 예전 '질문'과 같은 열쇠(question)라 옛 글 · 옛 앱이 그대로 맞는다.
 */
export const POST_CATEGORIES = [
  { key: 'free', label: '자유' },
  { key: 'question', label: '질문 · 답변' },
  { key: 'meetup', label: '번개' },
  { key: 'team', label: '팀 홍보 · 선수 모집' },
] as const;
export type PostCategory = (typeof POST_CATEGORIES)[number]['key'];
export function isPostCategory(v: unknown): v is PostCategory {
  return POST_CATEGORIES.some((c) => c.key === v);
}
export function postCategoryLabel(key: string) {
  return POST_CATEGORIES.find((c) => c.key === key)?.label ?? '자유';
}
/** 예전 갈래(기록 자랑 · 팁)는 자유로 — 아직 옛 앱이 보낼 수 있다(10-24 까지 글 0개라 옮길 글은 없다) */
export function normalizeCategory(v: unknown): PostCategory | null {
  if (v === 'record' || v === 'tip') return 'free';
  return isPostCategory(v) ? v : null;
}

/*
 * 연락처 가리기 — 1:1 쪽지가 없는 곳이라(미성년 보호) 글 · 댓글에 적은 전화번호 · 카톡 아이디 · 오픈채팅 주소는 올릴 때 가린다.
 * 휴대폰은 구분자가 없어도, 지역번호는 구분자가 있을 때만(아무 숫자나 잡지 않게). 카톡 아이디는 '카톡' 같은 말 뒤의 영문 · 숫자만.
 */
export const CONTACT_MASK = '(연락처 가림)';
const PHONE = /(?:\+?82[-.\s]?)?0?1[016789][-.\s]?\d{3,4}[-.\s]?\d{4}|\b0\d{1,2}[-.\s]\d{3,4}[-.\s]\d{4}\b/g;
const KAKAO_LINK = /(?:https?:\/\/)?open\.kakao\.com\/\S+/gi;
const KAKAO_ID =
  /((?:카카오톡|카톡|카카오|톡|kakao(?:talk)?|katalk)\s*(?:아이디|id)?\s*[:：]?\s*)[A-Za-z0-9][A-Za-z0-9._-]{2,}/gi;
export function maskContacts(text: string) {
  return text
    .replace(KAKAO_LINK, CONTACT_MASK)
    .replace(KAKAO_ID, `$1${CONTACT_MASK}`)
    .replace(PHONE, CONTACT_MASK);
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
/** 신고 상세(선택) */
export const REPORT_DETAIL_MAX = 500;
/** 한 번에 보이는 글 수(더 보기로 다음 장) */
export const POSTS_PER_PAGE = 20;

/** 목록 정렬 */
export const POST_SORTS = [
  { key: 'new', label: '최신' },
  { key: 'hot', label: '인기' },
] as const;
export type PostSort = (typeof POST_SORTS)[number]['key'];
