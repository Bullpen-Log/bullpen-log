import { BackLink } from '@/components/ui';
import CommunityPage from '@/app/(app)/community/community-page';

type Search = { [key: string]: string | string[] | undefined };

/**
 * 글 목록(소통 피드) — 커뮤니티 탭 판은 덕아웃 홈이 차지하므로(2026-10-21 사용자 "커뮤니티를 누르면 바로 덕아웃으로"),
 * 글 전체 · 구분 · 정렬은 이 하위 화면에서. 덕아웃 홈의 '소통 · 새 글' → 전체 보기가 여기로 온다.
 */
export default function CommunityFeedPage({
  searchParams,
}: {
  searchParams: Promise<Search>;
}) {
  return (
    <div className="stack-page">
      <BackLink href="/community">덕아웃</BackLink>
      <CommunityPage searchParams={searchParams} />
    </div>
  );
}
