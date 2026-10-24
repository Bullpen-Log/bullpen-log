import { redirect } from 'next/navigation';
import { getCurrentUser } from '@/lib/dal';
import { prisma } from '@/lib/prisma';
import { setBlocked } from '@/app/actions/community';
import { BackLink, Button, PageHeading } from '@/components/ui';
import { SafeForm } from '@/components/safe-form';

/** 차단한 사람 — 풀면 그 사람 글 · 댓글이 다시 보인다(커뮤니티 목록 맨 밑 '차단한 사람') */
export default async function BlockedPage() {
  const user = await getCurrentUser();
  if (!user) redirect('/login?next=/community/blocked');
  const rows = await prisma.communityBlock.findMany({
    where: { blockerId: user.id },
    orderBy: { createdAt: 'desc' },
    select: { blocked: { select: { id: true, nickname: true } } },
  });

  return (
    <div className="stack-page mx-auto max-w-3xl">
      <BackLink href="/community">커뮤니티</BackLink>
      <PageHeading title="차단한 사람" />
      {rows.length === 0 ? (
        <p className="empty-well px-(--block-pad) py-8 text-center text-sm text-muted">차단한 사람이 없어요.</p>
      ) : (
        <ul className="divide-y divide-line overflow-hidden rounded-2xl border border-line bg-surface">
          {rows.map(({ blocked }) => (
            <li key={blocked.id} className="flex items-center justify-between gap-3 px-(--block-pad) py-3">
              <span className="text-sm text-ink">{blocked.nickname}</span>
              <SafeForm action={setBlocked}>
                <input type="hidden" name="userId" value={blocked.id} />
                <input type="hidden" name="block" value="0" />
                <Button type="submit" variant="secondary" size="sm">
                  풀기
                </Button>
              </SafeForm>
            </li>
          ))}
        </ul>
      )}
    </div>
  );
}
