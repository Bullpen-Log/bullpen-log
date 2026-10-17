import { notFound } from 'next/navigation';
import { prisma } from '@/lib/prisma';
import { requireAdmin } from '@/lib/dal';
import { BackLink, PageHeading } from '@/components/ui';
import { SupportNoticeForm } from '@/components/support/support-notice-form';

/** 공지 고치기(관리자) — 저장하면 그 공지 화면으로 간다. */
export default async function EditNoticePage({
  params,
}: {
  params: Promise<{ id: string }>;
}) {
  const { id } = await params;
  await requireAdmin();

  const notice = await prisma.supportNotice.findUnique({
    where: { id },
    select: { id: true, title: true, body: true, pinned: true },
  });
  if (!notice) notFound();

  return (
    <div className="mx-auto max-w-3xl stack-page">
      <BackLink href={`/support/notices/${notice.id}`}>공지</BackLink>
      <PageHeading title="공지 고치기" />
      <SupportNoticeForm notice={notice} />
    </div>
  );
}
