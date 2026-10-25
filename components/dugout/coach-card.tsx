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
/** 이름으로 고른 색 — 아바타 원과 사진 자리(CoachPhotoCard)가 같은 색 */
export function coachTone(name: string): string {
  let h = 0;
  for (const ch of name) h = (h * 31 + ch.charCodeAt(0)) % 997;
  return TONES[h % TONES.length];
}

export function CoachAvatar({
  name,
  size = 'md',
  className = '',
}: {
  name: string;
  size?: 'sm' | 'md' | 'lg' | 'xl';
  className?: string;
}) {
  const tone = coachTone(name);
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

/**
 * 코치 카드(PC, 2026-10-24) — 격자 칸에 들어가는 세로 카드. 휴대폰 줄(CoachCard)과 같은 자료 · 같은 순서(왜 추천 → 이름 ★ → 전문 → 가격 · 다음 가능),
 * 카드 전체가 상세로 가는 링크(이름 링크를 카드 크기로 덮는다 — 안쪽 단추와 링크가 겹치지 않게). `actions` 는 카드 아래 오른쪽(비교 담기 같은 것).
 * 손가락이 아닌 PC 에서만 올리면 살짝 떠오른다.
 */
export function CoachTile({
  c,
  href,
  actions,
  admin = false,
}: {
  c: CoachCardData;
  href: string;
  actions?: ReactNode;
  admin?: boolean;
}) {
  return (
    <article className="group relative flex h-full flex-col rounded-2xl border border-line bg-surface p-5 transition-[border-color,box-shadow,transform] duration-200 ease-out focus-within:border-sky-soft desk:hover:-translate-y-0.5 desk:hover:border-ink/15 desk:hover:shadow-[0_10px_30px_-12px_rgba(0,0,0,0.18)] motion-reduce:transform-none">
      <div className="flex items-start gap-3">
        <CoachAvatar name={c.coach} size="lg" />
        <div className="min-w-0 flex-1">
          <p className="truncate text-xs text-muted">{c.name}</p>
          <Link
            href={href}
            className="block truncate text-base font-bold text-ink after:absolute after:inset-0 after:rounded-2xl after:content-[''] focus-visible:outline-none"
          >
            {c.coach} 코치
          </Link>
          <Stars rating={c.rating} reviews={c.reviews} className="mt-0.5" />
        </div>
      </div>

      {c.match && c.match.reasons.length > 0 && (
        <p className="mt-3 flex flex-wrap gap-1">
          {c.match.reasons.map((r) => (
            <span key={r} className="rounded-full bg-sky/10 px-2 py-0.5 text-[11px] font-semibold text-sky-strong">
              {r}
            </span>
          ))}
        </p>
      )}

      <p className="mt-3 flex flex-wrap gap-1">
        {c.specialties.slice(0, 4).map((s) => (
          <Badge key={s}>{specialtyLabel(s)}</Badge>
        ))}
        <CoachBadges c={c} admin={admin} />
      </p>

      {c.intro && <p className="mt-3 line-clamp-2 text-xs leading-relaxed text-muted">{c.intro}</p>}

      <div className="mt-auto flex items-end justify-between gap-3 border-t border-line pt-3">
        <div className="min-w-0 space-y-0.5">
          <p className="text-sm font-bold text-ink">
            {c.priceFrom != null ? `${formatPrice(c.priceFrom)}~` : '가격 문의'}
            <span className="ml-1 text-xs font-normal text-muted">· {c.slotMin}분</span>
          </p>
          <p className="truncate text-xs text-muted">
            {c.region && <span>{c.region} · </span>}
            <span className={c.nextOpen?.startsWith('오늘') ? 'font-semibold text-ok' : ''}>
              {c.nextOpen ?? c.hours ?? '시간 문의'}
            </span>
          </p>
        </div>
        {actions && <div className="relative z-10 flex shrink-0 items-center gap-2">{actions}</div>}
      </div>
    </article>
  );
}

/**
 * 코치 사진 카드(2026-10-24 금윤호: "장터처럼 덜어내") — 장터 물건 카드(listing-card)와 같은 꼴: 테두리 없이 큰 정사각 자리 · 그 밑 세 줄
 * (이름 · 레슨장과 지역 · 가격). 칩 · 소개 · 구분선은 상세에서 본다. 사진이 아직 없어 이름 색 판에 첫 글자를 크게.
 */
export function CoachPhotoCard({ c, href }: { c: CoachCardData; href: string }) {
  const today = c.nextOpen?.startsWith('오늘');
  return (
    <Link href={href} className="group block">
      <div
        aria-hidden
        className={`relative grid aspect-square place-items-center overflow-hidden rounded-xl text-5xl font-black ${coachTone(c.coach)}`}
      >
        <span className="transition-transform duration-300 ease-out group-hover:scale-105 motion-reduce:transform-none">
          {c.coach.slice(0, 1)}
        </span>
        {today && (
          <span className="absolute top-2 left-2 rounded-full bg-surface px-2 py-0.5 text-[11px] font-bold text-ok">오늘 가능</span>
        )}
      </div>
      <p className="mt-2.5 flex items-center gap-1.5">
        <span className="truncate text-sm font-semibold text-ink">{c.coach} 코치</span>
        <Stars rating={c.rating} reviews={c.reviews} className="shrink-0" />
      </p>
      <p className="mt-0.5 truncate text-[13px] text-muted">
        {c.name}
        {c.region ? ` · ${c.region}` : ''}
      </p>
      <p className="mt-1 text-[15px] font-bold text-ink">
        {c.priceFrom != null ? `${formatPrice(c.priceFrom)}~` : '가격 문의'}
      </p>
    </Link>
  );
}

/**
 * 코치 비교 줄(PC, 2026-10-25 덕아웃 PC 개편 — docs/designs/dugout-desktop-information-design.md 레슨) — 큰 첫 글자 판 대신 작은 아바타 한 줄.
 * 왼쪽 작은 아바타 · 이름 ★ · 레슨장 · 지역 · 전문 칩 → 오른쪽 가격 · 다음 가능 · 비교 단추. 줄들은 가로선으로 쌓여 열이 맞아 코치끼리 바로 견준다.
 * 줄 전체가 상세로 가는 링크(이름 링크를 줄 크기로 덮는다 — 안쪽 단추는 relative z-10 으로 위에).
 */
export function CoachRow({
  c,
  href,
  actions,
  admin = false,
}: {
  c: CoachCardData;
  href: string;
  actions?: ReactNode;
  admin?: boolean;
}) {
  const today = c.nextOpen?.startsWith('오늘');
  return (
    <article className="relative grid grid-cols-[40px_minmax(0,1fr)_auto] items-start gap-4 py-4 transition-colors hover:bg-ink/3 focus-within:bg-ink/3">
      <CoachAvatar name={c.coach} size="md" className="h-10 w-10 text-sm" />
      <div className="min-w-0 space-y-1">
        <p className="flex flex-wrap items-center gap-x-2 gap-y-0.5">
          <Link
            href={href}
            className="text-base font-bold text-ink after:absolute after:inset-0 after:content-[''] focus-visible:outline-none"
          >
            {c.coach} 코치
          </Link>
          <Stars rating={c.rating} reviews={c.reviews} />
        </p>
        <p className="truncate text-[13px] text-muted">
          {c.name}
          {c.region ? ` · ${c.region}` : ''}
        </p>
        <p className="flex flex-wrap gap-1 pt-0.5">
          {c.specialties.slice(0, 4).map((s) => (
            <Badge key={s}>{specialtyLabel(s)}</Badge>
          ))}
          <CoachBadges c={c} admin={admin} />
          {c.match?.reasons.map((r) => (
            <span key={r} className="rounded-full bg-sky/10 px-2 py-0.5 text-[11px] font-semibold text-sky-strong">
              {r}
            </span>
          ))}
        </p>
      </div>
      <div className="flex shrink-0 flex-col items-end gap-1.5 text-right">
        <p className="text-sm font-bold text-ink">
          {c.priceFrom != null ? `${formatPrice(c.priceFrom)}~` : '가격 문의'}
          <span className="ml-1 text-xs font-normal text-muted">· {c.slotMin}분</span>
        </p>
        <p className={`text-xs ${today ? 'font-semibold text-ok' : 'text-muted'}`}>{c.nextOpen ?? c.hours ?? '시간 문의'}</p>
        {actions && <div className="relative z-10 flex items-center gap-2 pt-0.5">{actions}</div>}
      </div>
    </article>
  );
}
