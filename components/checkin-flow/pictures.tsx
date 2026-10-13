'use client';

import type { ConditionBand } from '@/lib/checkin';

/**
 * 체크인 3판의 그림 둘(components/checkin-flow/steps.tsx) — 선으로만 그린 사람.
 *
 *   OutlinePerson  컨디션의 세 띠: 좋아요(곧게 서서 살짝 웃음, 파랑) · 보통이에요(가만히, 회색) · 아파요(어깨 내려가고 한 손이 팔꿈치를
 *                  잡음, 주황). 셋을 겹쳐 두고 띠에 맞는 것만 보이게 — 0.16초 옅어지며 바뀐다(크로스페이드). 막대 사람이 아니라 몸의 윤곽.
 *   SleepPicture   어젯밤 잠 — 같은 윤곽의 사람이 누워 있고 머리 위 달이 잘 잔 만큼 차오른다(1 비어 있음 … 5 가득).
 *
 * 색은 테마 토큰(stroke-sky · stroke-muted · stroke-warn)이라 다크 · 네이비에서도 보인다. 글자가 없으니 글꼴과 무관하다.
 */

const STROKE = 'fill-none stroke-[3.2] [stroke-linecap:round] [stroke-linejoin:round]';

function Figure({ band }: { band: ConditionBand }) {
  const good = band === 'good';
  const sick = band === 'sick';
  /* 어깨 높이 · 머리 기울기 — 아프면 처진다 */
  const shoulderY = sick ? 58 : 52;
  const headTilt = sick ? 'rotate(8 60 30)' : good ? 'rotate(-3 60 30)' : '';
  return (
    <g className={STROKE}>
      {/* 머리 */}
      <g transform={headTilt}>
        <circle cx="60" cy="30" r="14" />
        {/* 입 — 좋으면 웃고, 아프면 내려가고, 보통은 반듯 */}
        {good && <path d="M53 35 Q60 41 67 35" />}
        {sick && <path d="M54 38 Q60 34 66 38" />}
        {!good && !sick && <path d="M54 37 H66" />}
        {/* 눈 */}
        <circle cx="55" cy="28" r="1.4" className="fill-current stroke-none" />
        <circle cx="65" cy="28" r="1.4" className="fill-current stroke-none" />
      </g>
      {/* 목 · 몸통 */}
      <path d={`M60 44 V${shoulderY - 4}`} />
      <path
        d={`M${sick ? 44 : 40} ${shoulderY} Q60 ${shoulderY - 8} ${sick ? 76 : 80} ${shoulderY} L${sick ? 73 : 75} 112 Q60 118 ${sick ? 47 : 45} 112 Z`}
      />
      {/* 팔 — 아프면 왼팔(그림의 오른쪽)이 올라가 반대 팔꿈치를 잡는다 */}
      {sick ? (
        <>
          <path d="M44 60 L36 92 L42 118" />
          <path d="M76 60 L84 84 L58 96" />
          <circle
            cx="36"
            cy="92"
            r="4.5"
            className="fill-current stroke-none opacity-60"
          />
        </>
      ) : good ? (
        <>
          <path d="M40 54 L28 90 L30 118" />
          <path d="M80 54 L92 90 L90 118" />
        </>
      ) : (
        <>
          <path d="M40 54 L32 92 L34 120" />
          <path d="M80 54 L88 92 L86 120" />
        </>
      )}
      {/* 다리 */}
      <path d="M50 112 L46 170 L40 196" />
      <path d="M70 112 L74 170 L80 196" />
      <path d="M40 196 H30" />
      <path d="M80 196 H90" />
    </g>
  );
}

const TONE: Record<ConditionBand, string> = {
  good: 'text-sky',
  normal: 'text-muted',
  sick: 'text-warn',
};

/** 컨디션 그림 — 세 상태를 겹쳐 두고 지금 띠만 보인다(0.16초 크로스페이드) */
export function OutlinePerson({
  band,
  className,
}: {
  band: ConditionBand;
  className?: string;
}) {
  return (
    <div className={`relative ${className ?? ''}`} aria-hidden>
      {(['good', 'normal', 'sick'] as const).map((b) => (
        <svg
          key={b}
          viewBox="0 0 120 210"
          className={`absolute inset-0 h-full w-full stroke-current transition-opacity duration-[160ms] ease-out ${TONE[b]} ${
            band === b ? 'opacity-100' : 'opacity-0'
          }`}
        >
          <Figure band={b} />
        </svg>
      ))}
    </div>
  );
}

/** 잠 그림 — 누운 사람과 달. quality 1~5 만큼 달이 찬다 */
export function SleepPicture({
  quality,
  className,
}: {
  quality: number;
  className?: string;
}) {
  const ratio = Math.max(0, Math.min(1, (quality - 1) / 4));
  return (
    <svg
      viewBox="0 0 260 120"
      className={`stroke-current text-sky ${className ?? ''}`}
      aria-hidden
    >
      {/* 달 — 테두리는 늘, 속은 찬 만큼(아래부터) */}
      <defs>
        <clipPath id="checkin-moon-fill">
          <rect x="190" y={30 + 48 * (1 - ratio)} width="60" height={48 * ratio} />
        </clipPath>
      </defs>
      <circle cx="220" cy="54" r="22" className={STROKE} />
      <circle
        cx="220"
        cy="54"
        r="22"
        className="fill-current stroke-none opacity-80"
        clipPath="url(#checkin-moon-fill)"
      />
      {/* 별 — 질이 좋을수록 하나씩 */}
      {[
        [160, 22],
        [184, 14],
        [250, 18],
        [170, 44],
      ]
        .slice(0, Math.round(ratio * 4))
        .map(([x, y]) => (
          <path
            key={`${x}-${y}`}
            d={`M${x} ${y - 4} V${y + 4} M${x - 4} ${y} H${x + 4}`}
            className={STROKE}
          />
        ))}
      {/* 침대 선과 누운 사람 — 머리 왼쪽 */}
      <g className={`${STROKE} text-muted`}>
        <path d="M14 98 H180" />
        <circle cx="40" cy="80" r="13" />
        <path d="M53 86 Q90 72 150 78 L170 86 Q176 92 168 96 L60 96 Q50 96 53 86 Z" />
        {/* 베개 */}
        <path d="M18 92 Q24 78 40 88" />
      </g>
      {/* 눈 — 감았다 */}
      <path d="M34 80 H39 M43 80 H48" className={`${STROKE} text-muted`} />
    </svg>
  );
}
