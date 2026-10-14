import type { ReactNode } from 'react';
import { ArrowDownRight, ArrowUpRight, Minus } from '@/components/icon';

/*
 * 상태 색과 칩은 components/tone.tsx 로 옮겼다. 홈에서도 부하 상태를 보여주게
 * 되면서 두 화면이 같은 색을 써야 했는데, 여기 두면 다른 화면이 비슷한 색을
 * 새로 만들게 된다. 여기서는 그대로 다시 내보내, 부르는 쪽을 고치지 않는다.
 */
import { TONE, StatusChip, type Tone } from '@/components/tone';

export { TONE, StatusChip, type Tone };

/** 지난 기간 대비 변화. 값이 없으면 비교 자체를 생략한다. */
export function Delta({
  percent,
  /** 값이 오르는 게 나쁜 지표(투구량 등)면 true */
  invert = false,
  suffix = '지난주 대비',
}: {
  percent: number | null;
  invert?: boolean;
  suffix?: string;
}) {
  if (percent == null) {
    return <span className="text-xs text-muted/60">비교할 이전 기록 없음</span>;
  }

  const rounded = Math.round(percent);
  const flat = Math.abs(rounded) < 1;
  const up = rounded > 0;
  const tone: Tone = flat ? 'neutral' : (up ? !invert : invert) ? 'good' : 'warn';
  const Icon = flat ? Minus : up ? ArrowUpRight : ArrowDownRight;

  return (
    <span className={`inline-flex items-center gap-1 whitespace-nowrap text-xs ${TONE[tone].text}`}>
      <Icon className="h-3.5 w-3.5" />
      <span className="tabular-nums">
        {flat ? '변화 없음' : `${Math.abs(rounded)}%`}
      </span>
      {/* 휴대폰은 숫자 칸이 한 줄 셋이라 좁다 — 화살표 · % 만(뜻은 칸 이름 '이번 주'가 말한다) */}
      <span className="hidden text-muted/60 desk:inline">{suffix}</span>
    </span>
  );
}

export function StatCard({
  label,
  value,
  unit,
  footer,
  tone = 'neutral',
}: {
  label: string;
  value: ReactNode;
  unit?: string;
  footer?: ReactNode;
  tone?: Tone;
}) {
  return (
    /* 한 줄 셋이라 휴대폰은 안쪽 여백을 줄인다(칸 하나 약 114px), PC 는 블록 여백 */
    <div className="relative min-w-0 bg-surface px-3 py-4 desk:p-(--block-pad)">
      {/* 상태를 알리는 얇은 상단 선 */}
      <span
        className={`absolute inset-x-0 top-0 h-px ${
          tone === 'neutral' ? 'bg-transparent' : TONE[tone].bar
        }`}
      />
      <p className="truncate text-xs font-medium tracking-normal text-muted">{label}</p>
      <p className="mt-2 flex flex-wrap items-baseline gap-x-1">
        <span className="text-numeric text-lg leading-none whitespace-nowrap text-ink tabular-nums min-[360px]:text-xl desk:text-3xl">
          {value}
        </span>
        {unit && <span className="text-xs text-muted">{unit}</span>}
      </p>
      {footer && <div className="mt-2 leading-snug">{footer}</div>}
    </div>
  );
}

