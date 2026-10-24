import type { Metadata } from 'next';
import { headers } from 'next/headers';
import { getCurrentUser } from '@/lib/dal';
import { isNativeUserAgent } from '@/lib/app-env';
import { countUnread } from '@/lib/market/load';
import { DugoutShell } from '@/components/dugout/dugout-shell';
import { usesSinker } from '@/lib/brand';
import { countUnreadNotifications } from '@/lib/notify';
import { createAvatarUrl } from '@/lib/storage';

export const metadata: Metadata = {
  title: { default: '덕아웃', template: '%s · 덕아웃' },
  description: '야구인의 중고 장터 · 소통 · 레슨 · 장소 — 덕아웃',
};

/**
 * 덕아웃(2026-10-20, docs/designs/baseball-hub.md) — 로그인 없이 보는 바깥 공간. 여기에는 requireUser 가 없다(일부러). 쓰기 · 찜 · 채팅만
 * 서버 동작이 requireUser 로 막는다. 로그인한 사람에게는 위 막대의 '내 싱커'가 안(/today)으로 가는 길.
 */
export default async function DugoutLayout({
  children,
}: {
  children: React.ReactNode;
}) {
  const user = await getCurrentUser();
  /* 싱커 앱(웹뷰)의 덕아웃 탭으로 왔나 — 아래 탭은 앱 것이 서고, 홈은 ?dugout=1, '내 싱커'는 /today */
  const native = isNativeUserAgent((await headers()).get('user-agent'));
  const [unread, alerts, avatarUrl] = user
    ? await Promise.all([
        countUnread(user.id),
        countUnreadNotifications(user.id),
        createAvatarUrl(user.avatarPath).catch(() => null),
      ])
    : [0, 0, null];
  return (
    <DugoutShell
      user={user ? { nickname: user.nickname } : null}
      avatarUrl={avatarUrl}
      unread={unread}
      alerts={alerts}
      sinker={!!user && usesSinker(user)}
      manage={!!user && (user.accountType === 'MASTER' || user.role === 'ADMIN')}
      native={native}
    >
      {children}
    </DugoutShell>
  );
}
