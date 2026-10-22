import Link from 'next/link';
import type { ReactNode } from 'react';
import { RoundStar } from '@/components/round-icon';
import { Badge } from '@/components/ui';
import type { CoachCard as CoachCardData } from '@/lib/market/lesson-load';
import { specialtyLabel } from '@/lib/market/lessons';
import { formatPrice } from '@/lib/market/specs';

/**
 * 코치 아바타 — 사진이 없어 이름 첫 글자를 색 원에. 같은 이름은 같은 색(이름으로 색을 고른다).
 */
const TONES = [
  'bg-sky/14 text-sky-strong',
  'bg-ok/15 text-ok',
  'bg-warn/15 text-warn',
  'bg-danger/12 text-danger',
  'bg-ink/8 text-ink',
];
export function CoachAvatar({
  name,
  size = 'md',
  className = '',
}: {
  name: string;
  size?: 'sm' | 'md' | 'lg' | 'xl';
  className?: string;
}) {
  let h = 0;
  for (const ch of name) h = (h * 31 + ch.charCodeAt(0)) % 997;
  const tone = TONES[h % TONES.length];
  const dim =
    size === 'xl'
      ? 'h-24 w-24 text-3xl'
      : size === 'lg'
        ? 'h-16 w-16 text-2xl'
        : size === 'sm'
          ? 'h-9 w-9 text-sm'
          : 'h-12 w-12 text-base';
  return (
    <span
      aria-hidden
      className={`grid shrink-0 place-items-center rounded-full font-bold ${tone} ${dim} ${className}`}
    >
      {name.slice(0, 1)}
    </span>
  );
}

/** 별점 한 줄 — '★ 4.9 (12)' · 후기가 없으면 '새 코치' */
export function Stars({ rating, reviews, className = '' }: { rating: number | null; reviews: number; className?: string }) {
  if (rating == null || reviews === 0)
    return <span className={`text-xs text-muted ${className}`}>새 코치</span>;
  return (
    <span className={`inline-flex items-center gap-1 text-xs font-semibold text-ink ${className}`}>
      <RoundStar className="h-3.5 w-3.5 text-warn" {...({ filled: true } as object)} /> {rating.toFixed(1)}
      <span className="font-normal text-muted">({reviews})</span>
    </span>
  );
}

/** 코치의 특징 칩 — 빠른 확정 · 싱커 기록 · 체험가 · 더미(관리자만 보임) */
export function CoachBadges({ c, admin = false }: { c: CoachCardData; admin?: boolean }) {
  return (
    <>
      {c.quickConfirm && <Badge className="text-sky-strong">빠른 확정</Badge>}
      {c.sinkerReview && <Badge className="text-sky-strong">싱커 기록 봐 줌</Badge>}
      {c.trialPrice != null && <Badge className="text-ok">체험 {formatPrice(c.trialPrice)}</Badge>}
      {admin && c.dummy && <Badge className="text-warn">더미</Badge>}
      {admin && !c.publicProfile && <Badge className="text-muted">비공개</Badge>}
    </>
  );
}

/**
 * 코치 한 줄(닥터나우 의사 목록 줄) — 왼쪽 글(레슨장 · 이름 ★ · 전문 칩 · 가격 · 지역 · 다음 가능), 오른쪽 아바타.
 * 줄들은 한 카드 안에 가로선으로 나뉘어 쌓인다(`<Card className="divide-y p-0">`) — 모든 줄이 같은 폭 · 같은 높이 꼴이라 크기가 맞는다.
 * 찾기 조건으로 열었으면 '왜 추천' 칩이 위에 한 줄. `aside` 는 오른쪽 위 자리(비교 체크 같은 것).
 */
export function CoachCard({
  c,
  href,
  aside,
}: {
  c: CoachCardData;
  href?: string;
  aside?: ReactNode;
}) {
  const body = (
    <div className="flex items-start gap-4 px-4 py-4">
      <div className="min-w-0 flex-1 space-y-1.5">
        {c.match && c.match.reasons.length > 0 && (
          <p className="flex flex-wrap gap-1">
            {c.match.reasons.map((r) => (
              <span key={r} className="rounded-full bg-sky/10 px-2 py-0.5 text-[11px] font-semibold text-sky-strong">
                {r}
              </span>
            ))}
          </p>
        )}
        <p className="truncate text-xs text-muted">{c.name}</p>
        <p className="flex flex-wrap items-center gap-x-2 gap-y-0.5">
          <span className="text-base font-bold text-ink">{c.coach} 코치</span>
          <Stars rating={c.rating} reviews={c.reviews} />
        </p>
        <p className="flex flex-wrap gap-1">
          {c.specialties.slice(0, 4).map((s) => (
            <Badge key={s}>{specialtyLabel(s)}</Badge>
          ))}
          <CoachBadges c={c} />
        </p>
        <p className="flex flex-wrap items-center gap-x-3 gap-y-1 pt-0.5 text-xs text-muted">
          <span className="font-semibold text-ink">
            {c.priceFrom != null ? `${formatPrice(c.priceFrom)}~` : '가격 문의'}
          </span>
          {c.region && <span>{c.region}</span>}
          <span className={c.nextOpen?.startsWith('오늘') ? 'font-semibold text-ok' : ''}>
            {c.nextOpen ?? c.hours ?? '시간 문의'}
          </span>
        </p>
      </div>
      <div className="flex shrink-0 flex-col items-end gap-2">
        {aside}
        <CoachAvatar name={c.coach} size="lg" />
      </div>
    </div>
  );
  return href ? (
    <Link href={href} className="block transition-colors hover:bg-ink/3">
      {body}
    </Link>
  ) : (
    <div>{body}</div>
  );
}
