import { headers } from 'next/headers';
import { requireUser } from '@/lib/dal';
import { expoLevel } from '@/lib/app-env';
import { OpenNative } from '@/app/(session)/velocity/open-native';
import { BackLink, PageHeading } from '@/components/ui';
import { CommunityPostForm } from './community-post-form';

/** 글쓰기 — 가입한 누구나(자료실과 달리 관리자 전용이 아니다) */
export default async function NewCommunityPostPage() {
  await requireUser();

  /* 새 아이폰 앱(Expo)이 커뮤니티를 아는 판(BullpenNative/6 부터)이면 앱 화면으로 연다(native/src/app/community/new.tsx) */
  if (expoLevel((await headers()).get('user-agent')) >= 6) {
    return <OpenNative path="/community/new" cover={false} />;
  }

  return (
    <div className="stack-page mx-auto max-w-3xl">
      <BackLink href="/community">커뮤니티</BackLink>
      <PageHeading title="글쓰기" />
      <CommunityPostForm />
    </div>
  );
}
