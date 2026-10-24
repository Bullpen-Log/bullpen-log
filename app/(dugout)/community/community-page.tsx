import Link from 'next/link';
import { RoundChat, RoundCommunity, RoundEyeOff, RoundHeart, RoundVideo } from '@/components/round-icon';
import { getCurrentUser } from '@/lib/dal';
import { loadCommunityList } from '@/lib/community-load';
import {
  POST_CATEGORIES,
  POST_SORTS,
  POST_TAGS,
  isCommunityRegion,
  isPostCategory,
  isPostTag,
  postCategoryLabel,
  postTagLabel,
  type PostSort,
} from '@/lib/community';
import { Badge, ButtonLink, EmptyState, PageHeading } from '@/components/ui';
import {
  categoryBadgeClass,
  meetAtText,
  relativeTime,
} from '@/components/community/community-format';
import { CommunityRegionFilter } from '@/components/community/community-region-filter';

type Search = { [key: string]: string | string[] | undefined };
const one = (v: string | string[] | undefined) =>
  typeof v === 'string' ? v : undefined;

/** 목록 주소 — 게시판 · 말머리 · 정렬 · 장을 바꿔도 나머지는 그대로 */
function listHref(q: {
  category?: string;
  tag?: string;
  region?: string;
  past?: boolean;
  sort: PostSort;
  page?: number;
}) {
  const sp = new URLSearchParams();
  if (q.category) sp.set('category', q.category);
  if (q.category && q.tag) sp.set('tag', q.tag);
  if (q.region && (q.category === 'meetup' || q.category === 'team')) sp.set('region', q.region);
  if (q.past && q.category === 'meetup') sp.set('past', '1');
  if (q.sort !== 'new') sp.set('sort', q.sort);
  if (q.page && q.page > 1) sp.set('page', String(q.page));
  const s = sp.toString();
  return s ? `/community?${s}` : '/community';
}

/**
 * 커뮤니티 목록(2026-10-17 1판 — 틀). 게시판 칩 · 최신/인기 · 더 보기. 가린 글은 관리자에게만 흐리게 보인다.
 *
 * 2026-10-21 부터 덕아웃 안(/community, app/(dugout)) — 싱커의 커뮤니티 판은 걷었다. 장터 · 채팅은 덕아웃 위 막대에 있어 여기 길 카드는 뺐다.
 */
export default async function CommunityPage({
  searchParams,
}: {
  searchParams: Promise<Search>;
}) {
  const user = await getCurrentUser();
  const sp = await searchParams;

  const rawCategory = one(sp.category);
  const category = isPostCategory(rawCategory) ? rawCategory : undefined;
  const rawTag = one(sp.tag);
  const tag = category && isPostTag(category, rawTag) ? rawTag : undefined;
  const sort: PostSort = one(sp.sort) === 'hot' ? 'hot' : 'new';
  const page = Math.max(1, Number.parseInt(one(sp.page) ?? '1', 10) || 1);
  /* 우리 동네 · 지난 번개는 번개 · 팀 게시판에서만 */
  const local = category === 'meetup' || category === 'team';
  const rawRegion = one(sp.region);
  const region = local && isCommunityRegion(rawRegion) ? rawRegion : undefined;
  const past = category === 'meetup' && one(sp.past) === '1';
  /* 지금 거르기를 지키는 주소 조각 — 게시판을 바꾸면 버린다 */
  const keep = { category, tag, region, past };

  /* 글쓰기는 로그인 — 안 했으면 로그인 뒤 글쓰기로. 게시판을 보고 있으면 그 게시판을 골라 둔다 */
  const newHref = category ? `/community/new?board=${category}` : '/community/new';
  const writeHref = user ? newHref : `/login?next=${encodeURIComponent(newHref)}`;

  /* 읽기는 앱 화면과 같은 곳(lib/community-load.ts) — 가린 글은 관리자에게만, 차단한 사람 글은 빼고 */
  const { posts, hasMore } = await loadCommunityList(user, {
    category,
    tag,
    region,
    when: category === 'meetup' ? (past ? 'past' : 'upcoming') : undefined,
    sort,
    page,
  });

  const chipClass = (active: boolean) =>
    `inline-flex min-h-9 shrink-0 items-center rounded-full px-4 text-sm font-semibold whitespace-nowrap transition-colors ${
      active
        ? 'bg-sky text-white'
        : 'bg-ink/6 text-ink hover:text-sky desk:bg-surface-2'
    }`;

  return (
    <div className="stack-page">
      <PageHeading
        title="커뮤니티"
        inlineAction
        action={<ButtonLink href={writeHref}>글쓰기</ButtonLink>}
      />

      {/* 거르기 — 구분 칩은 옆으로 미끄러지고(휴대폰), 정렬은 오른쪽 끝의 작은 둘 */}
      <div className="flex flex-col gap-3 desk:flex-row desk:flex-wrap desk:items-center desk:justify-between">
        <nav
          aria-label="게시판"
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
        {category && (
          <nav
            aria-label="말머리"
            className="no-scrollbar -mx-4 flex gap-1.5 overflow-x-auto px-4 desk:order-last desk:mx-0 desk:w-full desk:flex-wrap desk:px-0"
          >
            {[{ key: '', label: '전체' }, ...POST_TAGS[category]].map((t) => (
              <Link
                key={t.key}
                href={listHref({ ...keep, tag: t.key || undefined, sort })}
                aria-current={(tag ?? '') === t.key ? 'page' : undefined}
                className={`inline-flex min-h-8 shrink-0 items-center rounded-full px-3 text-xs font-semibold whitespace-nowrap transition-colors ${
                  (tag ?? '') === t.key
                    ? 'bg-ink text-page'
                    : 'text-muted hover:text-ink'
                }`}
              >
                {t.label}
              </Link>
            ))}
          </nav>
        )}
        <div className="flex items-center gap-2 self-end desk:self-auto">
          {local && (
            <CommunityRegionFilter base={listHref({ ...keep, region: undefined, sort })} region={region} />
          )}
          {/* 번개는 모일 때 순 — 최신 · 인기 대신 다가오는 · 지난 */}
          <div role="group" aria-label={category === 'meetup' ? '번개 때' : '정렬'} className="flex items-center gap-1 text-sm">
            {(category === 'meetup'
              ? [
                  { key: 'up', label: '다가오는', href: listHref({ ...keep, past: false, sort }), on: !past },
                  { key: 'past', label: '지난', href: listHref({ ...keep, past: true, sort }), on: past },
                ]
              : POST_SORTS.map((o) => ({
                  key: o.key,
                  label: o.label,
                  href: listHref({ ...keep, sort: o.key }),
                  on: sort === o.key,
                }))
            ).map((o, i) => (
              <span key={o.key} className="flex items-center gap-1">
                {i > 0 && <span className="text-line-strong">|</span>}
                <Link
                  href={o.href}
                  aria-current={o.on ? 'page' : undefined}
                  className={`rounded-full px-2 py-1 transition-colors ${
                    o.on ? 'font-semibold text-ink' : 'text-muted hover:text-ink'
                  }`}
                >
                  {o.label}
                </Link>
              </span>
            ))}
          </div>
        </div>
      </div>

      {posts.length === 0 ? (
        <EmptyState
          icon={<RoundCommunity />}
          title={
            page > 1
              ? '여기까지예요'
              : category
                ? tag
                  ? '이 말머리에는 아직 글이 없어요'
                  : '이 게시판에는 아직 글이 없어요'
                : '아직 글이 없어요'
          }
          description={
            page > 1
              ? '앞 장으로 돌아가 보세요.'
              : category === 'meetup' && !past
                ? '다가오는 번개가 없어요. 캐치볼 · 배팅 할 사람을 먼저 모아 보세요.'
              : '야구 이야기, 궁금한 것, 같이 할 사람. 무엇이든 첫 글을 남겨 보세요.'
          }
          action={
            page > 1 ? (
              <ButtonLink href={listHref({ ...keep, sort })} variant="secondary">
                처음으로
              </ButtonLink>
            ) : (
              <ButtonLink href={writeHref} variant="secondary">
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
                  className="group flex gap-3 px-(--block-pad) py-4 transition-colors hover:bg-surface-2 active:bg-ink/6"
                >
                  <div className="flex min-w-0 flex-1 flex-col gap-2.5">
                  <div className="flex flex-wrap items-center gap-2">
                    <Badge className={categoryBadgeClass(post.category)}>
                      {postCategoryLabel(post.category)}
                    </Badge>
                    {postTagLabel(post.category, post.tag) && (
                      <span className="text-xs font-semibold text-muted">
                        {postTagLabel(post.category, post.tag)}
                      </span>
                    )}
                    {post.hasCard && (
                      <span className="text-xs font-semibold text-sky">싱커 기록</span>
                    )}
                    {post.solved && (
                      <Badge className="border-ok/40 bg-ok/10 text-ok desk:bg-transparent">해결됨</Badge>
                    )}
                    {hidden && (
                      <Badge className="gap-1 border-danger-line bg-danger-bg text-danger desk:bg-transparent">
                        <RoundEyeOff aria-hidden className="h-3 w-3" />
                        가림
                      </Badge>
                    )}
                  </div>
                  <h2 className="font-semibold leading-snug text-ink transition-colors group-hover:text-sky">
                    {post.title}
                  </h2>
                  {(post.meetAt || post.region) && (
                    <p className="flex flex-wrap items-center gap-x-2 gap-y-1 text-xs font-semibold text-ink/80">
                      {post.meetAt && <span>{meetAtText(post.meetAt)}</span>}
                      {post.region && <span className="text-muted">{post.region}</span>}
                      {post.capacity !== null && (
                        <span className="text-muted tabular-nums">
                          {post.joins} / {post.capacity}명
                        </span>
                      )}
                      {(post.closed || (post.capacity !== null && post.joins >= post.capacity)) && (
                        <span className="rounded-full bg-ink/8 px-2 py-0.5 text-muted">마감</span>
                      )}
                    </p>
                  )}
                  <p className="line-clamp-2 text-sm leading-relaxed text-muted">
                    {post.preview}
                  </p>
                  <div className="flex items-center gap-3 text-xs text-muted">
                    <span className="text-ink/80">
                      {post.nickname}
                      {post.coach && <span className="ml-1 font-semibold text-sky">코치</span>}
                    </span>
                    <span>{relativeTime(post.createdAt)}</span>
                    <span className="ml-auto flex items-center gap-3 tabular-nums">
                      <span className="flex items-center gap-1">
                        <RoundHeart aria-hidden className="h-3.5 w-3.5" />
                        <span className="sr-only">좋아요 </span>
                        {post.likes}
                      </span>
                      <span className="flex items-center gap-1">
                        <RoundChat aria-hidden className="h-3.5 w-3.5" />
                        <span className="sr-only">댓글 </span>
                        {post.comments}
                      </span>
                    </span>
                  </div>
                  </div>
                  {(post.thumb || post.hasVideo) && (
                    <div className="relative h-18 w-18 shrink-0 self-center overflow-hidden rounded-xl bg-surface-2">
                      {post.thumb && (
                        /* eslint-disable-next-line @next/next/no-img-element -- 저장소 서명 주소 */
                        <img src={post.thumb} alt="" className="h-full w-full object-cover" />
                      )}
                      {post.hasVideo && (
                        <RoundVideo
                          aria-label="영상 있음"
                          className={`absolute h-5 w-5 ${post.thumb ? 'right-1 bottom-1 text-white drop-shadow' : 'inset-0 m-auto text-muted'}`}
                        />
                      )}
                    </div>
                  )}
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
              href={listHref({ ...keep, sort, page: page - 1 })}
              variant="secondary"
            >
              이전 장
            </ButtonLink>
          )}
          {hasMore && (
            <ButtonLink
              href={listHref({ ...keep, sort, page: page + 1 })}
              variant="secondary"
            >
              더 보기
            </ButtonLink>
          )}
        </div>
      )}
      {user && (
        <p className="text-center">
          <Link href="/community/blocked" className="text-xs text-muted hover:text-ink">
            차단한 사람
          </Link>
        </p>
      )}
    </div>
  );
}
