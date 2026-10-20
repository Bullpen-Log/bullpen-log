/**
 * 코치 화면의 작은 그래프(2단계) — 서버에서 그리는 SVG. 글자는 SVG 밖(HTML)에 둔다 — 폭에 맞춰 늘리는(preserveAspectRatio none)
 * 그림 안의 글자는 찌그러진다. 선수 화면의 그래프(app/(app)/coach/load-trend.tsx)는 손으로 훑는 것이라 따로 둔다.
 */

const W = 320;
const H = 80;

export function Bars({
  data,
  label,
}: {
  /** 오래된 것부터 */
  data: { key: string; value: number }[];
  /** 왼쪽 위 — 무엇의 그래프인지 */
  label?: string;
}) {
  const max = Math.max(1, ...data.map((d) => d.value));
  const bw = W / Math.max(1, data.length);
  return (
    <figure className="space-y-1">
      {label && <figcaption className="text-xs text-muted">{label}</figcaption>}
      <svg
        viewBox={`0 0 ${W} ${H}`}
        preserveAspectRatio="none"
        className="h-20 w-full"
        aria-hidden
      >
        {data.map((d, i) => {
          const h = d.value > 0 ? Math.max(2, (d.value / max) * (H - 2)) : 1.5;
          return (
            <rect
              key={d.key}
              x={i * bw + bw * 0.2}
              y={H - h}
              width={bw * 0.6}
              height={h}
              className={d.value > 0 ? 'fill-sky' : 'fill-ink/10'}
            />
          );
        })}
      </svg>
      <div className="flex justify-between text-[11px] text-muted/80">
        <span>{shortKey(data[0]?.key)}</span>
        <span>최대 {max}</span>
        <span>{shortKey(data[data.length - 1]?.key)}</span>
      </div>
    </figure>
  );
}

export function Line({
  points,
  unit = '',
  label,
  decimals = 0,
}: {
  points: { key: string; value: number }[];
  unit?: string;
  label?: string;
  decimals?: number;
}) {
  if (points.length === 0) return null;
  const vals = points.map((p) => p.value);
  const lo = Math.min(...vals);
  const hi = Math.max(...vals);
  const span = hi - lo || 1;
  const x = (i: number) =>
    points.length === 1 ? W / 2 : (i / (points.length - 1)) * (W - 8) + 4;
  const y = (v: number) => 6 + (1 - (v - lo) / span) * (H - 12);
  const d = points
    .map((p, i) => `${i === 0 ? 'M' : 'L'}${x(i).toFixed(1)},${y(p.value).toFixed(1)}`)
    .join(' ');
  const fmt = (v: number) => `${v.toFixed(decimals)}${unit}`;
  return (
    <figure className="space-y-1">
      {label && <figcaption className="text-xs text-muted">{label}</figcaption>}
      <svg
        viewBox={`0 0 ${W} ${H}`}
        preserveAspectRatio="none"
        className="h-20 w-full"
        aria-hidden
      >
        <path
          d={d}
          fill="none"
          strokeWidth={2}
          vectorEffect="non-scaling-stroke"
          className="stroke-sky"
        />
        {points.map((p, i) => (
          <circle key={p.key} cx={x(i)} cy={y(p.value)} r={2.5} className="fill-sky" />
        ))}
      </svg>
      <div className="flex justify-between text-[11px] text-muted/80">
        <span>{shortKey(points[0].key)}</span>
        <span>
          {fmt(lo)} ~ {fmt(hi)}
        </span>
        <span>{shortKey(points[points.length - 1].key)}</span>
      </div>
    </figure>
  );
}

function shortKey(key: string | undefined): string {
  if (!key) return '';
  const [, m, d] = key.split('-');
  return `${Number(m)}/${Number(d)}`;
}
