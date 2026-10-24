import Link from 'next/link';
import { notFound, redirect } from 'next/navigation';
import { RoundBack, RoundMarket } from '@/components/round-icon';
import { ChatRoom, type MessageView } from '@/components/dugout/chat-room';
import { ChatAvatar } from '@/components/dugout/chat-avatar';
import { getCurrentUser } from '@/lib/dal';
import { loadConversation } from '@/lib/market/load';
import { formatPrice, statusLabel } from '@/lib/market/specs';

/** 같은 사람이 이 시간 안에 이어 보낸 말은 한 묶음(얼굴은 묶음 끝에 한 번) */
const GROUP_MS = 2 * 60_000;
/** 앞 말과 이만큼 떨어지면 가운데에 시각 한 줄 */
const SEP_MS = 60 * 60_000;

const time = new Intl.DateTimeFormat('ko-KR', { hour: 'numeric', minute: '2-digit', timeZone: 'Asia/Seoul' });
const dayTime = new Intl.DateTimeFormat('ko-KR', {
  month: 'long',
  day: 'numeric',
  hour: 'numeric',
  minute: '2-digit',
  timeZone: 'Asia/Seoul',
});
const kstDay = (d: Date) => new Date(d.getTime() + 9 * 3_600_000).toISOString().slice(0, 10);

/**
 * 채팅방 하나(2026-10-24 금윤호 "인스타 DM처럼") — 머리(상대 얼굴 · 이름 · 물건) → 말풍선(내 말 오른쪽 · 상대 말 왼쪽, 이어 보낸 말은 묶고 얼굴은 묶음 끝에,
 * 한 시간 넘게 쉬면 가운데 시각) → 아래 둥근 입력칸. 왼쪽 목록은 chat/layout.tsx. 시각 글은 서버가 한국 시각으로 만든다.
 */
export default async function ChatRoomPage({ params }: { params: Promise<{ id: string }> }) {
  const { id } = await params;
  const user = await getCurrentUser();
  if (!user) redirect(`/login?next=/chat/${id}`);
  const room = await loadConversation(id, user.id);
  if (!room) notFound();
  const today = kstDay(new Date());

  const msgs = room.messages;
  const views: MessageView[] = msgs.map((m, i) => {
    const prev = msgs[i - 1];
    const next = msgs[i + 1];
    const sep =
      !prev || m.createdAt.getTime() - prev.createdAt.getTime() > SEP_MS || kstDay(prev.createdAt) !== kstDay(m.createdAt)
        ? kstDay(m.createdAt) === today
          ? time.format(m.createdAt)
          : dayTime.format(m.createdAt)
        : null;
    const groupEnd =
      !next || next.mine !== m.mine || next.createdAt.getTime() - m.createdAt.getTime() > GROUP_MS;
    return { id: m.id, mine: m.mine, body: m.body, time: time.format(m.createdAt), sep, groupEnd };
  });

  return (
    <>
      <header className="flex items-center gap-3 border-b border-line px-4 py-3 md:px-5">
        <Link href="/chat" aria-label="대화 목록" className="-ml-1 grid h-9 w-9 place-items-center rounded-full text-ink md:hidden">
          <RoundBack className="h-5 w-5" />
        </Link>
        <ChatAvatar name={room.other.nickname} url={room.other.avatarUrl} />
        <div className="min-w-0 flex-1">
          <p className="truncate text-[15px] font-bold text-ink">{room.other.nickname}</p>
          <p className="truncate text-xs text-muted">
            {room.listing
              ? `${room.listing.title} · ${formatPrice(room.listing.price)} · ${statusLabel(room.listing.status)}`
              : '지워진 물건'}
          </p>
        </div>
        {room.listing && (
          <Link
            href={`/market/${room.listing.id}`}
            aria-label="물건 보기"
            title="물건 보기"
            className="flex items-center gap-2 rounded-full border border-line py-1 pr-3 pl-1 text-xs font-semibold text-ink hover:border-ink/40"
          >
            <span className="grid h-7 w-7 place-items-center overflow-hidden rounded-full bg-ink/6">
              {room.listing.image ? (
                // eslint-disable-next-line @next/next/no-img-element -- 서명 주소(저장소)
                <img src={room.listing.image} alt="" className="h-full w-full object-cover" />
              ) : (
                <RoundMarket className="h-4 w-4 text-muted" />
              )}
            </span>
            물건 보기
          </Link>
        )}
      </header>
      <ChatRoom
        conversationId={room.id}
        other={{ name: room.other.nickname, avatarUrl: room.other.avatarUrl }}
        messages={views}
      />
    </>
  );
}
