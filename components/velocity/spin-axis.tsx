'use client';

import type { CSSProperties } from 'react';
import { pitchTypeLabel } from '@/lib/velocity-meta';
import { spinAxisFor } from '@/lib/velocity-spin';
import type { ThrowingHand } from './session-types';

/**
 * 회전축 그림 — 고른 구종 + 던지는 손으로 정한 "전형적인 회전축"(lib/velocity-spin.ts).
 * 카메라는 회전을 재지 못하므로 짐작이다 — 옆에 SpinAxisNote 를 같이 둔다.
 *
 * 그리는 법: 시계 12시가 위, 시계 방향이 양수(투수가 홈을 보는 기준). 공 · 실밥 · 축 · 회전 화살표를
 * 한 묶음(<g>)으로 두고 묶음째 tiltDeg 만큼 돌린다 — 그래서 구종이 바뀌면 CSS transition 으로 축이
 * 부드럽게 돈다. 돌리기 전 모양은 순수 백스핀(12:00): 축은 가로 지름, 화살표 호는 12시 쪽.
 * 12시 눈금과 시계 글자는 돌지 않는다 — 기준이 어디인지 보여야 한다.
 */

/* viewBox 120×120. 공은 조금 아래에 두고 위 여백에 12시 눈금 · 시계 글자를 놓는다 */
const CX = 60;
const CY = 66;
const R = 34;
/** 축 끝 점 — 공 테두리 바로 밖 */
const AXIS_R = R + 3;
/** 회전 화살표 호 — 공 밖, 12시 양옆으로 ±ARC_HALF° */
const ARC_R = R + 9;
const ARC_HALF = 60;

/** 시계 각(12시 = 0°, 시계 방향) → 좌표. SVG 는 y 가 아래로 자란다 */
function polar(r: number, deg: number): [number, number] {
  const a = (deg * Math.PI) / 180;
  return [round2(CX + r * Math.sin(a)), round2(CY - r * Math.cos(a))];
}

const round2 = (n: number) => Math.round(n * 100) / 100;

/**
 * 회전 방향 호 — 12시를 가운데 두고 ±ARC_HALF°. 우투는 시계 방향으로(오른쪽 끝에 화살촉), 좌투는
 * 거울이라 반시계로. 화살촉은 끝점에서 호의 접선 방향으로 놓는다 — 시계 각 θ 에서 시계 방향 접선은
 * (cosθ, sinθ) 라 x 축 기준 θ° 회전, 반시계면 반대(θ+180°).
 */
function arrowArc(dir: 1 | -1) {
  const [sx, sy] = polar(ARC_R, -dir * ARC_HALF);
  const [ex, ey] = polar(ARC_R, dir * ARC_HALF);
  return {
    d: `M${sx} ${sy} A${ARC_R} ${ARC_R} 0 0 ${dir === 1 ? 1 : 0} ${ex} ${ey}`,
    head: `translate(${ex} ${ey}) rotate(${dir === 1 ? ARC_HALF : 180 - ARC_HALF})`,
  };
}

/** 원점을 viewBox 좌표의 공 중심으로 — 돌리기 · 나타날 때 scale 이 공 중심을 기준으로 하게 */
const originStyle: CSSProperties = {
  transformOrigin: `${CX}px ${CY}px`,
  transformBox: 'view-box',
};

/** 돌리는 묶음 — CSS transform 이라 transition 이 먹는다 */
const spinStyle = (deg: number): CSSProperties => ({
  ...originStyle,
  transform: `rotate(${deg}deg)`,
});

export function SpinAxisGraphic({
  pitchType,
  hand,
  size = 120,
  tone = 'dark',
  showLabel = true,
}: {
  pitchType: string | null;
  hand: ThrowingHand;
  size?: number;
  tone?: 'dark' | 'light';
  showLabel?: boolean;
}) {
  const axis = spinAxisFor(pitchType, hand);
  const dark = tone === 'dark';
  const typeLabel = pitchTypeLabel(pitchType);
  const handLabel = hand === 'left' ? '좌투' : '우투';
  /* 작게 그릴 때(목록 줄 등)는 시계 글자가 못 읽을 크기라 뺀다 */
  const small = size < 80;
  const arc = arrowArc(hand === 'left' ? -1 : 1);
  const label = axis
    ? `${typeLabel} · 회전축 ${axis.clock} · 효율 ${axis.efficiencyPct}% (${handLabel} 기준 전형값)`
    : '구종을 고르면 회전축이 보여요';

  return (
    <div
      className={`flex flex-col items-center text-center ${dark ? 'text-white' : 'text-ink'}`}
    >
      <svg
        role="img"
        aria-label={label}
        viewBox="0 0 120 120"
        width={size}
        height={size}
        className="shrink-0"
      >
        {/* 12시 눈금 + 시계 글자 — 돌지 않는 기준 */}
        {!small && (
          <line
            x1={CX}
            y1={12}
            x2={CX}
            y2={18}
            stroke="currentColor"
            strokeOpacity={axis ? 0.7 : 0.3}
            strokeWidth={2}
            strokeLinecap="round"
          />
        )}
        {!small && axis && (
          <text
            key={axis.clock}
            x={CX + 5}
            y={17}
            fontSize={10}
            fontWeight={600}
            fill="currentColor"
            className="tabular-nums motion-safe:animate-fade-in"
          >
            {axis.clock}
          </text>
        )}

        <g
          style={spinStyle(axis?.tiltDeg ?? 0)}
          className="motion-safe:transition-transform motion-safe:duration-500 motion-safe:ease-out"
        >
          {/* 공 — 구종이 없으면 흐리게 */}
          <circle
            cx={CX}
            cy={CY}
            r={R}
            fill="currentColor"
            fillOpacity={dark ? 0.06 : 0.04}
            stroke="currentColor"
            strokeOpacity={axis ? 0.75 : 0.3}
            strokeWidth={1.8}
            className="transition-[stroke-opacity]"
          />
          {/* 실밥 둘 — 로고(velocity-logo.tsx)와 같은 모양을 4배로 */}
          <g
            fill="none"
            stroke="currentColor"
            strokeOpacity={axis ? 0.5 : 0.2}
            strokeWidth={1.6}
            strokeLinecap="round"
            className="transition-[stroke-opacity]"
          >
            <path d="M38.4 41.2c10.4 11.2 10.4 38.4 0 49.6" />
            <path d="M81.6 41.2c-10.4 11.2-10.4 38.4 0 49.6" />
            <g strokeWidth={1.2}>
              <path d="M40 51.6 49.6 54M41.6 62.8 51.6 64.4M41.6 69.2 51.6 67.6M40 80.4 49.6 78" />
              <path d="M80 51.6 70.4 54M78.4 62.8 68.4 64.4M78.4 69.2 68.4 67.6M80 80.4 70.4 78" />
            </g>
          </g>

          {axis && (
            <g style={originStyle} className="motion-safe:animate-fade-in">
              {/* 축 — 지름선 굵게, 양 끝에 점 */}
              <line
                x1={CX - AXIS_R}
                y1={CY}
                x2={CX + AXIS_R}
                y2={CY}
                stroke="currentColor"
                strokeWidth={3}
                strokeLinecap="round"
              />
              <circle cx={CX - AXIS_R} cy={CY} r={3} fill="currentColor" />
              <circle cx={CX + AXIS_R} cy={CY} r={3} fill="currentColor" />
              {/* 회전 방향 — 축과 직각인 호 + 화살촉. 하늘색으로 강조 */}
              <g className="text-sky">
                <path
                  d={arc.d}
                  fill="none"
                  stroke="currentColor"
                  strokeWidth={2.2}
                  strokeLinecap="round"
                />
                <polygon
                  points="0,-4.5 7,0 0,4.5"
                  fill="currentColor"
                  transform={arc.head}
                />
              </g>
            </g>
          )}
        </g>
      </svg>

      {showLabel &&
        (axis ? (
          <div key={pitchType} className="mt-2 motion-safe:animate-fade-in">
            <p
              className={`text-xs font-medium tabular-nums ${dark ? 'text-white/80' : 'text-ink'}`}
            >
              {axis.clock} · 효율 {axis.efficiencyPct}% · {axis.rpm[0]}~{axis.rpm[1]}rpm
            </p>
            <p className={`mt-0.5 text-xs ${dark ? 'text-white/55' : 'text-muted'}`}>
              {axis.movement}
            </p>
          </div>
        ) : (
          <p className={`mt-2 text-xs ${dark ? 'text-white/55' : 'text-muted'}`}>
            구종을 고르면 회전축이 보여요
          </p>
        ))}
    </div>
  );
}

/** 짐작임을 밝히는 한 줄 — 그림 가까이에 꼭 둔다 */
export function SpinAxisNote({ tone = 'dark' }: { tone?: 'dark' | 'light' }) {
  return (
    <p className={`text-xs ${tone === 'dark' ? 'text-white/55' : 'text-muted'}`}>
      회전축은 구종 기준 전형값이에요 — 카메라는 회전을 재지 않아요
    </p>
  );
}
