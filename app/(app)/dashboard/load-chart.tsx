'use client';

import {
  BarController,
  BarElement,
  CategoryScale,
  Chart as ChartJS,
  Filler,
  LineController,
  LineElement,
  LinearScale,
  PointElement,
  Tooltip,
} from 'chart.js';
import { Chart } from 'react-chartjs-2';

// 일반 <Chart>는 컨트롤러를 자동 등록하지 않으므로 직접 등록한다.
ChartJS.register(
  BarController,
  LineController,
  CategoryScale,
  LinearScale,
  BarElement,
  PointElement,
  LineElement,
  Filler,
  Tooltip
);

const GRID = 'rgba(42, 42, 51, 0.7)';
const TICK = '#8e8e99';

export type LoadPoint = {
  label: string;
  pitches: number;
  /** 그날까지의 7일 누적 부하 (투구수 × 강도의 합) */
  rollingLoad: number;
};

export function LoadChart({ points }: { points: LoadPoint[] }) {
  return (
    <div className="h-[260px] sm:h-[300px]">
      <Chart
        type="bar"
        data={{
          labels: points.map((p) => p.label),
          datasets: [
            {
              type: 'bar' as const,
              label: '투구수',
              data: points.map((p) => p.pitches),
              backgroundColor: 'rgba(201, 169, 106, 0.45)',
              hoverBackgroundColor: 'rgba(227, 203, 149, 0.85)',
              borderRadius: 3,
              barPercentage: 0.7,
              categoryPercentage: 0.85,
              yAxisID: 'y',
              order: 2,
            },
            {
              type: 'line' as const,
              label: '7일 누적 부하',
              data: points.map((p) => p.rollingLoad),
              borderColor: '#5eead4',
              backgroundColor: 'rgba(94, 234, 212, 0.08)',
              borderWidth: 2,
              pointRadius: 0,
              pointHoverRadius: 4,
              pointHoverBackgroundColor: '#5eead4',
              tension: 0.35,
              fill: true,
              yAxisID: 'yLoad',
              order: 1,
            },
          ],
        }}
        options={{
          responsive: true,
          maintainAspectRatio: false,
          interaction: { mode: 'index', intersect: false },
          plugins: {
            tooltip: {
              backgroundColor: '#131317',
              borderColor: '#2a2a33',
              borderWidth: 1,
              titleColor: '#f4f2ee',
              bodyColor: '#8e8e99',
              padding: 12,
              displayColors: false,
              callbacks: {
                label: (ctx) =>
                  ctx.dataset.label === '투구수'
                    ? `투구수 ${ctx.parsed.y ?? 0}구`
                    : `7일 누적 부하 ${Math.round(ctx.parsed.y ?? 0)}`,
              },
            },
          },
          scales: {
            x: {
              grid: { display: false },
              border: { color: GRID },
              ticks: {
                color: TICK,
                font: { size: 10 },
                maxRotation: 0,
                autoSkipPadding: 16,
              },
            },
            y: {
              beginAtZero: true,
              grid: { color: GRID },
              border: { display: false },
              ticks: { color: TICK, font: { size: 10 }, precision: 0 },
              title: {
                display: true,
                text: '투구수',
                color: TICK,
                font: { size: 10 },
              },
            },
            yLoad: {
              position: 'right',
              beginAtZero: true,
              grid: { display: false },
              border: { display: false },
              ticks: { color: 'rgba(94, 234, 212, 0.7)', font: { size: 10 } },
              title: {
                display: true,
                text: '누적 부하',
                color: 'rgba(94, 234, 212, 0.7)',
                font: { size: 10 },
              },
            },
          },
        }}
      />
    </div>
  );
}
