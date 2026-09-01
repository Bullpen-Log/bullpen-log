'use client';

import { useState } from 'react';
import { useRouter } from 'next/navigation';
import { Card } from '@/components/ui';
import { LegendSwatch, MonthCalendar, type DayMark } from '@/components/month-calendar';
import type { TrainingDaySummary } from '@/lib/report/training-history';

/**
 * 지난 운동 기록 — 달력 하나.
 *
 * 투구 일지와 같은 모양이다. 둘 다 "언제 무엇을 했는지 보고, 날짜를 눌러 그날을
 * 연다"가 하는 일이라 같은 달력을 쓴다.
 *
 * 달력은 요약(몇 개 했나·강도 몇)만 들고 있다. 날짜를 누르면
 * /training/day/<날짜> 로 넘어가고, 그날 목록은 거기서 읽는다. 하루 열 개씩
 * 한 해를 쌓으면 삼천 줄인데, 그걸 화면 열 때마다 내려받게 할 수는 없다.
 *
 * 한때 그것을 작은 창으로 띄웠는데, 운동이 열 개를 넘는 날에는 창 안에서
 * 굴리다가 어디까지 봤는지 놓치기 쉬웠다.
 */
export function TrainingHistory({
  summaries,
}: {
  summaries: Record<string, TrainingDaySummary>;
}) {
  const [month, setMonth] = useState(() => {
    const now = new Date();
    return new Date(now.getFullYear(), now.getMonth(), 1);
  });
  const router = useRouter();

  /* 날짜를 누르면 그날 페이지로 간다. */
  const openDay = (date: string) => router.push(`/training/day/${date}`);

  const marks: Record<string, DayMark> = {};
  for (const [key, s] of Object.entries(summaries)) {
    marks[key] = {
      /*
       * 강도를 안 적은 날은 색을 안 채운다. 운동은 했는데 얼마나 힘들었는지는
       * 모르는 날이라, 색으로 세기를 말하면 없는 것을 지어내는 셈이 된다.
       */
      intensity: s.intensity,
      label: s.count > 0 ? `${s.count}개` : '기록',
      dot: s.hasMemo,
      spoken: [
        s.count > 0 ? `운동 ${s.count}개` : '운동 기록 없음',
        s.intensity != null ? `강도 ${s.intensity}` : null,
        s.hasMemo ? '메모 있음' : null,
      ]
        .filter(Boolean)
        .join(', '),
    };
  }

  return (
    <>
      <Card>
        <MonthCalendar
          month={month}
          onMonthChange={setMonth}
          selected={null}
          onSelect={openDay}
          marks={marks}
        >
          <span>강도</span>
          <LegendSwatch className="h-3 w-5 rounded bg-sky/15">낮음</LegendSwatch>
          <LegendSwatch className="h-3 w-5 rounded bg-sky/40">보통</LegendSwatch>
          <LegendSwatch className="h-3 w-5 rounded bg-sky/70">높음</LegendSwatch>
          <LegendSwatch className="h-3 w-5 rounded border border-dashed border-line-strong">
            강도 안 적음
          </LegendSwatch>
          <LegendSwatch className="h-1.5 w-1.5 rounded-full bg-sky-strong">
            메모
          </LegendSwatch>
        </MonthCalendar>
      </Card>
    </>
  );
}
