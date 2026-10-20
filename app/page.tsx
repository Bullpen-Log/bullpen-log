import { headers } from 'next/headers';
import { redirect } from 'next/navigation';
import { getCurrentUser } from '@/lib/dal';
import { isNativeUserAgent } from '@/lib/app-env';

/**
 * 첫 화면(2026-10-20 사용자: "로그인 안 한 사람은 메인 화면으로 덕아웃, 로그인하면 불펜로그") — 로그인했으면 홈(/today), 아니면 덕아웃(/dugout).
 * 아이폰 앱 안에서는 예전처럼 홈 · 로그인(앱은 덕아웃이 아니라 불펜로그다). 옛 소개 화면은 /intro 에 남겼다.
 */
export default async function RootPage() {
  const user = await getCurrentUser();
  if (isNativeUserAgent((await headers()).get('user-agent')))
    redirect(user ? '/today' : '/login');
  redirect(user ? '/today' : '/dugout');
}
