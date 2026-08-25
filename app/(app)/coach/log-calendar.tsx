'use client';

import { useState } from 'react';
import { useRouter } from 'next/navigation';
import { PitchCalendar, type DaySummary } from '@/app/(app)/pitch-log/calendar';

/**
 * 홈에 얹는 달력. 날짜를 누르면 그 날짜의 투구 일지로 넘어간다.
 *
 * 달력 자체는 투구 일지의 것을 그대로 쓴다. 두 벌로 만들면 한쪽만
 * 고쳐져서 홈과 일지가 서로 다른 날을 표시하게 된다.
 * 여기서는 "고른다" 대신 "옮겨간다"만 다르다.
 */
export function LogCalendar({
  summaries,
  initialMonth,
}: {
  summaries: Record<string, DaySummary>;
  /** 'YYYY-MM' — 기록이 있는 가장 최근 달 */
  initialMonth: string;
}) {
  const router = useRouter();

  const [month, setMonth] = useState(() => {
    const [y, m] = initialMonth.split('-').map(Number);
    return new Date(y, m - 1, 1);
  });

  return (
    <PitchCalendar
      month={month}
      onMonthChange={setMonth}
      // 홈에서는 고른 날을 따로 표시하지 않는다. 누르면 바로 넘어가기 때문이다.
      selected=""
      onSelect={(dateKey) => router.push(`/pitch-log?date=${dateKey}`)}
      summaries={summaries}
    />
  );
}
