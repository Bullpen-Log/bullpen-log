import Link from 'next/link';
import { RoundIcon } from '@/components/round-icon';
import type { ListingCard as Card } from '@/lib/market/load';
import { formatPrice, statusLabel } from '@/lib/market/specs';
import { relativeTime } from '@/components/community/community-format';

/**
 * 장터 카드 — 번개장터 모양 그대로(2026-10-23 금윤호: "장터는 번개장터 느낌을 최대한").
 * 테두리 없는 정사각 사진 · 오른쪽 위 흰 테두리 하트 → 가격 굵게 → 제목 한 줄 → '언제' 왼쪽 · '♡ n ○ n' 오른쪽. 예약 · 완료는 사진 위 띠, 가린 것은 흐리게.
 */
export function ListingCard({ item, now }: { item: Card; now: Date }) {
  return (
    <Link href={`/market/${item.id}`} className={`group block min-w-0 ${item.hidden ? 'opacity-50' : ''}`}>
      <div className="relative aspect-square overflow-hidden rounded-md bg-surface-2">
        {item.image ? (
          // eslint-disable-next-line @next/next/no-img-element -- 서명 주소(저장소)라 next/image 최적화를 안 거친다
          <img src={item.image} alt="" className="h-full w-full object-cover" loading="lazy" />
        ) : (
          <div className="grid h-full w-full place-items-center text-xs text-muted">사진 없음</div>
        )}
        <RoundIcon
          name="heart"
          outline
          aria-hidden
          className="absolute top-3 right-3 h-6 w-6 text-white drop-shadow-[0_1px_2px_rgba(0,0,0,0.45)]"
        />
        {item.status !== 'ACTIVE' && (
          <span className="absolute inset-0 grid place-items-center bg-black/45 text-base font-bold text-white">
            {statusLabel(item.status)}
          </span>
        )}
      </div>
      <p className="mt-3 text-[17px] leading-tight font-bold text-ink">{formatPrice(item.price)}</p>
      <p className="mt-1 truncate text-[15px] text-ink">{item.title}</p>
      <p className="mt-1.5 flex items-center gap-2 text-xs text-muted">
        <span>{relativeTime(item.createdAt, now)}</span>
        <span className="ml-auto inline-flex items-center gap-2">
          {item.favorites > 0 && (
            <span className="inline-flex items-center gap-0.5">
              <RoundIcon name="heart" outline className="h-3 w-3" /> {item.favorites}
            </span>
          )}
          {item.chats > 0 && (
            <span className="inline-flex items-center gap-0.5">
              <RoundIcon name="chat" outline className="h-3 w-3" /> {item.chats}
            </span>
          )}
        </span>
      </p>
    </Link>
  );
}
