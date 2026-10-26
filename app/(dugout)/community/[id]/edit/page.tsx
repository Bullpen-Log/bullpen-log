import { notFound, redirect } from 'next/navigation';
import { getCurrentUser } from '@/lib/dal';
import { prisma } from '@/lib/prisma';
import { loadCommunityPost } from '@/lib/community-load';
import { kstInputValue } from '@/lib/community';
import type { FormValues } from '@/lib/form-values';
import { BackLink } from '@/components/ui';
import { DugoutPageHeader } from '@/components/dugout/ui';
import { CommunityPostForm } from '../../new/community-post-form';

/**
 * 글 고치기(2026-10-26) — 글쓴이만. 글쓰기와 같은 폼에 지금 값을 채워 연다. 참가 · 신청 · 대화가 있으면 게시판, 신청이 있으면 팀 말머리를 잠근다
 * (서버 updatePost 가 한 번 더 막는다). 날짜 · 장소 · 비용 · 인원을 바꾸면 참가자 · 신청자에게 알림이 간다.
 */
export default async function EditCommunityPostPage({ params }: { params: Promise<{ id: string }> }) {
  const { id } = await params;
  const user = await getCurrentUser();
  if (!user) redirect(`/login?next=${encodeURIComponent(`/community/${id}/edit`)}`);
  const post = await loadCommunityPost(user, id);
  if (!post) notFound();
  if (!post.isOwner) redirect(`/community/${id}`);
  const messages = await prisma.communityMessage.count({ where: { postId: id } });

  const values: FormValues = {
    category: post.category,
    tag: post.tag ?? '',
    title: post.title,
    body: post.body,
    byStaff: post.byStaff ? '1' : '0',
    region: post.region ?? '',
    district: post.district ?? '',
  };
  if (post.meetup) {
    Object.assign(values, {
      meetAt: post.meetAt ? kstInputValue(post.meetAt) : '',
      place: post.meetup.place,
      capacity: String(post.meetup.capacity),
      level: post.meetup.level,
      gear: post.meetup.gear,
      cost: post.meetup.cost,
      age: post.meetup.age,
    });
  }
  if (post.team) {
    const t = post.team;
    Object.assign(values, {
      team: t.team,
      league: t.league,
      days: t.days,
      fee: t.fee,
      ages: t.ages,
      positions: t.positions,
      count: t.count ? String(t.count) : '',
      career: t.career,
      schedule: t.schedule,
      venue: t.venue,
      venueReady: t.venueReady,
      level: t.level,
      cost: t.cost,
      areas: t.areas,
      gameAt: post.meetAt ? kstInputValue(post.meetAt) : '',
    });
  }

  return (
    <div className="stack-page mx-auto max-w-3xl">
      <BackLink href={`/community/${id}`}>글</BackLink>
      <DugoutPageHeader title="글 고치기" />
      {post.joinCount > 0 && (
        <p className="rounded-2xl bg-surface-2 px-(--block-pad) py-3 text-sm text-muted">
          {post.joinCount}명이 참가 · 신청했어요. 날짜 · 장소 · 비용 · 인원을 바꾸면 그분들께 알림이 가요.
        </p>
      )}
      <CommunityPostForm
        isAdmin={user.role === 'ADMIN'}
        editing={{
          id,
          values,
          media: post.media,
          lockCategory: post.joinCount > 0 || messages > 0,
          lockTag: post.joinCount > 0 && post.category === 'team',
          hasCard: post.card !== null,
        }}
      />
    </div>
  );
}
