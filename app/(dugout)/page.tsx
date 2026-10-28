import Link from 'next/link';
import { countryOf, hasKoreaDugout } from '@/lib/country';
import { headers } from 'next/headers';
import { redirect } from 'next/navigation';
import { RoundIcon } from '@/components/round-icon';
import { LISTING_GRID, ListingCard } from '@/components/dugout/listing-card';
import { SectionHead, chipClass } from '@/components/dugout/ui';
import { getCurrentUser } from '@/lib/dal';
import { isNativeUserAgent, surfaceOf } from '@/lib/app-env';
import { DugoutMain } from '@/components/dugout/dugout-main';
import { SinkerDugoutHome } from '@/components/dugout/sinker-dugout-home';
import { loadSinkerActivity, loadSinkerCommunity, loadSinkerMeetup, loadSinkerVenue } from '@/lib/sinker-dugout-load';
import { HomeSnap } from '@/components/dugout/home-snap';
import { type HomeCard } from '@/components/dugout/home-carousel';
import { CoachRow, Stars } from '@/components/dugout/coach-card';
import { countUnread, loadLatestListings, loadPublicPosts } from '@/lib/market/load';
import { loadRecommendedCoaches } from '@/lib/market/lesson-load';
import { loadMapPlaces } from '@/lib/market/map-load';
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
import { CATEGORIES, filterHref } from '@/lib/market/specs';
import { SPECIALTIES } from '@/lib/market/lessons';

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
  /* 덕아웃 앱(2026-10-26 김민) — 첫 화면의 싱커 S 단추 · 아이콘 줄의 경기 일정을 뺀다. 웹은 그대로 */
  const dugoutApp = surfaceOf(ua) === 'dugout-app';
  const viewer = user ? { id: user.id, role: user.role } : null;
  const sinkerUser = !!user && usesSinker(user);
  /*
   * 싱커 앱의 덕아웃 탭(2026-10-27 김민) — 선수 활동 공간: 내 활동 · 같이 연습 · 커뮤니티 · 연습장. 큰 로고 · 장터 · 경기 · 뉴스 · 검색 · 장터 채팅은 없다.
   * 자기 자료만 읽고 바로 그린다(덕아웃 웹 · 덕아웃 앱의 첫 화면은 아래 그대로). 글은 커뮤니티 목록과 같은 함수라 차단 · 가림 규칙이 같다.
   */
  if (sinkerApp) {
    /*
     * 2026-10-27 승인 시안 '수정 개선안' — 이어 볼 활동 · 같이 연습(번개 한 건) · 커뮤니티 인기/최신 · 연습장 한 곳. 레슨 찾기 · 추천 코치 · 최근 레슨 조회는 뺐다
     * (기존 레슨 예약은 loadSinkerActivity 가 그대로 읽는다). 구역마다 따로 실패한다.
     */
    /* 미국 · 일본 싱커는 커뮤니티 · 기록 공유만(lib/country.ts) — 내 활동(예약 · 번개) · 같이 연습 · 연습장은 한국 것이라 읽지도 않는다 */
    const korea = hasKoreaDugout(countryOf(user?.country));
    const [activity, meetup, community, venue, sinkerRecords] = await Promise.all([
      user && korea ? loadSinkerActivity(user) : undefined,
      korea ? loadSinkerMeetup(user) : undefined,
      loadSinkerCommunity(user),
      korea ? loadSinkerVenue() : undefined,
      /* 기록 공유 카드 — 정책을 다시 정할 때까지 예전 그대로(가장 최근 기록 하나, 못 읽어도 홈은 뜬다) */
      user ? recentCardOptions(user.id).catch(() => []) : [],
    ]);
    return (
      <SinkerDugoutHome
        activity={activity}
        meetup={meetup}
        community={community}
        venue={venue}
        record={sinkerRecords[0] ?? null}
        loggedIn={!!user}
        korea={korea}
      />
    );
  }
  const [listings, posts, coaches, alerts, lessons, games, news, avatarUrl, unread, records, places] = await Promise.all([
    sinkerApp ? [] : loadLatestListings(6, viewer),
    /* 내가 차단한 사람의 글은 빼고(커뮤니티 목록 · 검색과 같은 규칙) */
    loadPublicPosts(30, user?.id ?? null),
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
    /* 연습장 · 레슨장 앞 세 곳 — 못 읽어도 홈은 뜬다 */
    sinkerApp ? [] : loadMapPlaces().catch(() => []),
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

  /*
   * 둘러보기 카드(2026-10-26) — 예전 소식 띠의 네 장(싱커 · 레슨 · 장터 · 연습장) 글을 그대로 쓰고, 실제로 있는 길 둘(커뮤니티 · 경기 일정)을 더했다.
   * 카드 하나 = 한 곳. 되는 일만 적는다.
   */
  const cards: HomeCard[] = [
    { kicker: '장터', title: '쓰던 장비, 야구인끼리 사고팔아요', desc: '글러브 · 배트를 규격으로 골라 보기', href: '/market', icon: 'market', tone: 'dark' },
    { kicker: '레슨', title: '코치를 비교하고, 원하는 시간에 예약해요', desc: '종목 · 지역 · 시간으로 찾기', href: '/lessons/find', icon: 'lesson', tone: 'sky' },
    { kicker: '연습장', title: '빈 시간을 보고 전화 없이 바로 잡아요', desc: '지도에서 연습장 · 레슨장 보기', href: '/venues', icon: 'venue', tone: 'soft' },
    { kicker: '커뮤니티', title: '야구인끼리 묻고 답해요', desc: '자유 · 질문 · 번개 · 팀 홍보', href: '/community', icon: 'community', tone: 'dark' },
    { kicker: '경기 일정', title: 'KBO · MLB · NPB 오늘 경기', desc: '선발 · 점수 · 경기 기록', href: '/baseball', icon: 'baseball', tone: 'soft' },
    {
      kicker: '싱커',
      title: '던진 만큼 적으면, 오늘 할 일을 정해 줘요',
      desc: '선수용 기록 앱',
      href: user ? '/sinker' : '/login?signup=1',
      icon: 'pitcher',
      tone: 'sky',
    },
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
          sinker={sinkerUser && !dugoutApp}
          native={native}
          sinkerApp={sinkerApp}
          dugoutApp={dugoutApp}
          manage={!!user && (user.accountType === 'MASTER' || user.role === 'ADMIN')}
          cards={sinkerApp ? undefined : cards}
          aside={sinkerApp ? undefined : <GamesPanel games={games} today={today} />}
        />
        {/*
          경기 칸은 오른쪽에 작게 따로(2026-10-24 금윤호 "야구 일정 결과를 우측으로 작게 빼 달라고") — 휴대폰이 아니면(768px~) 본문 오른쪽의 좁은 칸(220~240px)에 떠서
          내려도 따라오고(sticky), 본문은 왼쪽 넓은 칸 그대로 먼저. 휴대폰만 띠 밑에 오른쪽으로 붙은 작은 카드(본문 맨 위로 올라오지 않게).
        */}
        {/* 두 칸 스크롤(첫 화면 ↔ 본문) — 손가락 화면 · 폭 1024 밑만. components/dugout/home-snap.tsx 가 이 칸을 위 막대 바로 밑에 세운다(scroll-margin 이 그 틈) */}
        <HomeSnap free={sinkerApp || dugoutApp} />
        {/*
          본문(2026-10-26 v2 — docs/designs/dugout-desktop-layout-v2-plan.md 7절 홈). 큰 화면(lg)은 진입 판 없이 바로 이것: 주 칸(1160 기준 872) + 간격 24 + 오늘 경기 264.
          주 칸 차례 — 짧은 제목 줄 → 새로 올라온 장비 넷 → 커뮤니티 세 줄 → 추천 코치 → 연습장 · 레슨장. 같은 줄(grid row)에 둬서 예전 '-mt-48' 끌어올리기가 없다.
          휴대폰 · 패드는 예전 차례 그대로(경기는 판 띠 옆 · 본문 카드).
        */}
        <div
          data-dugout-content
          className={`grid scroll-mt-3 gap-6 pb-6 md:scroll-mt-5 ${sinkerApp ? '' : 'lg:grid-cols-[minmax(0,1fr)_264px]'}`}
        >
        <div className="min-w-0 space-y-16 lg:space-y-10">
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

          {/* 휴대폰의 경기 칸 — 오른쪽으로 붙은 작은 카드(패드는 첫 판 띠 옆, 큰 화면은 오른쪽 칸) */}
          <div className={sinkerApp ? 'hidden' : 'flex justify-end md:hidden'}>
            <div className="w-full sm:w-80">
              <GamesPanel games={games} today={today} />
            </div>
          </div>

          {/* 야구 뉴스 — 네이버 검색 열쇠가 있을 때만 */}
          {newsRows && newsRows.length > 0 && <BaseballNews news={newsRows} />}

          {/* 장터 — 싱커 앱에는 없다. 두 칸 스크롤의 본문 자리(B)는 이 묶음이 위 막대 바로 밑에 오는 곳 */}
          <section data-dugout-snap className={sinkerApp ? 'hidden' : '@container scroll-mt-4 space-y-4 md:scroll-mt-6 lg:space-y-3'}>
            {/* 큰 화면은 제목 · 품목 넷 · 전체 보기를 한 줄에 — 첫 사진이 y220 안에서 시작하게(v2 첫 화면 예산) */}
            <div className="space-y-4 lg:flex lg:items-end lg:justify-between lg:gap-4 lg:space-y-0">
              <SectionHead
                kicker={<span className="lg:hidden">덕아웃 장터에서</span>}
                title="방금 올라온 물건"
                action={
                  <Link href="/market/browse" className="shrink-0 text-sm text-muted hover:text-ink lg:hidden">
                    더보기 ›
                  </Link>
                }
              />
              <div className="no-scrollbar -mx-(--dugout-gutter) flex items-center gap-2 overflow-x-auto px-(--dugout-gutter) md:mx-0 md:flex-wrap md:px-0 lg:shrink-0 lg:flex-nowrap lg:[&>a:nth-child(n+6)]:hidden">
                {chip('/market/browse', '전체', true)}
                {CATEGORIES.slice(0, 8).map((c) => chip(filterHref({ category: c.key }), c.label))}
                <Link href="/market" className="ml-1 hidden shrink-0 text-sm text-muted hover:text-ink lg:inline">
                  장터 전체 ›
                </Link>
              </div>
            </div>
            {listings.length === 0 ? (
              <p className="py-10 text-center text-sm text-muted lg:py-6">
                아직 올라온 물건이 없어요 ·{' '}
                <Link href="/market/new" className="font-semibold text-sky">
                  첫 물건 올리기
                </Link>
              </p>
            ) : (
              /*
                카드 190~220(장터와 같은 계약) — 큰 화면은 한 줄만: 넷(872 칸에 206px 넷), 칸이 넷을 못 담으면(808 밑 — 1024 화면은 662) 셋.
                한 줄을 넘겨 마지막 하나가 혼자 둘째 줄에 서지 않게
              */
              <div className={`${LISTING_GRID} lg:[&>*:nth-child(n+5)]:hidden lg:@max-[808px]:[&>*:nth-child(n+4)]:hidden`}>
                {listings.map((item) => (
                  <ListingCard key={item.id} item={item} now={now} />
                ))}
              </div>
            )}
          </section>

          {/* 커뮤니티 — 장비 바로 밑(v2: 다음 쓸모 있는 묶음이 첫 화면 안에서 시작하게). 큰 화면은 세 줄 */}
          <section className="space-y-4 lg:space-y-2">
            <SectionHead title="이번 주 인기글" href="/community" more="커뮤니티 ›" />
            {hot.length === 0 ? (
              <p className="py-10 text-center text-sm text-muted lg:py-5 lg:text-left">
                아직 글이 없어요 ·{' '}
                <Link href={user ? '/community/new' : '/login?next=/community/new'} className="font-semibold text-sky">
                  첫 글 쓰기
                </Link>
              </p>
            ) : (
              <ol className="grid gap-x-10 md:grid-flow-col md:grid-cols-2 md:grid-rows-3 lg:grid-flow-row lg:grid-cols-1 lg:grid-rows-none lg:[&>li:nth-child(n+4)]:hidden">
                {hot.map((p, i) => (
                  <li key={p.id} className="border-b border-line">
                    <Link href={`/community/${p.id}`} className="flex gap-3 py-4 transition-colors hover:bg-ink/3 lg:items-center lg:py-3">
                      <span className="w-4 shrink-0 text-[15px] font-bold text-sky tabular-nums">{i + 1}</span>
                      <span className="min-w-0 flex-1">
                        <span className="block truncate text-[15px] font-bold text-ink lg:text-[14px] lg:font-semibold">{p.title}</span>
                        <span className="mt-1 block truncate text-[13px] text-muted lg:hidden">{p.preview}</span>
                        <span className="mt-1.5 block text-xs text-muted lg:hidden">
                          좋아요 {p.likes} · 댓글 {p.comments}
                        </span>
                      </span>
                      <span className="hidden shrink-0 text-xs text-muted tabular-nums lg:block">
                        {relativeTime(p.createdAt, now)} · 댓글 {p.comments}
                      </span>
                    </Link>
                  </li>
                ))}
              </ol>
            )}
          </section>

          {/* 추천 코치 — 비교 줄(레슨 목록과 같은 CoachRow). 종목 칩은 휴대폰 · 패드만 */}
          <section className="space-y-4 lg:space-y-2">
            <SectionHead title="오늘의 추천 코치" href="/lessons/list" more="코치 찾기 ›" />
            <div className="no-scrollbar -mx-(--dugout-gutter) flex gap-2 overflow-x-auto px-(--dugout-gutter) md:mx-0 md:flex-wrap md:px-0 lg:hidden">
              {chip('/lessons/list', '전체', true)}
              {SPECIALTIES.map((s) => chip(`/lessons/list?specialty=${s.key}`, s.label))}
            </div>
            {coaches.length === 0 ? (
              <p className="py-10 text-center text-sm text-muted lg:py-5 lg:text-left">아직 공개한 코치가 없어요.</p>
            ) : (
              <div className="divide-y divide-line border-y border-line">
                {coaches.map((c) => (
                  <CoachRow key={c.id} c={c} href={`/lessons/${c.id}`} />
                ))}
              </div>
            )}
          </section>

          {/* 연습장 · 레슨장 — 지도 화면의 앞 세 곳(같은 목록 읽기 lib/market/map-load.ts) */}
          {!sinkerApp && places.length > 0 && (
            <section className="space-y-4 lg:space-y-2">
              <SectionHead title="연습장 · 레슨장" href="/venues" more="지도로 보기 ›" />
              <ul className="divide-y divide-line border-y border-line">
                {places.slice(0, 3).map((pl) => (
                  <li key={`${pl.type}-${pl.id}`}>
                    <Link href={pl.href} className="flex items-center gap-3 py-3 transition-colors hover:bg-ink/3">
                      <span className="min-w-0 flex-1">
                        <span className="block truncate text-[14px] font-semibold text-ink">{pl.name}</span>
                        <span className="mt-0.5 block truncate text-xs text-muted">
                          {[pl.kindLabel, pl.region, pl.sub].filter(Boolean).join(' · ')}
                        </span>
                      </span>
                      <Stars rating={pl.rating} reviews={pl.reviews} className="shrink-0" />
                    </Link>
                  </li>
                ))}
              </ul>
            </section>
          )}

          {/* 지금 필요한 것 — 큰 길 타일 넷(장비 · 레슨 · 연습장 · 팔기). 큰 화면은 위 막대 메뉴와 겹쳐 뺀다(v2 — 같은 길을 두 번 안 보인다) */}
          <section className={sinkerApp ? 'hidden' : 'space-y-4 lg:hidden'}>
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
        </div>
        {/* 큰 화면의 오늘 경기 — 주 칸과 같은 줄 맨 위에서 시작해 내려도 위 막대 밑에 붙어 따라온다 */}
        <aside className={sinkerApp ? 'hidden' : 'hidden lg:block'}>
          <div className="sticky top-[calc(var(--dugout-bar-h)+1.5rem)]">
            <GamesPanel games={games} today={today} />
          </div>
        </aside>
        </div>
      </div>
    </div>
  );
}
