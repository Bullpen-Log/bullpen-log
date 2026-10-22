import Link from 'next/link';
import { Badge, Card } from '@/components/ui';
import { ListingCard } from '@/components/dugout/listing-card';
import type { ListingCard as ListingCardData } from '@/lib/market/load';
import type { loadPublicPosts } from '@/lib/market/load';
import { CATEGORIES, filterHref } from '@/lib/market/specs';
import { postCategoryLabel } from '@/lib/community';
import { categoryBadgeClass, relativeTime } from '@/components/community/community-format';

type Post = Awaited<ReturnType<typeof loadPublicPosts>>[number];

/**
 * PC 덕아웃 홈의 왼쪽 '둘러보기' 칸(2026-10-22) — 장터 · 커뮤니티 · 레슨 · 연습장. 위 막대가 이미 메뉴라 바로가기 판 · 설명 카드는 없다.
 * 비었을 때도 큰 상자 대신 한 줄. '물건 올리기' 큰 단추는 위 막대 하나뿐 — 여기서는 빈 장터의 글 링크로만.
 */
export function HomeBrowse({
  listings,
  posts,
  now,
}: {
  listings: ListingCardData[];
  posts: Post[];
  now: Date;
}) {
  return (
    <div className="stack-page">
      {/* 장터 */}
      <section className="space-y-3">
        <Head title="장터 · 방금 올라온 물건" href="/market" />
        <div className="flex flex-wrap gap-1.5">
          {CATEGORIES.slice(0, 6).map((c) => (
            <Link
              key={c.key}
              href={filterHref({ category: c.key })}
              className="rounded-full border border-line bg-surface px-3 py-1.5 text-footnote font-semibold text-ink transition-colors hover:border-sky-soft hover:text-sky"
            >
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
          <div className="grid grid-cols-4 gap-3">
            {listings.map((item) => (
              <ListingCard key={item.id} item={item} now={now} />
            ))}
          </div>
        )}
      </section>

      {/* 커뮤니티 */}
      <section className="space-y-3">
        <div className="flex items-baseline justify-between">
          <h2 className="text-base font-bold text-ink">커뮤니티 · 새 글</h2>
          <span className="flex items-center gap-3 text-footnote font-semibold">
            <Link href="/community" className="text-muted hover:text-ink">
              전체 보기
            </Link>
            <Link href="/community/new" className="text-sky">
              글쓰기 ›
            </Link>
          </span>
        </div>
        {posts.length === 0 ? (
          <Empty>
            아직 글이 없어요 ·{' '}
            <Link href="/community/new" className="font-semibold text-sky">
              첫 글 쓰기
            </Link>
          </Empty>
        ) : (
          <Card className="divide-y divide-line p-0">
            {posts.map((p) => (
              <Link
                key={p.id}
                href={`/community/${p.id}`}
                className="flex min-h-11 items-center gap-3 px-4 py-2 transition-colors hover:bg-ink/4"
              >
                <Badge className={categoryBadgeClass(p.category)}>{postCategoryLabel(p.category)}</Badge>
                <span className="min-w-0 flex-1 truncate text-sm text-ink">{p.title}</span>
                {p.comments > 0 && <span className="text-caption font-semibold text-sky-strong">[{p.comments}]</span>}
                <span className="shrink-0 text-caption text-muted">{relativeTime(p.createdAt, now)}</span>
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

function Empty({ children }: { children: React.ReactNode }) {
  return <p className="rounded-xl border border-dashed border-line px-4 py-3 text-sm text-muted">{children}</p>;
}
