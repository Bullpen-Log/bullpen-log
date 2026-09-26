import { notFound } from 'next/navigation';
import { DayClient } from '@/app/(app)/pitch-log/[date]/day-client';
import { loadPitchDay } from '@/app/(app)/pitch-log/[date]/load';

/**
 * 투구 기록 팝업의 내용 — 주소로 곧장 들어왔을 때의 페이지(app/(app)/pitch-log/[date])와
 * 같은 것을 읽어 같은 화면을 그린다. 창은 틀(layout.tsx)이 띄운다.
 */
export default async function PitchDayModalPage({
  params,
}: {
  params: Promise<{ date: string }>;
}) {
  const { date } = await params;
  const data = await loadPitchDay(date);
  if (!data) notFound();
  /* 불러오는 자리(loading.tsx)에서 바뀔 때 뚝 갈리지 않고 살짝 떠오른다 */
  return (
    <div className="motion-safe:animate-fade-in">
      <DayClient {...data} />
    </div>
  );
}
