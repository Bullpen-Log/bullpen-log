import Link from 'next/link';
import { ArrowRight, CalendarDays } from '@/components/icon';
import { RoundChat, RoundGear, RoundLesson, RoundVenue } from '@/components/round-icon';
import { Badge, Card } from '@/components/ui';
import { ListingCard } from '@/components/dugout/listing-card';
import { headers } from 'next/headers';
import { redirect } from 'next/navigation';
import { getCurrentUser } from '@/lib/dal';
import { isNativeUserAgent } from '@/lib/app-env';
import { SinkerStrip } from '@/components/dugout/sinker-strip';
import { DugoutHero } from '@/components/dugout/dugout-hero';
import { AppLauncher } from '@/components/dugout/app-launcher';
import { countUnread } from '@/lib/market/load';
import { countUnreadNotifications } from '@/lib/notify';
import { LessonFeedCard } from '@/components/dugout/lesson-feed-card';
import { HomeBrowse } from '@/components/dugout/home-browse';
import { HomeMeColumn } from '@/components/dugout/home-me-column';
import { loadSinkerSummary } from '@/lib/org/sinker-summary';
import { loadLessonFeed } from '@/lib/org/lesson-feed';
import { usesSinker } from '@/lib/brand';
import { loadLatestListings, loadPublicPosts } from '@/lib/market/load';
import { CATEGORIES, filterHref } from '@/lib/market/specs';
import { postCategoryLabel } from '@/lib/community';
import {
  categoryBadgeClass,
  relativeTime,
} from '@/components/community/community-format';

/**
 * 덕아웃 홈(2026-10-20) — 로그인 안 한 사람의 첫 화면. 야구인이 매일 하는 일 넷(장터 · 소통 · 레슨 · 장소)이 한 화면에.
 * 1판은 장터와 소통이 돌고, 레슨 · 장소는 '곧'(2 · 3판). 로그인한 사람도 같은 화면 — 위 막대의 '내 불펜로그'가 안으로 가는 길.
 */
export default async function DugoutHome({
  searchParams,
}: {
  searchParams: Promise<{ dugout?: string }>;
}) {
  const user = await getCurrentUser();
  /* 아이폰 앱(싱커) 안에서 /: 예전처럼 홈 · 로그인 — 앱의 첫 화면은 덕아웃이 아니라 싱커다(2026-10-21 2단계, 옛 app/page.tsx) */
  /* 앱(싱커 웹뷰)의 / 는 예전처럼 싱커로 — 단 덕아웃 탭(?dugout=1)으로 온 것은 덕아웃(2026-10-21) */
  const native = isNativeUserAgent((await headers()).get('user-agent'));
  if (native && !(await searchParams).dugout) redirect(user ? '/today' : '/login');
  const viewer = user ? { id: user.id, role: user.role } : null;
  const sinkerUser = !!user && usesSinker(user);
  /* 한 번만 읽어 휴대폰 쌓은 판 · PC 두 칸이 같이 쓴다 */
  const [listings, posts, unread, alerts, lessons, sinkerCells] = await Promise.all([
    loadLatestListings(8, viewer),
    loadPublicPosts(8),
    user ? countUnread(user.id) : 0,
    user ? countUnreadNotifications(user.id) : 0,
    user ? loadLessonFeed(user.id, 3) : [],
    user && sinkerUser ? loadSinkerSummary(user.id) : null,
  ]);
  const now = new Date();

  return (
    <div className="space-y-10">
      {/* 첫 화면(2026-10-21) — 로고 크게 → 구글식 검색 홈 → 조금 내리면 접히며 아래 홈. 위 막대는 html[data-hero] 동안 숨는다 */}
      <DugoutHero
        user={user ? { nickname: user.nickname } : null}
        unread={unread}
        alerts={alerts}
        sinker={sinkerUser}
        native={native}
      />
      {/*
        PC 이면서 로그인(2026-10-22) — 위 막대가 이미 메뉴라 바로가기 판 · 소개 문구 · 설명 카드를 빼고, 왼쪽 '둘러보기'(장터 · 커뮤니티 · 레슨)와
        오른쪽 '나'(내 싱커 · 내 소식, 위 막대 밑에 붙음) 두 칸. 휴대폰 · 앱 웹뷰는 desk 가 아니라 아래 쌓은 판 그대로(거기서는 바로가기가 메뉴다).
      */}
      <div className="hidden gap-6 desk:grid desk:grid-cols-[minmax(0,2fr)_minmax(0,1fr)]">
        <HomeBrowse listings={listings} posts={posts} now={now} loggedIn={!!user} />
        {user ? (
          <HomeMeColumn sinker={sinkerCells} unread={unread} alerts={alerts} lessons={lessons} />
        ) : (
          /* 로그인 전 PC — 오른쪽 칸은 시작하기 카드 하나(2026-10-23) */
          <aside className="desk:sticky desk:top-28 desk:self-start">
            <section className="rounded-2xl bg-ink px-5 py-6 text-white">
              <p className="flex items-center gap-2 text-xs font-semibold text-white/70">
                <CalendarDays className="h-4 w-4" /> 싱커
              </p>
              <p className="mt-2 text-lg font-bold break-keep">던진 만큼 적으면, 오늘 할 일을 정해 줘요</p>
              <p className="mt-1 text-sm break-keep text-white/70">
                투구수 · 구속 · 몸 상태를 남기면 팔 상태를 알려 주고 운동을 골라 줘요.
              </p>
              <Link
                href="/login?signup=1"
                className="mt-4 inline-flex min-h-11 items-center rounded-xl bg-white px-5 text-sm font-bold text-ink"
              >
                무료로 시작하기
              </Link>
              <Link href="/login" className="mt-2 block text-xs font-semibold text-white/70">
                이미 계정이 있어요 ›
              </Link>
            </section>
          </aside>
        )}
      </div>
      <div className="space-y-10 desk:hidden">
      {/* 로그인한 싱커 사용자 — 오늘 체크인 · 이번 주 투구 · 마지막 등판 한 줄(2단계 2-5) */}
      {sinkerCells && <SinkerStrip cells={sinkerCells} />}
      {/* 코치가 쓴 레슨 노트 — 선수 쪽 레슨 줄(3단계 3-4) */}
      {user && <LessonFeedCard items={lessons} compact title="최근 레슨" />}
      {/* 첫 줄 — 무엇을 하는 곳인지 한 문장, 바로가기 */}
      <section className="space-y-5">
        <div className="space-y-2">
          <h1 className="text-[28px] leading-snug font-black break-keep text-ink md:text-4xl">
            야구인의 하루를
            <br className="md:hidden" /> 한곳에서
          </h1>
          <p className="text-sm leading-relaxed break-keep text-muted md:text-base">
            글러브 사고팔기, 팀 소식, 레슨과 연습장 예약까지. 로그인 없이 둘러보고,
            기록은 싱커에서.
          </p>
        </div>
        {/* 바로가기(2026-10-21 — 검색 대신). PC 는 위 막대가 같은 메뉴라 숨긴다(2026-10-22) */}
        <div className="desk:hidden">
          <AppLauncher loggedIn={!!user} sinker={sinkerUser} native={native} size="sm" />
        </div>
        <div className="flex flex-wrap gap-2">
          {CATEGORIES.slice(0, 6).map((c) => (
            <Link
              key={c.key}
              href={filterHref({ category: c.key })}
              className="rounded-full border border-line bg-surface px-3.5 py-2 text-xs font-semibold text-ink transition-colors hover:border-sky-soft hover:text-sky"
            >
              {c.label}
            </Link>
          ))}
        </div>
      </section>

      {/* 장터 */}
      <section className="space-y-3">
        <div className="flex items-baseline justify-between">
          <h2 className="text-lg font-bold text-ink">장터 · 방금 올라온 물건</h2>
          <Link
            href="/market"
            className="inline-flex items-center gap-0.5 text-sm font-semibold text-sky"
          >
            전체 보기 <ArrowRight className="h-4 w-4" />
          </Link>
        </div>
        {listings.length === 0 ? (
          <Card className="space-y-2 text-center">
            <p className="text-sm font-semibold text-ink">첫 물건을 올려 주세요</p>
            <p className="text-xs text-muted">
              사진 한 장, 가격, 한 줄이면 30초에 끝나요. 포지션 · 손 · 사이즈는 자동으로
              채워요.
            </p>
            <Link
              href="/market/new"
              className="inline-flex min-h-10 items-center rounded-xl bg-sky px-4 text-sm font-semibold text-white"
            >
              물건 올리기
            </Link>
          </Card>
        ) : (
          <div className="grid grid-cols-2 gap-3 sm:grid-cols-3 lg:grid-cols-4">
            {listings.map((item) => (
              <ListingCard key={item.id} item={item} now={now} />
            ))}
          </div>
        )}
      </section>

      {/* 소통 */}
      <section id="talk" className="scroll-mt-20 space-y-3">
        <div className="flex items-baseline justify-between">
          <h2 className="text-lg font-bold text-ink">소통 · 새 글</h2>
          <span className="flex items-center gap-3">
            {user && (
              <Link href="/community" className="text-sm font-semibold text-muted">
                전체 보기
              </Link>
            )}
            <Link
              href={user ? '/community/new' : '/login?next=/community/new'}
              className="inline-flex items-center gap-0.5 text-sm font-semibold text-sky"
            >
              {user ? '글쓰기' : '로그인하고 글쓰기'} <ArrowRight className="h-4 w-4" />
            </Link>
          </span>
        </div>
        {posts.length === 0 ? (
          <Card>
            <p className="text-sm text-muted">
              아직 글이 없어요. 오늘 던진 이야기, 궁금한 것부터 올려 주세요.
            </p>
          </Card>
        ) : (
          <Card className="divide-y divide-line p-0">
            {posts.map((p) => (
              <Link
                key={p.id}
                href={user ? `/community/${p.id}` : '/login'}
                className="block px-4 py-3 transition-colors hover:bg-ink/4"
              >
                <p className="flex items-center gap-2">
                  <Badge className={categoryBadgeClass(p.category)}>
                    {postCategoryLabel(p.category)}
                  </Badge>
                  <span className="min-w-0 flex-1 truncate text-sm font-semibold text-ink">
                    {p.title}
                  </span>
                </p>
                <p className="mt-1 line-clamp-2 text-xs text-muted">{p.preview}</p>
                <p className="mt-1.5 flex items-center gap-2 text-[11px] text-muted/80">
                  <span>{p.nickname}</span>
                  <span>{relativeTime(p.createdAt, now)}</span>
                  <span className="ml-auto inline-flex items-center gap-0.5">
                    <RoundChat className="h-3 w-3" /> {p.comments}
                  </span>
                </p>
              </Link>
            ))}
          </Card>
        )}
        {!user && (
          <p className="text-xs text-muted">
            글 전체와 댓글은 로그인하면 볼 수 있어요.
          </p>
        )}
      </section>

      {/* 레슨 · 장소 · 장비 고르기 — 위 막대와 같은 길이라 PC 에서는 숨긴다(2026-10-22) */}
      <section className="grid gap-3 sm:grid-cols-3 desk:hidden">
        <Link
          href="/lessons"
          className="flex items-start gap-3 rounded-2xl border border-line bg-surface p-4 transition-colors hover:border-sky-soft"
        >
          <span className="grid h-10 w-10 shrink-0 place-items-center rounded-xl bg-sky/12 text-sky">
            <RoundLesson className="h-5 w-5" />
          </span>
          <span className="min-w-0">
            <span className="block text-sm font-bold text-ink">레슨 예약</span>
            <span className="mt-0.5 block text-xs leading-relaxed text-muted">
              코치를 비교하고 원하는 시간에 요청해요. 코치는 내 기록을 보고 레슨해요.
            </span>
          </span>
        </Link>
        <Link
          href="/venues"
          className="flex items-start gap-3 rounded-2xl border border-line bg-surface p-4 transition-colors hover:border-sky-soft"
        >
          <span className="grid h-10 w-10 shrink-0 place-items-center rounded-xl bg-sky/12 text-sky">
            <RoundVenue className="h-5 w-5" />
          </span>
          <span className="min-w-0">
            <span className="block text-sm font-bold text-ink">연습장 · 구장 예약</span>
            <span className="mt-0.5 block text-xs leading-relaxed text-muted">
              빈 시간을 보고 전화 없이 바로 잡아요.
            </span>
          </span>
        </Link>
        <Link
          href="/gear"
          className="flex items-start gap-3 rounded-2xl border border-line bg-surface p-4 transition-colors hover:border-sky-soft"
        >
          <span className="grid h-10 w-10 shrink-0 place-items-center rounded-xl bg-sky/12 text-sky">
            <RoundGear className="h-5 w-5" />
          </span>
          <span className="min-w-0">
            <span className="block text-sm font-bold text-ink">장비 고르기</span>
            <span className="mt-0.5 block text-xs leading-relaxed text-muted">
              처음이라 뭘 사야 할지 모르면 — 나이 · 포지션 · 손으로 골라 드려요.
            </span>
          </span>
        </Link>
      </section>

      {/* 싱커로 */}
      {!user && (
        <section className="rounded-2xl bg-ink px-5 py-6 text-white md:px-8 md:py-8">
          <p className="flex items-center gap-2 text-xs font-semibold text-white/70">
            <CalendarDays className="h-4 w-4" /> 싱커
          </p>
          <p className="mt-2 text-lg font-bold break-keep md:text-xl">
            던진 만큼 적으면, 오늘 할 일을 정해 줘요
          </p>
          <p className="mt-1 text-sm break-keep text-white/70">
            투구수 · 구속 · 몸 상태를 남기면 팔 상태를 알려 주고 운동을 골라 줘요. 선수
            · 팀 · 레슨장 모두.
          </p>
          <Link
            href="/login?signup=1"
            className="mt-4 inline-flex min-h-11 items-center rounded-xl bg-white px-5 text-sm font-bold text-ink"
          >
            무료로 시작하기
          </Link>
        </section>
      )}
      </div>
    </div>
  );
}
