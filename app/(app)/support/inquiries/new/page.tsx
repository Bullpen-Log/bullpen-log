import { headers } from 'next/headers';
import { requireUser } from '@/lib/dal';
import { expoLevel } from '@/lib/app-env';
import { OpenNative } from '@/app/(session)/velocity/open-native';
import { BackLink, PageHeading } from '@/components/ui';
import { SupportInquiryForm } from '@/components/support/support-inquiry-form';

/** 문의 쓰기 — 종류 · 제목 · 내용. 보내면 그 문의의 대화 화면으로 간다. */
export default async function NewInquiryPage() {
  await requireUser();

  /* 새 아이폰 앱(Expo)이 고객센터를 아는 판(BullpenNative/6 부터)이면 앱 화면으로 연다(native/src/app/support/inquiries/new.tsx) */
  if (expoLevel((await headers()).get('user-agent')) >= 6) {
    return <OpenNative path="/support/inquiries/new" cover={false} />;
  }

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
