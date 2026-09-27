import { notFound } from 'next/navigation';
import { requireAdmin } from '@/lib/dal';
import { loadVelocityAdminDay } from '@/lib/velocity-admin-load';
import { VelocityAdminDayView } from './day-view';

/**
 * 구속 측정 관리자 — 하루. 그날 모든 계정의 세션과 공, 스피드건 값 · 제외 표시 · 클립을 고친다.
 * 그리는 것은 day-view.tsx · day-client.tsx.
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
  return <VelocityAdminDayView date={date} day={day} />;
}
