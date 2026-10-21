import { headers } from 'next/headers';
import { redirect } from 'next/navigation';
import { getCurrentUser } from '@/lib/dal';
import { isNativeUserAgent } from '@/lib/app-env';
import { DugoutHome } from '@/components/dugout/dugout-home';

/**
 * 주소 / — 덕아웃 홈. 앱(싱커) 안이면 예전처럼 홈 · 로그인으로(앱의 첫 화면은 덕아웃이 아니라 싱커다, 옛 app/page.tsx).
 * 이 보내기는 여기서만 한다 — 앱 틀의 커뮤니티 판(@community)도 덕아웃 홈을 그리는데, 거기서 보내면 앱의 모든 웹 화면이
 * 홈으로 튕겼다(2026-10-21 투구 · 타격 탭).
 */
export default async function DugoutPage() {
  if (isNativeUserAgent((await headers()).get('user-agent'))) {
    const user = await getCurrentUser();
    redirect(user ? '/today' : '/login');
  }
  return <DugoutHome />;
}
