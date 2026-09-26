import Link from 'next/link';
import type { DaySummary, WeightPoint } from '@/lib/nutrition/load';
import { kcalText } from '@/lib/nutrition/meta';
import { toWeight, type WeightUnit } from '@/lib/units';
import { EASE } from './shared';

/**
 * 영양 탭의 작은 그래프 둘 — 7일 칼로리, 30일 체중.
 *
 * 그림을 그리는 라이브러리(chart.js)를 쓰지 않는다. 막대 일곱 개와 선 하나라
 * 직접 그리는 편이 가볍고, 무엇보다 앱의 색·글꼴과 어긋나지 않는다.
 */

const WEEKDAYS = ['일', '월', '화', '수', '목', '금', '토'];
const weekday = (date: string) =>
  WEEKDAYS[new Date(`${date}T00:00:00.000Z`).getUTCDay()];

/** 막대 = 먹은 칼로리, 가로 점선 = 그날 목표. 막대를 누르면 그날로 간다. */
export function WeekChart({
  week,
  selected,
}: {
  week: DaySummary[];
  selected: string;
}) {
  const max = Math.max(1, ...week.map((d) => Math.max(d.kcal, d.target)));
  const logged = week.filter((d) => d.kcal > 0);
  const avg = (key: 'kcal' | 'protein') =>
    logged.length
      ? Math.round(logged.reduce((s, d) => s + d[key], 0) / logged.length)
      : 0;

  return (
    <div className="space-y-2">
      <div className="flex h-20 items-end gap-1.5">
        {week.map((d) => {
          const sel = d.date === selected;
          const over = d.kcal > d.target;
          return (
            <Link
              key={d.date}
              href={`/nutrition?date=${d.date}`}
              scroll={false}
              aria-label={`${d.date} — ${kcalText(d.kcal)}kcal 먹음, 목표 ${kcalText(d.target)}kcal`}
              className="group relative flex h-full flex-1 items-end rounded-md focus-visible:outline-2 focus-visible:outline-offset-2 focus-visible:outline-sky"
            >
              <span
                className={`block w-full rounded-t-md transition-[height,background-color] duration-500 ${EASE} ${
                  sel
                    ? over
                      ? 'bg-warn'
                      : 'bg-sky'
                    : 'bg-sky/30 group-hover:bg-sky/50'
                }`}
                style={{ height: `${(d.kcal / max) * 100}%` }}
              />
              <span
                aria-hidden
                className="absolute inset-x-0 border-t-2 border-dotted border-ink/30"
                style={{ bottom: `${(d.target / max) * 100}%` }}
              />
            </Link>
          );
        })}
      </div>
      <div className="flex gap-1.5">
        {week.map((d) => (
          <span
            key={d.date}
            className={`flex-1 text-center text-[11px] ${
              d.date === selected ? 'font-semibold text-ink' : 'text-muted'
            }`}
          >
            {weekday(d.date)}
          </span>
        ))}
      </div>
      <p className="text-xs text-muted tabular-nums">
        {logged.length === 0
          ? '아직 이번 주 기록이 없어요.'
          : `기록한 ${logged.length}일 평균 ${kcalText(avg('kcal'))}kcal · 단백질 ${avg('protein')}g`}
      </p>
    </div>
  );
}

/** 30일 체중 — 선 하나와 처음·끝 값 */
export function WeightTrend({
  weights,
  unit,
}: {
  weights: WeightPoint[];
  unit: WeightUnit;
}) {
  if (weights.length < 2) {
    return (
      <p className="text-xs leading-relaxed text-muted">
        체중을 이틀 이상 적으면 30일 흐름이 여기 그려져요.
      </p>
    );
  }

  const W = 280;
  const H = 64;
  const PAD = 6;
  const values = weights.map((w) => toWeight(w.kg, unit));
  const lo = Math.min(...values);
  const hi = Math.max(...values);
  const span = Math.max(hi - lo, unit === 'kg' ? 1 : 2);
  const mid = (lo + hi) / 2;
  const first = new Date(`${weights[0].date}T00:00:00.000Z`).getTime();
  const last = new Date(`${weights.at(-1)!.date}T00:00:00.000Z`).getTime();
  const x = (date: string) =>
    PAD +
    ((new Date(`${date}T00:00:00.000Z`).getTime() - first) /
      Math.max(1, last - first)) *
      (W - PAD * 2);
  const y = (v: number) => H / 2 - ((v - mid) / span) * (H - PAD * 2);
  const points = weights.map(
    (w, i) => `${x(w.date).toFixed(1)},${y(values[i]).toFixed(1)}`
  );
  const change = values.at(-1)! - values[0];
  const r1 = (n: number) => Math.round(n * 10) / 10;

  return (
    <figure className="space-y-1">
      <svg
        viewBox={`0 0 ${W} ${H}`}
        className="h-16 w-full overflow-visible text-sky"
        role="img"
        aria-label={`체중 흐름 — ${r1(values[0])}${unit}에서 ${r1(values.at(-1)!)}${unit}`}
      >
        <polyline
          points={points.join(' ')}
          fill="none"
          stroke="currentColor"
          strokeWidth={2}
          strokeLinejoin="round"
          strokeLinecap="round"
          vectorEffect="non-scaling-stroke"
        />
        {weights.map((w, i) => (
          <circle
            key={w.date}
            cx={x(w.date)}
            cy={y(values[i])}
            r={i === weights.length - 1 ? 3.5 : 2}
            className={
              i === weights.length - 1 ? 'fill-sky' : 'fill-surface stroke-sky'
            }
            strokeWidth={1.5}
            vectorEffect="non-scaling-stroke"
          />
        ))}
      </svg>
      <figcaption className="flex justify-between text-xs text-muted tabular-nums">
        <span>
          {weights[0].date.slice(5).replace('-', '/')} · {r1(values[0])}
          {unit}
        </span>
        <span
          className={
            change === 0 ? '' : change > 0 ? 'text-cat-power' : 'text-cat-mobility'
          }
        >
          {change > 0 ? '+' : ''}
          {r1(change)}
          {unit}
        </span>
        <span>
          {weights.at(-1)!.date.slice(5).replace('-', '/')} · {r1(values.at(-1)!)}
          {unit}
        </span>
      </figcaption>
    </figure>
  );
}
