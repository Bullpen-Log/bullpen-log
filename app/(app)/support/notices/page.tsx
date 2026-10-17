import { Megaphone } from '@/components/icon';
import { headers } from 'next/headers';
import { requireUser } from '@/lib/dal';
import { expoLevel } from '@/lib/app-env';
import { loadNotices } from '@/lib/support-load';
import { OpenNative } from '@/app/(session)/velocity/open-native';
import { BackLink, ButtonLink, EmptyState, PageHeading } from '@/components/ui';
import { SupportNoticeRows } from '@/components/support/support-notice-rows';

/** 공지 전체 — 고정 공지가 먼저, 그다음 새 글 순. 관리자는 여기서 바로 쓴다. */
export default async function SupportNoticesPage() {
  const user = await requireUser();
  const isAdmin = user.role === 'ADMIN';

  /* 새 아이폰 앱(Expo)이 고객센터를 아는 판(BullpenNative/6 부터)이면 앱 화면으로 연다(native/src/app/support/notices/index.tsx) */
  if (expoLevel((await headers()).get('user-agent')) >= 6) {
    return <OpenNative path="/support/notices" cover={false} />;
  }

  const notices = await loadNotices();

  return (
    <div className="stack-page">
      <BackLink href="/support">고객센터</BackLink>
      <PageHeading
        title="공지"
        action={
          isAdmin ? (
            <ButtonLink href="/admin/support/notices/new" size="sm">
              공지 쓰기
            </ButtonLink>
          ) : undefined
        }
      />

      {notices.length === 0 ? (
        <EmptyState
          icon={<Megaphone />}
          title="아직 올라온 공지가 없어요"
          description="점검 · 새 기능 · 바뀐 점이 있으면 여기에 올라와요."
        />
      ) : (
        <SupportNoticeRows rows={notices} />
      )}
    </div>
  );
}
