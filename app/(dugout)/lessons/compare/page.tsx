import type { Metadata } from 'next';
import Link from 'next/link';
import { LessonFrame } from '@/components/dugout/lesson-frame';
import { Badge, ButtonLink, EmptyState } from '@/components/ui';
import { CoachAvatar, Stars } from '@/components/dugout/coach-card';
import { loadCoachesByIds } from '@/lib/market/lesson-load';
import { COMPARE_MAX, specialtyLabel } from '@/lib/market/lessons';
import { WEEKDAYS } from '@/lib/market/venues';
import { formatPrice } from '@/lib/market/specs';

export const metadata: Metadata = { title: '코치 비교' };

type SP = { [key: string]: string | string[] | undefined };

/**
 * 코치 비교(3판) — 고른 둘 · 셋을 한 표에. 가격 · 후기 · 확정 속도 · 전문 · 경력 · 레슨 시간 · 특징. 각 열 아래 '예약'.
 * PC(lg, 2026-10-24): 넓은 표, 왼쪽 이름 칸은 옆으로 밀어도 붙어 있고, 줄마다 가장 좋은 값(가장 싼 가격 · 체험가, 가장 높은 별점, 가장 빠른 확정)을 옅은 초록으로.
 */
export default async function ComparePage({ searchParams }: { searchParams: Promise<SP> }) {
  const sp = await searchParams;
  const raw = Array.isArray(sp.ids) ? sp.ids[0] : sp.ids;
  const ids = (raw ?? '')
    .split(',')
    .map((s) => s.trim())
    .filter((s) => /^[0-9a-f-]{36}$/i.test(s))
    .slice(0, COMPARE_MAX);
  const coaches = await loadCoachesByIds(ids);
  const bookQuery = new URLSearchParams(
    Object.entries({
      specialty: Array.isArray(sp.specialty) ? sp.specialty[0] : sp.specialty,
      audience: Array.isArray(sp.audience) ? sp.audience[0] : sp.audience,
    }).filter(([, v]) => v) as [string, string][]
  ).toString();

  type C = (typeof coaches)[number];
  /** 줄에서 가장 좋은 값을 가진 코치들 — 값이 다 같거나 하나만 있으면 칠하지 않는다 */
  const bestOf = (val: (c: C) => number | null, lower: boolean): Set<string> => {
    const vals = coaches.map((c) => ({ id: c.id, v: val(c) })).filter((x): x is { id: string; v: number } => x.v != null);
    if (vals.length < 2) return new Set();
    const target = lower ? Math.min(...vals.map((x) => x.v)) : Math.max(...vals.map((x) => x.v));
    const hit = vals.filter((x) => x.v === target);
    return hit.length === vals.length ? new Set() : new Set(hit.map((x) => x.id));
  };
  const rows: { label: string; cell: (c: C) => React.ReactNode; best?: Set<string> }[] = [
    {
      label: '1회 가격',
      cell: (c) => (
        <span className="text-base font-bold text-ink">
          {c.priceFrom != null ? `${formatPrice(c.priceFrom)}~` : '문의'}
        </span>
      ),
      best: bestOf((c) => c.priceFrom, true),
    },
    { label: '체험가', cell: (c) => (c.trialPrice != null ? formatPrice(c.trialPrice) : '—'), best: bestOf((c) => c.trialPrice, true) },
    {
      label: '후기',
      cell: (c) => <Stars rating={c.rating} reviews={c.reviews} />,
      best: bestOf((c) => (c.reviews > 0 ? c.rating : null), false),
    },
    {
      label: '확정 속도',
      best: bestOf((c) => c.confirmHours, true),
      cell: (c) =>
        c.confirmHours == null
          ? '아직 없음'
          : c.confirmHours < 1
            ? '1시간 안'
            : c.confirmHours <= 24
              ? `${Math.round(c.confirmHours)}시간 안`
              : `${Math.round(c.confirmHours / 24)}일쯤`,
    },
    {
      label: '전문',
      cell: (c) => (
        <span className="flex flex-wrap gap-1">
          {c.specialties.map((s) => (
            <Badge key={s}>{specialtyLabel(s)}</Badge>
          ))}
        </span>
      ),
    },
    { label: '경력', cell: (c) => c.career ?? '—' },
    { label: '지역', cell: (c) => c.region ?? '—' },
    {
      label: '레슨 시간',
      cell: (c) =>
        c.slots
          ? WEEKDAYS.map((w, i) => (c.slots![i] ? `${w} ${c.slots![i]!.open}~${c.slots![i]!.close}` : null))
              .filter(Boolean)
              .join(' · ')
          : (c.hours ?? '문의'),
    },
    { label: '한 번에', cell: (c) => `${c.slotMin}분` },
    { label: '싱커 기록', cell: (c) => (c.sinkerReview ? '봐 줘요' : '—') },
    { label: '회원', cell: (c) => `${c.members}명` },
  ];

  return (
    <LessonFrame
      back="/lessons/list"
      backLabel="코치 목록"
      title="코치 비교"
      wide
      crumbs={[{ label: '레슨', href: '/lessons' }, { label: '코치 목록', href: '/lessons/list' }, { label: '코치 비교' }]}
      subtitle="나란히 보고 고르세요. 줄마다 가장 좋은 값은 옅은 초록이에요."
    >
      <p className="text-xs text-muted lg:hidden">나란히 보고 고르세요. 열 아래 단추로 바로 예약해요.</p>
      {coaches.length < 2 ? (
        <EmptyState
          title="비교할 코치를 둘 이상 담아 주세요"
          description="코치 목록에서 카드의 ‘비교’를 눌러 담아요."
          action={<ButtonLink href="/lessons/list">코치 목록</ButtonLink>}
        />
      ) : (
        <div className="-mx-4 overflow-x-auto px-4 md:mx-0 md:px-0 lg:overflow-hidden lg:rounded-2xl lg:border lg:border-line lg:bg-surface">
          <table className="w-full min-w-[32rem] border-separate border-spacing-0 text-sm">
            <thead>
              <tr>
                <th className="w-24 py-2 text-left text-xs font-medium text-muted lg:sticky lg:left-0 lg:z-10 lg:w-40 lg:bg-surface lg:px-5 lg:py-4" />
                {coaches.map((c) => (
                  <th key={c.id} className="px-2 py-2 text-left align-top lg:px-4 lg:py-4">
                    <Link href={`/lessons/${c.id}`} className="flex items-center gap-2 lg:gap-3">
                      <CoachAvatar name={c.coach} size="sm" className="lg:h-12 lg:w-12 lg:text-base" />
                      <span className="min-w-0">
                        <span className="block truncate text-sm font-bold text-ink">{c.coach} 코치</span>
                        <span className="block truncate text-xs font-normal text-muted">{c.name}</span>
                      </span>
                    </Link>
                  </th>
                ))}
              </tr>
            </thead>
            <tbody>
              {rows.map((r) => (
                <tr key={r.label} className="border-t border-line">
                  <th className="border-t border-line py-3 pr-2 text-left align-top text-xs font-medium text-muted lg:sticky lg:left-0 lg:z-10 lg:bg-surface lg:px-5">
                    {r.label}
                  </th>
                  {coaches.map((c) => {
                    const best = r.best?.has(c.id);
                    return (
                      <td
                        key={c.id}
                        className={`border-t border-line px-2 py-3 align-top text-ink lg:px-4 ${best ? 'lg:bg-ok/8' : ''}`}
                      >
                        {r.cell(c)}
                        {best && <span className="ml-1.5 hidden text-[10px] font-bold text-ok lg:inline">가장 좋음</span>}
                      </td>
                    );
                  })}
                </tr>
              ))}
              <tr>
                <th className="border-t border-line py-3 lg:sticky lg:left-0 lg:bg-surface" />
                {coaches.map((c) => (
                  <td key={c.id} className="border-t border-line px-2 py-3 lg:px-4 lg:py-4">
                    <ButtonLink href={`/lessons/${c.id}/book${bookQuery ? `?${bookQuery}` : ''}`} size="sm" className="w-full lg:min-h-11">
                      <span className="lg:hidden">예약</span>
                      <span className="hidden lg:inline">{c.coach} 코치 예약</span>
                    </ButtonLink>
                  </td>
                ))}
              </tr>
            </tbody>
          </table>
        </div>
      )}
    </LessonFrame>
  );
}
