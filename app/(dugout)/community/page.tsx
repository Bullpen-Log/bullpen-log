import CommunityPage from './community-page';

type Search = { [key: string]: string | string[] | undefined };

/**
 * 덕아웃 커뮤니티(2026-10-21 금윤호: "덕아웃에서 별도의 커뮤니티 기능을 만들고 싱커의 커뮤니티는 없애") — 글 목록 · 글 · 글쓰기는 덕아웃 틀 안.
 * 싱커(선수 화면)의 커뮤니티 판은 지웠고, 그 탭 자리는 '덕아웃'(이동)이다(lib/nav.ts DUGOUT_HREF).
 * 보기는 로그인 없이(2026-10-24 김민 — 휴대폰 브라우저로 온 사람도 읽는다), 쓰기 · 댓글 · 좋아요 · 신고는 로그인.
 */
export default async function DugoutCommunityPage({
  searchParams,
}: {
  searchParams: Promise<Search>;
}) {
  return <CommunityPage searchParams={searchParams} />;
}
