import { DugoutHome } from '@/components/dugout/dugout-home';

/** 커뮤니티 판의 /community 쪽 — 덕아웃 홈 그대로(앱이면 홈으로 보내지 않는다 — app/(dugout)/page.tsx 만 보낸다) */
export default function CommunitySlotPage() {
  return <DugoutHome />;
}
