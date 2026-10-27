import 'server-only';
import type { getCurrentUser } from '@/lib/dal';
import { appNow } from '@/lib/clock';
import { toDateKey } from '@/lib/pitch-stats';
import { gatherStateLabel, headcountText, joinStatusLabel, postTagLabel } from '@/lib/community';
import { loadCommunityList, loadMyCommunity } from '@/lib/community-load';
import { bookingStatusLabel, formatSlot } from '@/lib/market/lessons';
import { loadMyBookings } from '@/lib/market/lesson-load';
import { minToTime, venueBookingStatusLabel } from '@/lib/market/venues';
import { loadMyVenueBookings } from '@/lib/market/venue-load';

/**
 * 싱커 앱 덕아웃 탭 첫 화면의 자료(2026-10-27 김민 — 선수가 질문하고, 함께 연습하고, 코치 · 연습장을 찾고, 내 활동을 보는 곳).
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
        label: '답이 온 내 질문',
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

export type FeedPost = { id: string; title: string; sub: string };

/**
 * 질문 · 답변(최근 셋 + 답을 기다리는 수) · 같이 연습(다가오는 모집 중 번개 셋). 못 읽으면 null.
 * 관리자에게도 가린 글은 빼고 보인다(요약은 누구에게나 같은 글).
 */
export async function loadSinkerDugoutFeed(user: User | null) {
  try {
    const [q, waiting, meet] = await Promise.all([
      loadCommunityList(user, { category: 'question', sort: 'new', page: 1 }),
      loadCommunityList(user, { category: 'question', answer: 'none', sort: 'new', page: 1 }),
      loadCommunityList(user, { category: 'meetup', when: 'upcoming', openOnly: true, sort: 'new', page: 1 }),
    ]);
    const questions: FeedPost[] = q.posts
      .filter((p) => !p.hidden)
      .slice(0, 3)
      .map((p) => ({
        id: p.id,
        title: p.title,
        sub: [p.tag ? postTagLabel('question', p.tag) : null, p.solved ? '해결' : p.answered ? `답 ${p.comments}` : '답 기다림'].filter(Boolean).join(' · '),
      }));
    const waitingVisible = waiting.posts.filter((p) => !p.hidden).length;
    const meetups: FeedPost[] = meet.posts
      .filter((p) => !p.hidden)
      .slice(0, 3)
      .map((p) => ({
        id: p.id,
        title: p.title,
        sub: [
          p.meetAt ? formatSlot(p.meetAt) : null,
          p.district ?? p.region,
          p.capacity ? headcountText(p.joins, p.capacity) : `${p.joins}명 참가`,
          p.state ? gatherStateLabel(p.state, 'meetup', p.tag) : null,
        ]
          .filter(Boolean)
          .join(' · '),
      }));
    return { questions, waiting: { count: waitingVisible, more: waiting.hasMore }, meetups };
  } catch (e) {
    console.error('[sinker-dugout] 글', e);
    return null;
  }
}
