import Link from 'next/link';
import { redirect } from 'next/navigation';
import { MessagesSquare } from '@/components/icon';
import { Card, EmptyState } from '@/components/ui';
import { getCurrentUser } from '@/lib/dal';
import { loadConversations } from '@/lib/market/load';
import { formatPrice } from '@/lib/market/specs';
import { relativeTime } from '@/components/community/community-format';

/** 내 채팅 — 로그인 필요. 마지막 말이 최근인 방부터, 안 읽은 수 */
export default async function ChatListPage() {
  const user = await getCurrentUser();
  if (!user) redirect('/login?next=/chat');
  const rooms = await loadConversations(user.id);
  const now = new Date();
  return (
    <div className="mx-auto max-w-2xl space-y-4">
      <h1 className="text-2xl font-black text-ink">채팅</h1>
      {rooms.length === 0 ? (
        <EmptyState icon={<MessagesSquare />} title="아직 채팅이 없어요" description="장터에서 마음에 드는 물건의 ‘채팅하기’를 누르면 여기 생겨요." />
      ) : (
        <Card className="divide-y divide-line p-0">
          {rooms.map((r) => (
            <Link key={r.id} href={`/chat/${r.id}`} className="flex items-center gap-3 px-4 py-3 transition-colors hover:bg-ink/4">
              <div className="h-12 w-12 shrink-0 overflow-hidden rounded-xl bg-surface-2">
                {r.listing?.image && (
                  // eslint-disable-next-line @next/next/no-img-element -- 저장소 서명 주소
                  <img src={r.listing.image} alt="" className="h-full w-full object-cover" />
                )}
              </div>
              <div className="min-w-0 flex-1">
                <p className="flex items-center gap-2 text-sm">
                  <span className="font-semibold text-ink">{r.other.nickname}</span>
                  <span className="truncate text-xs text-muted">{r.listing ? `${r.listing.title} · ${formatPrice(r.listing.price)}` : '지워진 물건'}</span>
                </p>
                <p className={`truncate text-xs ${r.unread ? 'font-semibold text-ink' : 'text-muted'}`}>{r.lastText ?? '아직 말이 없어요'}</p>
              </div>
              <div className="flex flex-col items-end gap-1">
                <span className="text-[11px] text-muted">{relativeTime(r.lastAt, now)}</span>
                {r.unread > 0 && <span className="rounded-full bg-danger px-1.5 text-[10px] font-bold text-white">{r.unread}</span>}
              </div>
            </Link>
          ))}
        </Card>
      )}
    </div>
  );
}
