import type { ReactNode } from 'react';
import { headers } from 'next/headers';
import { surfaceOf } from '@/lib/app-env';
import { redirect } from 'next/navigation';
import { getCurrentUser } from '@/lib/dal';
import { loadConversations } from '@/lib/market/load';
import { formatPrice } from '@/lib/market/specs';
import { relativeTime } from '@/components/community/community-format';
import { ChatShell } from '@/components/dugout/chat-shell';

/** 채팅 틀(2026-10-24) — 왼쪽 대화 목록은 여기서 읽어 넘기고(방을 옮겨도 그대로), 오른쪽은 /chat(고르기 전) · /chat/<방>. 로그인 필요 */
export default async function ChatLayout({ children }: { children: ReactNode }) {
  const user = await getCurrentUser();
  if (!user) redirect('/login?next=/chat');
  const rooms = await loadConversations(user.id);
  const now = new Date();
  /* 싱커 앱 안 — 여기 대화는 장터 물건 거래다(번개 · 팀 신청 대화는 커뮤니티 글 안). 선수 활동 메시지처럼 보이지 않게 이름을 가른다 */
  const trade = surfaceOf((await headers()).get('user-agent')) === 'sinker-app';
  return (
    <ChatShell
      trade={trade}
      rooms={rooms.map((r) => ({
        id: r.id,
        name: r.other.nickname,
        avatarUrl: r.other.avatarUrl,
        sub: r.listing ? `${r.listing.title} · ${formatPrice(r.listing.price)}` : '',
        last: r.lastText ?? '아직 말이 없어요',
        ago: relativeTime(r.lastAt, now),
        unread: r.unread,
      }))}
    >
      {children}
    </ChatShell>
  );
}
