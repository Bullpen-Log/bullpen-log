import { headers } from 'next/headers';
import { expoLevel } from '@/lib/app-env';
import { OpenNative } from '@/app/(session)/velocity/open-native';
import { requireAdmin } from '@/lib/dal';
import { BackLink, PageHeading } from '@/components/ui';
import { SupportNoticeForm } from '@/components/support/support-notice-form';

/** 공지 쓰기(관리자) — 주소를 직접 쳐서 들어와도 막힌다. */
export default async function NewNoticePage() {
  await requireAdmin();
  if (expoLevel((await headers()).get('user-agent')) >= 8) return <OpenNative path="/admin/notice" cover={false} />;

  return (
    <div className="mx-auto max-w-3xl stack-page">
      <BackLink href="/admin/support">소통 관리</BackLink>
      <PageHeading title="공지 쓰기" />
      <SupportNoticeForm />
    </div>
  );
}
