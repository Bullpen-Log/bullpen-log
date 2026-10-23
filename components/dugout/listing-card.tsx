import Link from 'next/link';
import { RoundChat, RoundHeart } from '@/components/round-icon';
import type { ListingCard as Card } from '@/lib/market/load';
import { formatPrice, specSummary, statusLabel } from '@/lib/market/specs';
import { relativeTime } from '@/components/community/community-format';

/**
 * 장터 카드 — 번개장터 모양(2026-10-23 금윤호: "장터는 번개장터 느낌을 최대한"). 테두리 없는 정사각 사진에 오른쪽 위 하트, 밑에 가격을 굵게 먼저 →
 * 제목 → 규격 한 줄 → '언제 · ♥ n · 💬 n'. 예약 · 완료는 사진 위 띠, 가린 것은 흐리게(관리자 · 주인만 본다).
 */
export function ListingCard({ item, now }: { item: Card; now: Date }) {
  const summary = specSummary(item.category, item.specs);
  return (
    <Link
      href={`/market/${item.id}`}
      className={`group block min-w-0 ${item.hidden ? 'opacity-50' : ''}`}
    >
      <div className="relative aspect-square overflow-hidden rounded-xl bg-surface-2">
        {item.image ? (
          // eslint-disable-next-line @next/next/no-img-element -- 서명 주소(저장소)라 next/image 최적화를 안 거친다
          <img
            src={item.image}
            alt=""
            className="h-full w-full object-cover transition-transform duration-300 group-hover:scale-[1.03]"
            loading="lazy"
          />
        ) : (
          <div className="grid h-full w-full place-items-center text-xs text-muted">
            사진 없음
          </div>
        )}
        <span
          aria-hidden
          className="absolute top-2.5 right-2.5 grid h-8 w-8 place-items-center rounded-full bg-black/25 text-white backdrop-blur-sm"
        >
          <RoundHeart className="h-4 w-4" />
        </span>
        {item.status !== 'ACTIVE' && (
          <span className="absolute inset-x-0 bottom-0 bg-ink/70 py-1.5 text-center text-xs font-bold text-white">
            {statusLabel(item.status)}
          </span>
        )}
      </div>
      <div className="space-y-0.5 pt-2.5">
        <p className="text-base font-bold text-ink">{formatPrice(item.price)}</p>
        <p className="truncate text-sm text-ink group-hover:text-sky">{item.title}</p>
        {summary && <p className="truncate text-caption text-muted">{summary}</p>}
        <p className="flex items-center gap-2 pt-0.5 text-caption text-muted">
          <span>{item.region}</span>
          <span>{relativeTime(item.createdAt, now)}</span>
          <span className="ml-auto inline-flex items-center gap-2">
            {item.favorites > 0 && (
              <span className="inline-flex items-center gap-0.5">
                <RoundHeart className="h-3 w-3" /> {item.favorites}
              </span>
            )}
            {item.chats > 0 && (
              <span className="inline-flex items-center gap-0.5">
                <RoundChat className="h-3 w-3" /> {item.chats}
              </span>
            )}
          </span>
        </p>
      </div>
    </Link>
  );
}
