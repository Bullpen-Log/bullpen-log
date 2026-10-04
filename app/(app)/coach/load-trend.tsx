'use client';

import { useEffect, useRef, useState, type PointerEvent } from 'react';
import {
  ACWR_ZONES,
  formatShortDate,
  zoneOf,
  type AcwrTrendPoint,
} from '@/lib/pitch-stats';
import { TONE } from '@/components/tone';
import { haptic } from '@/lib/haptics';
import { smoothPath } from '@/lib/smooth-path';
import { useBoxSize } from '@/components/use-box-size';
import { spokenDay } from '@/app/(app)/today/day-summary';

/* 적정 구간 — 띠로 깐다 */
const BAND_LO = 0.8;
const BAND_HI = 1.3;

/**
 * 최근 2주 지수 흐름 — 건강 앱 그래프처럼(2026-10-04 '앱 느낌').
 *
 * 지수 하나만 크게 보여주면 그 값이 요일 때문에 오르내린다는 것을 알 수가 없다. 같은 훈련을 12주 반복한 선수도 오늘이
 * 목요일이냐 일요일이냐에 따라 0.79 와 1.25 를 오간다. 계산은 그대로 두고(급증을 빨리 잡는다) 흐름을 옆에 둬서, 오늘이
 * 낮아도 선이 평평하면 그게 보이게 한다.
 *
 * 예전에는 테두리 상자 안에 가로로 늘린 꺾은선과 점선 경계 둘이었다. 이제 적정 구간을 옅은 파란 띠로 깔고 부드러운 선을
 * 화면 픽셀 그대로(점이 찌그러지지 않게) 그린다. 눌러서 옆으로 훑으면 위 줄이 그날 날짜 · 지수로 바뀐다(칸마다 '톡').
 */
export function LoadTrend({ trend }: { trend: AcwrTrendPoint[] }) {
  const box = useRef<HTMLDivElement>(null);
  const size = useBoxSize(box);
  const [hover, setHover] = useState<number | null>(null);
  const hideTimer = useRef(0);
  useEffect(() => () => window.clearTimeout(hideTimer.current), []);

  const got = trend.filter((p) => p.ratio != null);
  // 이틀 이하로는 선이라 할 것이 없다.
  if (got.length < 3) return null;

  const n = trend.length;
  const last = trend[n - 1];
  const w = size?.w ?? 0;
  const h = size?.h ?? 0;
  const padL = 4;
  const padR = 28;
  const padT = 8;
  const padB = 18;
  const plotW = Math.max(1, w - padL - padR);
  const plotH = Math.max(1, h - padT - padB);
  const x = (i: number) => padL + (plotW * i) / (n - 1);
  /*
   * 세로 범위 — 적정 띠(0.8~1.3)가 늘 보이게 0.5~1.5 를 덮고, 값이 그 밖이면 넓힌다. 예전엔 0.5~2.0 에 묶어 0.42 처럼
   * 낮은 지수가 바닥에 깔려 납작한 줄이 됐다.
   */
  const vals = got.map((p) => p.ratio as number);
  const lo = Math.max(
    0,
    Math.min(0.5, Math.floor((Math.min(...vals) - 0.1) * 10) / 10)
  );
  const hi = Math.max(1.5, Math.ceil((Math.max(...vals) + 0.1) * 10) / 10);
  const y = (r: number) => padT + plotH * (1 - (r - lo) / (hi - lo));

  const pts = trend.flatMap((p, i) =>
    p.ratio == null ? [] : [{ i, px: x(i), py: y(p.ratio), ratio: p.ratio }]
  );
  const line = smoothPath(pts.map((p) => [p.px, p.py] as [number, number]));
  const end = pts[pts.length - 1];
  const endZone = zoneOf(end.ratio);

  const picked = hover == null ? null : trend[hover];
  const pickedZone = picked?.ratio != null ? zoneOf(picked.ratio) : null;

  const pick = (e: PointerEvent<HTMLDivElement>) => {
    const r = e.currentTarget.getBoundingClientRect();
    const i = Math.min(
      n - 1,
      Math.max(0, Math.round(((e.clientX - r.left - padL) / plotW) * (n - 1)))
    );
    window.clearTimeout(hideTimer.current);
    if (e.pointerType !== 'mouse' && i !== hover && trend[i].ratio != null)
      haptic('selection');
    setHover(i);
  };

  return (
    <div className="rounded-2xl bg-ink/4 px-4 pb-3 pt-3.5">
      {/* 위 줄 — 평소엔 '최근 2주 · 날짜', 훑는 동안은 그날 날짜 · 지수 · 구간 */}
      <div className="flex min-h-5 items-baseline justify-between gap-2">
        {picked ? (
          <>
            <p className="text-xs font-medium text-muted">
              {spokenDay(picked.dateKey)}
            </p>
            <p className="text-sm font-bold tabular-nums">
              {picked.ratio != null && pickedZone ? (
                <span className={TONE[ACWR_ZONES[pickedZone].tone].text}>
                  {picked.ratio.toFixed(2)}
                  <span className="ml-1 text-xs font-medium">
                    {ACWR_ZONES[pickedZone].label}
                  </span>
                </span>
              ) : (
                <span className="text-xs font-medium text-muted">지수 없음</span>
              )}
            </p>
          </>
        ) : (
          <>
            <p className="text-xs font-semibold text-ink">최근 2주 흐름</p>
            <p className="text-[11px] tabular-nums text-muted">
              {formatShortDate(trend[0].dateKey)} — {formatShortDate(last.dateKey)}
            </p>
          </>
        )}
      </div>

      <div
        ref={box}
        role="img"
        aria-label={`최근 2주 부하 지수 흐름. ${got
          .map((p) => `${formatShortDate(p.dateKey)} ${p.ratio!.toFixed(2)}`)
          .join(', ')}`}
        className="relative mt-2 h-28 touch-pan-y select-none text-sky"
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
      >
        {size && (
          <svg
            aria-hidden
            width={w}
            height={h}
            className="absolute inset-0 overflow-visible"
          >
            {/* 적정 구간 띠 — 예전 점선 둘(0.8 · 1.3) 대신. 선이 띠 안에 있으면 괜찮다 */}
            <rect
              x={padL}
              y={y(BAND_HI)}
              width={plotW}
              height={y(BAND_LO) - y(BAND_HI)}
              rx={4}
              className="fill-current"
              fillOpacity={0.1}
            />
            {[BAND_HI, BAND_LO].map((b) => (
              <text
                key={b}
                x={w - padR + 6}
                y={y(b)}
                dominantBaseline="middle"
                className="fill-muted text-[10px] tabular-nums"
              >
                {b.toFixed(1)}
              </text>
            ))}
            {/* 바닥 */}
            <line
              x1={padL}
              x2={w - padR}
              y1={padT + plotH}
              y2={padT + plotH}
              className="stroke-line"
            />
            {/* 날짜 — 처음과 끝 */}
            <text x={padL} y={h - 3} className="fill-muted text-[10px] tabular-nums">
              {formatShortDate(trend[0].dateKey)}
            </text>
            <text
              x={w - padR}
              y={h - 3}
              textAnchor="end"
              className="fill-muted text-[10px] tabular-nums"
            >
              {formatShortDate(last.dateKey)}
            </text>

            {/* 가리킨 날 — 세로 안내선 */}
            {hover != null && (
              <line
                x1={x(hover)}
                x2={x(hover)}
                y1={padT - 4}
                y2={padT + plotH}
                className="stroke-ink/30"
              />
            )}

            <path
              d={line}
              fill="none"
              stroke="currentColor"
              strokeWidth={2}
              strokeLinecap="round"
              strokeLinejoin="round"
              pathLength={1}
              strokeDasharray="1"
              className="motion-safe:animate-[trend-draw_900ms_cubic-bezier(0.22,1,0.36,1)_both]"
            />
            {pts.map((p) => (
              <circle
                key={p.i}
                cx={p.px}
                cy={p.py}
                r={hover === p.i ? 4.5 : p === end ? 4 : 2}
                /* 고리는 끝 · 고른 점에만 — 점마다 두르면 선이 점선처럼 끊겨 보였다 */
                strokeWidth={hover === p.i || p === end ? 1.5 : 0}
                className={`stroke-surface transition-[r] duration-150 ${
                  p === end ? TONE[ACWR_ZONES[endZone].tone].fill : 'fill-current'
                }`}
              />
            ))}
          </svg>
        )}
      </div>

      <p className="mt-2 text-xs leading-relaxed break-keep text-muted">
        파란 띠가 적정 구간(0.8~1.3)이에요. 요일에 따라 오르내려요 — 훈련이 그대로여도
        던진 다음 날은 높고 이틀 쉰 날은 낮게 나와요. 하루 값보다 흐름을 보세요.
      </p>
    </div>
  );
}
