import { requireUser } from '@/lib/dal';
import { BackLink, PageHeading } from '@/components/ui';
import { CommunityPostForm } from './community-post-form';

/** 글쓰기 — 가입한 누구나(자료실과 달리 관리자 전용이 아니다) */
export default async function NewCommunityPostPage() {
  await requireUser();

  return (
    <div className="stack-page mx-auto max-w-3xl">
      <BackLink href="/community">커뮤니티</BackLink>
      <PageHeading title="글쓰기" />
      <CommunityPostForm />
    </div>
  );
}
