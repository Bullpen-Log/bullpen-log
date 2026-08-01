import type { ReactNode } from 'react';
import { ArrowDownRight, ArrowUpRight, ChevronDown, Minus } from 'lucide-react';
import { ACWR_ZONES, ACWR_ZONE_ORDER, type AcwrZone } from '@/lib/pitch-stats';

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

/**
 * 게이지는 0~2.0을 그리므로 구간 경계 0.8 / 1.3 / 1.5가
 * 각각 40% / 65% / 75% 위치에 온다.
 */
const GAUGE_SEGMENTS: {
  zone: AcwrZone;
  short: string;
  width: number;
  fill: string;
}[] = [
  { zone: 'low', short: '낮음', width: 40, fill: 'bg-sky-500/25' },
  { zone: 'optimal', short: '적정', width: 25, fill: 'bg-emerald-500/40' },
  { zone: 'caution', short: '주의', width: 10, fill: 'bg-amber-500/40' },
  { zone: 'danger', short: '위험', width: 25, fill: 'bg-red-500/35' },
];

const ZONE_TONE: Record<AcwrZone, Tone> = {
  low: 'info',
  optimal: 'good',
  caution: 'warn',
  danger: 'bad',
};

/** 0 ~ 2.0 범위에서 현재 부하 비율이 어디에 있는지, 각 구간이 뭘 뜻하는지 보여준다. */
export function ZoneGauge({
  ratio,
  activeZone,
}: {
  ratio: number;
  activeZone: AcwrZone;
}) {
  const position = Math.min(Math.max(ratio / 2, 0), 1) * 100;

  return (
    <div>
      {/* 바늘을 막대 위에 겹쳐 현재 위치를 바로 읽히게 한다. */}
      <div className="relative py-1.5">
        <div className="flex h-2.5 w-full overflow-hidden rounded-full">
          {GAUGE_SEGMENTS.map((s) => (
            <span key={s.zone} className={s.fill} style={{ width: `${s.width}%` }} />
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

      {/* 구간 이름 — 색만 있고 뜻이 없으면 읽을 수 없다. */}
      <div className="mt-1.5 flex">
        {GAUGE_SEGMENTS.map((s) => (
          <span
            key={s.zone}
            className={`text-center text-[10px] ${
              s.zone === activeZone
                ? `font-semibold ${TONE[ZONE_TONE[s.zone]].text}`
                : 'text-muted/50'
            }`}
            style={{ width: `${s.width}%` }}
          >
            {s.short}
          </span>
        ))}
      </div>

      {/* 경계 숫자 */}
      <div className="relative mt-1 h-3 text-[10px] tabular-nums text-muted/50">
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

/**
 * 부하 지수 설명. 처음 보는 사람이 숫자만으로는 뜻을 알 수 없어
 * 계산법과 구간의 의미를 펼쳐볼 수 있게 둔다.
 */
export function LoadIndexHelp({
  acute,
  chronic,
  activeZone,
}: {
  acute: number;
  chronic: number;
  activeZone?: AcwrZone;
}) {
  return (
    <details className="group border-t border-line pt-3">
      <summary className="flex cursor-pointer list-none items-center gap-1.5 text-[11px] text-muted transition-colors hover:text-gold">
        <ChevronDown className="h-3.5 w-3.5 transition-transform group-open:rotate-180" />
        부하 지수가 뭔가요?
      </summary>

      <div className="mt-4 space-y-4 text-[11px] leading-relaxed text-muted">
        <div>
          <p className="font-semibold text-cream">어떻게 나오나요</p>
          <div className="mt-2 space-y-1.5 rounded-lg border border-line bg-surface-2 px-3 py-2.5 tabular-nums">
            <p>
              하루 부하 <span className="text-cream">= 투구수 × 강도</span>
              <span className="ml-1 text-muted/60">(50구를 강도 6으로 → 300)</span>
            </p>
            <p>
              부하 지수{' '}
              <span className="text-cream">
                = 최근 7일 부하 ÷ 평소 4주 주당 평균
              </span>
            </p>
            {chronic > 0 && (
              <p className="border-t border-line pt-1.5 text-muted/70">
                지금은 {Math.round(acute)} ÷ {Math.round(chronic)} ={' '}
                <span className="text-cream">
                  {(acute / chronic).toFixed(2)}
                </span>
              </p>
            )}
          </div>
        </div>

        <div>
          <p className="font-semibold text-cream">왜 보나요</p>
          <p className="mt-1.5">
            몸은 평소 하던 양에 맞춰 적응해 있습니다. 그래서 절대적인 투구수보다
            <span className="text-cream"> 평소보다 얼마나 늘었는지</span>가 부상 위험과 더
            가깝습니다. 같은 100구라도 평소 100구를 던지던 사람과 30구를 던지던
            사람에게 오는 부담이 다릅니다.
          </p>
        </div>

        <div>
          <p className="font-semibold text-cream">구간</p>
          <ul className="mt-2 space-y-1.5">
            {ACWR_ZONE_ORDER.map((zone) => {
              const z = ACWR_ZONES[zone];
              const active = zone === activeZone;
              return (
                <li
                  key={zone}
                  className={`flex gap-2 rounded-lg px-2 py-1.5 ${
                    active ? 'bg-surface-2' : ''
                  }`}
                >
                  <span
                    className={`mt-1.5 h-1.5 w-1.5 shrink-0 rounded-full ${TONE[ZONE_TONE[zone]].dot}`}
                  />
                  <span className="min-w-0">
                    <span
                      className={
                        active ? `font-semibold ${TONE[ZONE_TONE[zone]].text}` : 'text-cream'
                      }
                    >
                      {z.short}
                    </span>
                    <span className="ml-1.5 tabular-nums text-muted/60">{z.range}</span>
                    {active && (
                      <span className="ml-1.5 text-muted/60">← 지금</span>
                    )}
                    <span className="block">{z.meaning}</span>
                  </span>
                </li>
              );
            })}
          </ul>
        </div>

        {/* 화면 아래의 안내와 겹치지 않게, 여기서는 지표 자체의 한계를 말한다. */}
        <p className="rounded-lg border border-line bg-surface-2 px-3 py-2.5 text-muted/70">
          <span className="text-cream">알아두세요.</span> 스포츠과학에서 널리 쓰이는
          방식이지만 절대 기준은 아닙니다. 수면·컨디션·나이·폼 같은 요소는 들어가지
          않고, 오직 기록한 투구수와 강도만으로 계산합니다.
        </p>
      </div>
    </details>
  );
}
