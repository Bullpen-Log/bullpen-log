import Link from 'next/link';
import { Download } from '@/components/icon';
import { Card, EmptyState, PageHeading } from '@/components/ui';
import { SinkerNav } from '@/components/sinker/sinker-nav';
import { LogRow } from '@/components/sinker/log-row';
import { requireUser } from '@/lib/dal';
import { prisma } from '@/lib/prisma';
import { appNow } from '@/lib/clock';
import { shiftDateKey, toDateKey } from '@/lib/pitch-stats';
import { dbDate, keyOfDbDate } from '@/lib/nutrition/days';
import { SESSION_TYPES } from '@/lib/session-type';

type Search = { [key: string]: string | string[] | undefined };
const one = (v: string | string[] | undefined) =>
  typeof v === 'string' ? v : undefined;

const PERIODS = [
  { days: 28, label: '4주' },
  { days: 90, label: '3개월' },
  { days: 365, label: '1년' },
];

/**
 * 기록 표(PC, 2026-10-21 개편 4단계 4-2, docs/designs/sinker-dugout.md 5-2) — 날짜별 투구 기록을 표로. 기간 · 종류 거르기, 줄에서 바로 고치기, CSV.
 * 새 기록은 투구 탭에서(이 화면은 보기 · 고치기 · 내보내기).
 */
export default async function SinkerLogPage({
  searchParams,
}: {
  searchParams: Promise<Search>;
}) {
  const user = await requireUser();
  const sp = await searchParams;
  const days = PERIODS.find((p) => String(p.days) === one(sp.days))?.days ?? 28;
  const type = one(sp.type) ?? '';
  const todayKey = toDateKey(appNow());
  const from = shiftDateKey(todayKey, -(days - 1));
  const logs = await prisma.pitchLog.findMany({
    where: {
      userId: user.id,
      date: { gte: dbDate(from), lte: dbDate(todayKey) },
      ...(type ? { sessionType: type } : {}),
    },
    orderBy: [{ date: 'desc' }, { createdAt: 'desc' }],
    take: 400,
    select: {
      id: true,
      date: true,
      sessionType: true,
      pitchCount: true,
      intensity: true,
      effortPct: true,
      maxVelocity: true,
      memo: true,
      enteredById: true,
    },
  });
  const href = (q: { days?: number; type?: string }) => {
    const p = new URLSearchParams();
    const d = q.days ?? days;
    const t = q.type ?? type;
    if (d !== 28) p.set('days', String(d));
    if (t) p.set('type', t);
    const s = p.toString();
    return s ? `/sinker/log?${s}` : '/sinker/log';
  };
  const total = logs.reduce((a, l) => a + l.pitchCount, 0);

  return (
    <div className="stack-page">
      <PageHeading
        title="기록 표"
        description={`최근 ${days}일 · ${logs.length}건 · ${total}개`}
      />
      <SinkerNav />

      <div className="flex flex-wrap items-center gap-2">
        {PERIODS.map((p) => (
          <Link
            key={p.days}
            href={href({ days: p.days })}
            className={`min-h-9 rounded-lg border px-3 text-sm font-semibold leading-9 ${days === p.days ? 'border-sky bg-sky/10 text-sky-strong' : 'border-line text-muted'}`}
          >
            {p.label}
          </Link>
        ))}
        <span className="mx-1 h-5 w-px bg-line" />
        <Link
          href={href({ type: '' })}
          className={`min-h-9 rounded-lg border px-3 text-sm font-semibold leading-9 ${!type ? 'border-sky bg-sky/10 text-sky-strong' : 'border-line text-muted'}`}
        >
          전체
        </Link>
        {SESSION_TYPES.map((t) => (
          <Link
            key={t.name}
            href={href({ type: t.name })}
            className={`min-h-9 rounded-lg border px-3 text-sm font-semibold leading-9 ${type === t.name ? 'border-sky bg-sky/10 text-sky-strong' : 'border-line text-muted'}`}
          >
            {t.name}
          </Link>
        ))}
        <a
          href={`/api/sinker/log.csv?days=${days}${type ? `&type=${encodeURIComponent(type)}` : ''}`}
          className="ml-auto inline-flex min-h-9 items-center gap-1.5 rounded-lg border border-line px-3 text-sm font-semibold text-ink"
        >
          <Download className="h-4 w-4" /> CSV
        </a>
      </div>

      {logs.length === 0 ? (
        <EmptyState
          title="이 기간에 기록이 없어요"
          description="투구 탭에서 오늘 던진 것을 남기면 여기 쌓여요."
        />
      ) : (
        <Card className="overflow-x-auto p-0">
          <table className="w-full min-w-[720px] text-sm">
            <thead className="bg-surface-2 text-xs text-muted">
              <tr>
                <th className="px-3 py-2 text-left font-medium">날짜</th>
                <th className="px-3 py-2 text-left font-medium">종류</th>
                <th className="px-3 py-2 text-right font-medium">공 수</th>
                <th className="px-3 py-2 text-right font-medium">강도</th>
                <th className="px-3 py-2 text-right font-medium">최고 구속</th>
                <th className="px-3 py-2 text-left font-medium">메모</th>
                <th className="px-3 py-2 text-right font-medium"></th>
              </tr>
            </thead>
            <tbody className="divide-y divide-line">
              {logs.map((l) => (
                <LogRow
                  key={l.id}
                  log={{
                    id: l.id,
                    date: keyOfDbDate(l.date),
                    sessionType: l.sessionType,
                    pitchCount: l.pitchCount,
                    intensity: l.intensity,
                    effortPct: l.effortPct,
                    maxVelocity: l.maxVelocity,
                    memo: l.memo,
                    byCoach: !!l.enteredById && l.enteredById !== user.id,
                  }}
                />
              ))}
            </tbody>
          </table>
        </Card>
      )}
    </div>
  );
}
