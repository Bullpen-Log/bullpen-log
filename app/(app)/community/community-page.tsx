import Link from 'next/link';
import { EyeOff, Heart, MessageCircle, MessagesSquare, Tag } from '@/components/icon';
import { requireUser } from '@/lib/dal';
import { loadCommunityList } from '@/lib/community-load';
import {
  POST_CATEGORIES,
  POST_SORTS,
  isPostCategory,
  postCategoryLabel,
  type PostSort,
} from '@/lib/community';
import { Badge, ButtonLink, EmptyState, PageHeading } from '@/components/ui';
import {
  categoryBadgeClass,
  relativeTime,
} from '@/components/community/community-format';

type Search = { [key: string]: string | string[] | undefined };
const one = (v: string | string[] | undefined) =>
  typeof v === 'string' ? v : undefined;

/** 목록 주소 — 구분 · 정렬 · 장을 바꿔도 나머지는 그대로 */
function listHref(q: { category?: string; sort: PostSort; page?: number }) {
  const sp = new URLSearchParams();
  if (q.category) sp.set('category', q.category);
  if (q.sort !== 'new') sp.set('sort', q.sort);
  if (q.page && q.page > 1) sp.set('page', String(q.page));
  const s = sp.toString();
  return s ? `/community/feed?${s}` : '/community/feed';
}

/**
 * 커뮤니티 목록(2026-10-17 1판 — 틀). 구분 칩 · 최신/인기 · 더 보기. 가린 글은 관리자에게만 흐리게 보인다.
 *
 * 2026-10-20 하단 탭 넷째(영양 자리)가 돼 판 넘기기 자리(app/(app)/@community)가 그린다. 새 아이폰 앱(Expo)에서도 앱 화면으로 넘기지 않고
 * 이 판을 보인다 — 판은 늘 떠 있어 넘기면(OpenNative 의 router.back) 어느 화면을 열든 튕긴다. 글 · 글쓰기는 앱 화면 그대로(그 페이지들이 넘김).
 */
export default async function CommunityPage({
  searchParams,
}: {
  searchParams: Promise<Search>;
}) {
  const user = await requireUser();
  const sp = await searchParams;

  const rawCategory = one(sp.category);
  const category = isPostCategory(rawCategory) ? rawCategory : undefined;
  const sort: PostSort = one(sp.sort) === 'hot' ? 'hot' : 'new';
  const page = Math.max(1, Number.parseInt(one(sp.page) ?? '1', 10) || 1);

  /* 읽기는 앱 화면과 같은 곳(lib/community-load.ts) — 가린 글은 관리자에게만 */
  const { posts, hasMore } = await loadCommunityList(user, { category, sort, page });

  const chipClass = (active: boolean) =>
    `inline-flex min-h-9 shrink-0 items-center rounded-full px-4 text-sm font-semibold whitespace-nowrap transition-colors ${
      active
        ? 'bg-sky text-white'
        : 'bg-ink/6 text-ink hover:text-sky desk:bg-surface-2'
    }`;

  return (
    <div className="stack-page">
      <PageHeading
        title="덕아웃"
        inlineAction
        action={<ButtonLink href="/community/new">글쓰기</ButtonLink>}
      />

      {/* 덕아웃의 다른 방 — 장터 · 채팅(app/(dugout), 2026-10-20). 로그인한 사람도 같은 화면을 쓴다 */}
      <nav aria-label="덕아웃" className="grid grid-cols-2 gap-3">
        <Link
          href="/market"
          className="flex items-center gap-3 rounded-2xl border border-line bg-surface px-4 py-3 transition-colors hover:border-sky-soft"
        >
          <span className="grid h-10 w-10 place-items-center rounded-xl bg-sky/12 text-sky">
            <Tag className="h-5 w-5" />
          </span>
          <span className="min-w-0">
            <span className="block text-sm font-bold text-ink">장터</span>
            <span className="block text-xs text-muted">중고 야구용품 사고팔기</span>
          </span>
        </Link>
        <Link
          href="/chat"
          className="flex items-center gap-3 rounded-2xl border border-line bg-surface px-4 py-3 transition-colors hover:border-sky-soft"
        >
          <span className="grid h-10 w-10 place-items-center rounded-xl bg-sky/12 text-sky">
            <MessageCircle className="h-5 w-5" />
          </span>
          <span className="min-w-0">
            <span className="block text-sm font-bold text-ink">채팅</span>
            <span className="block text-xs text-muted">거래 · 레슨 이야기</span>
          </span>
        </Link>
      </nav>

      {/* 거르기 — 구분 칩은 옆으로 미끄러지고(휴대폰), 정렬은 오른쪽 끝의 작은 둘 */}
      <div className="flex flex-col gap-3 desk:flex-row desk:items-center desk:justify-between">
        <nav
          aria-label="글 구분"
          className="no-scrollbar -mx-4 flex gap-2 overflow-x-auto px-4 desk:mx-0 desk:flex-wrap desk:px-0"
        >
          <Link
            href={listHref({ sort })}
            aria-current={!category ? 'page' : undefined}
            className={chipClass(!category)}
          >
            전체
          </Link>
          {POST_CATEGORIES.map((c) => (
            <Link
              key={c.key}
              href={listHref({ category: c.key, sort })}
              aria-current={category === c.key ? 'page' : undefined}
              className={chipClass(category === c.key)}
            >
              {c.label}
            </Link>
          ))}
        </nav>
        <div
          role="group"
          aria-label="정렬"
          className="flex items-center gap-1 self-end text-sm desk:self-auto"
        >
          {POST_SORTS.map((s, i) => (
            <span key={s.key} className="flex items-center gap-1">
              {i > 0 && <span className="text-line-strong">|</span>}
              <Link
                href={listHref({ category, sort: s.key })}
                aria-current={sort === s.key ? 'page' : undefined}
                className={`rounded-full px-2 py-1 transition-colors ${
                  sort === s.key
                    ? 'font-semibold text-ink'
                    : 'text-muted hover:text-ink'
                }`}
              >
                {s.label}
              </Link>
            </span>
          ))}
        </div>
      </div>

      {posts.length === 0 ? (
        <EmptyState
          icon={<MessagesSquare />}
          title={
            page > 1
              ? '여기까지예요'
              : category
                ? '이 구분에는 아직 글이 없어요'
                : '아직 글이 없어요'
          }
          description={
            page > 1
              ? '앞 장으로 돌아가 보세요.'
              : '훈련 이야기, 궁금한 것, 오늘의 기록. 무엇이든 첫 글을 남겨 보세요.'
          }
          action={
            page > 1 ? (
              <ButtonLink href={listHref({ category, sort })} variant="secondary">
                처음으로
              </ButtonLink>
            ) : (
              <ButtonLink href="/community/new" variant="secondary">
                첫 글 쓰기
              </ButtonLink>
            )
          }
        />
      ) : (
        <ul className="divide-y divide-line overflow-hidden rounded-2xl border border-line bg-surface">
          {posts.map((post, i) => {
            const hidden = post.hidden;
            return (
              <li
                key={post.id}
                style={{ '--row': i } as React.CSSProperties}
                className={`motion-safe:animate-row-in ${hidden ? 'opacity-55' : ''}`}
              >
                <Link
                  href={`/community/${post.id}`}
                  className="group flex flex-col gap-2.5 px-(--block-pad) py-4 transition-colors hover:bg-surface-2 active:bg-ink/6"
                >
                  <div className="flex flex-wrap items-center gap-2">
                    <Badge className={categoryBadgeClass(post.category)}>
                      {postCategoryLabel(post.category)}
                    </Badge>
                    {hidden && (
                      <Badge className="gap-1 border-danger-line bg-danger-bg text-danger desk:bg-transparent">
                        <EyeOff aria-hidden className="h-3 w-3" />
                        가림
                      </Badge>
                    )}
                  </div>
                  <h2 className="font-semibold leading-snug text-ink transition-colors group-hover:text-sky">
                    {post.title}
                  </h2>
                  <p className="line-clamp-2 text-sm leading-relaxed text-muted">
                    {post.preview}
                  </p>
                  <div className="flex items-center gap-3 text-xs text-muted">
                    <span className="text-ink/80">{post.nickname}</span>
                    <span>{relativeTime(post.createdAt)}</span>
                    <span className="ml-auto flex items-center gap-3 tabular-nums">
                      <span className="flex items-center gap-1">
                        <Heart aria-hidden className="h-3.5 w-3.5" />
                        <span className="sr-only">좋아요 </span>
                        {post.likes}
                      </span>
                      <span className="flex items-center gap-1">
                        <MessageCircle aria-hidden className="h-3.5 w-3.5" />
                        <span className="sr-only">댓글 </span>
                        {post.comments}
                      </span>
                    </span>
                  </div>
                </Link>
              </li>
            );
          })}
        </ul>
      )}

      {/* 장 넘기기 — 다음 장이 있을 때만 '더 보기', 둘째 장부터는 '이전 장'도 */}
      {(hasMore || page > 1) && posts.length > 0 && (
        <div className="flex items-center justify-center gap-3">
          {page > 1 && (
            <ButtonLink
              href={listHref({ category, sort, page: page - 1 })}
              variant="secondary"
            >
              이전 장
            </ButtonLink>
          )}
          {hasMore && (
            <ButtonLink
              href={listHref({ category, sort, page: page + 1 })}
              variant="secondary"
            >
              더 보기
            </ButtonLink>
          )}
        </div>
      )}
    </div>
  );
}
