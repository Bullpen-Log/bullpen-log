import Link from 'next/link';
import { RoundChat, RoundCommunity, RoundEyeOff, RoundFlame, RoundHeart, RoundPencil, RoundPeople, RoundSearch, RoundVideo } from '@/components/round-icon';
import { getCurrentUser } from '@/lib/dal';
import { boardHasPosts, coachIdsOf, loadCommunityList, waitingQuestions } from '@/lib/community-load';
import {
  ANSWER_FILTERS,
  BOARD_GUIDES,
  HOT_PERIODS,
  POST_CATEGORIES,
  POST_SORTS,
  POST_TAGS,
  gatherStateLabel,
  headcountText,
  hotPeriodOf,
  isAnswerFilter,
  isCommunityRegion,
  isPostCategory,
  isPostTag,
  postCategoryLabel,
  postTagLabel,
  type AnswerFilter,
  type HotPeriod,
  type PostSort,
} from '@/lib/community';
import { isDistrict } from '@/lib/kr-districts';
import { Badge, ButtonLink } from '@/components/ui';
import { CategoryRow, ChipLink, ChipRow, DugoutEmpty, DugoutPageHeader, ShortcutTiles } from '@/components/dugout/ui';
import {
  meetAtText,
  relativeTime,
} from '@/components/community/community-format';
import { CommunityRegionFilter } from '@/components/community/community-region-filter';

type Search = { [key: string]: string | string[] | undefined };
const one = (v: string | string[] | undefined) =>
  typeof v === 'string' ? v : undefined;

type ListParams = {
  category?: string;
  tag?: string;
  region?: string;
  district?: string;
  past?: boolean;
  open?: boolean;
  answer?: AnswerFilter;
  sort: PostSort;
  period?: HotPeriod;
  page?: number;
};

/** 목록 주소 — 게시판 · 말머리 · 지역 · 답 상태 · 정렬 · 기간 · 장을 바꿔도 나머지는 그대로(게시판을 바꾸면 게시판 거르기는 버린다) */
function listHref(q: ListParams) {
  const sp = new URLSearchParams();
  const local = q.category === 'meetup' || q.category === 'team';
  if (q.category) sp.set('category', q.category);
  if (q.category && q.tag) sp.set('tag', q.tag);
  if (q.region && local) sp.set('region', q.region);
  if (q.region && q.district && local) sp.set('district', q.district);
  if (q.past && q.category === 'meetup') sp.set('past', '1');
  if (q.open && local && !q.past) sp.set('open', '1');
  if (q.answer && q.category === 'question') sp.set('answer', q.answer);
  if (q.sort !== 'new') sp.set('sort', q.sort);
  if (q.sort === 'hot' && q.period && q.period !== '7d') sp.set('period', q.period);
  if (q.page && q.page > 1) sp.set('page', String(q.page));
  const s = sp.toString();
  return s ? `/community?${s}` : '/community';
}

const STATE_CHIP: Record<string, string> = {
  open: 'bg-ok/10 text-ok',
  cancelled: 'bg-danger-bg text-danger',
  held: 'bg-sky-tint text-sky-strong',
};

/**
 * 커뮤니티 목록(2026-10-17 1판 — 틀). 게시판 칩 · 최신/인기 · 더 보기. 가린 글은 관리자에게만 흐리게 보인다.
 *
 * 2026-10-21 부터 덕아웃 안(/community, app/(dugout)) — 싱커의 커뮤니티 판은 걷었다. 장터 · 채팅은 덕아웃 위 막대에 있어 여기 길 카드는 뺐다.
 * 2026-10-26: 질문의 답 상태(답변 없음 · 미해결 · 해결됨), 모집 중만, 시 · 군 · 구, 인기 기간(7일 · 30일 · 전체) — 거르기는 주소에 남아 정렬 · 장을 넘겨도 그대로.
 * 빈 화면은 '게시판에 아직 글이 없음'과 '거르기에 맞는 글이 없음'을 가른다.
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
  const period = hotPeriodOf(one(sp.period));
  const page = Math.max(1, Number.parseInt(one(sp.page) ?? '1', 10) || 1);
  /* 우리 동네 · 지난 번개 · 모집 중은 번개 · 팀 게시판에서만, 답 상태는 질문 · 답변에서만 */
  const local = category === 'meetup' || category === 'team';
  const rawRegion = one(sp.region);
  const region = local && isCommunityRegion(rawRegion) ? rawRegion : undefined;
  const rawDistrict = one(sp.district);
  const district = region && isDistrict(region, rawDistrict) ? rawDistrict : undefined;
  const past = category === 'meetup' && one(sp.past) === '1';
  const open = local && !past && one(sp.open) === '1';
  const rawAnswer = one(sp.answer);
  const answer = category === 'question' && isAnswerFilter(rawAnswer) ? rawAnswer : undefined;
  /* 지금 거르기를 지키는 주소 조각 — 게시판을 바꾸면 버린다 */
  const keep = { category, tag, region, district, past, open, answer, period };
  const filtered = Boolean(tag || region || open || answer || past || (sort === 'hot' && period !== 'all'));

  /* 첫 화면(전체 · 최신 · 첫 장)만 바로가기 — 장터와 같은 규칙 */
  const landing = !category && sort === 'new' && page === 1;

  /* 글쓰기는 로그인 — 안 했으면 로그인 뒤 글쓰기로. 게시판을 보고 있으면 그 게시판을 골라 둔다 */
  const newHref = category ? `/community/new?board=${category}` : '/community/new';
  const writeHref = user ? newHref : `/login?next=${encodeURIComponent(newHref)}`;

  /* 읽기는 앱 화면과 같은 곳(lib/community-load.ts) — 가린 글은 관리자에게만, 차단한 사람 글은 빼고 */
  const [{ posts, hasMore }, isCoach] = await Promise.all([
    loadCommunityList(user, {
      category,
      tag,
      region,
      district,
      when: category === 'meetup' ? (past ? 'past' : 'upcoming') : undefined,
      openOnly: open,
      answer,
      sort,
      period,
      page,
    }),
    user ? coachIdsOf([user.id]).then((s) => s.size > 0) : Promise.resolve(false),
  ]);
  /* 빈 목록이면 — 게시판 자체가 비었는지, 거르기 때문인지 */
  const boardEmpty = posts.length === 0 && page === 1 ? !(await boardHasPosts(user, category)) : false;
  /* 답할 질문 — 코치 · 운영자에게(질문 게시판 · 첫 화면) */
  const showWaiting = (isCoach || user?.role === 'ADMIN') && (landing || category === 'question');
  const waiting = showWaiting ? await waitingQuestions() : null;

  const guide = category ? BOARD_GUIDES[category] : null;

  return (
    /* 읽기 폭 900(2026-10-26 v2 커뮤니티) — 글 줄이 1160 양 끝까지 늘어나지 않게. 게시판 줄 · 머리 · 목록이 같은 폭 */
    <div className="space-y-10 lg:max-w-[900px] lg:space-y-6">
      {/* 게시판 — 장터 품목과 같은 밑줄 줄, 맨 위(2026-10-24 '장터처럼 덜어내') */}
      <CategoryRow
        label="게시판"
        className="-mt-2"
        items={[
          { key: 'all', label: '전체', href: listHref({ sort }), on: !category },
          ...POST_CATEGORIES.map((c) => ({ key: c.key, label: c.label, href: listHref({ category: c.key, sort }), on: category === c.key })),
        ]}
      />

      {/* 바로가기는 휴대폰 · 패드만 — PC 는 게시판 탭 · 글쓰기 단추가 같은 길(2026-10-25 PC 개편) */}
      {landing && (
        <ShortcutTiles
          className="lg:hidden"
          label="커뮤니티 바로가기"
          items={[
            { href: writeHref, label: '글쓰기', icon: RoundPencil },
            { href: listHref({ category: 'question', answer: 'none', sort }), label: '답할 질문', icon: RoundSearch },
            { href: listHref({ category: 'meetup', open: true, sort }), label: '모집 중 번개', icon: RoundFlame },
            { href: listHref({ category: 'team', sort }), label: '선수 모집', icon: RoundPeople },
            { href: listHref({ sort: 'hot' }), label: '인기 글', icon: RoundHeart },
            { href: user ? '/me/community' : `/login?next=${encodeURIComponent('/me/community')}`, label: '내 활동', icon: RoundChat },
          ]}
        />
      )}

      {waiting && waiting.total > 0 && (
        <section aria-label="답을 기다리는 질문" className="space-y-2 rounded-2xl bg-warn-bg/60 px-(--block-pad) py-4">
          <p className="text-sm font-semibold text-ink">
            답을 기다리는 질문 {waiting.total}개 <span className="font-normal text-muted">· 코치 · 운영자에게 보여요</span>
          </p>
          <ChipRow label="분야">
            {POST_TAGS.question
              .filter((t) => waiting.byTag[t.key])
              .map((t) => (
                <ChipLink key={t.key} on={false} href={listHref({ category: 'question', tag: t.key, answer: 'none', sort: 'new' })}>
                  {t.label} {waiting.byTag[t.key]}
                </ChipLink>
              ))}
            {waiting.byTag[''] ? (
              <ChipLink on={false} href={listHref({ category: 'question', answer: 'none', sort: 'new' })}>
                말머리 없음 {waiting.byTag['']}
              </ChipLink>
            ) : null}
          </ChipRow>
        </section>
      )}

      <section className="space-y-5">
      <DugoutPageHeader
        title={category ? postCategoryLabel(category) : sort === 'hot' ? '인기 글' : '새 글'}
        subtitle={guide?.what}
        actions={<ButtonLink href={writeHref} size="sm" className={landing ? 'hidden lg:inline-flex' : ''}>{guide?.cta ?? '글쓰기'}</ButtonLink>}
      />

      {/* 거르기 — 구분 칩은 옆으로 미끄러지고(휴대폰), 정렬은 오른쪽 끝의 작은 둘 */}
      <div className="space-y-3">
        <div className="flex flex-col gap-3 desk:flex-row desk:flex-wrap desk:items-center desk:justify-between">
          {!category && <span className="hidden desk:block" />}
          {category && (
            <ChipRow label="말머리" className="desk:flex-1">
              {[{ key: '', label: '전체' }, ...POST_TAGS[category]].map((t) => (
                <ChipLink key={t.key} on={(tag ?? '') === t.key} href={listHref({ ...keep, tag: t.key || undefined, sort })}>
                  {t.label}
                </ChipLink>
              ))}
            </ChipRow>
          )}
          <div className="flex flex-wrap items-center gap-2 self-end desk:self-auto">
            {local && (
              <CommunityRegionFilter base={listHref({ ...keep, sort })} region={region} district={district} />
            )}
            {/* 번개는 모일 때 순 — 최신 · 인기 대신 다가오는 · 지난 */}
            <div role="group" aria-label={category === 'meetup' ? '번개 때' : '정렬'} className="flex items-center gap-1 text-sm">
              {(category === 'meetup'
                ? [
                    { key: 'up', label: '다가오는', href: listHref({ ...keep, past: false, sort }), on: !past },
                    { key: 'past', label: '지난', href: listHref({ ...keep, past: true, open: false, sort }), on: past },
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
        {/* 둘째 줄 — 게시판마다 쓸모 있는 거르기 하나씩 */}
        {(category === 'question' || (local && !past) || (sort === 'hot' && category !== 'meetup')) && (
          <ChipRow label="거르기">
            {category === 'question' &&
              [{ key: undefined, label: '모든 질문' }, ...ANSWER_FILTERS].map((f) => (
                <ChipLink key={f.key ?? 'all'} on={answer === f.key} href={listHref({ ...keep, answer: f.key, sort })}>
                  {f.label}
                </ChipLink>
              ))}
            {local && !past && (
              <ChipLink on={open} href={listHref({ ...keep, open: !open, sort })}>
                모집 중만
              </ChipLink>
            )}
            {sort === 'hot' &&
              category !== 'meetup' &&
              HOT_PERIODS.map((p) => (
                <ChipLink key={p.key} on={period === p.key} href={listHref({ ...keep, period: p.key, sort })}>
                  {p.key === 'all' ? '전체 기간' : `최근 ${p.label}`}
                </ChipLink>
              ))}
          </ChipRow>
        )}
      </div>

      {posts.length === 0 ? (
        page > 1 ? (
          <DugoutEmpty
            compact
            icon={<RoundCommunity />}
            title="여기까지예요"
            description="앞 장으로 돌아가 보세요."
            action={
              <ButtonLink href={listHref({ ...keep, sort })} variant="secondary">
                처음으로
              </ButtonLink>
            }
          />
        ) : boardEmpty ? (
          /* 게시판 자체가 빔 — 무엇을 하는 곳인지 · 이런 글을 써 보라는 보기 · 쓰기 단추 */
          <div className="space-y-4 rounded-2xl bg-surface-2 px-(--block-pad) py-8 text-center">
            <p className="text-base font-bold text-ink">{category ? `${postCategoryLabel(category)}의 첫 글을 기다려요` : '첫 글을 기다려요'}</p>
            <p className="text-sm text-muted">{guide?.what ?? '야구 이야기라면 무엇이든 남겨요. 질문 · 번개 · 팀 모집도 여기서 해요.'}</p>
            <ul className="mx-auto max-w-xl space-y-1 text-left text-sm text-ink/80">
              {(guide?.examples ?? [BOARD_GUIDES.free.examples[0], BOARD_GUIDES.question.examples[0], BOARD_GUIDES.meetup.examples[0]]).map((e) => (
                <li key={e} className="rounded-xl bg-surface px-3 py-2">
                  예) {e}
                </li>
              ))}
            </ul>
            <div className="flex flex-wrap justify-center gap-2">
              <ButtonLink href={writeHref}>{guide?.cta ?? '글쓰기'}</ButtonLink>
              <ButtonLink href="/community/guide" variant="secondary">
                운영 원칙
              </ButtonLink>
            </div>
          </div>
        ) : (
          /* 거르기에 맞는 글이 없음 — 조건 풀기 · 넓혀 보기 */
          <DugoutEmpty
            compact
            icon={<RoundCommunity />}
            title={answer === 'none' ? '답을 기다리는 질문이 없어요' : '조건에 맞는 글이 없어요'}
            description={
              region
                ? `${district ?? region}에는 아직 없어요. 지역을 넓혀 보세요.`
                : category === 'meetup' && !past
                  ? '다가오는 번개가 없어요. 먼저 열어 보세요.'
                  : '거르기를 풀거나 다른 게시판을 보세요.'
            }
            action={
              <div className="flex flex-wrap justify-center gap-2">
                {filtered && (
                  <ButtonLink href={listHref({ category, sort: 'new' })} variant="secondary">
                    조건 풀기
                  </ButtonLink>
                )}
                {district && (
                  <ButtonLink href={listHref({ ...keep, district: undefined, sort })} variant="secondary">
                    {region} 전체 보기
                  </ButtonLink>
                )}
                <ButtonLink href={writeHref}>{guide?.cta ?? '글쓰기'}</ButtonLink>
              </div>
            }
          />
        )
      ) : (
        <ul className="divide-y divide-line border-y border-line">
          {posts.map((post, i) => {
            const hidden = post.hidden;
            const stateLabel = post.state ? gatherStateLabel(post.state, post.category, post.tag) : null;
            return (
              <li
                key={post.id}
                style={{ '--row': i } as React.CSSProperties}
                className={`motion-safe:animate-row-in ${hidden ? 'opacity-55' : ''}`}
              >
                <Link
                  href={`/community/${post.id}`}
                  className="group flex gap-4 py-5 transition-colors active:bg-ink/6 lg:items-center lg:py-3 lg:hover:bg-ink/3"
                >
                  {/*
                    큰 화면은 두 줄(약 68px, v2): 게시판 · 말머리 · 제목 한 줄 → 쓴 사람 · 때 · 좋아요 · 댓글 한 줄. 미리보기 글은 휴대폰만(목록을 훑을 때는 제목이 먼저)
                  */}
                  <div className="flex min-w-0 flex-1 flex-col gap-1.5 lg:flex-row lg:flex-wrap lg:items-center lg:gap-x-3 lg:gap-y-1">
                  <div className="flex flex-wrap items-center gap-2">
                    <span className="text-xs font-semibold text-ink">{postCategoryLabel(post.category)}</span>
                    {postTagLabel(post.category, post.tag) && (
                      <span className="text-xs font-semibold text-muted">
                        {postTagLabel(post.category, post.tag)}
                      </span>
                    )}
                    {post.byStaff && <span className="text-xs font-semibold text-ink">운영</span>}
                    {post.hasCard && (
                      <span className="text-xs font-semibold text-sky">싱커 기록</span>
                    )}
                    {post.category === 'question' &&
                      (post.solved ? (
                        <Badge className="border-ok/40 bg-ok/10 text-ok desk:bg-transparent">해결됨</Badge>
                      ) : !post.answered ? (
                        <Badge className="border-warn-line bg-warn-bg text-warn desk:bg-transparent">답변 기다림</Badge>
                      ) : null)}
                    {hidden && (
                      <Badge className="gap-1 border-danger-line bg-danger-bg text-danger desk:bg-transparent">
                        <RoundEyeOff aria-hidden className="h-3 w-3" />
                        가림
                      </Badge>
                    )}
                  </div>
                  <h2 className="text-base font-semibold leading-snug text-ink group-hover:underline lg:min-w-0 lg:flex-1 lg:truncate lg:leading-[22px]">
                    {post.title}
                  </h2>
                  {(post.meetAt || post.region || stateLabel) && (
                    <p className="flex flex-wrap items-center gap-x-2 gap-y-1 text-xs font-semibold text-ink/80 lg:basis-full">
                      {stateLabel && post.state && (
                        <span className={`rounded-full px-2 py-0.5 ${STATE_CHIP[post.state] ?? 'bg-ink/8 text-muted'}`}>{stateLabel}</span>
                      )}
                      {post.meetAt && <span>{meetAtText(post.meetAt)}</span>}
                      {post.region && <span className="text-muted">{[post.region, post.district].filter(Boolean).join(' ')}</span>}
                      {post.capacity !== null && (
                        <span className="text-muted tabular-nums">{headcountText(post.joins, post.capacity)}</span>
                      )}
                    </p>
                  )}
                  <p className="line-clamp-1 text-sm text-muted lg:hidden">
                    {post.preview}
                  </p>
                  <div className="flex items-center gap-3 text-xs text-muted lg:basis-full">
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
                    <div className="relative h-18 w-18 shrink-0 self-center overflow-hidden rounded-xl bg-surface-2 lg:h-12 lg:w-12 lg:rounded-lg">
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

      </section>

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
      <p className="flex flex-wrap justify-center gap-4 text-center">
        {user && (
          <Link href="/me/community" className="text-xs text-muted hover:text-ink">
            내 활동
          </Link>
        )}
        <Link href="/community/guide" className="text-xs text-muted hover:text-ink">
          운영 원칙 · 신고 안내
        </Link>
        {user && (
          <Link href="/community/blocked" className="text-xs text-muted hover:text-ink">
            차단한 사람
          </Link>
        )}
      </p>
    </div>
  );
}
