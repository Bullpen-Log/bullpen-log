import type { ReactNode } from 'react';
import { ArrowDownRight, ArrowUpRight, Minus } from 'lucide-react';

export type Tone = 'good' | 'info' | 'warn' | 'bad' | 'neutral';

/** 상태별 색. 문자열을 그대로 써야 Tailwind가 클래스를 찾아낸다. */
export const TONE: Record<
  Tone,
  { text: string; dot: string; chip: string; bar: string }
> = {
  good: {
    text: 'text-emerald-400',
    dot: 'bg-emerald-400',
    chip: 'border-emerald-500/30 bg-emerald-500/10 text-emerald-300',
    bar: 'bg-emerald-500/70',
  },
  info: {
    text: 'text-sky-400',
    dot: 'bg-sky-400',
    chip: 'border-sky-500/30 bg-sky-500/10 text-sky-300',
    bar: 'bg-sky-500/70',
  },
  warn: {
    text: 'text-amber-400',
    dot: 'bg-amber-400',
    chip: 'border-amber-500/30 bg-amber-500/10 text-amber-300',
    bar: 'bg-amber-500/70',
  },
  bad: {
    text: 'text-red-400',
    dot: 'bg-red-400',
    chip: 'border-red-500/40 bg-red-500/10 text-red-300',
    bar: 'bg-red-500/70',
  },
  neutral: {
    text: 'text-muted',
    dot: 'bg-line-strong',
    chip: 'border-line-strong bg-surface-2 text-muted',
    bar: 'bg-line-strong',
  },
};

export function StatusChip({
  tone,
  children,
}: {
  tone: Tone;
  children: ReactNode;
}) {
  return (
    <span
      className={`inline-flex items-center gap-1.5 rounded-full border px-3 py-1 text-xs font-medium ${TONE[tone].chip}`}
    >
      <span className={`h-1.5 w-1.5 rounded-full ${TONE[tone].dot}`} />
      {children}
    </span>
  );
}

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
    <span className={`inline-flex items-center gap-1 text-xs ${TONE[tone].text}`}>
      <Icon className="h-3.5 w-3.5" />
      <span className="tabular-nums">
        {flat ? '변화 없음' : `${Math.abs(rounded)}%`}
      </span>
      <span className="text-muted/60">{suffix}</span>
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
    <div className="relative bg-surface px-5 py-5 sm:px-6 sm:py-6">
      {/* 상태를 알리는 얇은 상단 선 */}
      <span
        className={`absolute inset-x-0 top-0 h-px ${
          tone === 'neutral' ? 'bg-transparent' : TONE[tone].bar
        }`}
      />
      <p className="text-[11px] font-medium uppercase tracking-[0.18em] text-muted">
        {label}
      </p>
      <p className="mt-3 flex items-baseline gap-1.5">
        <span className="text-display text-3xl leading-none text-cream tabular-nums sm:text-4xl">
          {value}
        </span>
        {unit && <span className="text-xs text-muted">{unit}</span>}
      </p>
      {footer && <div className="mt-3 min-h-[1.25rem]">{footer}</div>}
    </div>
  );
}

const GAUGE_SEGMENTS = [
  { width: 40, className: 'bg-sky-500/25' },
  { width: 25, className: 'bg-emerald-500/35' },
  { width: 10, className: 'bg-amber-500/35' },
  { width: 25, className: 'bg-red-500/30' },
];

/** 0 ~ 2.0 범위에서 현재 부하 비율이 어디에 있는지 보여준다. */
export function ZoneGauge({ ratio }: { ratio: number }) {
  const position = Math.min(Math.max(ratio / 2, 0), 1) * 100;

  return (
    <div className="space-y-2">
      {/* 바늘을 막대 위에 겹쳐 현재 위치를 바로 읽히게 한다. */}
      <div className="relative py-1.5">
        <div className="flex h-2.5 w-full overflow-hidden rounded-full">
          {GAUGE_SEGMENTS.map((s, i) => (
            <span key={i} className={s.className} style={{ width: `${s.width}%` }} />
          ))}
        </div>
        <span
          className="absolute inset-y-0 -translate-x-1/2"
          style={{ left: `${position}%` }}
          aria-hidden
        >
          <span className="block h-full w-[3px] rounded-full bg-cream shadow-[0_0_0_2px_rgba(10,10,11,0.9)]" />
        </span>
      </div>
      {/* 눈금은 구간 경계와 같은 위치에 놓아야 읽을 때 헷갈리지 않는다. */}
      <div className="relative h-3 text-[10px] tabular-nums text-muted/70">
        {[
          { value: '0', at: 0 },
          { value: '0.8', at: 40 },
          { value: '1.3', at: 65 },
          { value: '1.5', at: 75 },
          { value: '2.0', at: 100 },
        ].map(({ value, at }) => (
          <span
            key={value}
            className="absolute top-0"
            style={{
              left: `${at}%`,
              transform:
                at === 0
                  ? 'none'
                  : at === 100
                    ? 'translateX(-100%)'
                    : 'translateX(-50%)',
            }}
          >
            {value}
          </span>
        ))}
      </div>
    </div>
  );
}

export type WeekBar = { label: string; pitches: number };

/** 최근 7일 투구수를 한눈에 보는 작은 막대. 던지지 않은 날은 바닥선으로 남긴다. */
export function WeekStrip({ bars }: { bars: WeekBar[] }) {
  const peak = Math.max(...bars.map((b) => b.pitches), 1);

  return (
    <div>
      <p className="text-[10px] uppercase tracking-[0.18em] text-muted">
        일별 투구수
      </p>
      <div className="mt-3 flex h-20 items-end gap-1.5">
        {bars.map((bar) => (
          <div key={bar.label} className="flex h-full flex-1 flex-col justify-end">
            {/* 막대가 너무 뚱뚱해 보이지 않도록 폭에 상한을 둔다. */}
            {bar.pitches > 0 ? (
              <span
                className="mx-auto w-full max-w-[34px] rounded-t-sm bg-gold/55"
                style={{ height: `${Math.max(8, (bar.pitches / peak) * 100)}%` }}
                title={`${bar.label} ${bar.pitches}구`}
              />
            ) : (
              <span className="mx-auto h-px w-full max-w-[34px] bg-line-strong" />
            )}
          </div>
        ))}
      </div>
      <div className="mt-2 flex gap-1.5">
        {bars.map((bar) => (
          <span
            key={bar.label}
            className="flex-1 text-center text-[10px] tabular-nums text-muted/70"
          >
            {bar.label}
          </span>
        ))}
      </div>
    </div>
  );
}
