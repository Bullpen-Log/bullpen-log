'use client';

import { useState, type ReactNode } from 'react';
import { AnalysisBlock } from '@/app/(app)/today/analysis-block';
import { HomeTrends, type MetricKey } from '@/app/(app)/today/home-trends';
import type { AnalysisTab } from '@/app/(app)/today/analysis-tabs';
import type { Log } from '@/app/(app)/pitch-log/types';
import type { TrainingDaySummary } from '@/lib/report/training-history';
import type { CheckinDay, NutritionDay } from '@/app/(app)/today/day-summary';

/** 그 분석의 그래프 — 투구는 투구수 · 최고 구속, 트레이닝은 운동만(2026-10-14 '투구만 · 트레이닝만') */
const PITCH_METRICS: MetricKey[] = ['pitches', 'velocity'];
const TRAINING_METRICS: MetricKey[] = ['training'];

/**
 * 분석 · 그래프 화면의 몸통 — 예전 홈 캘린더 밑에 있던 두 칸 그대로(2026-10-05 홈 정리로 옮겨 옴).
 *
 * 분석 칸은 날짜 하나를 본다. 홈에서는 캘린더가 날짜를 쥐었는데, 여기서는 이 화면이 쥔다 — 처음은 주소의 ?date=
 * (홈 그날 칸의 '그날 분석'), 없으면 오늘. 그래프의 점을 누르면 그날로 바뀌고 위의 분석 칸까지 올려 보여 준다
 * (휴대폰은 그래프가 분석 밑에 있다).
 */
export function AnalysisBody({
  today,
  initialDate,
  tab,
  initialView,
  earliest,
  logs,
  trainingByDay,
  nutritionByDay,
  checkinByDay,
  weightByDay,
}: {
  today: string;
  initialDate: string;
  /** 어느 분석인가 — 투구면 투구만, 트레이닝이면 트레이닝만(2026-10-14) */
  tab: AnalysisTab;
  /** 처음 펼 날 · 칸의 내용 — 서버가 함께 그려 보낸다(뜬 뒤에 따로 받아 오지 않게, analysis-block.tsx) */
  initialView: ReactNode;
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
    /*
     * 분석 밑에 그래프 — 한 줄로 쌓는다(2026-10-14 사용자 "공백 · 간격이 안 맞아"). 예전엔 넓은 화면에서 둘을 나란히 두고 그래프가
     * 분석 높이만큼 늘어났는데, 그래프가 한두 장으로 줄자 카드 하나가 900px 넘게 늘어났다. 사이는 쪽의 큰 덩이 간격(stack-page).
     */
    <div className="stack-page">
      <AnalysisBlock
        date={date}
        today={today}
        tab={tab}
        initialView={{ date: initialDate, node: initialView }}
      />
      <HomeTrends
        today={today}
        earliest={earliest}
        logs={logs}
        trainingByDay={trainingByDay}
        nutritionByDay={nutritionByDay}
        checkinByDay={checkinByDay}
        weightByDay={weightByDay}
        metrics={tab === 'training' ? TRAINING_METRICS : PITCH_METRICS}
        onJump={showDay}
      />
    </div>
  );
}
