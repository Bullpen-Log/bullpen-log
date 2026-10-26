'use client';

import { useId } from 'react';
import type { ConditionBand } from '@/lib/checkin';
import { MARK_PATH, MARK_VIEWBOX } from '@/components/logo';

import {
  CONDITION_VISUAL_STAGES,
  conditionVisualStage,
  type ConditionVisualLevel,
} from './condition-visual';

/** 앱 이름표와 같은 원본 로고 경로를 재사용한다. */
function UniformMark({ x, y, size }: { x: number; y: number; size: number }) {
  return (
    <svg
      x={x}
      y={y}
      width={size}
      height={size}
      viewBox={MARK_VIEWBOX}
      focusable="false"
    >
      <path d={MARK_PATH} fill="#ffffff" />
    </svg>
  );
}

/** 컨디션마다 자세·표정이 다른 같은 야구 선수. 유니폼 색은 상태와 관계없이 유지한다. */
function Figure({ level, id }: { level: ConditionVisualLevel; id: string }) {
  const veryLow = level === 'very-low';
  const low = level === 'low';
  const good = level === 'good';
  const excellent = level === 'excellent';
  const tired = low || veryLow;
  const lean = veryLow
    ? 'rotate(8 72 134)'
    : low
      ? 'rotate(4 72 134)'
      : excellent
        ? 'rotate(-3 72 134)'
        : undefined;
  const torso = veryLow
    ? 'M57 66 Q72 73 87 67 Q99 72 104 86 L94 92 L92 123 Q72 131 51 124 L50 92 L40 87 Q43 72 57 66 Z'
    : low
      ? 'M57 63 Q72 68 87 64 Q99 67 105 82 L94 90 L93 123 Q72 129 51 123 L50 90 L39 84 Q43 68 57 63 Z'
      : 'M57 59 Q72 62 86 59 Q99 63 106 78 L95 87 L93 121 Q73 127 51 121 L49 87 L38 79 Q43 64 57 59 Z';
  const leftArm = veryLow
    ? 'M46 82 Q33 105 46 130'
    : low
      ? 'M46 79 Q36 100 41 128'
      : good || excellent
        ? 'M46 76 Q29 91 35 108 L48 119'
        : 'M46 77 Q34 98 39 122 L40 132';
  const rightArm = veryLow
    ? 'M98 83 Q109 105 99 133'
    : low
      ? 'M98 80 Q113 100 104 127'
      : excellent
        ? 'M99 75 L115 91 Q123 83 121 64'
        : good
          ? 'M98 76 Q114 91 108 108 L96 119'
          : 'M98 77 Q109 99 104 123 L103 132';
  return (
    <>
      <defs>
        <linearGradient id={`${id}-jersey`} x1="0" y1="0" x2=".9" y2="1">
          <stop stopColor="#69d2ff" />
          <stop offset=".5" stopColor="#29b7f2" />
          <stop offset="1" stopColor="#0795dc" />
        </linearGradient>
        <linearGradient id={`${id}-pants`} x1="0" y1="0" x2=".9" y2="1">
          <stop stopColor="#ffffff" />
          <stop offset=".5" stopColor="#f0f5fa" />
          <stop offset="1" stopColor="#c1d0df" />
        </linearGradient>
        <linearGradient id={`${id}-skin`} x1="0" y1="0" x2=".85" y2="1">
          <stop stopColor="#f5dac8" />
          <stop offset="1" stopColor="#dba98e" />
        </linearGradient>
        <linearGradient id={`${id}-cap`} x1="0" y1="0" x2="1" y2="1">
          <stop stopColor="#38c2ff" />
          <stop offset="1" stopColor="#058fd8" />
        </linearGradient>
        <clipPath id={`${id}-torso`}>
          <path d={torso} />
        </clipPath>
      </defs>
      <ellipse cx="72" cy="112" rx="59" ry="77" fill="currentColor" opacity=".065" />
      <ellipse cx="73" cy="212" rx="39" ry="4" fill="currentColor" opacity=".13" />
      <g transform={lean}>
        {/* 유니폼 바지 · 옆선 · 스타킹 · 스파이크 */}
        <path
          d="M51 119 L72 121 L68 164 L63 191 H50 L51 161 Z"
          fill={`url(#${id}-pants)`}
        />
        <path
          d="M72 121 L93 119 L94 161 L100 191 H86 L77 163 Z"
          fill={`url(#${id}-pants)`}
        />
        <path
          d="M53 131 L55 162 L54 188 M90 131 L90 160 L96 188"
          fill="none"
          stroke="#37a8df"
          strokeWidth="1.7"
          strokeLinecap="round"
        />
        <path d="M50 183 H64 L63 202 H50 Z M85 183 H98 L101 201 H87 Z" fill="#0989cd" />
        <path d="M50 189 H64 M87 189 H99" stroke="#85d9ff" strokeWidth="2" />
        <path
          d="M50 199 L63 199 L67 207 Q67 212 60 212 H41 Q36 210 41 205 Z M86 199 L100 198 L108 205 Q113 211 106 212 H88 Q84 211 85 206 Z"
          fill="#145c8b"
        />
        <path
          d="M42 211 H65 M87 211 H108"
          stroke="#dbe6ef"
          strokeWidth="2"
          strokeLinecap="round"
        />
        <path
          d="M51 204 H59 M91 204 H99"
          stroke="#fff"
          strokeWidth="1.5"
          strokeLinecap="round"
        />
        {/* 언더셔츠와 손 — 최상 단계에는 엄지를 들어 자세 차이도 명확하게. */}
        <path
          d={leftArm}
          fill="none"
          stroke="#159fe0"
          strokeWidth="13"
          strokeLinecap="round"
          strokeLinejoin="round"
        />
        <path
          d={rightArm}
          fill="none"
          stroke="#159fe0"
          strokeWidth="13"
          strokeLinecap="round"
          strokeLinejoin="round"
        />
        <ellipse
          cx={veryLow ? 46 : low ? 41 : good || excellent ? 48 : 40}
          cy={veryLow ? 130 : low ? 128 : good || excellent ? 119 : 132}
          rx="6.6"
          ry="7.7"
          fill={`url(#${id}-skin)`}
        />
        {excellent ? (
          <g fill={`url(#${id}-skin)`}>
            <rect x="115" y="59" width="13" height="13" rx="5" />
            <path d="M116 63 L114 56 Q114 50 118 51 Q121 52 120 57 L124 61 Z" />
          </g>
        ) : (
          <ellipse
            cx={veryLow ? 99 : low ? 104 : good ? 96 : 103}
            cy={veryLow ? 133 : low ? 127 : good ? 119 : 132}
            rx="6.6"
            ry="7.7"
            fill={`url(#${id}-skin)`}
          />
        )}
        <path d={torso} fill={`url(#${id}-jersey)`} />
        <g
          clipPath={`url(#${id}-torso)`}
          stroke="#ffffff"
          strokeWidth=".85"
          opacity=".25"
        >
          <path d="M48 62 V126 M57 62 V128 M65 62 V128 M80 62 V128 M89 62 V128 M98 62 V128" />
        </g>
        <path
          d={
            tired
              ? 'M62 65 Q72 75 84 65 L78 80 H69 Z'
              : 'M61 60 Q72 71 84 60 L78 74 H69 Z'
          }
          fill="#087fc0"
        />
        <path
          d={
            tired
              ? 'M64 65 L72 75 L72 120 M81 65 L72 75'
              : 'M64 61 L72 70 L72 120 M81 61 L72 70'
          }
          fill="none"
          stroke="#e8f8ff"
          strokeWidth="1.3"
        />
        <g fill="#e8f8ff">
          <circle cx="73" cy="84" r="1.2" />
          <circle cx="73" cy="95" r="1.2" />
          <circle cx="73" cy="106" r="1.2" />
        </g>
        <path
          d="M40 79 L49 85 M96 84 L104 78"
          stroke="#dcf5ff"
          strokeWidth="3"
          strokeLinecap="round"
        />
        <UniformMark x={79} y={77} size={11} />
        <path
          d={veryLow ? 'M52 123 Q72 128 92 122' : 'M52 120 Q72 125 92 120'}
          fill="none"
          stroke="#203d58"
          strokeWidth="5"
        />
        <rect
          x="69"
          y={veryLow ? 122 : 119}
          width="8"
          height="6"
          rx="1"
          fill="#a7b9c9"
          stroke="#203d58"
          strokeWidth="1"
        />
        <path d="M65 48 H80 V63 Q72 70 64 62 Z" fill={`url(#${id}-skin)`} />
        <g
          transform={
            veryLow
              ? 'translate(0 6) rotate(15 72 35)'
              : low
                ? 'translate(0 2) rotate(7 72 35)'
                : excellent
                  ? 'rotate(-4 72 35)'
                  : undefined
          }
        >
          <ellipse cx="54" cy="36" rx="3.5" ry="5" fill="#deae93" />
          <ellipse cx="90" cy="36" rx="3.5" ry="5" fill="#deae93" />
          <path
            d="M54 27 Q54 12 72 12 Q90 12 90 28 L88 43 Q85 55 72 57 Q59 55 56 43 Z"
            fill={`url(#${id}-skin)`}
          />
          <path
            d="M54 32 L52 25 Q53 10 72 9 Q91 10 92 25 L90 33 L85 27 L58 27 Z"
            fill="#1d344b"
          />
          {/* 앱과 같은 아래 화살표 S 로고를 모자에도 넣는다. */}
          <path d="M51 25 Q51 7 72 6 Q92 7 93 25 Z" fill={`url(#${id}-cap)`} />
          <path
            d="M72 8 V23 M57 12 Q53 18 54 24 M87 12 Q92 19 90 24"
            fill="none"
            stroke="#fff"
            strokeOpacity=".16"
            strokeWidth="1"
          />
          <path d="M51 24 Q72 20 93 24 L99 30 Q78 34 54 29 Z" fill="#087fc0" />
          <UniformMark x={67} y={10} size={11} />
          <g fill="none" stroke="#4b423d" strokeWidth="1.8" strokeLinecap="round">
            {excellent ? (
              <path d="M61 36 Q65 32 69 36 M76 36 Q80 32 84 36" />
            ) : veryLow ? (
              <path d="M62 38 L68 39 M77 39 L83 38 M61 34 L67 36 M78 36 L84 34" />
            ) : low ? (
              <path d="M63 37 H68 M77 37 H82 M63 33 L68 34 M77 34 L82 33" />
            ) : good ? (
              <path d="M65 35 V36 M79 35 V36" />
            ) : (
              <path d="M65 36 V37 M79 36 V37" />
            )}
            <path
              d={
                excellent
                  ? 'M66 44 Q72 52 79 43'
                  : veryLow
                    ? 'M67 49 Q72 43 78 49'
                    : low
                      ? 'M68 47 Q73 44 77 47'
                      : good
                        ? 'M67 44 Q72 49 78 43'
                        : 'M68 46 H77'
              }
            />
          </g>
          <path
            d="M72 37 L70 42 H73"
            fill="none"
            stroke="#bc8a72"
            strokeWidth="1.2"
            strokeLinecap="round"
          />
          <ellipse cx="62" cy="43" rx="3" ry="1.6" fill="#e49c8e" opacity=".35" />
          <ellipse cx="82" cy="43" rx="3" ry="1.6" fill="#e49c8e" opacity=".35" />
        </g>
      </g>
      {excellent && (
        <g
          fill="none"
          stroke="currentColor"
          strokeWidth="2"
          strokeLinecap="round"
          opacity=".7"
        >
          <path d="M113 30 L118 24 M123 41 H130 M104 21 V14 M21 48 L17 44" />
        </g>
      )}
      {veryLow && (
        <g
          fill="none"
          stroke="currentColor"
          strokeWidth="2"
          strokeLinecap="round"
          opacity=".5"
        >
          <path d="M112 43 Q119 48 112 53 M118 37 Q129 48 118 59 M24 70 Q18 73 22 78" />
        </g>
      )}
    </>
  );
}

/** score가 있으면 5단계. band는 앞선 3단계 호출부와의 호환용이다. */
export function OutlinePerson({
  score,
  band,
  className,
}: {
  score?: number | null;
  band?: ConditionBand;
  className?: string;
}) {
  const id = useId().replace(/:/g, '');
  const stage = conditionVisualStage(
    score !== undefined ? score : band === 'good' ? 8 : band === 'sick' ? 3 : 6
  );
  return (
    <div
      className={`relative ${className ?? ''}`}
      aria-hidden="true"
      data-condition-level={stage.key}
    >
      {CONDITION_VISUAL_STAGES.map((item) => (
        <svg
          key={item.key}
          viewBox="0 0 144 228"
          focusable="false"
          className={`absolute inset-0 h-full w-full transition-opacity duration-[160ms] ease-out motion-reduce:transition-none ${item.tone} ${stage.key === item.key ? 'opacity-100' : 'opacity-0'}`}
        >
          <Figure level={item.key} id={`${id}-${item.key}`} />
        </svg>
      ))}
    </div>
  );
}

/** 수면도 같은 인물·색·명암으로. 달의 채움은 기존 quality 1~5 의미를 유지한다. */
export function SleepPicture({
  quality,
  className,
}: {
  quality: number;
  className?: string;
}) {
  const id = useId().replace(/:/g, '');
  const ratio = Math.max(0, Math.min(1, (quality - 1) / 4));
  return (
    <svg
      viewBox="0 0 288 132"
      className={`text-sky ${className ?? ''}`}
      aria-hidden="true"
      focusable="false"
    >
      <defs>
        <linearGradient id={`${id}-blanket`} x1="0" y1="0" x2="1" y2="1">
          <stop stopColor="currentColor" stopOpacity=".65" />
          <stop offset="1" stopColor="currentColor" />
        </linearGradient>
        <linearGradient id={`${id}-pillow`} x1="0" y1="0" x2="0" y2="1">
          <stop stopColor="#f3f6fa" />
          <stop offset="1" stopColor="#d3dfe9" />
        </linearGradient>
        <clipPath id={`${id}-moon-fill`}>
          <rect x="216" y={24 + 44 * (1 - ratio)} width="48" height={44 * ratio} />
        </clipPath>
      </defs>
      <ellipse cx="133" cy="72" rx="108" ry="48" fill="currentColor" opacity=".05" />
      <ellipse cx="128" cy="119" rx="104" ry="4" fill="currentColor" opacity=".12" />
      {/* 침대와 베개는 단순한 면, 사람과 이불에만 명암을 준다. */}
      <rect x="22" y="96" width="207" height="15" rx="7.5" fill="#b8c9d8" />
      <path
        d="M31 110 V119 M219 110 V119"
        stroke="#71869a"
        strokeWidth="5"
        strokeLinecap="round"
      />
      <rect x="24" y="84" width="63" height="16" rx="8" fill={`url(#${id}-pillow)`} />
      <path
        d="M79 83 Q98 62 130 67 L191 76 Q213 81 219 99 H78 Z"
        fill={`url(#${id}-blanket)`}
      />
      <path
        d="M104 76 Q121 81 126 98 M145 78 Q161 83 164 98"
        fill="none"
        stroke="#fff"
        strokeOpacity=".2"
        strokeWidth="2.5"
        strokeLinecap="round"
      />
      <path d="M71 77 Q88 73 100 86 L101 98 H70 Z" fill="currentColor" opacity=".9" />
      <ellipse
        cx="62"
        cy="76"
        rx="19"
        ry="17"
        transform="rotate(-10 62 76)"
        fill="#efd0bb"
      />
      <path d="M44 78 Q37 63 51 57 Q68 50 77 63 Q61 60 55 68 L52 81 Z" fill="#263b50" />
      <path
        d="M61 77 Q64 80 67 77 M72 75 L75 74"
        fill="none"
        stroke="#59483e"
        strokeWidth="1.7"
        strokeLinecap="round"
      />
      <path
        d={ratio < 0.5 ? 'M71 84 Q74 81 77 83' : 'M70 84 Q74 87 78 82'}
        fill="none"
        stroke="#9c6b57"
        strokeWidth="1.5"
        strokeLinecap="round"
      />
      <path
        d="M80 89 Q89 91 94 96"
        fill="none"
        stroke="#efd0bb"
        strokeWidth="8"
        strokeLinecap="round"
      />
      {/* 기존 달 채움과 별 개수로 점수 변화를 보여준다. */}
      <circle
        cx="240"
        cy="46"
        r="22"
        fill="none"
        stroke="currentColor"
        strokeWidth="2"
        opacity=".35"
      />
      <circle
        cx="240"
        cy="46"
        r="22"
        fill="currentColor"
        opacity=".85"
        clipPath={`url(#${id}-moon-fill)`}
      />
      {(
        [
          [206, 20],
          [270, 17],
          [201, 46],
          [275, 72],
        ] as const
      )
        .slice(0, Math.round(ratio * 4))
        .map(([x, y]) => (
          <path
            key={`${x}-${y}`}
            d={`M${x} ${y - 3} V${y + 3} M${x - 3} ${y} H${x + 3}`}
            stroke="currentColor"
            strokeWidth="1.8"
            strokeLinecap="round"
            opacity=".65"
          />
        ))}
    </svg>
  );
}
