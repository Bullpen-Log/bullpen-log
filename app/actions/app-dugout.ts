'use server';

import { getCurrentUser } from '@/lib/dal';
import { prisma } from '@/lib/prisma';
import { countryOf, hasKoreaDugout } from '@/lib/country';
import { MEET_LEVELS, POSTS_PER_PAGE, gatherStateLabel, isCommunityRegion, postTagLabel, type GatherState } from '@/lib/community';
import { isDistrict } from '@/lib/kr-districts';
import { loadCommunityList, loadCommunityPost } from '@/lib/community-load';
import { loadSinkerActivity, loadSinkerCommunity, loadSinkerVenue, type VenueCard } from '@/lib/sinker-dugout-load';
import { activitySummary, benchDate, seatsLeft, venueBookingText, venuePriceText, type FeedCard } from '@/lib/sinker-dugout-feed';
import { venueKindLabel } from '@/lib/market/venues';
import { setJoin, setSaved } from '@/app/actions/community';

/**
 * 싱커 앱 덕아웃 탭 첫 화면(앱 화면, 2026-10-29 확정 시안 '매치 카드 + 모임 가로 넘기기') — 둘러보기 · 모임 카드 · 모임 상세 · 참가.
 * 고르기 · 가림 · 차단 · 정원 · 나이 규칙은 웹 덕아웃과 같은 함수(lib/community-load.ts · lib/community-ops.ts)를 그대로 쓴다 — 여기는 앱 모양으로 옮기기만.
 * 모임 = 커뮤니티 '번개' 게시판 글(category meetup), 참가 = CommunityJoin. 대화 · 댓글 · 신고 · 차단은 웹 글 화면(/community/<id>)이 맡는다.
 * 미국 · 일본 싱커는 커뮤니티만(lib/country.ts hasKoreaDugout) — 모임 · 연습장 · 내 활동은 읽지 않는다.
 */
const TO_LOGIN = { ok: false as const, error: '로그인이 필요해요.' };

/** 한국 시각 '오전 10:00' */
const timeKo = (hhmm: string) => {
  const [h, m] = hhmm.split(':').map(Number);
  return `${h < 12 ? '오전' : '오후'} ${h % 12 || 12}:${String(m).padStart(2, '0')}`;
};
const WEEK_KO_FULL: Record<string, string> = { 일: '일요일', 월: '월요일', 화: '화요일', 수: '수요일', 목: '목요일', 금: '금요일', 토: '토요일' };
function when(at: Date) {
  const d = benchDate(at);
  return { month: d.month, day: d.day, weekday: WEEK_KO_FULL[d.dayKo] ?? d.dayKo, time: timeKo(d.time) };
}
const kindOf = (tag: string | null) => postTagLabel('meetup', tag) || '번개';
/* 카드 · 모임 화면의 상태 말 — 다 참 · 마감은 시안대로 '모집 마감' 하나로(웹 글 화면은 '다 찼어요' · '마감'으로 나눠 그대로) */
const stateLabelOf = (state: GatherState, tag: string | null) => (state === 'full' || state === 'closed' ? '모집 마감' : gatherStateLabel(state, 'meetup', tag));

export type ActivityLine = { title: string; sub: string; href: string; meetupId: string | null };

/** 둘러보기의 모임 밖 묶음 — 내 활동 · 커뮤니티 둘 · 연습장 하나. 묶음마다 따로 실패한다(null = 못 불러옴, undefined = 없음) */
export async function loadAppDugout(): Promise<
  | {
      ok: true;
      korea: boolean;
      activity: ActivityLine | null | undefined;
      community: { hot: FeedCard[] | null; latest: FeedCard[] | null };
      venue: VenueCard | null | undefined;
    }
  | typeof TO_LOGIN
> {
  const user = await getCurrentUser();
  if (!user) return TO_LOGIN;
  const korea = hasKoreaDugout(countryOf(user.country));
  const [activity, community, venue] = await Promise.all([
    korea ? loadSinkerActivity(user) : undefined,
    loadSinkerCommunity(user),
    korea ? loadSinkerVenue() : undefined,
  ]);
  const summary = activity ? activitySummary(activity) : null;
  /* 참가한 번개 하나면 그 모임의 참가 티켓으로(앱 화면) — 여럿이면 웹 마이 › 커뮤니티 활동 */
  const one = activity?.length === 1 && activity[0].key.startsWith('meetup:') ? activity[0].key.slice(7) : null;
  return {
    ok: true,
    korea,
    activity: activity === null ? null : summary ? { ...summary, meetupId: one } : undefined,
    community,
    venue,
  };
}

export type MeetupCard = {
  id: string;
  title: string;
  kind: string;
  month: number;
  day: number;
  weekday: string;
  time: string;
  place: string | null;
  area: string | null;
  joins: number;
  capacity: number | null;
  seats: number | null;
  state: GatherState;
  stateLabel: string;
  joined: boolean;
  mine: boolean;
};

/**
 * 같이 연습 — 다가오는 번개(모일 때 가까운 차례, 번개 목록과 같은 거르기: 가림 · 차단 · 나라). 다 찬 · 마감한 모임도 '모집 마감'으로 보이고, 취소된 모임은 뺀다.
 * pages 는 앱이 이어 붙인 장 수(한 장 20개). 지역은 시 · 도(+ 시 · 군 · 구)로만 거른다 — 위치 권한은 쓰지 않는다.
 */
export async function loadAppMeetups(
  region: unknown,
  district: unknown,
  pages: unknown
): Promise<{ ok: true; items: MeetupCard[]; hasMore: boolean } | { ok: false; error: string }> {
  const user = await getCurrentUser();
  if (!user) return TO_LOGIN;
  if (!hasKoreaDugout(countryOf(user.country))) return { ok: true, items: [], hasMore: false };
  const r = isCommunityRegion(region) ? region : undefined;
  const list = await loadCommunityList(user, {
    category: 'meetup',
    when: 'upcoming',
    region: r,
    district: r && isDistrict(r, district) ? district : undefined,
    sort: 'new',
    page: 1,
    pages: Math.min(10, Math.max(1, Math.floor(Number(pages)) || 1)),
  });
  const posts = list.posts.filter((p) => !p.hidden && p.meetAt && p.state !== 'cancelled');
  const ids = posts.map((p) => p.id);
  const [forms, mine] = await Promise.all([
    prisma.communityPost.findMany({ where: { id: { in: ids } }, select: { id: true, form: true, userId: true } }),
    prisma.communityJoin.findMany({ where: { userId: user.id, postId: { in: ids } }, select: { postId: true } }),
  ]);
  const joined = new Set(mine.map((j) => j.postId));
  const formOf = new Map(forms.map((f) => [f.id, f]));
  return {
    ok: true,
    hasMore: list.hasMore,
    items: posts.map((p) => {
      const f = formOf.get(p.id);
      const place = f?.form && typeof f.form === 'object' && 'place' in f.form ? String((f.form as { place?: unknown }).place ?? '') || null : null;
      const state = p.state ?? 'open';
      return {
        id: p.id,
        title: p.title,
        kind: kindOf(p.tag),
        ...when(p.meetAt as Date),
        place,
        area: [p.region, p.district].filter(Boolean).join(' ') || null,
        joins: p.joins,
        capacity: p.capacity,
        seats: seatsLeft(p.capacity, p.joins),
        state,
        stateLabel: stateLabelOf(state, p.tag),
        joined: joined.has(p.id),
        mine: f?.userId === user.id,
      };
    }),
  };
}

export type MeetupDetail = MeetupCard & {
  body: string;
  host: string;
  level: string | null;
  gear: string | null;
  cost: string | null;
  adultOnly: boolean;
  /** 참가 단추를 막는 까닭(로그인 · 나이 · 마감 · 내 글 …) — 이미 참가했으면 null */
  joinBlock: string | null;
  /** 모임 글의 대화방이 열려 있나(모임 다음 날 · 취소하면 닫힘) */
  roomOpen: boolean;
  /** 참가자 이름 — 글쓴이 · 참가자에게만(웹 글 화면과 같은 규칙), 남에게는 빈 목록 */
  joiners: string[];
};

/** 모임 하나(웹 글 화면과 같은 loadCommunityPost) — 없거나 볼 수 없거나 번개가 아니면 null */
async function meetupOf(user: NonNullable<Awaited<ReturnType<typeof getCurrentUser>>>, id: string): Promise<MeetupDetail | null> {
  const p = await loadCommunityPost(user, id);
  if (!p || p.category !== 'meetup' || !p.meetAt || (p.hidden && !p.isOwner)) return null;
  const state = p.state ?? 'open';
  const capacity = p.meetup?.capacity ?? null;
  return {
    id: p.id,
    title: p.title,
    kind: kindOf(p.tag),
    ...when(p.meetAt),
    place: p.meetup?.place ?? null,
    area: [p.region, p.district].filter(Boolean).join(' ') || null,
    joins: p.joinCount,
    capacity,
    seats: seatsLeft(capacity, p.joinCount),
    state,
    stateLabel: stateLabelOf(state, p.tag),
    joined: p.joined,
    mine: p.isOwner,
    body: p.body,
    host: p.nickname,
    level: p.meetup ? (MEET_LEVELS.find((l) => l.key === p.meetup?.level)?.label ?? null) : null,
    gear: p.meetup?.gear || null,
    cost: p.meetup?.cost || null,
    adultOnly: p.meetup?.age === 'adult',
    joinBlock: p.joinBlock,
    roomOpen: p.roomOpen,
    joiners: p.joiners.map((j) => j.nickname),
  };
}

export async function loadAppMeetup(id: unknown): Promise<{ ok: true; meetup: MeetupDetail | null } | { ok: false; error: string }> {
  const user = await getCurrentUser();
  if (!user) return TO_LOGIN;
  if (typeof id !== 'string' || !id) return { ok: true, meetup: null };
  return { ok: true, meetup: await meetupOf(user, id) };
}

/**
 * 참가 · 참가 취소 — 바라는 상태(want 'join' | 'leave')로 받는다(두 번 눌러도 결과가 같다). 정원 · 나이 · 마감 판정과 알림은 웹 setJoin 그대로.
 * 성공이든 실패든 서버의 지금 모임을 같이 돌려준다 — 앱은 그 값으로 화면을 맞춘다(카드의 남은 자리 숫자로 성공을 짐작하지 않는다).
 */
export async function setAppMeetupJoin(
  id: unknown,
  want: unknown
): Promise<{ ok: true; meetup: MeetupDetail | null } | { ok: false; error: string; meetup: MeetupDetail | null }> {
  const user = await getCurrentUser();
  if (!user) return { ...TO_LOGIN, meetup: null };
  if (typeof id !== 'string' || !id || (want !== 'join' && want !== 'leave')) return { ok: false, error: '다시 해 주세요.', meetup: null };
  const fd = new FormData();
  fd.set('postId', id);
  fd.set('want', want);
  const r = await setJoin(undefined, fd);
  const meetup = await meetupOf(user, id);
  return r?.error ? { ok: false, error: r.error, meetup } : { ok: true, meetup };
}

/** 글 저장 · 저장 풀기(둘러보기 커뮤니티 줄의 책갈피) — 웹 setSaved 그대로, 실제 남은 상태를 돌려준다 */
export async function setAppPostSaved(postId: unknown, saved: unknown): Promise<{ ok: true; saved: boolean } | { ok: false; error: string }> {
  const user = await getCurrentUser();
  if (!user) return TO_LOGIN;
  if (typeof postId !== 'string' || !postId || typeof saved !== 'boolean') return { ok: false, error: '다시 해 주세요.' };
  const fd = new FormData();
  fd.set('postId', postId);
  fd.set('saved', saved ? '1' : '0');
  await setSaved(fd);
  const row = await prisma.communitySave.findUnique({ where: { postId_userId: { postId, userId: user.id } }, select: { postId: true } });
  return { ok: true, saved: row !== null };
}

/** 연습장 목록(연습장 칸) — 공개된 장소, 새로 연 곳부터(둘러보기의 한 곳과 같은 차례). 자세히 · 예약은 웹 /venues/<id> */
export async function loadAppVenues(): Promise<
  { ok: true; venues: { id: string; name: string; kindLabel: string; region: string; price: string; unit: string; booking: string }[] } | { ok: false; error: string }
> {
  const user = await getCurrentUser();
  if (!user) return TO_LOGIN;
  if (!hasKoreaDugout(countryOf(user.country))) return { ok: true, venues: [] };
  const rows = await prisma.venue.findMany({
    where: { publicProfile: true, hiddenAt: null },
    orderBy: { createdAt: 'desc' },
    take: POSTS_PER_PAGE * 2,
    select: { id: true, name: true, kind: true, region: true, slotMin: true, pricePerSlot: true, approval: true },
  });
  return {
    ok: true,
    venues: rows.map((v) => ({
      id: v.id,
      name: v.name,
      kindLabel: venueKindLabel(v.kind),
      region: v.region,
      ...venuePriceText(v.pricePerSlot, v.slotMin),
      booking: venueBookingText(v.approval),
    })),
  };
}
