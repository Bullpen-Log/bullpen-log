/**
 * 촬영 안내 그림 — 폰 두 대 자리(위에서 본 마운드)와 화면에 담는 법(가로 화면 셋).
 *
 * 구속 측정 설정 그림(components/velocity/setup-art.tsx)과 같은 계열: SVG · 선 굵기 2 · 둥근 끝, 채움은 테마 토큰이라
 * 어두운 테마에서도 맞는다. 글자는 SVG 안에 넣지 않는다(작아지면 못 읽는다) — 이름표는 그림 위에 HTML 로 얹는다.
 */
import type { ReactNode } from 'react';
import { CheckCircle2, CircleAlert } from '@/components/icon';

/** 그림 위 이름표 — 그림 칸 기준 % 자리. align 은 그 자리에 이름표의 어느 끝을 맞출지 */
function Tag({
  x,
  y,
  children,
  tone = 'muted',
  align = 'center',
}: {
  x: number;
  y: number;
  children: ReactNode;
  tone?: 'sky' | 'ink' | 'muted';
  align?: 'start' | 'center' | 'end';
}) {
  const color =
    tone === 'sky' ? 'text-sky' : tone === 'ink' ? 'text-ink' : 'text-muted';
  const shift =
    align === 'start' ? '' : align === 'end' ? '-translate-x-full' : '-translate-x-1/2';
  return (
    <span
      className={`absolute -translate-y-1/2 ${shift} rounded-full bg-surface/90 px-2 py-0.5 text-xs font-semibold whitespace-nowrap ${color}`}
      style={{ left: `${x}%`, top: `${y}%` }}
    >
      {children}
    </span>
  );
}

/** 폰 하나(위에서 본 모양) — angle 0 이면 렌즈가 오른쪽(+x)을 본다 */
function Phone({
  x,
  y,
  angle,
  tone,
}: {
  x: number;
  y: number;
  angle: number;
  tone: string;
}) {
  return (
    <g transform={`translate(${x} ${y}) rotate(${angle})`}>
      <rect
        x={-5}
        y={-11}
        width={10}
        height={22}
        rx={3}
        fill="var(--color-surface)"
        stroke={tone}
        strokeWidth={2}
      />
      <path d="M5 -5 h3 v10 h-3" fill={tone} />
    </g>
  );
}

const W = 320;
const H = 210;
const pct = (v: number, of: number) => (v / of) * 100;

/**
 * 폰 두 대 자리 — 위에서 본 마운드. 투수는 오른쪽 홈을 보고 던진다. 3루는 그림 아래(홈에서 마운드를 볼 때 왼쪽),
 * 2루는 투수 뒤(왼쪽). 옆 폰은 투구 방향과 직각, 뒤 폰은 투구 방향 그대로 — 두 시선이 투수에서 90°로 만난다.
 */
export function PlacementArt() {
  const P = { x: 140, y: 88 }; /* 투수(투구판 앞) */
  const home = { x: 298, y: P.y };
  const side = { x: P.x, y: 184 };
  const back = { x: 30, y: P.y };
  const corner = 16; /* 90° 표시 크기 */
  const SKY = 'var(--color-sky)';
  const INK = 'var(--color-ink)';
  return (
    <div className="relative w-full" style={{ aspectRatio: `${W} / ${H}` }}>
      <svg
        viewBox={`0 0 ${W} ${H}`}
        className="absolute inset-0 h-full w-full"
        aria-hidden
      >
        {/* 마운드 흙 · 투구판 · 홈 */}
        <ellipse cx={P.x - 4} cy={P.y} rx={44} ry={38} fill="var(--color-line)" />
        <rect
          x={P.x - 15}
          y={P.y - 7}
          width={4}
          height={14}
          rx={1}
          fill="var(--color-surface)"
          stroke={INK}
          strokeWidth={1.5}
        />
        <path
          d={`M${home.x - 7} ${home.y - 7} h9 l6 7 l-6 7 h-9 z`}
          fill="var(--color-surface)"
          stroke={INK}
          strokeWidth={1.5}
          strokeLinejoin="round"
        />
        {/* 던지는 방향 */}
        <path
          d={`M${P.x + 16} ${P.y} H${home.x - 16}`}
          stroke="var(--color-muted)"
          strokeWidth={1.5}
          strokeDasharray="4 5"
          strokeLinecap="round"
        />
        <path
          d={`M${home.x - 22} ${P.y - 5} l6 5 l-6 5`}
          fill="none"
          stroke="var(--color-muted)"
          strokeWidth={1.5}
          strokeLinecap="round"
          strokeLinejoin="round"
        />
        {/* 두 폰의 시선 — 투수에서 만난다 */}
        <path
          d={`M${back.x + 9} ${P.y} H${P.x - corner}`}
          stroke={INK}
          strokeWidth={2}
          strokeLinecap="round"
        />
        <path
          d={`M${P.x} ${side.y - 9} V${P.y + corner}`}
          stroke={SKY}
          strokeWidth={2}
          strokeLinecap="round"
        />
        {/* 90° */}
        <path
          d={`M${P.x - corner} ${P.y} V${P.y + corner} H${P.x}`}
          fill="none"
          stroke="var(--color-muted)"
          strokeWidth={1.5}
          strokeLinejoin="round"
        />
        {/* 투수(위에서 본 어깨 · 머리) — 홈을 본다 */}
        <ellipse
          cx={P.x}
          cy={P.y}
          rx={6}
          ry={12}
          fill="var(--color-surface)"
          stroke={INK}
          strokeWidth={2}
        />
        <circle cx={P.x + 1} cy={P.y} r={4} fill={INK} />
        <Phone x={back.x} y={back.y} angle={0} tone={INK} />
        <Phone x={side.x} y={side.y} angle={-90} tone={SKY} />
      </svg>
      <Tag x={pct(back.x - 8, W)} y={pct(P.y - 28, H)} tone="ink" align="start">
        뒤 폰 · 2루 쪽 4~5m
      </Tag>
      <Tag x={pct(side.x + 18, W)} y={pct(side.y, H)} tone="sky" align="start">
        옆 폰 · 3루 쪽 4~6m
      </Tag>
      <Tag x={pct(home.x, W)} y={pct(home.y - 22, H)}>
        홈
      </Tag>
      <Tag x={pct(P.x - corner - 6, W)} y={pct(P.y + corner + 12, H)} align="end">
        90°
      </Tag>
    </div>
  );
}

/** 막대 사람(옆에서 본 내딛기 · 공 놓기) — 발끝 y=50, 머리 위 y=1, 오른쪽으로 던진다 */
function Pitcher() {
  return (
    <g
      fill="none"
      stroke="var(--color-ink)"
      strokeWidth={2.4}
      strokeLinecap="round"
      strokeLinejoin="round"
    >
      <circle cx={30} cy={6} r={5} fill="var(--color-surface)" />
      <path d="M30 12 L26 28" />
      <path d="M26 28 L14 38 L4 50" />
      <path d="M26 28 L40 38 L46 50" />
      <path d="M30 14 L40 8 L50 4" />
      <path d="M30 14 L22 20 L20 26" />
    </g>
  );
}

/** 가로 화면 하나 — 사람 크기 · 자리만 다르다 */
function Frame({ id, place }: { id: string; place: string }) {
  return (
    <svg viewBox="0 0 160 90" className="block h-auto w-full" aria-hidden>
      <defs>
        <clipPath id={id}>
          <rect x={2} y={2} width={156} height={86} rx={8} />
        </clipPath>
      </defs>
      <rect x={2} y={2} width={156} height={86} rx={8} fill="var(--color-page)" />
      {/* 바닥 */}
      <path
        d="M2 74 H158"
        stroke="var(--color-line-strong)"
        strokeWidth={1.5}
        clipPath={`url(#${id})`}
      />
      <g clipPath={`url(#${id})`}>
        <g transform={place}>
          <Pitcher />
        </g>
      </g>
      <rect
        x={2}
        y={2}
        width={156}
        height={86}
        rx={8}
        fill="none"
        stroke="var(--color-muted)"
        strokeWidth={2}
      />
    </svg>
  );
}

/** 화면에 담는 법 — 알맞음 · 너무 작음 · 잘림 */
export function FramingArt() {
  const cases: { id: string; place: string; ok: boolean; label: string }[] = [
    /* 몸 높이 49/90 ≈ 화면의 절반, 던지는 쪽(오른쪽)에 여유 */
    { id: 'frame-good', place: 'translate(46 24)', ok: true, label: '알맞아요' },
    {
      id: 'frame-small',
      place: 'translate(68 53) scale(0.42)',
      ok: false,
      label: '너무 작아요',
    },
    {
      id: 'frame-cut',
      place: 'translate(112 26) scale(1.1)',
      ok: false,
      label: '손이 잘려요',
    },
  ];
  return (
    <div className="grid grid-cols-3 gap-2">
      {cases.map((c) => (
        <figure key={c.id} className="space-y-1.5">
          <Frame id={c.id} place={c.place} />
          <figcaption
            className={`flex items-center justify-center gap-1 text-xs font-semibold ${c.ok ? 'text-ok' : 'text-danger'}`}
          >
            {c.ok ? (
              <CheckCircle2 aria-hidden className="h-3.5 w-3.5" />
            ) : (
              <CircleAlert aria-hidden className="h-3.5 w-3.5" />
            )}
            {c.label}
          </figcaption>
        </figure>
      ))}
    </div>
  );
}
