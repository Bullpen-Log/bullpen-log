import { redirect } from 'next/navigation';
import { getCurrentUser } from '@/lib/dal';
import { recentCardOptions } from '@/lib/community-cards';
import { prisma } from '@/lib/prisma';
import { COMMUNITY_REGIONS } from '@/lib/community';
import { BackLink, PageHeading } from '@/components/ui';
import { CommunityPostForm } from './community-post-form';

/**
 * 글쓰기 — 가입한 누구나(자료실과 달리 관리자 전용이 아니다). 앱 웹뷰에서도 이 화면 그대로(2026-10-24 — 커뮤니티는 웹 하나로,
 * 앱 화면으로 넘기던 OpenNative 를 걷었다. 게시판 · 말머리 같은 새 기능을 두 곳에 만들지 않게).
 * ?board= 로 오면 그 게시판을 골라 둔 채 연다(게시판 목록의 글쓰기). ?card=velocity:<id> · pitch:<id> · lab:<id> 면 그 싱커 기록을 붙여 둔다
 * (싱커 결과 화면의 '덕아웃에 올리기' — 게시판을 안 주면 자유 · 내 기록).
 */
export default async function NewCommunityPostPage({
  searchParams,
}: {
  searchParams: Promise<{ board?: string | string[]; card?: string | string[] }>;
}) {
  const { board, card } = await searchParams;
  const initialCategory = typeof board === 'string' ? board : undefined;
  const initialCard = typeof card === 'string' ? card : undefined;
  const user = await getCurrentUser();
  if (!user) {
    const q = new URLSearchParams();
    if (initialCategory) q.set('board', initialCategory);
    if (initialCard) q.set('card', initialCard);
    const back = q.size ? `/community/new?${q}` : '/community/new';
    redirect(`/login?next=${encodeURIComponent(back)}`);
  }
  /* 기록을 못 읽어도 글쓰기는 연다 — 카드 칸만 빈다 */
  const [cardOptions, team] = await Promise.all([
    recentCardOptions(user.id, initialCard).catch(() => []),
    /* 팀 관리를 쓰는 팀이면 팀 양식을 미리 채운다(지역은 '서울 강남' 같은 자유 글의 앞말로 시 · 도를 맞춘다) */
    prisma.org.findFirst({
      where: { kind: 'TEAM', ownerId: user.id },
      orderBy: { createdAt: 'asc' },
      select: { name: true, region: true, note: true },
    }),
  ]);
  const teamPrefill = team
    ? {
        team: team.name,
        region: COMMUNITY_REGIONS.find((r) => team.region?.startsWith(r)) ?? '',
        ages: team.note ?? '',
      }
    : null;

  return (
    <div className="stack-page mx-auto max-w-3xl">
      <BackLink href="/community">커뮤니티</BackLink>
      <PageHeading title="글쓰기" />
      <CommunityPostForm
        initialCategory={initialCategory}
        cardOptions={cardOptions}
        initialCard={initialCard}
        teamPrefill={teamPrefill}
      />
    </div>
  );
}
