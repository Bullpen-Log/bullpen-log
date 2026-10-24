import { REGIONS } from '@/lib/market/specs';

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

/* ───────────── 번개 · 팀 홍보 · 선수 모집 양식(docs/designs/dugout-community.md 4단계) ───────────── */

/** 우리 동네 — 장터와 같은 시 · 도(택배 칸은 뺀다) */
export const COMMUNITY_REGIONS = REGIONS.filter((r) => r !== '전국(택배)');
export const isCommunityRegion = (v: unknown): v is string =>
  (COMMUNITY_REGIONS as readonly string[]).includes(v as string);

export const MEET_LEVELS = [
  { key: 'any', label: '누구나' },
  { key: 'new', label: '처음이에요' },
  { key: 'mid', label: '중급' },
  { key: 'high', label: '상급' },
] as const;
export const MEET_AGES = [
  { key: 'teen', label: '청소년 환영' },
  { key: 'adult', label: '성인만' },
] as const;
export const WEEKDAYS = ['월', '화', '수', '목', '금', '토', '일'] as const;
/** 낯선 사람끼리 만나는 번개 참가 · 팀 신청은 만 14세부터(김민 확정 대기 — 바꾸면 이 줄만), '성인만'은 만 19세부터 */
export const MEET_MIN_AGE = 14;
export const ADULT_AGE = 19;
export const MEET_CAPACITY_MAX = 30;
/** 번개 대화방은 모임 다음 날 닫힌다(모임 시각 + 하루) */
export const ROOM_OPEN_MS = 24 * 60 * 60 * 1000;
/** 번개 날짜는 오늘부터 60일 안 */
const MEET_AHEAD_MS = 60 * 24 * 60 * 60 * 1000;
export const ROOM_MESSAGE_MAX = 1000;

export type MeetupForm = {
  place: string;
  capacity: number;
  level: (typeof MEET_LEVELS)[number]['key'];
  gear: string;
  cost: string;
  age: (typeof MEET_AGES)[number]['key'];
};
export type TeamForm = { team: string; league: string; days: string[]; fee: string; ages: string };

const short = (v: unknown, max = 60) => (typeof v === 'string' ? v.trim().slice(0, max) : '');

/** 저장된 번개 양식 읽기 — 모양이 틀리면 null */
export function readMeetupForm(raw: unknown): MeetupForm | null {
  if (!raw || typeof raw !== 'object') return null;
  const f = raw as Record<string, unknown>;
  const capacity = Number(f.capacity);
  if (!short(f.place) || !Number.isInteger(capacity)) return null;
  return {
    place: short(f.place),
    capacity,
    level: MEET_LEVELS.some((l) => l.key === f.level) ? (f.level as MeetupForm['level']) : 'any',
    gear: short(f.gear),
    cost: short(f.cost),
    age: f.age === 'adult' ? 'adult' : 'teen',
  };
}
export function readTeamForm(raw: unknown): TeamForm | null {
  if (!raw || typeof raw !== 'object') return null;
  const f = raw as Record<string, unknown>;
  return {
    team: short(f.team, 40),
    league: short(f.league),
    days: Array.isArray(f.days) ? WEEKDAYS.filter((d) => (f.days as unknown[]).includes(d)) : [],
    fee: short(f.fee),
    ages: short(f.ages),
  };
}

/** 'YYYY-MM-DDTHH:mm'(datetime-local, 한국 시각) → Date. 형식이 틀리면 null */
export function kstDateTime(v: string): Date | null {
  if (!/^\d{4}-\d{2}-\d{2}T\d{2}:\d{2}$/.test(v)) return null;
  const d = new Date(`${v}:00+09:00`);
  return Number.isNaN(d.getTime()) ? null : d;
}

type Fields = (name: string) => string;

/** 번개 양식 검사 — 언제 · 어디 · 지역 · 몇 명은 꼭 */
export function parseMeetup(
  get: Fields,
  now: Date
): { error: string } | { form: MeetupForm; meetAt: Date; region: string } {
  const meetAt = kstDateTime(get('meetAt'));
  if (!meetAt) return { error: '언제 모이는지 골라 주세요.' };
  if (meetAt.getTime() < now.getTime()) return { error: '지난 시각이에요. 모일 때를 다시 골라 주세요.' };
  if (meetAt.getTime() > now.getTime() + MEET_AHEAD_MS) return { error: '번개는 60일 안의 날짜만 잡을 수 있어요.' };
  const place = short(get('place'));
  if (!place) return { error: '어디서 모이는지 적어 주세요.' };
  const region = get('region');
  if (!isCommunityRegion(region)) return { error: '지역을 골라 주세요.' };
  const capacity = Number(get('capacity'));
  if (!Number.isInteger(capacity) || capacity < 2 || capacity > MEET_CAPACITY_MAX)
    return { error: `몇 명이 모일지 2~${MEET_CAPACITY_MAX}명으로 적어 주세요.` };
  return {
    meetAt,
    region,
    form: readMeetupForm({
      place,
      capacity,
      level: get('level'),
      gear: get('gear'),
      cost: get('cost'),
      age: get('age'),
    })!,
  };
}

/** 팀 양식 검사 — 지역만 꼭(팀 구해요 글도 같은 양식) */
export function parseTeam(
  get: Fields,
  days: string[]
): { error: string } | { form: TeamForm; region: string } {
  const region = get('region');
  if (!isCommunityRegion(region)) return { error: '지역을 골라 주세요.' };
  return {
    region,
    form: readTeamForm({
      team: get('team'),
      league: get('league'),
      days,
      fee: get('fee'),
      ages: get('ages'),
    })!,
  };
}

/**
 * 번개 참가 · 팀 신청을 막는 까닭(없으면 null). 나이를 모르면(생년월일 없음) 막는다 — 낯선 사람과 만나는 일이라.
 */
export function joinBlockReason(q: {
  age: number | null;
  adultOnly: boolean;
  isAuthor: boolean;
  closed: boolean;
  full: boolean;
  past: boolean;
}): string | null {
  if (q.isAuthor) return '내 글이에요.';
  if (q.past) return '지난 번개예요.';
  if (q.closed || q.full) return '마감됐어요.';
  if (q.age === null) return '내 정보에 생년월일을 넣으면 참가할 수 있어요.';
  if (q.age < MEET_MIN_AGE) return `만 ${MEET_MIN_AGE}세부터 참가할 수 있어요.`;
  if (q.adultOnly && q.age < ADULT_AGE) return '성인만 참가하는 번개예요.';
  return null;
}
