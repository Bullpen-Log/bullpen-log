'use client';

import Link from 'next/link';
import { ChevronRight } from 'lucide-react';
import { useSpeedUnit } from '@/components/use-units';
import { formatSpeed } from '@/lib/units';
import { OPEN_POPUP_TYPES } from '@/lib/transition-types';
import { LinkPending } from '@/components/link-pending';
import type { Highlight, HighlightChart } from '@/lib/report/highlights';

/**
 * 홈 캘린더 밑 '하이라이트' — 한 장에 문장 하나와 작은 그림 하나(2026-10-05 홈 정리).
 *
 * 무엇을 고를지는 lib/report/highlights.ts 가 정한다(평소와 달라진 것만, 안전 → 성장 → 꾸준함, 많아야 셋).
 * 여기서는 그리기만 한다 — 구속은 이 기기에서 고른 단위(km/h · mph)로 바꿔 끼운다.
 * 카드를 누르면 그 자세한 화면(분석 /coach · 오늘 투구 기록 창)으로 간다.
 */

/* 몇 장이냐에 따라 PC 의 칸 수 — Tailwind 는 클래스 이름을 지어 붙일 수 없어 적어 둔다 */
const DESK_COLS = ['', 'lg:grid-cols-1', 'lg:grid-cols-2', 'lg:grid-cols-3'];

export function Highlights({ items }: { items: Highlight[] }) {
  const unit = useSpeedUnit();
  if (items.length === 0) return null;

  return (
    <section aria-labelledby="highlights-title" className="space-y-3">
      <h2 id="highlights-title" className="text-heading px-1 text-xl text-ink">
        하이라이트
      </h2>
      <ul className={`grid gap-3 ${DESK_COLS[items.length] ?? DESK_COLS[3]}`}>
        {items.map((h) => {
          const text = h.text
            .replace('{speed}', formatSpeed(h.speed, unit) ?? '')
            .replace('{diff}', formatSpeed(h.diff, unit) ?? '');
          const face = (
            <>
              <span className="min-w-0 flex-1">
                <span
                  className={`block text-xs font-semibold ${h.warn ? 'text-warn' : 'text-muted'}`}
                >
                  {h.label}
                </span>
                <span className="mt-0.5 block text-[15px] leading-snug text-ink">
                  {text}
                </span>
              </span>
              {h.chart && <MiniChart chart={h.chart} warn={h.warn} />}
              {h.href && (
                /* 누른 뒤 다음 화면이 뜰 때까지 화살표 자리에서 돈다 — 눌렸는지 바로 보이게 */
                <LinkPending className="h-4 w-4 shrink-0 text-line-strong">
                  <ChevronRight
                    aria-hidden
                    className="h-4 w-4 shrink-0 text-line-strong"
                  />
                </LinkPending>
              )}
            </>
          );
          const cls =
            'flex h-full items-center gap-3 rounded-2xl border border-line bg-surface p-(--block-pad)';
          return (
            <li key={h.key + h.label}>
              {h.href ? (
                <Link
                  href={h.href}
                  transitionTypes={
                    h.href.startsWith('/pitch-log/') ? OPEN_POPUP_TYPES : undefined
                  }
                  className={`${cls} transition-colors hover:bg-surface-2/60`}
                >
                  {face}
                </Link>
              ) : (
                <div className={cls}>{face}</div>
              )}
            </li>
          );
        })}
      </ul>
    </section>
  );
}

const W = 64;
const H = 36;

/** 작은 그림 — 바탕은 옅은 회색, 지금 것(마지막)만 색을 칠한다(그림은 색 적게) */
function MiniChart({ chart, warn }: { chart: HighlightChart; warn: boolean }) {
  const tone = warn ? 'text-warn' : 'text-sky';

  if (chart.kind === 'dots') {
    return (
      <svg
        aria-hidden
        width={W}
        height={H}
        viewBox={`0 0 ${W} ${H}`}
        className="shrink-0"
      >
        {chart.values.map((on, i) => (
          <circle
            key={i}
            cx={5 + i * 9}
            cy={H / 2}
            r={3.5}
            className={on ? tone : 'text-line-strong'}
            fill={on ? 'currentColor' : 'none'}
            stroke="currentColor"
            strokeWidth={on ? 0 : 1}
          />
        ))}
      </svg>
    );
  }

  if (chart.kind === 'bars') {
    const max = Math.max(1, ...chart.values);
    const n = chart.values.length;
    const bw = 10;
    const gap = (W - bw * n) / Math.max(1, n - 1);
    return (
      <svg
        aria-hidden
        width={W}
        height={H}
        viewBox={`0 0 ${W} ${H}`}
        className="shrink-0"
      >
        {chart.values.map((v, i) => {
          const h = Math.max(2, (v / max) * (H - 2));
          return (
            <rect
              key={i}
              x={i * (bw + gap)}
              y={H - h}
              width={bw}
              height={h}
              rx={2}
              fill="currentColor"
              className={i === n - 1 ? tone : 'text-line-strong'}
            />
          );
        })}
      </svg>
    );
  }

  /* 선 — 기록이 없는 칸(null)은 건너뛰고 잇는다 */
  const pts = chart.values
    .map((v, i) => (v == null ? null : { i, v }))
    .filter((p): p is { i: number; v: number } => p != null);
  if (pts.length === 0) return null;
  /* 위아래 폭은 적어도 minSpan — 가운데에 두고 넓힌다 */
  const vLo = Math.min(...pts.map((p) => p.v));
  const vHi = Math.max(...pts.map((p) => p.v));
  const span = Math.max(vHi - vLo, chart.minSpan);
  const lo = (vLo + vHi) / 2 - span / 2;
  const hi = lo + span;
  const step = (W - 6) / Math.max(1, chart.values.length - 1);
  const xy = (p: { i: number; v: number }) => ({
    x: 3 + p.i * step,
    y: hi === lo ? H / 2 : H - 4 - ((p.v - lo) / (hi - lo)) * (H - 8),
  });
  const last = xy(pts[pts.length - 1]);
  return (
    <svg
      aria-hidden
      width={W}
      height={H}
      viewBox={`0 0 ${W} ${H}`}
      className={`shrink-0 ${tone}`}
    >
      {pts.length > 1 && (
        <polyline
          points={pts.map((p) => `${xy(p).x},${xy(p).y}`).join(' ')}
          fill="none"
          stroke="currentColor"
          strokeWidth={2}
          strokeLinecap="round"
          strokeLinejoin="round"
        />
      )}
      <circle cx={last.x} cy={last.y} r={3} fill="currentColor" />
    </svg>
  );
}
