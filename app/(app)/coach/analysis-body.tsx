'use client';

import { useState, type ReactNode } from 'react';
import { AnalysisBlock } from '@/app/(app)/today/analysis-block';
import { HomeTrends } from '@/app/(app)/today/home-trends';
import type { AnalysisTab } from '@/app/(app)/today/analysis-tabs';
import type { Log } from '@/app/(app)/pitch-log/types';
import type { TrainingDaySummary } from '@/lib/report/training-history';
import type { CheckinDay, NutritionDay } from '@/app/(app)/today/day-summary';

/**
 * 분석 · 그래프 화면의 몸통 — 예전 홈 캘린더 밑에 있던 두 칸 그대로(2026-10-05 홈 정리로 옮겨 옴).
 *
 * 분석 칸은 날짜 하나를 본다. 홈에서는 캘린더가 날짜를 쥐었는데, 여기서는 이 화면이 쥔다 — 처음은 주소의 ?date=
 * (홈 그날 칸의 '그날 분석'), 없으면 오늘. 지난 리포트 목록이나 그래프의 점을 누르면 그날로 바뀌고, 그래프에서
 * 눌렀으면 위의 분석 칸까지 올려 보여 준다(휴대폰은 그래프가 분석 밑에 있다).
 */
export function AnalysisBody({
  today,
  initialDate,
  initialTab,
  todayReport,
  earliest,
  logs,
  trainingByDay,
  nutritionByDay,
  checkinByDay,
  weightByDay,
}: {
  today: string;
  initialDate: string;
  initialTab: AnalysisTab;
  /** 오늘의 리포트 칸 — 서버가 함께 그려 보낸다(analysis-block.tsx) */
  todayReport: ReactNode;
  earliest: string;
  logs: Log[];
  trainingByDay: Record<string, TrainingDaySummary>;
  nutritionByDay: Record<string, NutritionDay>;
  checkinByDay: Record<string, CheckinDay>;
  weightByDay: Record<string, number>;
}) {
  const [date, setDate] = useState(initialDate);

  const showDay = (day: string) => {
    setDate(day);
    const el = document.getElementById('analysis');
    if (el && el.getBoundingClientRect().top < 0) {
      const reduce = window.matchMedia('(prefers-reduced-motion: reduce)').matches;
      el.scrollIntoView({ behavior: reduce ? 'auto' : 'smooth', block: 'start' });
    }
  };

  return (
    /* 넓은 화면은 분석('그날')과 그래프('요즘')를 나란히, 좁으면 분석 밑에 그래프 */
    <div className="grid gap-x-6 xl:grid-cols-2">
      <AnalysisBlock
        date={date}
        today={today}
        initialTab={initialTab}
        todayReport={todayReport}
        onJump={setDate}
      />
      <HomeTrends
        today={today}
        earliest={earliest}
        logs={logs}
        trainingByDay={trainingByDay}
        nutritionByDay={nutritionByDay}
        checkinByDay={checkinByDay}
        weightByDay={weightByDay}
        onJump={showDay}
      />
    </div>
  );
}
