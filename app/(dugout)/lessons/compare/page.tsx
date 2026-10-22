import type { Metadata } from 'next';
import Link from 'next/link';
import { RoundBack } from '@/components/round-icon';
import { Badge, ButtonLink, EmptyState } from '@/components/ui';
import { CoachAvatar, Stars } from '@/components/dugout/coach-card';
import { loadCoachesByIds } from '@/lib/market/lesson-load';
import { COMPARE_MAX, specialtyLabel } from '@/lib/market/lessons';
import { WEEKDAYS } from '@/lib/market/venues';
import { formatPrice } from '@/lib/market/specs';

export const metadata: Metadata = { title: '코치 비교' };

type SP = { [key: string]: string | string[] | undefined };

/** 코치 비교(3판) — 고른 둘 · 셋을 한 표에. 가격 · 후기 · 확정 속도 · 전문 · 경력 · 레슨 시간 · 특징. 각 열 아래 '예약' */
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

  const rows: { label: string; cell: (c: (typeof coaches)[number]) => React.ReactNode }[] = [
    {
      label: '1회 가격',
      cell: (c) => (
        <span className="text-base font-bold text-ink">
          {c.priceFrom != null ? `${formatPrice(c.priceFrom)}~` : '문의'}
        </span>
      ),
    },
    { label: '체험가', cell: (c) => (c.trialPrice != null ? formatPrice(c.trialPrice) : '—') },
    { label: '후기', cell: (c) => <Stars rating={c.rating} reviews={c.reviews} /> },
    {
      label: '확정 속도',
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
    <div className="space-y-5">
      <Link href="/lessons/list" className="inline-flex items-center gap-1 text-sm font-semibold text-sky">
        <RoundBack className="h-4 w-4" /> 코치 목록
      </Link>
      <div>
        <h1 className="text-2xl font-black text-ink">코치 비교</h1>
        <p className="mt-1 text-sm text-muted">나란히 보고 고르세요. 열 아래 단추로 바로 예약해요.</p>
      </div>
      {coaches.length < 2 ? (
        <EmptyState
          title="비교할 코치를 둘 이상 담아 주세요"
          description="코치 목록에서 카드의 ‘비교’를 눌러 담아요."
          action={<ButtonLink href="/lessons/list">코치 목록</ButtonLink>}
        />
      ) : (
        <div className="-mx-4 overflow-x-auto px-4 md:mx-0 md:px-0">
          <table className="w-full min-w-[32rem] border-separate border-spacing-0 text-sm">
            <thead>
              <tr>
                <th className="w-24 py-2 text-left text-xs font-medium text-muted" />
                {coaches.map((c) => (
                  <th key={c.id} className="px-2 py-2 text-left align-top">
                    <Link href={`/lessons/${c.id}`} className="flex items-center gap-2">
                      <CoachAvatar name={c.coach} size="sm" />
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
                  <th className="border-t border-line py-3 pr-2 text-left align-top text-xs font-medium text-muted">
                    {r.label}
                  </th>
                  {coaches.map((c) => (
                    <td key={c.id} className="border-t border-line px-2 py-3 align-top text-ink">
                      {r.cell(c)}
                    </td>
                  ))}
                </tr>
              ))}
              <tr>
                <th className="border-t border-line py-3" />
                {coaches.map((c) => (
                  <td key={c.id} className="border-t border-line px-2 py-3">
                    <ButtonLink href={`/lessons/${c.id}/book${bookQuery ? `?${bookQuery}` : ''}`} size="sm" className="w-full">
                      예약
                    </ButtonLink>
                  </td>
                ))}
              </tr>
            </tbody>
          </table>
        </div>
      )}
    </div>
  );
}
