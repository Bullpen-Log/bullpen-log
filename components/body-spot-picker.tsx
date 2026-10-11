'use client';

import { useState } from 'react';
import { X } from 'lucide-react';
import {
  SPOT_DEFS,
  SPOT_LEVELS,
  spotId,
  spotLabel,
  type BodySpots,
  type SpotDef,
  type SpotLevel,
  type SpotSide,
} from '@/lib/body-spots';

/*
 * 근육 모양 — 120 × 250 판의 '보는 사람 왼쪽' 반쪽만 적고, 오른쪽 반쪽은 거울로 그린다(x → 120 - x).
 * 가운데 하나뿐인 것(배 · 허리 · 목)은 그대로. 앞모습은 보는 사람 왼쪽이 그 사람의 오른쪽, 뒷모습은 반대다.
 * 3D 몸(1.9MB)은 매일 여는 체크인에는 무거워 2D 로 둔다.
 */
type Shape =
  | { e: [number, number, number, number] }
  | { r: [number, number, number, number, number] }
  | { d: string };

const SHAPES: Record<string, Shape> = {
  deltFront: { e: [35, 47, 9, 9] },
  chest: { r: [42, 40, 17, 22, 5] },
  biceps: { e: [30, 70, 6, 13] },
  elbowIn: { e: [27, 88, 5, 5] },
  forearmIn: { e: [24, 106, 5, 12] },
  wrist: { e: [21, 126, 5, 6] },
  abs: { r: [47, 65, 26, 31, 6] },
  oblique: { r: [40, 65, 6, 29, 3] },
  hipFront: { r: [42, 99, 17, 13, 5] },
  quad: { e: [49, 137, 9, 21] },
  knee: { e: [49, 165, 6, 6] },
  shin: { e: [49, 190, 6, 17] },
  ankle: { e: [49, 216, 7, 5] },
  traps: { d: 'M50 30 L70 30 L84 41 L36 41 Z' },
  deltBack: { e: [35, 47, 9, 9] },
  scapula: { r: [42, 43, 16, 22, 5] },
  triceps: { e: [30, 70, 6, 13] },
  elbowOut: { e: [27, 88, 5, 5] },
  forearmOut: { e: [24, 106, 5, 12] },
  lowBack: { r: [44, 69, 32, 28, 6] },
  glute: { e: [50, 108, 10, 10] },
  hamstring: { e: [49, 141, 9, 21] },
  calf: { e: [49, 187, 7, 16] },
};

function ShapeEl({
  shape,
  mirror,
  ...rest
}: { shape: Shape; mirror: boolean } & React.SVGProps<SVGElement>) {
  const mx = (x: number) => (mirror ? 120 - x : x);
  const p = rest as React.SVGProps<SVGPathElement>;
  if ('e' in shape) {
    const [cx, cy, rx, ry] = shape.e;
    return <ellipse cx={mx(cx)} cy={cy} rx={rx} ry={ry} {...(p as object)} />;
  }
  if ('r' in shape) {
    const [x, y, w, h, rr] = shape.r;
    return <rect x={mirror ? 120 - x - w : x} y={y} width={w} height={h} rx={rr} {...(p as object)} />;
  }
  return <path d={shape.d} {...p} />;
}

/* 몸 윤곽 — 누르는 자리가 아니라 바탕 */
function Silhouette() {
  return (
    <g className="fill-ink/6">
      <circle cx="60" cy="16" r="12" />
      <rect x="54" y="26" width="12" height="10" rx="3" />
      <rect x="37" y="36" width="46" height="66" rx="14" />
      <rect x="40" y="96" width="40" height="22" rx="8" />
      {[false, true].map((m) => (
        <g key={String(m)} transform={m ? 'matrix(-1 0 0 1 120 0)' : undefined}>
          <rect x="22" y="40" width="16" height="92" rx="8" transform="rotate(8 30 40)" />
          <rect x="40" y="112" width="18" height="114" rx="9" />
        </g>
      ))}
    </g>
  );
}

const FILL: Record<SpotLevel, string> = {
  뻐근: 'fill-amber-500/70',
  통증: 'fill-danger/80',
};

function Figure({
  view,
  spots,
  active,
  onTap,
}: {
  view: 'front' | 'back';
  spots: BodySpots;
  active: string | null;
  onTap: (id: string) => void;
}) {
  const defs = SPOT_DEFS.filter((d) => d.view === view);
  /* 앞모습: 보는 사람 왼쪽 = 그 사람 오른쪽. 뒷모습은 반대 */
  const sides = (d: SpotDef): { side: SpotSide; mirror: boolean }[] =>
    !d.paired
      ? [{ side: 'C', mirror: false }]
      : view === 'front'
        ? [
            { side: 'R', mirror: false },
            { side: 'L', mirror: true },
          ]
        : [
            { side: 'L', mirror: false },
            { side: 'R', mirror: true },
          ];
  return (
    <figure className="flex flex-col items-center">
      <svg viewBox="0 0 120 232" className="h-64 w-auto desk:h-56" role="group" aria-label={view === 'front' ? '앞모습' : '뒷모습'}>
        <Silhouette />
        {defs.flatMap((d) =>
          sides(d).map(({ side, mirror }) => {
            const id = spotId(side, d.key);
            const level = spots[id];
            const on = active === id;
            return (
              <ShapeEl
                key={id}
                shape={SHAPES[d.key]}
                mirror={mirror}
                role="button"
                tabIndex={0}
                aria-label={`${spotLabel(id)}${level ? `, ${level}` : ''}`}
                aria-pressed={level != null}
                onClick={() => onTap(id)}
                onKeyDown={(e) => {
                  if (e.key === 'Enter' || e.key === ' ') {
                    e.preventDefault();
                    onTap(id);
                  }
                }}
                className={`cursor-pointer outline-none transition-colors ${
                  level ? FILL[level] : 'fill-ink/14 hover:fill-sky/30'
                } ${on ? 'stroke-sky stroke-2' : 'stroke-surface stroke-1'} focus-visible:stroke-sky focus-visible:stroke-2`}
              />
            );
          })
        )}
      </svg>
      <figcaption className="text-[11px] text-muted">{view === 'front' ? '앞' : '뒤'}</figcaption>
    </figure>
  );
}

/**
 * 몸 그림에서 불편한 근육 고르기 — 누르면 '뻐근'으로 골라지고, 밑 줄에서 정도를 바꾸거나 뺀다.
 * 값은 부모가 쥔다(체크인 폼이 부위 칸을 여기서 계산해 보낸다 — lib/body-spots.ts partsFromSpots).
 */
export function BodySpotPicker({
  spots,
  onChange,
}: {
  spots: BodySpots;
  onChange: (next: BodySpots) => void;
}) {
  const [active, setActive] = useState<string | null>(null);
  const tap = (id: string) => {
    setActive(id);
    if (!spots[id]) onChange({ ...spots, [id]: '뻐근' });
  };
  const set = (id: string, level: SpotLevel | null) => {
    const next = { ...spots };
    if (level) next[id] = level;
    else delete next[id];
    onChange(next);
    if (!level) setActive(null);
  };
  const picked = Object.keys(spots);
  const activeLevel = active ? spots[active] : undefined;

  return (
    <div className="space-y-3">
      <div className="flex justify-center gap-2">
        <Figure view="front" spots={spots} active={active} onTap={tap} />
        <Figure view="back" spots={spots} active={active} onTap={tap} />
      </div>

      {active && activeLevel ? (
        <div className="flex flex-wrap items-center gap-2 rounded-xl bg-surface px-3 py-2 desk:border desk:border-line">
          <span className="text-sm font-semibold text-ink">{spotLabel(active)}</span>
          <div className="ml-auto flex gap-1.5" role="radiogroup" aria-label="얼마나 불편해요?">
            {SPOT_LEVELS.map((lv) => (
              <button
                key={lv}
                type="button"
                role="radio"
                aria-checked={activeLevel === lv}
                onClick={() => set(active, lv)}
                className={`inline-flex min-h-10 items-center rounded-full px-3.5 text-[13px] transition-colors desk:min-h-0 desk:py-1 desk:text-xs ${
                  activeLevel === lv
                    ? lv === '통증'
                      ? 'bg-danger-bg font-semibold text-danger'
                      : 'bg-amber-500/15 font-semibold text-warn'
                    : 'bg-ink/6 text-ink/80'
                }`}
              >
                {lv === '뻐근' ? '뻐근해요' : '아파요'}
              </button>
            ))}
            <button
              type="button"
              onClick={() => set(active, null)}
              className="inline-flex min-h-10 items-center rounded-full bg-ink/6 px-3 text-[13px] text-muted desk:min-h-0 desk:py-1 desk:text-xs"
            >
              빼기
            </button>
          </div>
        </div>
      ) : (
        <p className="text-center text-xs text-muted">
          {picked.length ? '고른 곳을 누르면 정도를 바꿀 수 있어요.' : '불편한 근육을 눌러 주세요.'}
        </p>
      )}

      {picked.length > 0 && (
        <ul className="flex flex-wrap gap-1.5">
          {picked.map((id) => (
            <li key={id}>
              <span
                className={`inline-flex min-h-9 items-center gap-1 rounded-full pr-1 pl-3 text-xs font-medium ${
                  spots[id] === '통증' ? 'bg-danger-bg text-danger' : 'bg-amber-500/15 text-warn'
                }`}
              >
                <button type="button" onClick={() => setActive(id)}>
                  {spotLabel(id)} {spots[id]}
                </button>
                <button
                  type="button"
                  aria-label={`${spotLabel(id)} 빼기`}
                  onClick={() => set(id, null)}
                  className="grid h-7 w-7 place-items-center rounded-full"
                >
                  <X aria-hidden className="h-3.5 w-3.5" />
                </button>
              </span>
            </li>
          ))}
        </ul>
      )}
    </div>
  );
}
