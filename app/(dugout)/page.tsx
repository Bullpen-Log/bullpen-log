import Link from 'next/link';
import { headers } from 'next/headers';
import { redirect } from 'next/navigation';
import { RoundIcon, RoundSearch } from '@/components/round-icon';
import { ListingCard } from '@/components/dugout/listing-card';
import { getCurrentUser } from '@/lib/dal';
import { isNativeUserAgent } from '@/lib/app-env';
import { DugoutHero } from '@/components/dugout/dugout-hero';
import { HomeServices } from '@/components/dugout/home-services';
import { MarketHero, type BannerSlide } from '@/components/dugout/market-hero';
import { CoachAvatar, Stars } from '@/components/dugout/coach-card';
import { countUnread, loadLatestListings, loadPublicPosts } from '@/lib/market/load';
import { loadRecommendedCoaches } from '@/lib/market/lesson-load';
import { BaseballBoard } from '@/components/dugout/baseball-board';
import { loadBaseballNews, loadLeagueBoard } from '@/lib/baseball-feed';
import { relativeTime } from '@/components/community/community-format';
import { countUnreadNotifications } from '@/lib/notify';
import { LessonFeedCard } from '@/components/dugout/lesson-feed-card';
import { loadLessonFeed } from '@/lib/org/lesson-feed';
import { usesSinker } from '@/lib/brand';
import { CATEGORIES, REGIONS, filterHref, formatPrice } from '@/lib/market/specs';
import { SPECIALTIES, specialtyLabel } from '@/lib/market/lessons';

/**
 * 덕아웃 홈(2026-10-20) — 맨 위는 큰 로고 첫 화면(components/dugout/dugout-hero.tsx), 접히면 이 홈.
 * 2026-10-23 금윤호: "홈화면을 숨고처럼" — 숨고 첫 화면 차례 그대로 옮겼다.
 *   '[지역 ∨] 에서 무엇이 필요하세요?' + 넓은 회색 검색 · 옆 단추 → [중고거래 | 레슨 · 예약] 탭과 아이콘 줄 → 얇은 검은 띠(넘어감) →
 *   '방금 올라온 물건'(작은 윗글 · 큰 제목 · 더보기 › · 검은 알약 칩 · 6열 사진) → '오늘의 추천 코치'(테두리 카드) →
 *   '지금 필요한 것, 한 번에'(회색 윗칸 + 아랫줄 카드 넷) → '이번 주 인기글'(두 칸 번호 목록).
 * 흰 바탕 · 가운데 좁은 폭(숨고 960px 쯤). 위 막대 · 아래 탭의 '홈'은 ?home=1 — 큰 로고 없이 이 홈부터.
 */
export default async function DugoutHome({
  searchParams,
}: {
  searchParams: Promise<{ dugout?: string; home?: string }>;
}) {
  const sp = await searchParams;
  const user = await getCurrentUser();
  /* 앱(싱커 웹뷰)의 / 는 예전처럼 싱커로 — 단 덕아웃 탭(?dugout=1)으로 온 것은 덕아웃(2026-10-21) */
  const native = isNativeUserAgent((await headers()).get('user-agent'));
  if (native && !sp.dugout) redirect(user ? '/today' : '/login');
  const viewer = user ? { id: user.id, role: user.role } : null;
  const sinkerUser = !!user && usesSinker(user);
  const [listings, posts, coaches, unread, alerts, lessons, kbo, mlb, news] = await Promise.all([
    loadLatestListings(6, viewer),
    loadPublicPosts(30),
    loadRecommendedCoaches(3),
    user ? countUnread(user.id) : 0,
    user ? countUnreadNotifications(user.id) : 0,
    user ? loadLessonFeed(user.id, 3) : [],
    /* 야구 소식 — 밖 서버가 느리거나 막혀도 홈은 뜬다(실패는 빈 목록 · null) */
    loadLeagueBoard('kbo'),
    loadLeagueBoard('mlb'),
    loadBaseballNews(8),
  ]);
  const now = new Date();
  const today = new Date(now.getTime() + 9 * 3_600_000).toISOString().slice(0, 10);
  const newsRows = news?.map((n) => ({ ...n, ago: relativeTime(new Date(n.at), now) })) ?? null;

  /* 인기글 — 이번 주 글 가운데 좋아요 + 댓글 많은 차례(이번 주 글이 모자라면 최근 글로 채움) */
  const weekAgo = now.getTime() - 7 * 86_400_000;
  const hot = [...posts]
    .sort((a, b) => {
      const wa = a.createdAt.getTime() >= weekAgo ? 1 : 0;
      const wb = b.createdAt.getTime() >= weekAgo ? 1 : 0;
      return wb - wa || b.likes + b.comments - (a.likes + a.comments) || b.createdAt.getTime() - a.createdAt.getTime();
    })
    .slice(0, 6);

  const slides: BannerSlide[] = [
    {
      kicker: '싱커',
      title: ['던진 만큼 적으면, 오늘 할 일을 정해 줘요'],
      href: user ? '/sinker' : '/login?signup=1',
      icon: 'pitcher',
    },
    { kicker: '레슨', title: ['코치를 비교하고, 원하는 시간에 예약해요'], href: '/lessons/find', icon: 'lesson' },
    { kicker: '장터', title: ['안 쓰는 글러브, 30초면 올려요'], href: '/market/new', icon: 'baseball' },
    { kicker: '연습장', title: ['빈 시간을 보고 전화 없이 바로 잡아요'], href: '/venues', icon: 'venue' },
  ];

  const needs: { kicker: string; title: string; foot: string; href: string; icon: 'gear' | 'lesson' | 'venue' | 'plus' }[] = [
    { kicker: '처음 시작한다면', title: '장비 추천', foot: '나이 · 포지션으로 골라요', href: '/market?guide=1', icon: 'gear' },
    { kicker: '실력을 올리고 싶다면', title: '레슨 찾기', foot: '코치 비교하기', href: '/lessons/find', icon: 'lesson' },
    { kicker: '던질 곳이 필요하면', title: '연습장 예약', foot: '빈 시간 보기', href: '/venues', icon: 'venue' },
    { kicker: '쓰던 장비 정리', title: '물건 팔기', foot: '30초 만에 올리기', href: '/market/new', icon: 'plus' },
  ];

  const chip = (href: string, label: string, on = false) => (
    <Link
      key={href + label}
      href={href}
      className={`inline-flex min-h-9 shrink-0 items-center rounded-full px-3.5 text-[13px] font-semibold whitespace-nowrap transition-colors ${
        on ? 'bg-ink text-page' : 'border border-line text-ink hover:border-ink/40'
      }`}
    >
      {label}
    </Link>
  );

  return (
    <div className="space-y-10">
      <DugoutHero
        start={sp.home === '1' ? 'home' : 'big'}
        user={user ? { nickname: user.nickname } : null}
        unread={unread}
        alerts={alerts}
        sinker={sinkerUser}
        native={native}
      />

      {/* 홈 — 흰 바탕을 화면 끝까지(장터와 같은 틀) */}
      <div className="relative isolate before:absolute before:-top-10 before:-bottom-40 before:left-1/2 before:-z-10 before:w-screen before:-translate-x-1/2 before:bg-surface">
        <div className="mx-auto max-w-5xl space-y-16 pb-6">
          {/* 찾기 — 숨고 '강남구 ∨ 에서 어떤 서비스가 필요하세요?' */}
          <section className="pt-4 md:pt-10">
            <form action="/market" method="get" role="search" className="space-y-6">
              <h1 className="flex flex-wrap items-center justify-center gap-x-1.5 text-center text-[22px] font-bold text-ink md:text-[28px]">
                <span className="relative inline-flex items-center">
                  <select
                    name="region"
                    aria-label="지역"
                    defaultValue=""
                    className="cursor-pointer appearance-none bg-transparent pr-6 [font:inherit] text-ink focus:outline-none"
                  >
                    <option value="">전국</option>
                    {REGIONS.filter((r) => r !== '전국(택배)').map((r) => (
                      <option key={r} value={r}>
                        {r}
                      </option>
                    ))}
                  </select>
                  <RoundIcon
                    name="back"
                    aria-hidden
                    className="pointer-events-none absolute right-0 h-4 w-4 -rotate-90 text-ink"
                  />
                </span>
                <span>에서 무엇이 필요하세요?</span>
              </h1>
              <div className="mx-auto flex max-w-xl items-center gap-2">
                <label className="relative min-w-0 flex-1">
                  <RoundSearch className="pointer-events-none absolute top-1/2 left-4 h-4.5 w-4.5 -translate-y-1/2 text-muted" />
                  <input
                    name="q"
                    type="search"
                    placeholder="글러브, 배트, 찾는 물건"
                    aria-label="찾는 물건"
                    className="min-h-12 w-full appearance-none rounded-xl bg-ink/6 pr-4 pl-11 text-[15px] text-ink placeholder:text-muted/70 focus:bg-surface focus:ring-2 focus:ring-sky focus:outline-none"
                  />
                </label>
                <Link
                  href="/lessons/find"
                  className="inline-flex min-h-12 shrink-0 items-center gap-1.5 rounded-xl bg-ink/6 px-4 text-sm font-bold text-ink transition-colors hover:bg-ink/10"
                >
                  <RoundIcon name="lesson" filled className="h-4.5 w-4.5 text-sky" />
                  <span className="hidden sm:inline">맞춤 코치 찾기</span>
                  <span className="sm:hidden">코치</span>
                </Link>
              </div>
            </form>
            <div className="mt-8">
              <HomeServices />
            </div>
          </section>

          {/* 로그인한 사람 — 최근 레슨(내 싱커 띠는 2026-10-23 금윤호 "덕아웃에서 내 싱커 블록도 없애줘") */}
          {lessons.length > 0 && <LessonFeedCard items={lessons} compact title="최근 레슨" />}

          <MarketHero slides={slides} slim label="덕아웃 소식" />

          {/* 야구 소식 — 경기 결과(KBO · MLB) · 야구 뉴스 */}
          <BaseballBoard boards={[kbo, mlb]} news={newsRows} today={today} />

          {/* 장터 */}
          <section className="space-y-4">
            <Head kicker="덕아웃 장터에서" title="방금 올라온 물건" href="/market" />
            <div className="no-scrollbar -mx-4 flex gap-2 overflow-x-auto px-4 md:mx-0 md:flex-wrap md:px-0">
              {chip('/market', '전체', true)}
              {CATEGORIES.slice(0, 8).map((c) => chip(filterHref({ category: c.key }), c.label))}
            </div>
            {listings.length === 0 ? (
              <p className="py-10 text-center text-sm text-muted">
                아직 올라온 물건이 없어요 ·{' '}
                <Link href="/market/new" className="font-semibold text-sky">
                  첫 물건 올리기
                </Link>
              </p>
            ) : (
              <div className="grid grid-cols-2 gap-x-4 gap-y-8 sm:grid-cols-3 lg:grid-cols-6">
                {listings.map((item) => (
                  <ListingCard key={item.id} item={item} now={now} />
                ))}
              </div>
            )}
          </section>

          {/* 추천 코치 — 숨고 '오늘의 추천 고수' */}
          <section className="space-y-4">
            <Head title="오늘의 추천 코치" href="/lessons/list" />
            <div className="no-scrollbar -mx-4 flex gap-2 overflow-x-auto px-4 md:mx-0 md:flex-wrap md:px-0">
              {chip('/lessons/list', '전체', true)}
              {SPECIALTIES.map((s) => chip(`/lessons/list?specialty=${s.key}`, s.label))}
            </div>
            {coaches.length === 0 ? (
              <p className="py-10 text-center text-sm text-muted">아직 공개한 코치가 없어요.</p>
            ) : (
              <div className="grid gap-4 md:grid-cols-3">
                {coaches.map((c) => (
                  <Link
                    key={c.id}
                    href={`/lessons/${c.id}`}
                    className="group block overflow-hidden rounded-2xl border border-line bg-surface transition-shadow hover:shadow-md"
                  >
                    <div className="space-y-1.5 p-5">
                      <p className="truncate text-xs text-muted">
                        {c.specialties.length ? c.specialties.map(specialtyLabel).join(' · ') : '레슨'}
                      </p>
                      <p className="truncate text-base font-bold text-ink">{c.name}</p>
                      <p className="flex items-center gap-1.5 text-xs text-muted">
                        <Stars rating={c.rating} reviews={c.reviews} />
                        {c.region && <span>· {c.region}</span>}
                      </p>
                    </div>
                    <div className="flex items-center gap-3 border-t border-line bg-ink/3 px-5 py-4">
                      <CoachAvatar name={c.coach} />
                      <span className="min-w-0 flex-1">
                        <span className="block truncate text-sm font-semibold text-ink">{c.coach} 코치</span>
                        <span className="block truncate text-xs text-muted">{c.nextOpen ?? '시간은 문의해요'}</span>
                      </span>
                      <span className="shrink-0 text-sm font-bold text-ink">
                        {c.trialPrice != null
                          ? `체험 ${formatPrice(c.trialPrice)}`
                          : c.priceFrom != null
                            ? `${formatPrice(c.priceFrom)}~`
                            : ''}
                      </span>
                    </div>
                  </Link>
                ))}
              </div>
            )}
          </section>

          {/* 지금 필요한 것 — 숨고 '지금 필요한 서비스, 한번에 견적 받기' */}
          <section className="space-y-4">
            <Head title="지금 필요한 것, 한 번에" />
            <div className="grid grid-cols-2 gap-3 md:grid-cols-4 md:gap-4">
              {needs.map((n) => (
                <Link
                  key={n.href}
                  href={n.href}
                  className="group overflow-hidden rounded-2xl border border-line bg-surface transition-shadow hover:shadow-md"
                >
                  <span className="relative block h-28 bg-ink/4 px-4 pt-4 md:h-32">
                    <span className="block text-xs text-muted">{n.kicker}</span>
                    <span className="mt-1 block text-[15px] font-bold text-ink">{n.title}</span>
                    <span className="absolute right-3 bottom-3 grid h-14 w-14 place-items-center rounded-full bg-sky text-white transition-transform group-hover:-translate-y-0.5 md:h-16 md:w-16">
                      <RoundIcon name={n.icon} filled className="h-8 w-8" />
                    </span>
                  </span>
                  <span className="flex min-h-12 items-center justify-between px-4 text-[13px] font-semibold text-ink">
                    {n.foot}
                    <span aria-hidden className="text-muted">
                      ›
                    </span>
                  </span>
                </Link>
              ))}
            </div>
          </section>

          {/* 인기글 — 숨고 '이번 주 강남구 주변 인기글' */}
          <section className="space-y-4">
            <Head title="이번 주 인기글" href={user ? '/community' : '/login?next=/community'} />
            {hot.length === 0 ? (
              <p className="py-10 text-center text-sm text-muted">
                아직 글이 없어요 ·{' '}
                <Link href={user ? '/community/new' : '/login?next=/community/new'} className="font-semibold text-sky">
                  첫 글 쓰기
                </Link>
              </p>
            ) : (
              <ol className="grid gap-x-10 md:grid-flow-col md:grid-cols-2 md:grid-rows-3">
                {hot.map((p, i) => (
                  <li key={p.id} className="border-b border-line">
                    <Link
                      href={user ? `/community/${p.id}` : '/login?next=/community'}
                      className="flex gap-3 py-4 transition-colors hover:bg-ink/3"
                    >
                      <span className="w-4 shrink-0 text-[15px] font-bold text-sky tabular-nums">{i + 1}</span>
                      <span className="min-w-0 flex-1">
                        <span className="block truncate text-[15px] font-bold text-ink">{p.title}</span>
                        <span className="mt-1 block truncate text-[13px] text-muted">{p.preview}</span>
                        <span className="mt-1.5 block text-xs text-muted">
                          좋아요 {p.likes} · 댓글 {p.comments}
                        </span>
                      </span>
                    </Link>
                  </li>
                ))}
              </ol>
            )}
          </section>
        </div>
      </div>
    </div>
  );
}

function Head({ kicker, title, href }: { kicker?: string; title: string; href?: string }) {
  return (
    <div className="flex items-end justify-between gap-3">
      <div className="min-w-0">
        {kicker && <p className="text-[13px] text-muted">{kicker}</p>}
        <h2 className="mt-0.5 text-xl font-bold text-ink">{title}</h2>
      </div>
      {href && (
        <Link href={href} className="shrink-0 text-sm text-muted hover:text-ink">
          더보기 ›
        </Link>
      )}
    </div>
  );
}
