import Link from 'next/link';
import type { ReactNode } from 'react';
import {
  RoundChat,
  RoundCommunity,
  RoundGear,
  RoundLesson,
  RoundMarket,
  RoundPlus,
  RoundUser,
  RoundVenue,
} from '@/components/round-icon';
import { Badge, Card } from '@/components/ui';
import { ListingCard } from '@/components/dugout/listing-card';
import type { ListingCard as ListingCardData } from '@/lib/market/load';
import type { loadPublicPosts } from '@/lib/market/load';
import { CATEGORIES, filterHref } from '@/lib/market/specs';
import { postCategoryLabel } from '@/lib/community';
import { categoryBadgeClass, relativeTime } from '@/components/community/community-format';

type Post = Awaited<ReturnType<typeof loadPublicPosts>>[number];

/**
 * PC 덕아웃 홈의 왼쪽 '둘러보기' 칸(2026-10-22) — 2026-10-23 금윤호: "숨고 · 번개장터 · 당근을 섞고 우리 색만 조금".
 *   타일 여덟(당근 홈의 2×4 타일 — 아이콘 왼쪽 위 · 이름 아래) → '오늘의 추천 물건'(번개장터 — 품목 글 줄 · 테두리 없는 사진 격자) →
 *   '지금 뜨는 이야기'(당근 — 번호 매긴 목록) → 레슨 · 연습장 한 줄.
 * 비었을 때도 큰 상자 대신 한 줄.
 */
const TILES: { href: string; label: string; icon: typeof RoundMarket; plus?: boolean }[] = [
  { href: '/market', label: '중고거래', icon: RoundMarket },
  { href: '/market/new', label: '물건 올리기', icon: RoundPlus, plus: true },
  { href: '/lessons', label: '레슨 찾기', icon: RoundLesson },
  { href: '/venues', label: '연습장 예약', icon: RoundVenue },
  { href: '/community', label: '커뮤니티', icon: RoundCommunity },
  { href: '/gear', label: '장비 고르기', icon: RoundGear },
  { href: '/chat', label: '채팅', icon: RoundChat },
  { href: '/me', label: '내 것', icon: RoundUser },
];

export function HomeBrowse({
  listings,
  posts,
  now,
  loggedIn,
}: {
  listings: ListingCardData[];
  posts: Post[];
  now: Date;
  loggedIn: boolean;
}) {
  return (
    <div className="stack-page">
      {/* 타일 — 당근 홈처럼 */}
      <section className="grid grid-cols-4 gap-2.5">
        {TILES.map((t) => {
          const Icon = t.icon;
          return (
            <Link
              key={t.href}
              href={t.href}
              className="flex min-h-24 flex-col justify-between rounded-2xl border border-line bg-surface p-4 transition-colors hover:border-sky-soft hover:bg-sky/4"
            >
              <span
                className={`grid h-8 w-8 place-items-center rounded-lg ${
                  t.plus ? 'bg-sky text-white' : 'bg-sky/12 text-sky-strong'
                }`}
              >
                <Icon className="h-4.5 w-4.5" />
              </span>
              <span className="text-sm font-bold text-ink">{t.label}</span>
            </Link>
          );
        })}
      </section>

      {/* 장터 — 번개장터 */}
      <section className="space-y-3">
        <Head title="오늘의 추천 물건" href="/market" />
        <div className="flex flex-wrap gap-x-4 gap-y-1 text-sm font-bold text-muted">
          {CATEGORIES.map((c) => (
            <Link key={c.key} href={filterHref({ category: c.key })} className="hover:text-ink">
              {c.label}
            </Link>
          ))}
        </div>
        {listings.length === 0 ? (
          <Empty>
            아직 물건이 없어요 ·{' '}
            <Link href="/market/new" className="font-semibold text-sky">
              첫 물건 올리기
            </Link>
          </Empty>
        ) : (
          <div className="grid grid-cols-4 gap-x-3 gap-y-6">
            {listings.map((item) => (
              <ListingCard key={item.id} item={item} now={now} />
            ))}
          </div>
        )}
      </section>

      {/* 커뮤니티 — 당근 '지금 뜨는 동네 이야기' */}
      <section className="space-y-3">
        <div className="flex items-baseline justify-between">
          <h2 className="text-base font-bold text-ink">지금 뜨는 이야기</h2>
          <span className="flex items-center gap-3 text-footnote font-semibold">
            <Link href="/community" className="text-muted hover:text-ink">
              전체 보기
            </Link>
            <Link href={loggedIn ? '/community/new' : '/login?next=/community/new'} className="text-sky">
              글쓰기 ›
            </Link>
          </span>
        </div>
        {posts.length === 0 ? (
          <Empty>
            아직 글이 없어요 ·{' '}
            <Link href={loggedIn ? '/community/new' : '/login?next=/community/new'} className="font-semibold text-sky">
              첫 글 쓰기
            </Link>
          </Empty>
        ) : (
          <Card className="divide-y divide-line p-0">
            {posts.map((p, i) => (
              <Link
                key={p.id}
                href={loggedIn ? `/community/${p.id}` : '/login?next=/community'}
                className="flex items-start gap-4 px-5 py-3.5 transition-colors hover:bg-ink/4"
              >
                <span className="w-5 shrink-0 pt-0.5 text-base font-black tabular-nums text-ink">{i + 1}</span>
                <span className="min-w-0 flex-1">
                  <span className="block truncate text-sm font-semibold text-ink">{p.title}</span>
                  <span className="mt-0.5 flex items-center gap-2 text-caption text-muted">
                    <Badge className={categoryBadgeClass(p.category)}>{postCategoryLabel(p.category)}</Badge>
                    <span>{relativeTime(p.createdAt, now)}</span>
                  </span>
                  <span className="mt-1 flex items-center gap-1 text-caption text-muted">
                    <RoundChat className="h-3 w-3" /> {p.comments}
                  </span>
                </span>
              </Link>
            ))}
          </Card>
        )}
      </section>

      {/* 레슨 · 연습장 — 설명 카드 셋 대신 한 줄 */}
      <section className="flex flex-wrap items-center gap-x-4 gap-y-2 rounded-2xl border border-line bg-surface px-(--block-pad) py-3 text-sm">
        <span className="font-bold text-ink">레슨 · 연습장</span>
        <span className="text-muted">코치를 비교해 예약하고, 빈 시간을 바로 잡아요</span>
        <span className="ml-auto flex gap-3 font-semibold">
          <Link href="/lessons" className="text-sky">
            레슨 찾기 ›
          </Link>
          <Link href="/venues" className="text-sky">
            연습장 찾기 ›
          </Link>
        </span>
      </section>
    </div>
  );
}

function Head({ title, href }: { title: string; href: string }) {
  return (
    <div className="flex items-baseline justify-between">
      <h2 className="text-base font-bold text-ink">{title}</h2>
      <Link href={href} className="text-footnote font-semibold text-sky">
        전체 보기 ›
      </Link>
    </div>
  );
}

function Empty({ children }: { children: ReactNode }) {
  return <p className="rounded-xl border border-dashed border-line px-4 py-3 text-sm text-muted">{children}</p>;
}
