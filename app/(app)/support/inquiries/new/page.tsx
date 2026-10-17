import { requireUser } from '@/lib/dal';
import { BackLink, PageHeading } from '@/components/ui';
import { SupportInquiryForm } from '@/components/support/support-inquiry-form';

/** 문의 쓰기 — 종류 · 제목 · 내용. 보내면 그 문의의 대화 화면으로 간다. */
export default async function NewInquiryPage() {
  await requireUser();

  return (
    <div className="mx-auto max-w-3xl stack-page">
      <BackLink href="/support">고객센터</BackLink>
      <PageHeading
        title="문의하기"
        description="운영자가 확인하고 답해 드려요. 답이 오면 문의 화면에 이어서 보여요."
      />
      <SupportInquiryForm />
    </div>
  );
}
