import Link from 'next/link';
import { redirect } from 'next/navigation';
import { getCurrentUser } from '@/lib/dal';
import { MY_TABS, loadMyCommunity, type MyTab } from '@/lib/community-load';
import { gatherStateLabel, joinStatusLabel, postCategoryLabel, postTagLabel, teamFlowOf } from '@/lib/community';
import { BackLink, Badge } from '@/components/ui';
import { CategoryRow, DugoutEmpty, DugoutPageHeader } from '@/components/dugout/ui';
import { RoundCommunity } from '@/components/round-icon';
import { meetAtText, relativeTime } from '@/components/community/community-format';

const EMPTY: Record<MyTab, { title: string; href: string; cta: string }> = {
  posts: { title: '아직 쓴 글이 없어요', href: '/community/new', cta: '글쓰기' },
  comments: { title: '댓글을 단 글이 없어요', href: '/community?category=question&answer=none', cta: '답할 질문 보기' },
  saved: { title: '저장한 글이 없어요', href: '/community', cta: '커뮤니티 보기' },
  meetups: { title: '참가한 번개가 없어요', href: '/community?category=meetup&open=1', cta: '모집 중 번개 보기' },
  team: { title: '팀 신청이 없어요', href: '/community?category=team', cta: '팀 글 보기' },
};

/**
 * 마이 › 커뮤니티 활동(2026-10-26) — 내 글 · 댓글 단 글 · 저장 · 참가한 번개 · 팀 신청(진행 상태). 탭은 주소(?tab=)라 돌아와도 그대로.
 * 가린 내 글도 보인다(눌러서 까닭 · 이의 제기). 남의 가린 글은 안 보인다.
 */
export default async function MyCommunityPage({ searchParams }: { searchParams: Promise<{ tab?: string | string[] }> }) {
  const user = await getCurrentUser();
  if (!user) redirect('/login?next=/me/community');
  const { tab: raw } = await searchParams;
  const tab: MyTab = MY_TABS.some((t) => t.key === raw) ? (raw as MyTab) : 'posts';
  const items = await loadMyCommunity(user, tab);

  return (
    <div className="stack-page mx-auto max-w-3xl">
      <BackLink href="/me">마이</BackLink>
      <DugoutPageHeader title="커뮤니티 활동" subtitle="내가 쓴 글 · 댓글 · 저장 · 참가 · 신청" />
      <CategoryRow
        label="활동"
        items={MY_TABS.map((t) => ({ key: t.key, label: t.label, href: `/me/community?tab=${t.key}`, on: tab === t.key }))}
      />
      {items.length === 0 ? (
        <DugoutEmpty compact icon={<RoundCommunity />} title={EMPTY[tab].title} href={EMPTY[tab].href} cta={EMPTY[tab].cta} />
      ) : (
        <ul className="divide-y divide-line border-y border-line">
          {items.map((p) => {
            const tagLabel = postTagLabel(p.category, p.tag);
            const state = p.state ? gatherStateLabel(p.state, p.category, p.tag) : null;
            return (
              <li key={p.id}>
                <Link href={`/community/${p.id}`} className="block space-y-1 py-4 transition-colors active:bg-ink/6 lg:hover:bg-ink/3">
                  <span className="flex flex-wrap items-center gap-2 text-xs font-semibold">
                    <span className="text-ink">{postCategoryLabel(p.category)}</span>
                    {tagLabel && <span className="text-muted">{tagLabel}</span>}
                    {p.hidden && <Badge className="border-danger-line bg-danger-bg text-danger desk:bg-transparent">가림 · 까닭 보기</Badge>}
                    {p.category === 'question' &&
                      (p.solved ? (
                        <Badge className="border-ok/40 bg-ok/10 text-ok desk:bg-transparent">해결됨</Badge>
                      ) : !p.answered ? (
                        <Badge className="border-warn-line bg-warn-bg text-warn desk:bg-transparent">답변 기다림</Badge>
                      ) : null)}
                    {state && <span className="text-muted">{state}</span>}
                  </span>
                  <span className="block text-base font-semibold text-ink">{p.title}</span>
                  <span className="flex flex-wrap items-center gap-x-3 text-xs text-muted">
                    {p.meetAt && <span>{meetAtText(p.meetAt)}</span>}
                    {p.joinStatus && p.category === 'team' && (
                      <span className="font-semibold text-ink">
                        {teamFlowOf(p.tag).applied} · 진행: {joinStatusLabel(p.joinStatus)}
                      </span>
                    )}
                    <span>{relativeTime(p.at)}</span>
                    <span>댓글 {p.comments}</span>
                  </span>
                </Link>
              </li>
            );
          })}
        </ul>
      )}
    </div>
  );
}
