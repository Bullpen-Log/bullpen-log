import 'server-only';
import type { getCurrentUser } from '@/lib/dal';
import { appNow } from '@/lib/clock';
import { toDateKey } from '@/lib/pitch-stats';
import { MEET_LEVELS, joinStatusLabel, postTagLabel, readMeetupForm } from '@/lib/community';
import { loadCommunityList, loadMyCommunity, loadPostExtras } from '@/lib/community-load';
import { relativeTime } from '@/components/community/community-format';
import { prisma } from '@/lib/prisma';
import { createPlaybackUrls } from '@/lib/storage';
import { benchDate, feedCardOf, meetupTagEn, pickAnswer, seatsLeft, venueBookingText, venuePriceText, type FeedCard } from '@/lib/sinker-dugout-feed';
import { bookingStatusLabel, formatSlot } from '@/lib/market/lessons';
import { loadMyBookings } from '@/lib/market/lesson-load';
import { minToTime, venueBookingStatusLabel, venueKindLabel } from '@/lib/market/venues';
import { loadMyVenueBookings } from '@/lib/market/venue-load';

/**
 * 싱커 앱 덕아웃 탭 첫 화면의 자료(2026-10-27 김민 — 선수가 질문하고, 함께 연습하고, 연습장을 찾고, 내 활동을 보는 곳).
 * 2026-10-27 승인 시안 '수정 개선안': 이어 볼 활동 → 같이 연습(번개 한 건) → 커뮤니티 인기글 · 최신글 → 연습장 한 곳. 레슨 찾기 · 추천 코치 · 최근 레슨은 첫 화면에서 뺐다
 * (기존 레슨 예약은 내 활동 · 마이에 그대로 — loadSinkerActivity 가 읽는다).
 * 고르는 기준은 코드로 확인되는 것만 — 게시판 · 말머리 · 답 상태 · 모집 상태 · 내 참가/신청 · 예약 상태. 개인 기록으로 추천하지 않는다.
 * 글은 커뮤니티 목록과 같은 함수(loadCommunityList)로 읽어 가림 · 차단 규칙이 목록과 같다 — 목록에서 안 보이는 글이 여기서 다시 나오지 않는다.
 */
type User = NonNullable<Awaited<ReturnType<typeof getCurrentUser>>>;

export type ActivityItem = { key: string; label: string; title: string; sub: string; href: string };

const LIVE_BOOKING = new Set(['REQUESTED', 'CONFIRMED']);

/**
 * 내 활동 요약 — 확인할 것이 있는 것만, 넷까지: 다가오는 예약 · 참가한 번개(가까운 때부터) → 답이 온 내 질문 → 진행 중인 팀 신청.
 * 하나라도 못 읽으면 null(화면이 '못 불러왔어요'로 가른다 — 빈 것과 다르다).
 */
export async function loadSinkerActivity(user: User): Promise<ActivityItem[] | null> {
  try {
    const now = appNow();
    const today = toDateKey(now);
    const [posts, meetups, team, lessons, venues] = await Promise.all([
      loadMyCommunity(user, 'posts'),
      loadMyCommunity(user, 'meetups'),
      loadMyCommunity(user, 'team'),
      loadMyBookings(user.id),
      loadMyVenueBookings(user.id),
    ]);
    const soon: (ActivityItem & { t: number })[] = [];
    for (const b of lessons) {
      const when = b.chosen ?? b.slot1;
      if (!LIVE_BOOKING.has(b.status) || when.getTime() < now.getTime()) continue;
      soon.push({
        key: `lesson:${b.id}`,
        label: '레슨 예약',
        title: b.org.name,
        sub: `${bookingStatusLabel(b.status)} · ${b.chosen ? formatSlot(b.chosen) : `${formatSlot(b.slot1)} (원하는 때)`}`,
        href: '/me',
        t: when.getTime(),
      });
    }
    for (const b of venues) {
      if (!LIVE_BOOKING.has(b.status) || b.dateKey < today) continue;
      soon.push({
        key: `venue:${b.id}`,
        label: '연습장 예약',
        title: b.venue.name,
        sub: `${venueBookingStatusLabel(b.status)} · ${Number(b.dateKey.slice(5, 7))}/${Number(b.dateKey.slice(8))} ${minToTime(b.startMin)}`,
        href: '/me',
        t: new Date(`${b.dateKey}T00:00:00+09:00`).getTime() + b.startMin * 60_000,
      });
    }
    for (const m of meetups) {
      if (m.hidden || !m.meetAt || m.meetAt.getTime() < now.getTime() || (m.state !== 'open' && m.state !== 'full')) continue;
      soon.push({
        key: `meetup:${m.id}`,
        label: '참가한 번개',
        title: m.title,
        sub: `${formatSlot(m.meetAt)} · 글에서 대화`,
        href: `/community/${m.id}`,
        t: m.meetAt.getTime(),
      });
    }
    soon.sort((a, b) => a.t - b.t);
    const upcoming: ActivityItem[] = soon.map((x) => ({ key: x.key, label: x.label, title: x.title, sub: x.sub, href: x.href }));
    const answered = posts
      .filter((p) => p.category === 'question' && !p.hidden && p.answered && !p.solved)
      .map((p) => ({
        key: `q:${p.id}`,
        label: '답변 있는 질문',
        title: p.title,
        sub: `댓글 ${p.comments}${p.tag ? ` · ${postTagLabel('question', p.tag)}` : ''}`,
        href: `/community/${p.id}`,
      }));
    const applied = team
      .filter((p) => !p.hidden && (p.joinStatus === 'applied' || p.joinStatus === 'accepted'))
      .map((p) => ({
        key: `team:${p.id}`,
        label: '팀 신청',
        title: p.title,
        sub: `${joinStatusLabel(p.joinStatus ?? 'applied')} · 글에서 대화`,
        href: `/community/${p.id}`,
      }));
    return [...upcoming, ...answered.slice(0, 2), ...applied.slice(0, 1)].slice(0, 4);
  } catch (e) {
    console.error('[sinker-dugout] 내 활동', e);
    return null;
  }
}

/** 커뮤니티 카드 수 — 정렬마다 둘만 요약하고 '전체 보기'로 잇는다 */
const CARDS = 2;

/**
 * 커뮤니티 인기글 · 최신글 — 커뮤니티 목록과 같은 함수(loadCommunityList)로 읽어 가림 · 차단 규칙이 목록과 같다.
 * 인기 = 최근 7일에 쓴 글을 좋아요 수 → 쓴 때 차례로(목록의 sort 'hot' · period '7d' 그대로 — 7일 동안 받은 반응 수가 아니다).
 * 최신 = 쓴 때 차례. 둘은 따로 읽고 따로 실패한다(한쪽이 못 읽혀도 다른 쪽은 보인다 — null 이 '못 불러왔어요').
 * 답변 미리보기 · 내 저장은 두 목록의 글을 모아 한 번에(loadPostExtras). 그것만 실패하면 본문 요약으로 보인다.
 */
export async function loadSinkerCommunity(user: User | null): Promise<{ hot: FeedCard[] | null; latest: FeedCard[] | null }> {
  const read = (q: Parameters<typeof loadCommunityList>[1]) =>
    loadCommunityList(user, q)
      .then((r) => r.posts.filter((p) => !p.hidden).slice(0, CARDS))
      .catch((e) => {
        console.error('[sinker-dugout] 커뮤니티', q.sort, e);
        return null;
      });
  const [hot, latest] = await Promise.all([read({ sort: 'hot', period: '7d', page: 1 }), read({ sort: 'new', page: 1 })]);
  const all = [...(hot ?? []), ...(latest ?? [])];
  const ids = [...new Set(all.map((p) => p.id))];
  const qids = [...new Set(all.filter((p) => p.category === 'question' && p.answered).map((p) => p.id))];
  const extras = await loadPostExtras(user, qids, ids).catch((e) => {
    console.error('[sinker-dugout] 답변 미리보기', e);
    return null;
  });
  const now = appNow();
  const card = (p: NonNullable<typeof hot>[number]) => {
    const m = extras?.posts.find((x) => x.id === p.id);
    return feedCardOf(p, {
      answer: m ? pickAnswer(m.comments, m.authorId, m.acceptedId) : null,
      saved: extras?.saved.has(p.id) ?? false,
      ago: relativeTime(p.createdAt, now),
    });
  };
  return { hot: hot?.map(card) ?? null, latest: latest?.map(card) ?? null };
}

export type BenchMeetup = {
  id: string;
  title: string;
  tag: string | null;
  tagLabel: string | null;
  /** 벤치 종이 · 티켓의 영문 종목(CATCHBALL …) */
  tagEn: string;
  place: string | null;
  area: string | null;
  level: string | null;
  date: ReturnType<typeof benchDate>;
  seats: number | null;
  joined: boolean;
};

/**
 * 같이 연습 — 다가오는 모집 중 번개 하나(번개 목록과 같은 거르기: 가림 · 차단 · 마감 · 다 참 · 지난 번개 뺌, 모일 때 가까운 차례).
 * 곳 · 실력 · 내가 참가했는지는 그 글 하나만 더 읽는다. 없으면 undefined, 못 읽으면 null.
 */
export async function loadSinkerMeetup(user: User | null): Promise<BenchMeetup | undefined | null> {
  try {
    const list = await loadCommunityList(user, { category: 'meetup', when: 'upcoming', openOnly: true, sort: 'new', page: 1 });
    const p = list.posts.find((x) => !x.hidden && x.meetAt);
    if (!p?.meetAt) return undefined;
    const row = await prisma.communityPost.findUnique({
      where: { id: p.id },
      select: { form: true, joins: { where: { userId: user?.id ?? '' }, select: { userId: true } } },
    });
    const form = readMeetupForm(row?.form);
    return {
      id: p.id,
      title: p.title,
      tag: p.tag,
      tagLabel: postTagLabel('meetup', p.tag),
      tagEn: meetupTagEn(p.tag),
      place: form?.place ?? null,
      area: [p.region, p.district].filter(Boolean).join(' ') || null,
      level: form ? (MEET_LEVELS.find((l) => l.key === form.level)?.label ?? null) : null,
      date: benchDate(p.meetAt),
      seats: seatsLeft(p.capacity, p.joins),
      joined: (row?.joins.length ?? 0) > 0,
    };
  } catch (e) {
    console.error('[sinker-dugout] 번개', e);
    return null;
  }
}

export type VenueCard = {
  id: string;
  name: string;
  kind: string;
  kindLabel: string;
  region: string | null;
  price: string;
  unit: string;
  booking: string;
  image: string | null;
};

/**
 * 연습장 한 곳 — 공개된 장소(Venue)만(레슨장은 넣지 않는다 — 공용 지도 loadMapPlaces 는 그대로 둘 다 읽는다). 지도 목록과 같은 차례(새로 연 곳부터).
 * 가격은 실제 칸 가격 / 칸 길이, 사진은 장소가 올린 첫 장(없으면 화면이 종류 그림). 없으면 undefined, 못 읽으면 null.
 */
export async function loadSinkerVenue(): Promise<VenueCard | undefined | null> {
  try {
    const v = await prisma.venue.findFirst({
      where: { publicProfile: true, hiddenAt: null },
      orderBy: { createdAt: 'desc' },
      select: { id: true, name: true, kind: true, region: true, slotMin: true, pricePerSlot: true, approval: true, images: true },
    });
    if (!v) return undefined;
    const urls = v.images[0] ? await createPlaybackUrls([v.images[0]]).catch(() => ({}) as Record<string, string>) : {};
    return {
      id: v.id,
      name: v.name,
      kind: v.kind,
      kindLabel: venueKindLabel(v.kind),
      region: v.region,
      ...venuePriceText(v.pricePerSlot, v.slotMin),
      booking: venueBookingText(v.approval),
      image: v.images[0] ? (urls[v.images[0]] ?? null) : null,
    };
  } catch (e) {
    console.error('[sinker-dugout] 연습장', e);
    return null;
  }
}
