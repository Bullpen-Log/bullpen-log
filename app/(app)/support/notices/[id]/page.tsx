import { notFound } from 'next/navigation';
import { Pencil, Pin, Trash2 } from '@/components/icon';
import { prisma } from '@/lib/prisma';
import { requireUser } from '@/lib/dal';
import { deleteNotice } from '@/app/actions/support';
import { BackLink, Badge, ButtonLink } from '@/components/ui';
import { ConfirmDeleteForm } from '@/components/confirm-delete';
import { formatSupportDateTime } from '@/components/support/support-format';

/** 공지 한 편 — 누구나 읽는다. 관리자만 고치고 지운다. */
export default async function SupportNoticePage({
  params,
}: {
  params: Promise<{ id: string }>;
}) {
  const { id } = await params;
  const user = await requireUser();

  const notice = await prisma.supportNotice.findUnique({
    where: { id },
    select: {
      id: true,
      title: true,
      body: true,
      pinned: true,
      createdAt: true,
      updatedAt: true,
    },
  });
  if (!notice) notFound();

  const isAdmin = user.role === 'ADMIN';

  return (
    <article className="selectable mx-auto max-w-3xl space-y-8">
      <BackLink href="/support/notices">공지</BackLink>

      <header className="space-y-4 border-b border-line pb-6">
        {notice.pinned && (
          <Badge className="gap-1 border-sky-soft/40 text-sky">
            <Pin aria-hidden className="h-3 w-3" />
            고정
          </Badge>
        )}
        <h1 className="text-heading page-title text-ink">{notice.title}</h1>
        <div className="flex flex-wrap items-center gap-x-4 gap-y-2 text-xs text-muted">
          <span>{formatSupportDateTime(notice.createdAt)}</span>

          {isAdmin && (
            <div className="ml-auto flex items-center gap-2">
              <ButtonLink
                href={`/admin/support/notices/${notice.id}/edit`}
                variant="secondary"
                size="sm"
              >
                <Pencil aria-hidden className="h-3.5 w-3.5" />
                수정
              </ButtonLink>
              <ConfirmDeleteForm
                action={deleteNotice}
                hidden={{ id: notice.id }}
                ariaLabel={`${notice.title} 지우기`}
                title="이 공지를 지울까요?"
                detail={
                  <div className="space-y-2">
                    <p>
                      <strong className="text-ink">{notice.title}</strong>
                    </p>
                    <p className="text-muted">되돌릴 수 없어요.</p>
                  </div>
                }
                className="inline-flex min-h-10 items-center gap-1.5 rounded-full border border-transparent bg-danger-bg px-4 py-2 text-sm font-semibold text-danger transition-colors hover:bg-danger-bg/70 desk:rounded-xl desk:border-danger-line"
              >
                <Trash2 aria-hidden className="h-3.5 w-3.5" />
                지우기
              </ConfirmDeleteForm>
            </div>
          )}
        </div>
      </header>

      <div className="whitespace-pre-wrap text-subhead leading-[1.9] text-ink/90">
        {notice.body}
      </div>
    </article>
  );
}
