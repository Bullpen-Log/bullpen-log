'use client';

import { useEffect, useRef } from 'react';
import { useWeightUnit } from '@/components/use-units';
import { round1, toWeight } from '@/lib/units';

/**
 * 예상 체중 선 — 지금에서 목표까지 계획 속도로 가는 직선(lib/nutrition/weight-goal.ts forecastWeights).
 *
 * 온보딩 '추천 계획'과 영양 탭 '내 계획' 카드가 같은 그림을 쓴다. 보이는 순간(active) 선이 왼쪽에서 그려진다
 * (Web Animations — CSS 를 더하지 않는다). 움직임을 줄인 설정이면 바로 다 그린다.
 *
 * 숫자는 두 개뿐이다(지금 · 목표) — 주마다 숫자를 박으면 작은 화면에서 겹친다. 가운데 세로 눈금은 4주마다.
 */
export function WeightForecast({
  points,
  active = true,
  className = '',
}: {
  points: { week: number; kg: number }[];
  active?: boolean;
  className?: string;
}) {
  const unit = useWeightUnit();
  const pathRef = useRef<SVGPathElement>(null);
  const areaRef = useRef<SVGPathElement>(null);
  const key = points.map((p) => `${p.week}:${p.kg}`).join('|');

  useEffect(() => {
    const path = pathRef.current;
    const area = areaRef.current;
    if (!active || !path || !area) return;
    const reduce = window.matchMedia('(prefers-reduced-motion: reduce)').matches;
    const options: KeyframeAnimationOptions = {
      duration: reduce ? 0 : 1000,
      easing: 'cubic-bezier(0.22, 1, 0.36, 1)',
      fill: 'forwards',
    };
    const a = path.animate([{ strokeDashoffset: 1 }, { strokeDashoffset: 0 }], options);
    const b = area.animate([{ opacity: 0 }, { opacity: 1 }], {
      ...options,
      delay: reduce ? 0 : 500,
      duration: reduce ? 0 : 500,
    });
    return () => {
      a.cancel();
      b.cancel();
    };
  }, [active, key]);

  if (points.length < 2) return null;

  const W = 320;
  const H = 120;
  const padX = 14;
  const padTop = 18;
  const padBottom = 22;
  const weeks = points[points.length - 1].week || 1;
  const kgs = points.map((p) => p.kg);
  const lo = Math.min(...kgs);
  const hi = Math.max(...kgs);
  const span = Math.max(hi - lo, 0.5);
  const x = (week: number) => padX + (week / weeks) * (W - padX * 2);
  const y = (kg: number) => padTop + (1 - (kg - lo) / span) * (H - padTop - padBottom);
  const d = points
    .map(
      (p, i) => `${i === 0 ? 'M' : 'L'}${x(p.week).toFixed(1)} ${y(p.kg).toFixed(1)}`
    )
    .join(' ');
  const area = `${d} L${x(weeks).toFixed(1)} ${(H - padBottom).toFixed(1)} L${x(0).toFixed(1)} ${(H - padBottom).toFixed(1)} Z`;
  const first = points[0];
  const last = points[points.length - 1];
  const label = (kg: number) => `${round1(toWeight(kg, unit))}${unit}`;
  const ticks: number[] = [];
  for (let w = 4; w < weeks; w += 4) ticks.push(w);

  return (
    <svg
      viewBox={`0 0 ${W} ${H}`}
      role="img"
      aria-label={`예상 체중: 지금 ${label(first.kg)}에서 ${weeks}주 뒤 ${label(last.kg)}`}
      className={`block h-auto w-full ${className}`}
    >
      <defs>
        <linearGradient id="wf-fill" x1="0" x2="0" y1="0" y2="1">
          <stop offset="0" stopColor="var(--color-sky)" stopOpacity="0.22" />
          <stop offset="1" stopColor="var(--color-sky)" stopOpacity="0" />
        </linearGradient>
      </defs>
      {/* 바닥선 · 4주 눈금 */}
      <line
        x1={padX}
        x2={W - padX}
        y1={H - padBottom}
        y2={H - padBottom}
        stroke="var(--color-line)"
        strokeWidth="1"
      />
      {ticks.map((w) => (
        <g key={w}>
          <line
            x1={x(w)}
            x2={x(w)}
            y1={H - padBottom}
            y2={H - padBottom + 4}
            stroke="var(--color-line-strong)"
            strokeWidth="1"
          />
          <text
            x={x(w)}
            y={H - 4}
            textAnchor="middle"
            fontSize="9"
            fill="var(--color-muted)"
          >
            {w}주
          </text>
        </g>
      ))}
      <path ref={areaRef} d={area} fill="url(#wf-fill)" opacity={0} />
      <path
        ref={pathRef}
        d={d}
        fill="none"
        stroke="var(--color-sky)"
        strokeWidth="2.5"
        strokeLinecap="round"
        strokeLinejoin="round"
        pathLength={1}
        strokeDasharray={1}
        strokeDashoffset={1}
      />
      {/* 지금 · 목표 */}
      <circle
        cx={x(first.week)}
        cy={y(first.kg)}
        r="4"
        fill="var(--color-surface)"
        stroke="var(--color-sky)"
        strokeWidth="2"
      />
      <circle cx={x(last.week)} cy={y(last.kg)} r="4.5" fill="var(--color-sky)" />
      <text
        x={x(first.week)}
        y={y(first.kg) + (first.kg <= last.kg ? 16 : -10)}
        textAnchor="start"
        fontSize="10"
        fontWeight="600"
        fill="var(--color-ink)"
      >
        {label(first.kg)}
      </text>
      <text
        x={x(last.week)}
        y={y(last.kg) + (first.kg <= last.kg ? -10 : 16)}
        textAnchor="end"
        fontSize="10"
        fontWeight="600"
        fill="var(--color-sky-strong)"
      >
        {label(last.kg)} · {weeks}주
      </text>
    </svg>
  );
}
