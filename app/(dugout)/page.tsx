import Link from 'next/link';
import { headers } from 'next/headers';
import { redirect } from 'next/navigation';
import { RoundIcon } from '@/components/round-icon';
import { ListingCard } from '@/components/dugout/listing-card';
import { SectionHead, chipClass } from '@/components/dugout/ui';
import { getCurrentUser } from '@/lib/dal';
import { isNativeUserAgent, surfaceOf } from '@/lib/app-env';
import { DugoutMain } from '@/components/dugout/dugout-main';
import { HomeSnap } from '@/components/dugout/home-snap';
import { MarketHero, type BannerSlide } from '@/components/dugout/market-hero';
import { CoachAvatar, Stars } from '@/components/dugout/coach-card';
import { countUnread, loadLatestListings, loadPublicPosts } from '@/lib/market/load';
import { loadRecommendedCoaches } from '@/lib/market/lesson-load';
import { GamesPanel } from '@/components/dugout/games-panel';
import { BaseballNews } from '@/components/dugout/baseball-news';
import { kstDateKey, loadBaseballNews, loadHomeGames } from '@/lib/baseball-feed';
import { relativeTime } from '@/components/community/community-format';
import { countUnreadNotifications } from '@/lib/notify';
import { LessonFeedCard } from '@/components/dugout/lesson-feed-card';
import { loadLessonFeed } from '@/lib/org/lesson-feed';
import { usesSinker } from '@/lib/brand';
import { createAvatarUrl } from '@/lib/storage';
import { recentCardOptions } from '@/lib/community-cards';
import { CATEGORIES, filterHref, formatPrice } from '@/lib/market/specs';
import { SPECIALTIES, specialtyLabel } from '@/lib/market/lessons';

/**
 * 덕아웃 홈(2026-10-20).
 * 2026-10-23 금윤호: "홈화면을 숨고처럼" — 숨고 첫 화면 차례 그대로 옮겼다.
 *   '[지역 ∨] 에서 무엇이 필요하세요?' + 넓은 회색 검색 · 옆 단추 → [중고거래 | 레슨 · 예약] 탭과 아이콘 줄 → 얇은 검은 띠(넘어감) →
 *   '방금 올라온 물건'(작은 윗글 · 큰 제목 · 더보기 › · 검은 알약 칩 · 6열 사진) → '오늘의 추천 코치'(테두리 카드) →
 *   '지금 필요한 것, 한 번에'(회색 윗칸 + 아랫줄 카드 넷) → '이번 주 인기글'(두 칸 번호 목록).
 * 흰 바탕 · 가운데 좁은 폭(숨고 960px 쯤).
 * 2026-10-24 금윤호: "처음 메인 시작화면은 이거로" — 큰 로고 화면(dugout-hero)을 걷고 찾기 판(components/dugout/dugout-main.tsx)이 첫 화면.
 *   검색은 통합검색(/search), 아이콘 줄은 [덕아웃 | 싱커] 기능으로 가는 길. 판이 보이는 동안 위 막대는 숨는다.
 */
export default async function DugoutHome({
  searchParams,
}: {
  searchParams: Promise<{ dugout?: string }>;
}) {
  const sp = await searchParams;
  const user = await getCurrentUser();
  /* 앱(싱커 웹뷰)의 / 는 예전처럼 싱커로 — 단 덕아웃 탭(?dugout=1)으로 온 것은 덕아웃(2026-10-21) */
  const ua = (await headers()).get('user-agent');
  const native = isNativeUserAgent(ua);
  if (native && !sp.dugout) redirect(user ? '/today' : '/login');
  /*
   * 싱커 앱의 덕아웃 탭(2026-10-24 김민: "따로 노는 느낌 말고 이어진 느낌 · 덕아웃 정체성은 그대로") — 같은 덕아웃 홈이되 싱커와 이어진 것만:
   * 장터 · 경기 · 뉴스 · 통합검색은 빼고(lib/sinker-dugout.ts), 맨 위에 내 싱커 기록을 덕아웃에 올리는 카드.
   */
  const sinkerApp = surfaceOf(ua) === 'sinker-app';
  const viewer = user ? { id: user.id, role: user.role } : null;
  const sinkerUser = !!user && usesSinker(user);
  const [listings, posts, coaches, alerts, lessons, games, news, avatarUrl, unread, records] = await Promise.all([
    sinkerApp ? [] : loadLatestListings(6, viewer),
    loadPublicPosts(30),
    loadRecommendedCoaches(3),
    user ? countUnreadNotifications(user.id) : 0,
    user ? loadLessonFeed(user.id, 3) : [],
    /* 야구 소식 — 밖 서버가 느리거나 막혀도 홈은 뜬다(실패는 빈 목록 · null) */
    sinkerApp ? ({ kbo: [], mlb: [], npb: [] } as Awaited<ReturnType<typeof loadHomeGames>>) : loadHomeGames(),
    sinkerApp ? null : loadBaseballNews(8),
    user ? createAvatarUrl(user.avatarPath).catch(() => null) : null,
    user ? countUnread(user.id) : 0,
    /* 싱커 기록 카드로 올릴 만한 가장 최근 기록 하나(구속 · 투구 · 3D) — 못 읽어도 홈은 뜬다 */
    sinkerApp && user ? recentCardOptions(user.id).catch(() => []) : [],
  ]);
  const now = new Date();
  const today = kstDateKey(0);
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
      className={chipClass(on, 'md')}
    >
      {label}
    </Link>
  );

  return (
    <div className="space-y-10">
      {/* 홈 — 흰 바탕은 덕아웃 틀이 준다(2026-10-24 UI 통일) */}
      <div>
        {/* 첫 화면 — 통합검색 · 우리 기능 아이콘 줄(이게 보이는 동안 위 막대는 숨는다) */}
        <DugoutMain
          user={user ? { nickname: user.nickname } : null}
          avatarUrl={avatarUrl}
          alerts={alerts}
          unread={unread}
          sinker={sinkerUser}
          native={native}
          sinkerApp={sinkerApp}
        />
        {/*
          경기 칸은 오른쪽에 작게 따로(2026-10-24 금윤호 "야구 일정 결과를 우측으로 작게 빼 달라고") — 휴대폰이 아니면(768px~) 본문 오른쪽의 좁은 칸(220~240px)에 떠서
          내려도 따라오고(sticky), 본문은 왼쪽 넓은 칸 그대로 먼저. 휴대폰만 띠 밑에 오른쪽으로 붙은 작은 카드(본문 맨 위로 올라오지 않게).
        */}
        {/* 두 칸 스크롤(첫 화면 ↔ 본문) — components/dugout/home-snap.tsx 가 이 칸을 위 막대 바로 밑에 세운다(scroll-margin 이 그 틈) */}
        <HomeSnap />
        <div
          data-dugout-content
          className={`mx-auto grid max-w-6xl scroll-mt-3 gap-6 pb-6 md:scroll-mt-5 ${sinkerApp ? '' : 'md:grid-cols-[minmax(0,1fr)_220px] lg:grid-cols-[minmax(0,1fr)_240px] lg:gap-8'}`}
        >
        <div className="min-w-0 space-y-16">
          {/* 로그인한 사람 — 최근 레슨(내 싱커 띠는 2026-10-23 금윤호 "덕아웃에서 내 싱커 블록도 없애줘") */}
          {/* 싱커 → 덕아웃 — 방금 잰 기록을 카드로 붙여 글을 연다(싱커 앱 안만, docs/designs/dugout-community.md '싱커에서 올리기') */}
          {records[0] && (
            <Link
              href={`/community/new?card=${encodeURIComponent(records[0].ref)}`}
              className="flex items-center gap-4 rounded-2xl border border-line bg-surface p-(--block-pad) transition-colors active:bg-ink/4"
            >
              <span className="grid h-12 w-12 shrink-0 place-items-center rounded-full bg-sky text-white">
                <RoundIcon name="community" filled className="h-6 w-6" />
              </span>
              <span className="min-w-0 flex-1">
                <span className="block text-xs text-muted">싱커 기록을 덕아웃에</span>
                <span className="mt-0.5 block truncate text-[15px] font-bold text-ink">{records[0].title}</span>
                <span className="block truncate text-[13px] text-muted">{records[0].detail} · 글로 올려 보세요</span>
              </span>
              <span aria-hidden className="text-muted">
                ›
              </span>
            </Link>
          )}

          {lessons.length > 0 && <LessonFeedCard items={lessons} compact title="최근 레슨" />}

          {!sinkerApp && <MarketHero slides={slides} slim label="덕아웃 소식" />}

          {/* 휴대폰 · 태블릿의 경기 칸 — 오른쪽으로 붙은 작은 카드(PC 는 오른쪽 칸) */}
          <div className={sinkerApp ? 'hidden' : 'flex justify-end md:hidden'}>
            <div className="w-full sm:w-80">
              <GamesPanel games={games} today={today} />
            </div>
          </div>

          {/* 야구 뉴스 — 네이버 검색 열쇠가 있을 때만(경기 결과는 오른쪽 칸) */}
          {newsRows && newsRows.length > 0 && <BaseballNews news={newsRows} />}

          {/* 장터 — 싱커 앱에는 없다 */}
          <section className={sinkerApp ? 'hidden' : 'space-y-4'}>
            <SectionHead kicker="덕아웃 장터에서" title="방금 올라온 물건" href="/market" />
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
              <div className="grid grid-cols-2 gap-x-4 gap-y-8 sm:grid-cols-3">
                {listings.map((item) => (
                  <ListingCard key={item.id} item={item} now={now} />
                ))}
              </div>
            )}
          </section>

          {/* 추천 코치 — 숨고 '오늘의 추천 고수' */}
          <section className="space-y-4">
            <SectionHead title="오늘의 추천 코치" href="/lessons/list" />
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

          {/* 지금 필요한 것 — 숨고 '지금 필요한 서비스, 한번에 견적 받기'(장비 · 물건 팔기가 섞여 싱커 앱에는 없다) */}
          <section className={sinkerApp ? 'hidden' : 'space-y-4'}>
            <SectionHead title="지금 필요한 것, 한 번에" />
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
            <SectionHead title="이번 주 인기글" href={user ? '/community' : '/login?next=/community'} />
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
        <aside className={sinkerApp ? 'hidden' : 'hidden md:block'}>
          <div className="sticky top-24">
            <GamesPanel games={games} today={today} />
          </div>
        </aside>
        </div>
      </div>
    </div>
  );
}
