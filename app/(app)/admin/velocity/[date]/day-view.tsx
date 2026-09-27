import Link from 'next/link';
import { ArrowLeft, Camera } from 'lucide-react';
import type { AdminDay } from '@/lib/velocity-admin-load';
import { ButtonLink, EmptyState, PageHeading } from '@/components/ui';
import { dayLabel, signed } from '../format';
import { StatTiles } from '../overview-view';
import { DayClient } from './day-client';

/**
 * 구속 측정 관리자 — 하루(자료를 받아 그리기만 한다). 읽기 · 권한 · 날짜 검사는 page.tsx.
 */
export function VelocityAdminDayView({ date, day }: { date: string; day: AdminDay }) {
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
            className="inline-flex w-full items-center gap-2 sm:w-auto"
          >
            <Camera aria-hidden className="h-4 w-4" />
            구속 측정 시작
          </ButtonLink>
        }
      />

      <StatTiles tiles={tiles} />

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
