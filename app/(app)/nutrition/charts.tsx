'use client';

import { useEffect, useRef, useState, type PointerEvent } from 'react';
import Link from 'next/link';
import { haptic } from '@/lib/haptics';
import type { DaySummary, WeightPoint } from '@/lib/nutrition/load';
import { fmtRate, type Trend } from '@/lib/nutrition/weight-goal';
import { kcalText } from '@/lib/nutrition/meta';
import { toWeight, type WeightUnit } from '@/lib/units';
import { EASE } from './shared';

/**
 * 영양 탭의 작은 그래프 둘 — 7일 칼로리, 8주 체중.
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
      {/* 세로가 낮은 PC(노트북)에서는 막대를 낮춘다 — 영양 탭이 한 화면에 들어오게 */}
      <div className="flex h-20 items-end gap-1.5 desk-low:h-14">
        {week.map((d) => {
          const sel = d.date === selected;
          const over = d.kcal > d.target;
          return (
            <Link
              key={d.date}
              href={`/nutrition?date=${d.date}`}
              scroll={false}
              aria-label={`${d.date}, ${kcalText(d.kcal)}kcal 먹음, 목표 ${kcalText(d.target)}kcal`}
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
              {/* 그날 목표 — 막대보다 조금 넓은 짧은 실선(건강 · 피트니스 앱의 목표 표시처럼, 2026-10-04 김민 '앱 느낌').
                  예전 점선은 막대마다 끊긴 점들이라 지저분했다 */}
              <span
                aria-hidden
                className="absolute -inset-x-0.5 h-0.5 translate-y-1/2 rounded-full bg-ink/35"
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

/**
 * 8주 체중 — 적은 값(옅은 선)과 그 흐름(굵은 선), 목표 체중(점선).
 *
 * 흐름이 주인공이다. 적은 값은 하루에도 1kg 쯤 오르내려서, 그것을 굵게 그리면 눈이 어제와 오늘의 차이를
 * 읽는다 — 읽어야 할 것은 몇 주의 기울기다. 흐름 계산에서 뺀 값(오타 · 탈수된 날)은 회색 빈 점으로 남긴다:
 * 지우면 "내가 적은 게 어디 갔지"가 된다.
 *
 * 숫자에 색을 입히지 않는다(늘었다 = 빨강 같은 판정은 목표에 따라 뜻이 반대다 — 판정은 카드의 글이 한다).
 */
export function WeightTrend({
  weights,
  unit,
  trend,
  targetKg,
}: {
  weights: WeightPoint[];
  unit: WeightUnit;
  trend: Trend;
  targetKg: number | null;
}) {
  /*
   * 누르고 옆으로 훑으면 그 무렵 적은 값 — 밑 줄이 '10월 3일 · 72.4kg' 으로 바뀌고 세로선이 선다(건강 앱처럼, 2026-10-04
   * 김민 '앱 느낌'). 떼면 1.5초 뒤 돌아온다. 마우스는 올린 대로.
   */
  const [hover, setHover] = useState<number | null>(null);
  const hideTimer = useRef(0);
  useEffect(() => () => window.clearTimeout(hideTimer.current), []);

  if (weights.length < 2) {
    return (
      <p className="text-xs leading-relaxed text-muted">
        체중을 이틀 이상 적으면 8주 흐름이 여기 그려져요.
      </p>
    );
  }

  const W = 280;
  const H = 64;
  const PAD = 6;
  const r1 = (n: number) => Math.round(n * 10) / 10;
  const show = (kg: number) => toWeight(kg, unit);
  const values = weights.map((w) => show(w.kg));
  const line = trend.ok
    ? { from: show(trend.startKg), to: show(trend.currentKg), band: show(trend.sigma) }
    : null;
  const target = targetKg === null ? null : show(targetKg);

  /*
   * 세로 범위 — 흐름에 넣은 값과 흐름. 흐름에서 뺀 값(87.5 같은 오타)은 범위에 넣지 않는다: 넣으면 그 한 점이
   * 그래프를 다 차지하고 흐름이 납작해진다. 뺀 값은 위 · 아래 가장자리에 붙여 그린다.
   * 목표도 가까울 때만(2kg · 4lb 안) 넣는다 — 먼 목표는 가장자리에 방향만.
   */
  const dropped = new Set(trend.ok ? trend.dropped : []);
  const kept = values.filter((_, i) => !dropped.has(weights[i].date));
  const near = unit === 'kg' ? 2 : 4;
  let lo = Math.min(...kept, ...(line ? [line.from, line.to] : []));
  let hi = Math.max(...kept, ...(line ? [line.from, line.to] : []));
  const targetIn = target !== null && target >= lo - near && target <= hi + near;
  const targetAbove = target !== null && target > hi;
  if (targetIn && target !== null) {
    lo = Math.min(lo, target);
    hi = Math.max(hi, target);
  }
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

  const points = weights.flatMap((w, i) =>
    dropped.has(w.date) ? [] : [`${x(w.date).toFixed(1)},${y(values[i]).toFixed(1)}`]
  );
  const lastIndex = weights.length - 1;
  const tx = trend.ok ? [x(trend.fromDate), x(trend.toDate)] : null;
  const targetY =
    target === null ? null : targetIn ? y(target) : targetAbove ? 5 : H - 5;
  /*
   * 목표 글자는 점선의 왼쪽 끝에 — 흐름은 목표를 향해 가니 오른쪽 끝에서 점선과 만난다(거기 두면 겹친다).
   * 위쪽 목표는 점선 위에, 아래쪽 목표는 점선 밑에 적되 가장자리에 닿으면 반대쪽으로.
   */
  const targetTextY =
    targetY === null
      ? 0
      : !targetIn
        ? targetY + 3.5
        : target !== null && target >= mid
          ? targetY < 12
            ? targetY + 11
            : targetY - 4
          : targetY > H - 12
            ? targetY - 4
            : targetY + 11;
  const change = line ? r1(line.to - line.from) : 0;
  const day = (date: string) => date.slice(5).replace('-', '/');

  /* 손가락 자리 → 가장 가까운 적은 날. 그림은 가로세로 같은 배율로 상자 가운데에 놓인다(viewBox 기본) */
  const pick = (e: PointerEvent<SVGSVGElement>) => {
    const r = e.currentTarget.getBoundingClientRect();
    const scale = Math.min(r.width / W, r.height / H);
    const vx = (e.clientX - r.left - (r.width - W * scale) / 2) / scale;
    let best = 0;
    weights.forEach((wt, i) => {
      if (Math.abs(x(wt.date) - vx) < Math.abs(x(weights[best].date) - vx)) best = i;
    });
    window.clearTimeout(hideTimer.current);
    if (e.pointerType !== 'mouse' && best !== hover) haptic('selection');
    setHover(best);
  };
  const picked = hover == null ? null : weights[hover];
  const md = (date: string) =>
    `${Number(date.slice(5, 7))}월 ${Number(date.slice(8, 10))}일`;

  return (
    <figure className="space-y-1">
      <svg
        viewBox={`0 0 ${W} ${H}`}
        className="h-16 w-full touch-pan-y overflow-visible text-sky select-none"
        onPointerDown={pick}
        onPointerMove={(e) => {
          if (e.pointerType === 'mouse' || e.buttons > 0) pick(e);
        }}
        onPointerLeave={(e) => {
          if (e.pointerType === 'mouse') setHover(null);
        }}
        onPointerUp={(e) => {
          if (e.pointerType === 'mouse') return;
          window.clearTimeout(hideTimer.current);
          hideTimer.current = window.setTimeout(() => setHover(null), 1500);
        }}
        onPointerCancel={() => setHover(null)}
        role="img"
        aria-label={[
          trend.ok && line
            ? `체중 흐름 ${r1(line.from)}${unit}에서 ${r1(line.to)}${unit}, ${fmtRate(trend.rate20, unit)}`
            : `체중 기록 ${r1(values[0])}${unit}에서 ${r1(values[lastIndex])}${unit}`,
          target !== null ? `목표 ${r1(target)}${unit}` : '',
          dropped.size > 0 ? `흐름 계산에서 뺀 값 ${dropped.size}개` : '',
        ]
          .filter(Boolean)
          .join(', ')}
      >
        {/* 목표 체중 — 가까우면 그 높이에 점선, 멀면 가장자리에 방향만 */}
        {target !== null && targetY !== null && (
          <g className="text-muted motion-safe:animate-[trend-fade_500ms_ease-out_400ms_both]">
            {targetIn ? (
              <line
                x1={PAD}
                x2={W - PAD}
                y1={targetY}
                y2={targetY}
                stroke="currentColor"
                strokeWidth={1}
                strokeDasharray="2 3"
                vectorEffect="non-scaling-stroke"
              />
            ) : (
              <path
                d={
                  targetAbove
                    ? `M${PAD} ${targetY + 2} l3.5 -4 l3.5 4`
                    : `M${PAD} ${targetY - 2} l3.5 4 l3.5 -4`
                }
                fill="none"
                stroke="currentColor"
                strokeWidth={1.5}
                strokeLinecap="round"
                strokeLinejoin="round"
                vectorEffect="non-scaling-stroke"
              />
            )}
            <text
              x={targetIn ? PAD : PAD + 11}
              y={targetTextY}
              textAnchor="start"
              className="fill-current text-[10px] font-semibold tabular-nums"
            >
              목표 {r1(target)}
            </text>
          </g>
        )}

        {/*
          하루 흔들림의 폭 — 이 띠 안의 오르내림은 흐름이 아니다. 안쪽 svg 로 그래프 상자에서 자른다:
          드물게 재는 사람은 띠가 세로 범위보다 넓어 위의 글 · 밑의 날짜 줄을 덮었다.
        */}
        {line && tx && (
          <svg x={0} y={0} width={W} height={H}>
            <polygon
              points={[
                `${tx[0].toFixed(1)},${y(line.from + line.band).toFixed(1)}`,
                `${tx[1].toFixed(1)},${y(line.to + line.band).toFixed(1)}`,
                `${tx[1].toFixed(1)},${y(line.to - line.band).toFixed(1)}`,
                `${tx[0].toFixed(1)},${y(line.from - line.band).toFixed(1)}`,
              ].join(' ')}
              className="fill-sky/10 motion-safe:animate-[trend-fade_600ms_ease-out_300ms_both]"
            />
          </svg>
        )}

        {/* 적은 값 — 흐름이 있으면 뒤로 물린다 */}
        <polyline
          points={points.join(' ')}
          fill="none"
          stroke="currentColor"
          strokeWidth={line ? 1.5 : 2}
          strokeOpacity={line ? 0.35 : 1}
          strokeLinejoin="round"
          strokeLinecap="round"
          vectorEffect="non-scaling-stroke"
        />
        {weights.map((w, i) =>
          dropped.has(w.date) ? (
            <circle
              key={w.date}
              cx={x(w.date)}
              cy={Math.min(H - 3, Math.max(3, y(values[i])))}
              r={2.5}
              className="fill-surface stroke-muted"
              strokeWidth={1.5}
              vectorEffect="non-scaling-stroke"
            >
              <title>흐름 계산에서 뺀 값</title>
            </circle>
          ) : i === lastIndex || !line ? (
            <circle
              key={w.date}
              cx={x(w.date)}
              cy={y(values[i])}
              r={i === lastIndex ? 3.5 : 2}
              className={i === lastIndex ? 'fill-sky' : 'fill-surface stroke-sky'}
              strokeWidth={1.5}
              vectorEffect="non-scaling-stroke"
            />
          ) : null
        )}

        {/* 고른 날 — 세로선과 그 값의 점 */}
        {picked && hover != null && (
          <g>
            <line
              x1={x(picked.date)}
              x2={x(picked.date)}
              y1={0}
              y2={H}
              className="stroke-ink/30"
              strokeWidth={1}
              vectorEffect="non-scaling-stroke"
            />
            <circle
              cx={x(picked.date)}
              cy={Math.min(H - 3, Math.max(3, y(values[hover])))}
              r={4}
              className="fill-sky stroke-surface"
              strokeWidth={1.5}
              vectorEffect="non-scaling-stroke"
            />
          </g>
        )}

        {/* 흐름 — 왼쪽에서 오른쪽으로 그어진다 */}
        {line && tx && (
          <line
            x1={tx[0]}
            y1={y(line.from)}
            x2={tx[1]}
            y2={y(line.to)}
            stroke="currentColor"
            strokeWidth={2.5}
            strokeLinecap="round"
            vectorEffect="non-scaling-stroke"
            pathLength={1}
            strokeDasharray={1}
            className="motion-safe:animate-[trend-draw_700ms_cubic-bezier(0.22,1,0.36,1)_both]"
          />
        )}
      </svg>
      <figcaption className="flex justify-between gap-2 text-xs text-muted tabular-nums">
        {picked && hover != null ? (
          <>
            <span>{md(picked.date)}</span>
            <span className="font-semibold text-sky-strong">
              {r1(values[hover])}
              {unit}
              {dropped.has(picked.date) && (
                <span className="ml-1 font-normal text-muted">
                  · 흐름 계산에서 뺀 값
                </span>
              )}
            </span>
          </>
        ) : trend.ok && line ? (
          <>
            <span>
              {day(trend.fromDate)} · {r1(line.from)}
              {unit}
            </span>
            <span className="text-ink">
              {change > 0 ? '+' : change < 0 ? '−' : ''}
              {Math.abs(change)}
              {unit}
            </span>
            <span>
              {day(trend.toDate)} · {r1(line.to)}
              {unit}
            </span>
          </>
        ) : (
          <>
            <span>
              {day(weights[0].date)} · {r1(values[0])}
              {unit}
            </span>
            <span>
              {day(weights[lastIndex].date)} · {r1(values[lastIndex])}
              {unit}
            </span>
          </>
        )}
      </figcaption>
    </figure>
  );
}
