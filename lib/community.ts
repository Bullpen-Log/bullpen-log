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
/** 말머리 — 게시판 안에서 가른다(김민 2026-10-24). '봐 주세요'는 질문 · 답변의 '내 폼 봐 주세요'로 합쳤다. */
export const POST_TAGS: Record<PostCategory, readonly { key: string; label: string }[]> = {
  free: [
    { key: 'chat', label: '잡담' },
    { key: 'record', label: '내 기록' },
    { key: 'kbo', label: 'KBO' },
    { key: 'mlb', label: 'MLB' },
    { key: 'amateur', label: '아마추어' },
    { key: 'gear', label: '장비' },
  ],
  question: [
    { key: 'pitch', label: '투구' },
    { key: 'bat', label: '타격' },
    { key: 'field', label: '수비' },
    { key: 'gear', label: '장비' },
    { key: 'injury', label: '부상' },
    { key: 'rule', label: '규칙' },
    { key: 'form', label: '내 폼 봐 주세요' },
  ],
  meetup: [
    { key: 'catch', label: '캐치볼' },
    { key: 'batting', label: '배팅' },
    { key: 'fungo', label: '펑고' },
    { key: 'game', label: '같이 경기' },
  ],
  team: [
    { key: 'promo', label: '팀 홍보' },
    { key: 'recruit', label: '팀원 모집' },
    { key: 'merc', label: '용병' },
    { key: 'scrim', label: '연습경기 상대' },
    { key: 'seek', label: '팀 구해요' },
  ],
};
export function isPostTag(category: string, tag: unknown): tag is string {
  return isPostCategory(category) && POST_TAGS[category].some((t) => t.key === tag);
}
export function postTagLabel(category: string, tag: string | null | undefined) {
  if (!tag || !isPostCategory(category)) return null;
  return POST_TAGS[category].find((t) => t.key === tag)?.label ?? null;
}

/** 부상 질문에 붙는 안내 — 의료 조언이 아니다 */
export const INJURY_NOTE = '부상 이야기는 의료 조언이 아니에요. 아프면 던지지 말고 병원 진료를 먼저 받아요.';

/** 사진 · 영상 — 글 하나에 4개, 영상은 저장소 한도(50MB)까지. 경로는 {userId}/{uuid}.확장자 */
export const MEDIA_MAX = 4;
export const MEDIA_VIDEO_MAX_MB = 50;
export const MEDIA_TYPES: Record<string, string> = {
  'image/jpeg': 'jpg',
  'image/png': 'png',
  'image/webp': 'webp',
  'video/mp4': 'mp4',
  'video/quicktime': 'mov',
};
export const isVideoPath = (path: string) => /\.(mp4|mov)$/i.test(path);
export const isMediaPath = (path: string) => /\.(jpg|png|webp|mp4|mov)$/i.test(path);

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
