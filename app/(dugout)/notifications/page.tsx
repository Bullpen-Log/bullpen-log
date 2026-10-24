import Link from 'next/link';
import { redirect } from 'next/navigation';
import { Badge, Card } from '@/components/ui';
import { DugoutEmpty, DugoutPageHeader } from '@/components/dugout/ui';
import { SafeForm } from '@/components/safe-form';
import { getCurrentUser } from '@/lib/dal';
import { prisma } from '@/lib/prisma';
import { markNotificationsRead } from '@/app/actions/notifications';
import { KIND_LABEL, NOTIFY_PAGE_SIZE, type NotifyKind } from '@/lib/notify-rules';
import { relativeTime } from '@/components/community/community-format';

/** 알림함(2026-10-21 개편 5단계 5-2, docs/designs/sinker-dugout.md 5-2) — 채팅 · 예약 · 레슨 기록 · 댓글 · 팀 공지. 누르면 그 자리로 */
export default async function NotificationsPage() {
  const user = await getCurrentUser();
  if (!user) redirect('/login?next=/notifications');
  const items = await prisma.notification.findMany({
    where: { userId: user.id },
    orderBy: { createdAt: 'desc' },
    take: NOTIFY_PAGE_SIZE,
    select: {
      id: true,
      kind: true,
      title: true,
      body: true,
      link: true,
      readAt: true,
      createdAt: true,
    },
  });
  const unread = items.filter((n) => !n.readAt).length;
  const now = new Date();
  return (
    <div className="max-w-3xl space-y-6">
      <DugoutPageHeader
        title="알림"
        subtitle={unread > 0 ? `안 읽은 알림 ${unread}개` : undefined}
        actions={
          unread > 0 ? (
            <SafeForm action={markNotificationsRead}>
              <button
                type="submit"
                className="min-h-9 rounded-full border border-line px-3.5 text-[13px] font-semibold text-ink hover:border-ink/40"
              >
                모두 읽음
              </button>
            </SafeForm>
          ) : undefined
        }
      />
      {items.length === 0 ? (
        <DugoutEmpty
          title="아직 알림이 없어요"
          description="채팅 · 예약 · 레슨 기록이 오면 여기 쌓여요."
        />
      ) : (
        <Card className="divide-y divide-line p-0">
          {items.map((n) => (
            <div
              key={n.id}
              className={`flex items-start gap-3 px-4 py-3 ${n.readAt ? 'opacity-70' : ''}`}
            >
              <Badge className="mt-0.5 shrink-0">
                {KIND_LABEL[n.kind as NotifyKind] ?? n.kind}
              </Badge>
              <Link href={n.link ?? '/'} className="min-w-0 flex-1">
                <span className="block text-sm font-semibold text-ink">{n.title}</span>
                {n.body && (
                  <span className="block truncate text-xs text-muted">{n.body}</span>
                )}
              </Link>
              <span className="shrink-0 text-[11px] text-muted">
                {relativeTime(n.createdAt, now)}
              </span>
              {!n.readAt && (
                <SafeForm action={markNotificationsRead}>
                  <input type="hidden" name="id" value={n.id} />
                  <button
                    type="submit"
                    className="shrink-0 text-[11px] font-semibold text-sky"
                  >
                    읽음
                  </button>
                </SafeForm>
              )}
            </div>
          ))}
        </Card>
      )}
    </div>
  );
}
