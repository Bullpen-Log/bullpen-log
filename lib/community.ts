import { REGIONS } from '@/lib/market/specs';
import { isDistrict } from '@/lib/kr-districts';
import { overseasKindOf } from '@/lib/community-country';

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
/* 해외 덕아웃의 고르개(lib/community-country.ts OVERSEAS_KINDS — 자유 · 팁)도 말머리로 받는다. 한국 화면의 말머리 줄에는 안 보인다 */
export function isPostTag(category: string, tag: unknown): tag is string {
  return isPostCategory(category) && (POST_TAGS[category].some((t) => t.key === tag) || overseasKindOf(category, String(tag)) !== null);
}
export function postTagLabel(category: string, tag: string | null | undefined) {
  if (!tag || !isPostCategory(category)) return null;
  return POST_TAGS[category].find((t) => t.key === tag)?.label ?? overseasKindOf(category, tag)?.label ?? null;
}

/** 부상 질문에 붙는 안내 — 의료 조언이 아니다 */
export const INJURY_NOTE = '부상 이야기는 의료 조언이 아니에요. 아프면 던지지 말고 병원 진료를 먼저 받아요.';

/**
 * 코치 배지의 뜻 — 덕아웃에 레슨장을 열고(마스터 · 스태프) 활동 중인 사람. 자격증 · 경력을 확인하지 않았다(2026-10-26) — 인증처럼 보이지 않게 늘 이 말을 붙인다.
 */
export const COACH_BADGE_NOTE = '덕아웃에 레슨장을 열고 활동 중인 사람이에요. 자격을 확인한 표시는 아니에요.';
/** 운영자 글 표시 */
export const STAFF_BADGE_NOTE = '덕아웃 운영자가 쓴 글이에요.';

/*
 * 게시판 안내 — 빈 화면 · 첫 방문에 '무엇을 할 수 있는지'와 쓸 만한 글의 예(2026-10-26). 예는 가짜 글이 아니라 제목 칸의 보기다.
 */
export const BOARD_GUIDES: Record<PostCategory, { what: string; cta: string; examples: string[] }> = {
  free: {
    what: '야구 이야기 · 장비 · 프로야구 감상을 자유롭게 나눠요.',
    cta: '자유 글 쓰기',
    examples: ['어제 경기 9회 수비 어떻게 봤어요?', '첫 나무 배트 샀어요. 길이 고르는 법 나눠요'],
  },
  question: {
    what: '투구 · 타격 · 수비 · 장비 · 규칙을 묻고 답해요. 도움이 된 답은 채택할 수 있어요.',
    cta: '질문하기',
    examples: ['커브를 던지면 팔꿈치 안쪽이 당겨요', '사회인 리그 인필드 플라이 판정이 궁금해요'],
  },
  meetup: {
    what: '캐치볼 · 배팅 · 펑고를 같이 할 사람을 모아요. 정한 인원이 차면 마감돼요.',
    cta: '번개 열기',
    examples: ['토요일 오전 10시 한강공원 캐치볼 2명', '평일 저녁 배팅센터 같이 갈 분'],
  },
  team: {
    what: '팀을 알리고, 팀원 · 용병 · 연습경기 상대를 찾고, 들어갈 팀을 구해요.',
    cta: '팀 글 쓰기',
    examples: ['토요 리그 3부 팀원 모집해요(투수 · 포수)', '일요일 오전 용병 구해요(외야 1명)'],
  },
};
/** 말머리별 제목 보기 — 글쓰기 칸의 placeholder */
export const TAG_EXAMPLES: Record<string, string> = {
  'free:chat': '오늘 연습 끝나고 쓰는 잡담',
  'free:record': '오늘 불펜 구속 기록 남겨요',
  'free:kbo': '어제 경기 선발 교체 타이밍 어땠어요?',
  'free:mlb': '이번 포스트시즌 불펜 운용 이야기',
  'free:amateur': '주말 리그 결승 다녀왔어요',
  'free:gear': '내야 글러브 길들이기 후기',
  'question:pitch': '슬라이더가 자꾸 빠져요',
  'question:bat': '몸쪽 공에 배트가 늦어요',
  'question:field': '땅볼 바운드 맞추는 연습법이 궁금해요',
  'question:gear': '사회인 첫 배트 무게는 몇 g 이 좋아요?',
  'question:injury': '던지고 나면 어깨 뒤쪽이 뻐근해요',
  'question:rule': '보크 판정 기준이 궁금해요',
  'question:form': '제 투구 폼 한 번 봐 주세요',
  'meetup:catch': '토요일 오전 캐치볼 하실 분',
  'meetup:batting': '평일 저녁 배팅센터 같이 가요',
  'meetup:fungo': '일요일 펑고 받아 주실 분',
  'meetup:game': '주말 친선 경기 인원 모아요',
  'team:promo': '수원 토요 리그 팀을 소개해요',
  'team:recruit': '토요 리그 3부 팀원 모집해요',
  'team:merc': '일요일 오전 용병 구해요',
  'team:scrim': '다음 주 토요일 연습경기 상대 찾아요',
  'team:seek': '투수 · 주말 가능한 팀 찾아요',
};

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
/** 인기 정렬의 기간 — 좋아요를 그 기간에 쓴 글끼리만 견준다(전체는 예전 누적 인기) */
export const HOT_PERIODS = [
  { key: '7d', label: '7일', days: 7 },
  { key: '30d', label: '30일', days: 30 },
  { key: 'all', label: '전체', days: 0 },
] as const;
export type HotPeriod = (typeof HOT_PERIODS)[number]['key'];
export const hotPeriodOf = (v: unknown): HotPeriod =>
  HOT_PERIODS.some((p) => p.key === v) ? (v as HotPeriod) : '7d';

/*
 * 질문 · 답변의 답 상태(2026-10-26) — '답'은 글쓴이가 아닌 사람의 가리지 않은 댓글(CommunityPost.firstAnswerAt).
 * 답변 없음 = 그런 댓글이 하나도 없음, 미해결 = 답은 있는데 채택이 없음. 둘은 다르다.
 */
export const ANSWER_FILTERS = [
  { key: 'none', label: '답변 없음' },
  { key: 'open', label: '미해결' },
  { key: 'solved', label: '해결됨' },
] as const;
export type AnswerFilter = (typeof ANSWER_FILTERS)[number]['key'];
export const isAnswerFilter = (v: unknown): v is AnswerFilter => ANSWER_FILTERS.some((f) => f.key === v);
/** 첫 답 목표 — 운영 목표일 뿐, 화면에 '보장'으로 쓰지 않는다 */
export const FIRST_ANSWER_TARGET_HOURS = 24;

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
/** 번개 모집 인원 = 글쓴이를 뺀 '더 모을 사람 수'(1~30). 모두 모이면 모집 인원 + 1명 */
export const MEET_CAPACITY_MIN = 1;
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
/**
 * 팀 홍보 · 선수 모집 양식(2026-10-26 말머리마다 칸이 다르다). 저장은 한 모양(옛 글의 team · league · days · fee · ages 그대로 읽힘), 칸은 말머리가 정한다.
 */
export type TeamForm = {
  team: string;
  league: string;
  days: string[];
  fee: string;
  ages: string;
  /** 모집 · 용병 · 팀 구해요 — 포지션 */
  positions: string[];
  /** 팀원 모집 — 몇 명(0 = 안 적음) */
  count: number;
  /** 경력 조건(모집) · 내 경력(팀 구해요) */
  career: string;
  /** 활동 일정 한 줄 */
  schedule: string;
  /** 용병 · 연습경기 — 구장 */
  venue: string;
  /** 연습경기 — 구장 확보: yes · no · '' */
  venueReady: string;
  /** 용병 실력 조건 · 연습경기 팀 수준 */
  level: string;
  /** 용병 비용 · 연습경기 비용 분담 */
  cost: string;
  /** 팀 구해요 — 다닐 수 있는 지역 */
  areas: string;
};
export const POSITIONS = ['투수', '포수', '내야', '외야', '어디든'] as const;

const short = (v: unknown, max = 60) => (typeof v === 'string' ? v.trim().slice(0, max) : '');

const strList = (v: unknown, allowed: readonly string[]) =>
  Array.isArray(v) ? allowed.filter((d) => (v as unknown[]).includes(d)) : [];

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
  const count = Number(f.count);
  return {
    team: short(f.team, 40),
    league: short(f.league),
    days: strList(f.days, WEEKDAYS),
    fee: short(f.fee),
    ages: short(f.ages),
    positions: strList(f.positions, POSITIONS),
    count: Number.isInteger(count) && count > 0 && count <= MEET_CAPACITY_MAX ? count : 0,
    career: short(f.career),
    schedule: short(f.schedule),
    venue: short(f.venue),
    venueReady: f.venueReady === 'yes' || f.venueReady === 'no' ? f.venueReady : '',
    level: short(f.level),
    cost: short(f.cost),
    areas: short(f.areas),
  };
}

/** Date → 'YYYY-MM-DDTHH:mm'(datetime-local, 한국 시각) — 고치기 화면이 다시 채운다 */
export function kstInputValue(d: Date): string {
  return new Date(d.getTime() + 9 * 3_600_000).toISOString().slice(0, 16);
}

/** 'YYYY-MM-DDTHH:mm'(datetime-local, 한국 시각) → Date. 형식이 틀리면 null */
export function kstDateTime(v: string): Date | null {
  if (!/^\d{4}-\d{2}-\d{2}T\d{2}:\d{2}$/.test(v)) return null;
  const d = new Date(`${v}:00+09:00`);
  return Number.isNaN(d.getTime()) ? null : d;
}

type Fields = (name: string) => string;

/** 시 · 도(꼭) + 시 · 군 · 구(골랐으면 그 시 · 도의 것만) */
function parsePlace(get: Fields): { error: string } | { region: string; district: string | null } {
  const region = get('region');
  if (!isCommunityRegion(region)) return { error: '지역을 골라 주세요.' };
  const district = get('district');
  if (district && !isDistrict(region, district)) return { error: '시 · 군 · 구를 다시 골라 주세요.' };
  return { region, district: district || null };
}

/** 같은 분인가 — 화면 칸(datetime-local)은 분까지라 초 · 밀리초는 버리고 견준다 */
const sameMinute = (a: Date | null | undefined, b: Date | null | undefined) =>
  Math.floor((a?.getTime() ?? NaN) / 60_000) === Math.floor((b?.getTime() ?? NaN) / 60_000);

/** 모일 때 · 경기 때 — 지난 시각 · 60일 넘는 날짜는 막는다 */
function parseWhen(raw: string, now: Date, word: string): { error: string } | { at: Date } {
  const at = kstDateTime(raw);
  if (!at) return { error: `${word} 골라 주세요.` };
  if (at.getTime() < now.getTime()) return { error: '지난 시각이에요. 날짜와 시각을 다시 골라 주세요.' };
  if (at.getTime() > now.getTime() + MEET_AHEAD_MS) return { error: '60일 안의 날짜만 잡을 수 있어요.' };
  return { at };
}

/**
 * 번개 양식 검사 — 언제 · 어디 · 지역 · 몇 명은 꼭. keepAt 이면(고치기에서 날짜를 안 바꿈) 이미 지난 시각이어도 그대로 둔다.
 */
export function parseMeetup(
  get: Fields,
  now: Date,
  keepAt?: Date | null
): { error: string } | { form: MeetupForm; meetAt: Date; region: string; district: string | null } {
  const same = keepAt && sameMinute(kstDateTime(get('meetAt')), keepAt);
  const when = same ? { at: keepAt } : parseWhen(get('meetAt'), now, '언제 모이는지');
  if ('error' in when) return when;
  const meetAt = when.at;
  const place = short(get('place'));
  if (!place) return { error: '어디서 모이는지 적어 주세요.' };
  const where = parsePlace(get);
  if ('error' in where) return where;
  const capacity = Number(get('capacity'));
  if (!Number.isInteger(capacity) || capacity < MEET_CAPACITY_MIN || capacity > MEET_CAPACITY_MAX)
    return { error: `나를 빼고 몇 명을 더 모을지 ${MEET_CAPACITY_MIN}~${MEET_CAPACITY_MAX}명으로 적어 주세요.` };
  return {
    meetAt,
    region: where.region,
    district: where.district,
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

/*
 * 말머리마다 칸 — 꼭 받는 것은 그 글의 목적에 필요한 것만(2026-10-26): 모든 글은 지역, 모집 · 팀 구해요는 포지션, 용병 · 연습경기는 경기 날짜.
 * 말머리가 없는 옛 글은 팀 홍보처럼 다룬다.
 */
export type TeamKind = 'promo' | 'recruit' | 'merc' | 'scrim' | 'seek';
export const teamKindOf = (tag: string | null | undefined): TeamKind =>
  tag === 'recruit' || tag === 'merc' || tag === 'scrim' || tag === 'seek' ? tag : 'promo';
/** 그 말머리가 쓰는 칸(화면 · 검사가 같이 본다) */
export const TEAM_FIELDS: Record<TeamKind, readonly (keyof TeamForm | 'gameAt')[]> = {
  promo: ['team', 'league', 'days', 'ages', 'fee'],
  recruit: ['team', 'positions', 'count', 'career', 'days', 'schedule', 'fee'],
  merc: ['team', 'gameAt', 'venue', 'positions', 'level', 'cost'],
  scrim: ['team', 'gameAt', 'venue', 'venueReady', 'level', 'cost'],
  seek: ['positions', 'career', 'days', 'areas'],
};
/** 경기 날짜가 있는 말머리 — meetAt 에 담아 지나면 신청을 닫는다 */
export const teamHasGame = (kind: TeamKind) => kind === 'merc' || kind === 'scrim';

/** 팀 양식 검사 — 말머리가 쓰지 않는 칸은 비운다(말머리를 바꿔 고쳤을 때 옛 칸이 남지 않게) */
export function parseTeam(
  get: Fields,
  getAll: (name: string) => string[],
  tag: string | null,
  now: Date,
  keepAt?: Date | null
): { error: string } | { form: TeamForm; region: string; district: string | null; meetAt: Date | null } {
  const kind = teamKindOf(tag);
  const uses = new Set<string>(TEAM_FIELDS[kind]);
  const where = parsePlace(get);
  if ('error' in where) return where;
  const form = readTeamForm({
    team: get('team'),
    league: get('league'),
    days: getAll('days'),
    fee: get('fee'),
    ages: get('ages'),
    positions: getAll('positions'),
    count: get('count'),
    career: get('career'),
    schedule: get('schedule'),
    venue: get('venue'),
    venueReady: get('venueReady'),
    level: get('level'),
    cost: get('cost'),
    areas: get('areas'),
  })!;
  const empty = readTeamForm({})!;
  for (const k of Object.keys(form) as (keyof TeamForm)[])
    if (!uses.has(k)) (form as Record<string, unknown>)[k] = empty[k];
  if ((kind === 'recruit' || kind === 'seek') && form.positions.length === 0)
    return { error: kind === 'seek' ? '내 포지션을 골라 주세요.' : '모집할 포지션을 골라 주세요.' };
  let meetAt: Date | null = null;
  if (teamHasGame(kind)) {
    const same = keepAt && sameMinute(kstDateTime(get('gameAt')), keepAt);
    const when = same ? { at: keepAt } : parseWhen(get('gameAt'), now, '경기 날짜와 시각을');
    if ('error' in when) return when;
    meetAt = when.at;
  }
  return { form, region: where.region, district: where.district, meetAt };
}

/**
 * 번개 참가 · 팀 신청을 막는 까닭(없으면 null). 나이를 모르면(생년월일 없음) 막는다 — 낯선 사람과 만나는 일이라.
 * blocked = 글쓴이와 나 사이에 차단이 있음 — 누가 막았는지 드러내지 않는 말로.
 */
export function joinBlockReason(q: {
  age: number | null;
  adultOnly: boolean;
  isAuthor: boolean;
  closed: boolean;
  full: boolean;
  past: boolean;
  cancelled?: boolean;
  blocked?: boolean;
  /** 지난 · 마감 글자 — 번개 '지난 번개', 팀 경기 '지난 경기' */
  word?: string;
}): string | null {
  if (q.isAuthor) return '내 글이에요.';
  if (q.blocked) return '이 글에는 참가할 수 없어요.';
  if (q.cancelled) return '취소된 모임이에요.';
  if (q.past) return `${q.word ?? '지난 번개'}예요.`;
  if (q.closed || q.full) return '마감됐어요.';
  if (q.age === null) return '내 정보에 생년월일을 넣으면 참가할 수 있어요.';
  if (q.age < MEET_MIN_AGE) return `만 ${MEET_MIN_AGE}세부터 참가할 수 있어요.`;
  if (q.adultOnly && q.age < ADULT_AGE) return '성인만 참가하는 번개예요.';
  return null;
}

/* ───────────── 번개 · 경기 상태(2026-10-26) ───────────── */

/**
 * 모집 상태 하나로 — 목록 · 글 · 단추가 같은 말을 쓴다. 결과(held · cancelled)가 먼저, 그다음 시각, 마감, 인원.
 * past = 시각이 지났는데 글쓴이가 결과를 아직 안 남김(참가 신청만으로 '모였어요'로 세지 않는다).
 */
export type GatherState = 'open' | 'full' | 'closed' | 'cancelled' | 'past' | 'held';
export function gatherState(p: {
  meetAt: Date | null;
  closedAt: Date | null;
  outcome: string | null;
  joins: number;
  /** 번개 모집 인원 — 팀 글은 null(인원으로 닫지 않는다) */
  capacity: number | null;
  now: Date;
}): GatherState {
  if (p.outcome === 'cancelled') return 'cancelled';
  if (p.outcome === 'held') return 'held';
  if (p.meetAt && p.meetAt.getTime() < p.now.getTime()) return 'past';
  if (p.closedAt) return 'closed';
  if (p.capacity !== null && p.joins >= p.capacity) return 'full';
  return 'open';
}
const STATE_WORDS: Record<GatherState, string> = {
  open: '모집 중',
  full: '다 찼어요',
  closed: '마감',
  cancelled: '취소됐어요',
  past: '결과 기다림',
  held: '진행 완료',
};
export function gatherStateLabel(state: GatherState, category: string, tag?: string | null): string {
  if (state === 'past') return category === 'meetup' ? '지난 번개' : '지난 경기';
  if (state === 'held') return category === 'meetup' ? '모였어요' : '경기했어요';
  if (state === 'open' && category === 'team' && tag === 'seek') return '팀 찾는 중';
  return STATE_WORDS[state];
}
/** 결과를 남길 수 있는 상태 — 시각이 지났거나(모였어요 · 취소) 시각 전 취소 */
export const OUTCOMES = ['held', 'cancelled'] as const;
export type Outcome = (typeof OUTCOMES)[number];

/** 번개 인원 한 줄 — '1/3명 모집 · 모두 4명'(모집 인원은 글쓴이를 뺀 수) */
export function headcountText(joins: number, capacity: number) {
  return `${joins}/${capacity}명 모집 · 모두 ${capacity + 1}명`;
}

/* ───────────── 팀 신청의 흐름(말머리마다 단추 · 상대 · 상태 말) ───────────── */

export type TeamFlow = { apply: string; cancel: string; who: string; ownerRoom: string; joinerRoom: string; applied: string };
export const TEAM_FLOWS: Record<TeamKind, TeamFlow> = {
  promo: { apply: '문의하기', cancel: '문의 그만두기', who: '문의한 사람', ownerRoom: '문의한 사람과 대화', joinerRoom: '팀과 대화', applied: '문의했어요' },
  recruit: { apply: '지원하기', cancel: '지원 취소', who: '지원자', ownerRoom: '지원자와 대화', joinerRoom: '팀과 대화', applied: '지원했어요' },
  merc: { apply: '용병 지원', cancel: '지원 취소', who: '지원자', ownerRoom: '지원자와 대화', joinerRoom: '팀과 대화', applied: '지원했어요' },
  scrim: { apply: '경기 신청', cancel: '신청 취소', who: '신청한 팀', ownerRoom: '신청한 팀과 대화', joinerRoom: '상대 팀과 대화', applied: '신청했어요' },
  seek: { apply: '우리 팀 제안하기', cancel: '제안 취소', who: '제안한 팀', ownerRoom: '제안한 팀과 대화', joinerRoom: '선수와 대화', applied: '제안했어요' },
};
export const teamFlowOf = (tag: string | null | undefined) => TEAM_FLOWS[teamKindOf(tag)];

/** 팀 신청 진행 — 글쓴이가 신청마다 바꾼다(신청자는 자기 것을 '마이 › 커뮤니티 활동'에서 다시 본다) */
export const JOIN_STATUSES = [
  { key: 'applied', label: '접수' },
  { key: 'accepted', label: '함께해요' },
  { key: 'declined', label: '이번엔 어려워요' },
  { key: 'done', label: '진행 완료' },
] as const;
export type JoinStatus = (typeof JOIN_STATUSES)[number]['key'];
export const isJoinStatus = (v: unknown): v is JoinStatus => JOIN_STATUSES.some((s) => s.key === v);
export const joinStatusLabel = (v: string) => JOIN_STATUSES.find((s) => s.key === v)?.label ?? '접수';

/* ───────────── 고치기 — 참가 판단에 닿는 것이 바뀌었나 ───────────── */

type Facts = {
  meetAt: Date | null;
  region: string | null;
  district: string | null;
  form: { place?: string; venue?: string; cost?: string; fee?: string; capacity?: number } | null;
};
/** 참가자 · 신청자에게 알릴 바뀐 것 — 날짜 · 장소 · 비용 · 인원(글 · 제목만 바뀐 것은 알리지 않는다) */
export function changedFacts(before: Facts, after: Facts): string[] {
  const out: string[] = [];
  if (Boolean(before.meetAt) !== Boolean(after.meetAt) || (before.meetAt && !sameMinute(before.meetAt, after.meetAt))) out.push('날짜');
  const place = (f: Facts) => [f.region, f.district, f.form?.place, f.form?.venue].map((x) => x ?? '').join('|');
  if (place(before) !== place(after)) out.push('장소');
  const cost = (f: Facts) => `${f.form?.cost ?? ''}|${f.form?.fee ?? ''}`;
  if (cost(before) !== cost(after)) out.push('비용');
  if ((before.form?.capacity ?? null) !== (after.form?.capacity ?? null)) out.push('인원');
  return out;
}

/* ───────────── 도배 막기 · 자동 임시 가림(2026-10-26) ───────────── */

/**
 * 서버 쪽 빈도 제한 — DB 의 최근 수로 센다(서버 여러 대여도 같은 수). 끊긴 응답의 다시 보내기는 그 전에 '같은 글'로 걸러져 세지 않는다.
 * 숫자는 보통 쓰는 사람이 닿지 않을 만큼 넉넉히(대화 1분 20개).
 */
export const RATE_LIMITS = {
  post: { max: 5, windowMs: 10 * 60_000, text: '글을 너무 빨리 올리고 있어요. 10분쯤 뒤에 다시 올려 주세요.' },
  comment: { max: 8, windowMs: 60_000, text: '댓글을 너무 빨리 달고 있어요. 1분쯤 뒤에 다시 해 주세요.' },
  message: { max: 20, windowMs: 60_000, text: '말을 너무 빨리 보내고 있어요. 잠시 뒤에 다시 보내 주세요.' },
  report: { max: 20, windowMs: 24 * 60 * 60_000, text: '오늘은 신고를 더 받을 수 없어요. 급한 일은 고객센터로 알려 주세요.' },
} as const;
export type RateKind = keyof typeof RATE_LIMITS;
export const rateLimitError = (kind: RateKind, recent: number) =>
  recent >= RATE_LIMITS[kind].max ? RATE_LIMITS[kind].text : null;

/**
 * 신고가 쌓이면 먼저 가린다(운영자가 보기 전, 되돌릴 수 있게) — 숫자만 보지 않는다:
 * 하루 안의 신고 가운데, 가입한 지 3일 넘은 계정이고 최근 30일 '문제 없음'으로 끝난 신고가 3건 밑인 사람만 센다(새 계정 몰이 · 되풀이 악용).
 * 운영자 글, 운영자가 이미 보고 되살린 글은 저절로 가리지 않는다. 기준을 바꾸려면 이 표만.
 */
export const AUTO_HIDE = {
  reporters: 3,
  windowMs: 24 * 60 * 60_000,
  minAccountAgeMs: 3 * 24 * 60 * 60_000,
  dismissedLimit: 3,
} as const;
export function shouldAutoHide(q: {
  reports: { createdAt: Date; reporterSince: Date; reporterDismissed: number }[];
  now: Date;
  alreadyHidden: boolean;
  authorIsStaff: boolean;
  adminReviewed: boolean;
}): boolean {
  if (q.alreadyHidden || q.authorIsStaff || q.adminReviewed) return false;
  const counted = q.reports.filter(
    (r) =>
      q.now.getTime() - r.createdAt.getTime() <= AUTO_HIDE.windowMs &&
      r.createdAt.getTime() - r.reporterSince.getTime() >= AUTO_HIDE.minAccountAgeMs &&
      r.reporterDismissed < AUTO_HIDE.dismissedLimit
  );
  return counted.length >= AUTO_HIDE.reporters;
}
export const AUTO_HIDE_REASON = '신고가 여러 건 들어와 운영자가 볼 때까지 잠시 가렸어요.';
export const APPEAL_MAX = 500;
export const HIDE_REASON_MAX = 200;
