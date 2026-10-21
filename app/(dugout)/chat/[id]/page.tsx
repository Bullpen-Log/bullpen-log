import Link from 'next/link';
import { notFound, redirect } from 'next/navigation';
import { RoundBack } from '@/components/round-icon';
import { ChatRoom } from '@/components/dugout/chat-room';
import { getCurrentUser } from '@/lib/dal';
import { loadConversation } from '@/lib/market/load';
import { formatPrice, statusLabel } from '@/lib/market/specs';

/** 채팅방 하나 — 내 방만. 위에 물건, 아래 말풍선과 보내기 */
export default async function ChatRoomPage({ params }: { params: Promise<{ id: string }> }) {
  const { id } = await params;
  const user = await getCurrentUser();
  if (!user) redirect(`/login?next=/chat/${id}`);
  const room = await loadConversation(id, user.id);
  if (!room) notFound();
  const fmt = new Intl.DateTimeFormat('ko-KR', { month: 'numeric', day: 'numeric', hour: 'numeric', minute: '2-digit', timeZone: 'Asia/Seoul' });
  return (
    <div className="mx-auto flex max-w-2xl flex-col gap-3">
      <Link href="/chat" className="inline-flex items-center gap-1 text-sm font-semibold text-sky">
        <RoundBack className="h-4 w-4" /> 채팅
      </Link>
      <div className="flex items-center gap-3 rounded-2xl border border-line bg-surface px-4 py-3">
        <div className="h-12 w-12 shrink-0 overflow-hidden rounded-xl bg-surface-2">
          {room.listing?.image && (
            // eslint-disable-next-line @next/next/no-img-element -- 저장소 서명 주소
            <img src={room.listing.image} alt="" className="h-full w-full object-cover" />
          )}
        </div>
        <div className="min-w-0 flex-1">
          <p className="text-sm font-semibold text-ink">{room.other.nickname}</p>
          {room.listing ? (
            <Link href={`/market/${room.listing.id}`} className="block truncate text-xs text-muted hover:text-sky">
              {room.listing.title} · {formatPrice(room.listing.price)} · {statusLabel(room.listing.status)}
            </Link>
          ) : (
            <p className="text-xs text-muted">지워진 물건</p>
          )}
        </div>
      </div>
      <ChatRoom conversationId={room.id} messages={room.messages.map((m) => ({ id: m.id, mine: m.mine, body: m.body, createdAt: fmt.format(m.createdAt) }))} />
    </div>
  );
}
