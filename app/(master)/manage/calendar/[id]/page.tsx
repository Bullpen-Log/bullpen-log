import Link from 'next/link';
import { notFound } from 'next/navigation';
import { ChevronLeft } from '@/components/icon';
import { PageHeading } from '@/components/ui';
import { TeamEventPanel } from '@/components/master/team-event';
import { requireMaster } from '@/lib/dal';
import { requireCurrentOrg } from '@/lib/org/access';
import { prisma } from '@/lib/prisma';
import { toDateKey } from '@/lib/pitch-stats';

/** 팀 훈련 하나(계약 11절) — 계획 · 실제 확인 · 결과 · 등판 계획. 앱 native/src/app/org/team-event.tsx 와 같은 동작(app/actions/app-team.ts) */
export default async function TeamEventPage({ params }: { params: Promise<{ id: string }> }) {
  const user = await requireMaster();
  const { org } = await requireCurrentOrg(user);
  const { id } = await params;
  const event = await prisma.orgEvent.findFirst({ where: { id, orgId: org.id }, select: { id: true, date: true, title: true } });
  if (!event) notFound();
  const day = toDateKey(event.date);
  return (
    <div className="stack-page">
      <Link href={`/manage/calendar?month=${day.slice(0, 7)}&day=${day}`} className="inline-flex items-center gap-1 text-xs text-muted hover:text-ink">
        <ChevronLeft className="h-3.5 w-3.5" /> 달력
      </Link>
      <PageHeading title={event.title} description="계획 · 실제 확인 · 결과 · 등판 계획" />
      <TeamEventPanel orgId={org.id} eventId={event.id} />
    </div>
  );
}
