import Link from 'next/link';
import { Heart, MessagesSquare } from '@/components/icon';
import type { ListingCard as Card } from '@/lib/market/load';
import {
  categoryLabel,
  formatPrice,
  specSummary,
  statusLabel,
} from '@/lib/market/specs';
import { relativeTime } from '@/components/community/community-format';

/** 장터 카드 — 사진 · 가격 · 제목 · 규격 한 줄 · 지역 · 언제. 예약 · 완료는 사진 위 띠, 가린 것은 흐리게(관리자 · 주인만 본다) */
export function ListingCard({ item, now }: { item: Card; now: Date }) {
  const summary = specSummary(item.category, item.specs);
  return (
    <Link
      href={`/market/${item.id}`}
      className={`group block overflow-hidden rounded-2xl border border-line bg-surface transition-colors hover:border-sky-soft ${item.hidden ? 'opacity-50' : ''}`}
    >
      <div className="relative aspect-square bg-surface-2">
        {item.image ? (
          // eslint-disable-next-line @next/next/no-img-element -- 서명 주소(저장소)라 next/image 최적화를 안 거친다
          <img
            src={item.image}
            alt=""
            className="h-full w-full object-cover"
            loading="lazy"
          />
        ) : (
          <div className="grid h-full w-full place-items-center text-xs text-muted">
            사진 없음
          </div>
        )}
        {item.status !== 'ACTIVE' && (
          <span className="absolute inset-x-0 bottom-0 bg-ink/70 py-1 text-center text-xs font-bold text-white">
            {statusLabel(item.status)}
          </span>
        )}
      </div>
      <div className="space-y-1 p-3">
        <p className="truncate text-sm font-semibold text-ink group-hover:text-sky">
          {item.title}
        </p>
        <p className="text-base font-bold text-ink">{formatPrice(item.price)}</p>
        <p className="truncate text-xs text-muted">
          {categoryLabel(item.category)}
          {summary ? ` · ${summary}` : ''}
        </p>
        <p className="flex items-center gap-2 text-[11px] text-muted/80">
          <span>{item.region}</span>
          <span>{relativeTime(item.createdAt, now)}</span>
          {item.favorites > 0 && (
            <span className="ml-auto inline-flex items-center gap-0.5">
              <Heart className="h-3 w-3" /> {item.favorites}
            </span>
          )}
          {item.chats > 0 && (
            <span className="inline-flex items-center gap-0.5">
              <MessagesSquare className="h-3 w-3" /> {item.chats}
            </span>
          )}
        </p>
      </div>
    </Link>
  );
}
