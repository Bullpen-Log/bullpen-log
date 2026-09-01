'use client';

import { useMemo } from 'react';
import type { RotationSeries } from '@/lib/pose/rotation';

/**
 * 골반과 어깨가 언제 열리는지 보는 곡선.
 *
 * 세 순간의 각도 숫자로는 순서가 안 보인다. 골반선이 어깨선보다 먼저 올라가면
 * 아래에서 위로 힘이 간 것이고, 둘이 붙어서 함께 올라가면 몸통을 비틀어 모은
 * 힘 없이 팔로만 던진 것이다.
 *
 * 재생 위치를 세로선으로 따라 그린다. 영상에서 지금 보고 있는 자세가 곡선의
 * 어디인지 이어져야 두 화면이 한 이야기가 된다.
 */

type EventMark = { key: string; label: string; t: number | null };

const HIP = 'var(--color-cat-power)';
const SHOULDER = 'var(--color-sky)';

export function RotationChart({
  series,
  now,
  events,
  onSeek,
}: {
  series: RotationSeries;
  /** 지금 재생 위치(초) */
  now: number;
  /** 니업·착지·릴리스 — 아직 못 잡은 것은 t 가 null */
  events: EventMark[];
  /** 곡선을 누르면 그 시각으로 옮긴다 */
  onSeek?: (t: number) => void;
}) {
  const { points } = series;

  const geom = useMemo(() => {
    if (points.length < 2) return null;
    const t0 = points[0].t;
    const t1 = points[points.length - 1].t;
    const span = Math.max(0.001, t1 - t0);

    /* 위아래는 두 곡선이 다 들어가게 잡고, 0도 선은 항상 보이게 둔다 */
    let lo = 0;
    let hi = 0;
    for (const p of points) {
      lo = Math.min(lo, p.hip, p.shoulder);
      hi = Math.max(hi, p.hip, p.shoulder);
    }
    const pad = Math.max(10, (hi - lo) * 0.12);
    lo -= pad;
    hi += pad;

    const x = (t: number) => ((t - t0) / span) * 100;
    const y = (deg: number) => ((hi - deg) / Math.max(1, hi - lo)) * 100;
    const path = (pick: (p: (typeof points)[number]) => number) =>
      points.map((p, i) => `${i ? 'L' : 'M'}${x(p.t).toFixed(2)},${y(pick(p)).toFixed(2)}`).join(' ');

    return { t0, t1, span, lo, hi, x, y, hip: path((p) => p.hip), shoulder: path((p) => p.shoulder) };
  }, [points]);

  if (!geom) {
    return (
      <p className="rounded-xl border border-dashed border-line px-4 py-6 text-center text-[11px] leading-relaxed text-muted">
        골반·어깨 회전을 읽을 수 있는 구간이 없습니다. 옆에서, 전신이 크게 나오게
        찍으면 잡힙니다.
      </p>
    );
  }

  const nowX = Math.max(0, Math.min(100, geom.x(now)));

  return (
    <div className="space-y-2">
      <div className="flex flex-wrap items-center gap-x-4 gap-y-1">
        <Legend color={HIP} label="골반" />
        <Legend color={SHOULDER} label="어깨" />
        <span className="ml-auto text-[11px] text-muted/70">
          시작 자세에서 얼마나 돌았나
        </span>
      </div>

      <svg
        viewBox="0 0 100 100"
        preserveAspectRatio="none"
        role="img"
        aria-label="골반과 어깨가 시간에 따라 돈 각도"
        className={`h-32 w-full rounded-xl border border-line bg-surface-2 ${
          onSeek ? 'cursor-crosshair' : ''
        }`}
        onClick={(e) => {
          if (!onSeek) return;
          const box = e.currentTarget.getBoundingClientRect();
          const ratio = (e.clientX - box.left) / box.width;
          onSeek(geom.t0 + ratio * geom.span);
        }}
      >
        {/* 0도 — 시작 자세 */}
        <line
          x1="0"
          x2="100"
          y1={geom.y(0)}
          y2={geom.y(0)}
          stroke="var(--color-line-strong)"
          strokeWidth="0.4"
          vectorEffect="non-scaling-stroke"
          strokeDasharray="3 3"
        />

        {/* 니업·착지·릴리스 */}
        {events.map((e) =>
          e.t == null ? null : (
            <line
              key={e.key}
              x1={geom.x(e.t)}
              x2={geom.x(e.t)}
              y1="0"
              y2="100"
              stroke="var(--color-line-strong)"
              strokeWidth="0.4"
              vectorEffect="non-scaling-stroke"
            />
          )
        )}

        <path
          d={geom.hip}
          fill="none"
          stroke={HIP}
          strokeWidth="1.6"
          vectorEffect="non-scaling-stroke"
          strokeLinejoin="round"
          strokeLinecap="round"
        />
        <path
          d={geom.shoulder}
          fill="none"
          stroke={SHOULDER}
          strokeWidth="1.6"
          vectorEffect="non-scaling-stroke"
          strokeLinejoin="round"
          strokeLinecap="round"
        />

        {/* 지금 보고 있는 자리 */}
        <line
          x1={nowX}
          x2={nowX}
          y1="0"
          y2="100"
          stroke="var(--color-ink)"
          strokeWidth="1"
          vectorEffect="non-scaling-stroke"
        />
      </svg>

      {/* 구간 이름은 그림 밖에 둔다 — 안에 넣으면 곡선을 가린다 */}
      <div className="relative h-4">
        {events.map((e) =>
          e.t == null ? null : (
            <span
              key={e.key}
              className="absolute -translate-x-1/2 text-[10px] whitespace-nowrap text-muted"
              style={{ left: `${geom.x(e.t)}%` }}
            >
              {e.label}
            </span>
          )
        )}
      </div>
    </div>
  );
}

function Legend({ color, label }: { color: string; label: string }) {
  return (
    <span className="inline-flex items-center gap-1.5 text-[11px] text-muted">
      <span
        aria-hidden
        className="inline-block h-0.5 w-4 rounded-full"
        style={{ background: color }}
      />
      {label}
    </span>
  );
}
