import Link from 'next/link';
import { notFound } from 'next/navigation';
import { ArrowLeft, Camera } from 'lucide-react';
import { requireAdmin } from '@/lib/dal';
import { loadVelocityAdminDay } from '@/lib/velocity-admin-load';
import { ButtonLink, EmptyState, PageHeading } from '@/components/ui';
import { dayLabel, signed } from '../format';
import { DayClient } from './day-client';

/**
 * 구속 측정 관리자 — 하루. 그날 모든 계정의 세션과 공, 스피드건 값 · 제외 표시 · 클립을 고친다.
 */
export default async function VelocityAdminDayPage({
  params,
}: {
  params: Promise<{ date: string }>;
}) {
  await requireAdmin();
  const { date } = await params;
  if (!/^\d{4}-\d{2}-\d{2}$/.test(date)) notFound();
  /* 2026-02-31 같은 것은 Date 가 다른 날로 굴려 버린다 — 되돌려 찍어 같은지 본다 */
  const at = new Date(`${date}T00:00:00.000Z`);
  if (Number.isNaN(at.getTime()) || at.toISOString().slice(0, 10) !== date) notFound();

  const day = await loadVelocityAdminDay(date);
  const { stat } = day;

  const tiles = [
    { label: '세션', value: String(stat.sessions), unit: '개' },
    { label: '공', value: String(stat.pitches), unit: '구' },
    { label: '스피드건 짝', value: String(stat.pairs), unit: '개' },
    { label: '클립', value: String(stat.clips), unit: '개' },
    { label: '편향(릴리스 − 건)', value: signed(stat.biasKmh), unit: 'km/h' },
    {
      label: 'p90 |오차|',
      value: stat.p90Kmh == null ? '—' : stat.p90Kmh.toFixed(1),
      unit: 'km/h',
    },
  ];

  return (
    <div className="stack-page">
      <Link
        href="/admin/velocity"
        className="inline-flex items-center gap-1.5 text-sm font-medium text-muted transition-colors hover:text-sky"
      >
        <ArrowLeft className="h-4 w-4" />
        구속 측정 관리자
      </Link>

      <PageHeading
        eyebrow="Bullpen Velocity"
        title={dayLabel(date)}
        description={`${date} · 세션 ${stat.sessions}개 · ${stat.users}명${
          stat.sdKmh != null ? ` · 오차 표준편차 ${stat.sdKmh.toFixed(1)} km/h` : ''
        }`}
        action={
          <ButtonLink
            href="/velocity/measure"
            className="inline-flex items-center gap-2"
          >
            <Camera aria-hidden className="h-4 w-4" />
            구속 측정 시작
          </ButtonLink>
        }
      />

      <div className="grid grid-cols-2 gap-px overflow-hidden rounded-2xl border border-line bg-line sm:grid-cols-3 lg:grid-cols-6">
        {tiles.map((t) => (
          <div key={t.label} className="bg-surface px-5 py-5">
            <p className="text-xs tracking-normal text-muted">{t.label}</p>
            <p className="text-display mt-2 text-2xl text-ink">
              {t.value}
              <span className="ml-1 font-sans text-xs text-muted">{t.unit}</span>
            </p>
          </div>
        ))}
      </div>

      {day.sessions.length === 0 ? (
        <EmptyState
          title="이날 잰 것이 없어요"
          description="세션이 모두 지워졌거나 아직 저장된 것이 없어요."
        />
      ) : (
        <DayClient sessions={day.sessions} />
      )}
    </div>
  );
}
