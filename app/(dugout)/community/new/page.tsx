import { redirect } from 'next/navigation';
import { getCurrentUser } from '@/lib/dal';
import { BackLink, PageHeading } from '@/components/ui';
import { CommunityPostForm } from './community-post-form';

/**
 * 글쓰기 — 가입한 누구나(자료실과 달리 관리자 전용이 아니다). 앱 웹뷰에서도 이 화면 그대로(2026-10-24 — 커뮤니티는 웹 하나로,
 * 앱 화면으로 넘기던 OpenNative 를 걷었다. 게시판 · 말머리 같은 새 기능을 두 곳에 만들지 않게).
 */
export default async function NewCommunityPostPage() {
  if (!(await getCurrentUser())) redirect('/login?next=/community/new');

  return (
    <div className="stack-page mx-auto max-w-3xl">
      <BackLink href="/community">커뮤니티</BackLink>
      <PageHeading title="글쓰기" />
      <CommunityPostForm />
    </div>
  );
}
