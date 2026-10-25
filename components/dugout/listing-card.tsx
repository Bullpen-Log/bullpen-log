import Link from 'next/link';
import { RoundIcon } from '@/components/round-icon';
import type { ListingCard as Card } from '@/lib/market/load';
import { conditionLabel, formatPrice, specSummary, statusLabel } from '@/lib/market/specs';
import { relativeTime } from '@/components/community/community-format';

/** 카드에 적지 않는 값 — '없음 · 모름'은 거르는 데 도움이 안 된다(2026-10-25 PC 개편 규칙) */
const EMPTY = /^(없음|모름|미정|-)$/;

/**
 * 장터 카드(2026-10-25 덕아웃 PC 개편, docs/designs/dugout-desktop-information-design.md 장터) — 사진 → 제목 두 줄 → 가격 → 상태 · 규격 → 지역 · 시간.
 * 제목이 먼저인 까닭: 같은 가격대 물건을 훑을 때 '무엇'을 먼저 읽고 가격으로 거른다(번개장터 · 당근 카드 차례). 사진 위 하트는 뺐다 —
 * 링크 안의 가짜 단추였다(찜은 상세의 진짜 단추). 예약 · 완료는 사진 위 띠, 가린 것은 흐리게.
 */
export function ListingCard({ item, now }: { item: Card; now: Date }) {
  const facts = [conditionLabel(item.condition), ...specSummary(item.category, item.specs).split(' · ')]
    .map((v) => v.trim())
    .filter((v) => v && !EMPTY.test(v));
  const where = item.region === '전국(택배)' ? '택배' : item.region;
  return (
    <Link href={`/market/${item.id}`} className={`group block min-w-0 ${item.hidden ? 'opacity-50' : ''}`}>
      <div className="relative aspect-square overflow-hidden rounded-lg bg-surface-2">
        {item.image ? (
          // eslint-disable-next-line @next/next/no-img-element -- 서명 주소(저장소)라 next/image 최적화를 안 거친다
          <img
            src={item.image}
            alt=""
            className="h-full w-full object-cover transition-transform duration-300 ease-out group-hover:scale-[1.03] motion-reduce:transform-none"
            loading="lazy"
          />
        ) : (
          <div className="grid h-full w-full place-items-center text-xs text-muted">사진 없음</div>
        )}
        {item.status !== 'ACTIVE' && (
          <span className="absolute inset-0 grid place-items-center bg-black/45 text-base font-bold text-white">
            {statusLabel(item.status)}
          </span>
        )}
      </div>
      <p className="mt-2.5 line-clamp-2 text-[15px] leading-snug text-ink">{item.title}</p>
      <p className="mt-1 text-[17px] leading-tight font-bold text-ink">{formatPrice(item.price)}</p>
      {facts.length > 0 && <p className="mt-1 truncate text-xs text-muted">{facts.join(' · ')}</p>}
      <p className="mt-1 flex items-center gap-2 text-xs text-muted">
        <span className="truncate">
          {where} · {relativeTime(item.createdAt, now)}
        </span>
        {(item.favorites > 0 || item.chats > 0) && (
          <span className="ml-auto inline-flex shrink-0 items-center gap-2 tabular-nums">
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
        )}
      </p>
    </Link>
  );
}
