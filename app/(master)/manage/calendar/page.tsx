import Link from 'next/link';
import { ChevronLeft, ChevronRight } from '@/components/icon';
import { Badge, Card, PageHeading } from '@/components/ui';
import { CalendarDay, type EventView } from '@/components/master/calendar-day';
import { requireMaster } from '@/lib/dal';
import { requireCurrentOrg } from '@/lib/org/access';
import { EVENT_KIND_LABEL, isDateKey, type EventKind } from '@/lib/org/rules';
import { appNow } from '@/lib/clock';
import { dbDate } from '@/lib/nutrition/days';
import { dateKeyOf, toDateKey } from '@/lib/pitch-stats';
import { prisma } from '@/lib/prisma';

type SP = { [key: string]: string | string[] | undefined };
const one = (v: string | string[] | undefined) => (Array.isArray(v) ? v[0] : v) ?? '';

const DOT: Record<EventKind, string> = {
  training: 'bg-sky',
  game: 'bg-danger',
  rest: 'bg-ink/30',
  lesson: 'bg-ok',
  other: 'bg-warn',
};

/**
 * 조직 달력(5단계) — 한 달 격자 + 고른 날의 일정(더하기 · 고치기 · 지우기). 팀은 훈련 · 경기 · 휴식, 레슨장은 회원별 레슨 시간표.
 * ?month=YYYY-MM&day=YYYY-MM-DD — 새로 고쳐도 같은 달 · 같은 날.
 */
export default async function CalendarPage({ searchParams }: { searchParams: Promise<SP> }) {
  const user = await requireMaster();
  const { org } = await requireCurrentOrg(user);
  const sp = await searchParams;
  const todayKey = toDateKey(appNow());
  const dayKey = isDateKey(one(sp.day)) ? one(sp.day) : todayKey;
  const monthRaw = one(sp.month);
  const [y, m] = /^\d{4}-\d{2}$/.test(monthRaw) ? monthRaw.split('-').map(Number) : dayKey.split('-').slice(0, 2).map(Number);
  const first = dateKeyOf(y, m - 1, 1);
  const daysInMonth = new Date(Date.UTC(y, m, 0)).getUTCDate();
  const last = dateKeyOf(y, m - 1, daysInMonth);
  const prevMonth = `${m === 1 ? y - 1 : y}-${String(m === 1 ? 12 : m - 1).padStart(2, '0')}`;
  const nextMonth = `${m === 12 ? y + 1 : y}-${String(m === 12 ? 1 : m + 1).padStart(2, '0')}`;
  const firstWeekday = new Date(`${first}T00:00:00Z`).getUTCDay();

  const [events, members] = await Promise.all([
    prisma.orgEvent.findMany({
      where: { orgId: org.id, date: { gte: dbDate(first), lte: dbDate(last) } },
      orderBy: [{ date: 'asc' }, { time: 'asc' }],
      select: { id: true, date: true, time: true, kind: true, title: true, memo: true, memberId: true },
    }),
    prisma.orgMember.findMany({
      where: { orgId: org.id, role: 'PLAYER', status: 'ACTIVE' },
      orderBy: { nickname: 'asc' },
      select: { id: true, nickname: true },
    }),
  ]);
  /* 코치가 남긴 수행일지 — 지울 때 같이 뺄지 묻는다(계약 9-6 ①-6 F, 결정 4) */
  const work = await prisma.userExerciseSet.groupBy({
    by: ['orgEventId'],
    where: { orgEventId: { in: events.map((e) => e.id) }, enteredById: { not: null } },
    _count: { _all: true },
  });
  const workOf = new Map(work.map((w) => [w.orgEventId, w._count._all]));
  const views: EventView[] = events.map((e) => ({ ...e, key: e.date.toISOString().slice(0, 10), workSets: workOf.get(e.id) ?? 0 }));
  const byDay = new Map<string, EventView[]>();
  for (const v of views) byDay.set(v.key, [...(byDay.get(v.key) ?? []), v]);
  const nameOf = new Map(members.map((x) => [x.id, x.nickname]));
  const cells: (string | null)[] = [
    ...Array.from({ length: firstWeekday }, () => null),
    ...Array.from({ length: daysInMonth }, (_, i) => dateKeyOf(y, m - 1, i + 1)),
  ];

  return (
    <div className="stack-page">
      <PageHeading title={org.kind === 'LESSON' ? '레슨 시간표' : '팀 달력'} description="누르면 그날 일정을 보고 더해요." />

      <div className="grid gap-4 lg:grid-cols-[1fr_minmax(20rem,26rem)]">
        <Card className="space-y-3">
          <div className="flex items-center justify-between">
            <Link href={`/manage/calendar?month=${prevMonth}`} aria-label="이전 달" className="grid h-9 w-9 place-items-center rounded-xl hover:bg-ink/5">
              <ChevronLeft className="h-4 w-4" />
            </Link>
            <p className="text-sm font-bold text-ink">
              {y}년 {m}월
            </p>
            <Link href={`/manage/calendar?month=${nextMonth}`} aria-label="다음 달" className="grid h-9 w-9 place-items-center rounded-xl hover:bg-ink/5">
              <ChevronRight className="h-4 w-4" />
            </Link>
          </div>
          <div className="grid grid-cols-7 gap-1 text-center text-[11px] text-muted">
            {['일', '월', '화', '수', '목', '금', '토'].map((d) => (
              <span key={d}>{d}</span>
            ))}
          </div>
          <div className="grid grid-cols-7 gap-1">
            {cells.map((key, i) =>
              key ? (
                <Link
                  key={key}
                  href={`/manage/calendar?month=${y}-${String(m).padStart(2, '0')}&day=${key}`}
                  aria-current={key === dayKey ? 'date' : undefined}
                  className={`flex min-h-14 flex-col rounded-xl border p-1.5 text-xs transition-colors ${
                    key === dayKey ? 'border-sky bg-sky/10' : 'border-line hover:border-sky-soft'
                  }`}
                >
                  <span className={`font-semibold ${key === todayKey ? 'text-sky-strong' : 'text-ink'}`}>{Number(key.slice(-2))}</span>
                  <span className="mt-auto flex flex-wrap gap-0.5">
                    {(byDay.get(key) ?? []).slice(0, 4).map((e) => (
                      <span key={e.id} aria-hidden className={`h-1.5 w-1.5 rounded-full ${DOT[e.kind as EventKind] ?? DOT.other}`} />
                    ))}
                  </span>
                </Link>
              ) : (
                <span key={`b${i}`} />
              )
            )}
          </div>
          <p className="flex flex-wrap gap-3 text-[11px] text-muted">
            {(Object.keys(DOT) as EventKind[]).map((k) => (
              <span key={k} className="inline-flex items-center gap-1">
                <span className={`h-1.5 w-1.5 rounded-full ${DOT[k]}`} /> {EVENT_KIND_LABEL[k]}
              </span>
            ))}
          </p>
        </Card>

        <CalendarDay orgId={org.id} orgKind={org.kind} dayKey={dayKey} events={byDay.get(dayKey) ?? []} members={members} />
      </div>

      <section className="space-y-3">
        <h2 className="text-sm font-bold text-ink">이달 일정 {views.length}개</h2>
        <Card className="divide-y divide-line p-0">
          {views.length === 0 && <p className="px-4 py-4 text-xs text-muted">이달 일정이 없어요.</p>}
          {views.map((e) => (
            <Link
              key={e.id}
              href={`/manage/calendar?month=${y}-${String(m).padStart(2, '0')}&day=${e.key}`}
              className="flex items-center gap-3 px-4 py-2.5 text-sm hover:bg-ink/4"
            >
              <span className="w-12 shrink-0 text-xs text-muted">{Number(e.key.slice(5, 7))}/{Number(e.key.slice(8))}</span>
              <span className="w-12 shrink-0 text-xs text-muted">{e.time ?? '종일'}</span>
              <Badge>{EVENT_KIND_LABEL[e.kind as EventKind] ?? e.kind}</Badge>
              <span className="min-w-0 flex-1 truncate text-ink">
                {e.memberId ? `${nameOf.get(e.memberId) ?? '?'} · ` : ''}
                {e.title}
              </span>
            </Link>
          ))}
        </Card>
      </section>
    </div>
  );
}
