import { MessagesSquare } from '@/components/icon';
import { prisma } from '@/lib/prisma';
import { requireUser } from '@/lib/dal';
import { BackLink, ButtonLink, EmptyState, PageHeading } from '@/components/ui';
import { SupportInquiryRows } from '@/components/support/support-inquiry-rows';

/** 내 1:1 문의 전체 — 새 것부터. 다른 사람의 문의는 여기 없다(관리자는 /admin/support 에서 본다). */
export default async function SupportInquiriesPage() {
  const user = await requireUser();

  const inquiries = await prisma.supportInquiry.findMany({
    where: { userId: user.id },
    orderBy: { createdAt: 'desc' },
    select: {
      id: true,
      title: true,
      category: true,
      status: true,
      createdAt: true,
      _count: { select: { replies: true } },
    },
  });

  return (
    <div className="stack-page">
      <BackLink href="/support">고객센터</BackLink>
      <PageHeading
        title="1:1 문의"
        action={
          <ButtonLink href="/support/inquiries/new" size="sm">
            문의하기
          </ButtonLink>
        }
      />

      {inquiries.length === 0 ? (
        <EmptyState
          icon={<MessagesSquare />}
          title="아직 문의한 게 없어요"
          description="오류 · 계정 · 기능 제안 무엇이든 물어 주세요. 답이 오면 여기에서 볼 수 있어요."
          action={
            <ButtonLink href="/support/inquiries/new" variant="secondary">
              첫 문의 보내기
            </ButtonLink>
          }
        />
      ) : (
        <SupportInquiryRows
          rows={inquiries.map((q) => ({ ...q, replyCount: q._count.replies }))}
        />
      )}
    </div>
  );
}
