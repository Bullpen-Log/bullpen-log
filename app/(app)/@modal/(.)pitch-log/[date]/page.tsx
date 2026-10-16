import { notFound } from 'next/navigation';
import { DayClient } from '@/app/(app)/pitch-log/[date]/day-client';
import { loadPitchDay } from '@/app/(app)/pitch-log/[date]/load';

/**
 * 투구 기록 팝업의 내용 — 주소로 곧장 들어왔을 때의 페이지(app/(app)/pitch-log/[date])와
 * 같은 것을 읽어 같은 화면을 그린다. 창은 틀(layout.tsx)이 띄운다.
 */
export default async function PitchDayModalPage({
  params,
  searchParams,
}: {
  params: Promise<{ date: string }>;
  /** ?drill=40&pct=70 — 트레이닝의 드릴 공 카드가 붙여 온다(load.ts drillPrefillOf) */
  searchParams: Promise<{ drill?: string | string[]; pct?: string | string[] }>;
}) {
  const { date } = await params;
  const data = await loadPitchDay(date, await searchParams);
  if (!data) notFound();
  return <DayClient {...data} />;
}
