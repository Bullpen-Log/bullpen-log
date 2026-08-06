import type { ReactNode } from 'react';
import Link from 'next/link';
import {
  AlertTriangle,
  ArrowDownRight,
  ArrowUpRight,
  ChevronDown,
  Minus,
  Moon,
  Sun,
} from 'lucide-react';
import { ACWR_ZONES, ACWR_ZONE_ORDER, type AcwrZone } from '@/lib/pitch-stats';
import type { PitchPlan } from '@/lib/report/plan';

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
    text: 'text-warn',
    dot: 'bg-amber-400',
    chip: 'border-amber-500/30 bg-amber-500/10 text-warn',
    bar: 'bg-amber-500/70',
  },
  bad: {
    text: 'text-red-600',
    dot: 'bg-red-400',
    chip: 'border-red-500/40 bg-red-500/10 text-red-700',
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
        <span className="text-display text-3xl leading-none text-ink tabular-nums sm:text-4xl">
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
          {/* 게이지 색은 테마와 무관하므로 바늘도 항상 어둡게 두어야 읽힌다 */}
          <span className="block h-full w-[3px] rounded-full bg-shade shadow-[0_0_0_2px_#ffffff]" />
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
                className="mx-auto w-full max-w-[34px] rounded-t-sm bg-sky/55"
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
      <summary className="flex cursor-pointer list-none items-center gap-1.5 text-[11px] text-muted transition-colors hover:text-sky">
        <ChevronDown className="h-3.5 w-3.5 transition-transform group-open:rotate-180" />
        부하 지수가 뭔가요?
      </summary>

      <div className="mt-4 space-y-4 text-[11px] leading-relaxed text-muted">
        <div>
          <p className="font-semibold text-ink">어떻게 나오나요</p>
          <div className="mt-2 space-y-1.5 rounded-lg border border-line bg-surface-2 px-3 py-2.5 tabular-nums">
            <p>
              하루 부하 <span className="text-ink">= 투구수 × 강도</span>
              <span className="ml-1 text-muted/60">(50구를 강도 6으로 → 300)</span>
            </p>
            <p>
              부하 지수{' '}
              <span className="text-ink">
                = 최근 부하 ÷ 평소 부하
              </span>
              <span className="ml-1 text-muted/60">(최근일수록 크게 반영되는 평균)</span>
            </p>
            <p className="text-muted/70">
              가입 때 답한 평소 투구량이 처음 기준이 되고, 기록이 쌓일수록 실제
              기록으로 바뀝니다.
            </p>
            {chronic > 0 && (
              <p className="border-t border-line pt-1.5 text-muted/70">
                지금은 {Math.round(acute)} ÷ {Math.round(chronic)} ={' '}
                <span className="text-ink">
                  {(acute / chronic).toFixed(2)}
                </span>
              </p>
            )}
          </div>
        </div>

        <div>
          <p className="font-semibold text-ink">왜 보나요</p>
          <p className="mt-1.5">
            몸은 평소 하던 양에 맞춰 적응해 있습니다. 그래서 절대적인 투구수보다
            <span className="text-ink"> 평소보다 얼마나 늘었는지</span>가 부상 위험과 더
            가깝습니다. 같은 100구라도 평소 100구를 던지던 사람과 30구를 던지던
            사람에게 오는 부담이 다릅니다.
          </p>
        </div>

        <div>
          <p className="font-semibold text-ink">구간</p>
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
                        active ? `font-semibold ${TONE[ZONE_TONE[zone]].text}` : 'text-ink'
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
          <span className="text-ink">알아두세요.</span> 스포츠과학에서 널리 쓰이는
          방식이지만 절대 기준은 아닙니다. 수면·컨디션·나이·폼 같은 요소는 들어가지
          않고, 오직 기록한 투구수와 강도만으로 계산합니다.
        </p>
      </div>
    </details>
  );
}

/** 핵심 지표 4장이 각각 어떻게 나온 값인지. 용어를 처음 보는 사람 기준으로 쓴다. */
export function MetricHelp({ twoDayLimit }: { twoDayLimit: number }) {
  const items = [
    {
      title: '최근 7일 투구수',
      body: '오늘을 포함한 지난 7일 동안 던진 공의 합계입니다. 아래 증감은 그 직전 7일과 비교한 값입니다.',
    },
    {
      title: '최근 7일 구속',
      body: '지난 7일 기록 중 가장 빠른 구속입니다. 아래 평균은 각 기록의 평균 구속을 투구수로 가중해 낸 값이라, 많이 던진 날이 더 크게 반영됩니다.',
    },
    {
      title: '평균 투구 강도',
      body: `기록할 때 본인이 매긴 1~10 강도를 던진 날 기준으로 평균 낸 값입니다. "이틀 연속 과부하"는 붙어 있는 이틀의 강도 합이 ${twoDayLimit}을 넘은 구간으로, 회복할 틈 없이 이어 던졌다는 뜻입니다.`,
    },
    {
      title: '마지막 투구',
      body: '마지막으로 기록을 남긴 날로부터 며칠이 지났는지입니다. "연투"는 최근 4주 안에서 쉬는 날 없이 연달아 던진 최장 일수로, 3일 이상이면 노란색으로 알립니다.',
    },
  ];

  return (
    <details className="group rounded-2xl border border-line bg-surface px-5 py-4">
      <summary className="flex cursor-pointer list-none items-center gap-1.5 text-[11px] text-muted transition-colors hover:text-sky">
        <ChevronDown className="h-3.5 w-3.5 transition-transform group-open:rotate-180" />
        이 숫자들은 어떻게 나오나요?
      </summary>

      <dl className="mt-4 grid gap-4 sm:grid-cols-2">
        {items.map((item) => (
          <div key={item.title}>
            <dt className="text-xs font-semibold text-ink">{item.title}</dt>
            <dd className="mt-1 text-[11px] leading-relaxed text-muted">{item.body}</dd>
          </div>
        ))}
      </dl>
    </details>
  );
}

/**
 * 오늘 뭘 하면 되는지 한 줄.
 * AI 코치 리포트와 같은 계산(buildPitchPlan)을 쓰므로 두 화면이 어긋나지 않는다.
 */
export function TodayPlanLine({ plan }: { plan: PitchPlan }) {
  // 통증 신호가 있으면 계획 대신 휴식 안내만 낸다.
  if (plan.halted) {
    return (
      <Link
        href="/coach"
        className="flex items-start gap-3 rounded-2xl border border-red-900/60 bg-red-950/25 px-5 py-4 transition-colors hover:border-red-400"
      >
        <AlertTriangle className="mt-0.5 h-4 w-4 shrink-0 text-red-600" />
        <span className="min-w-0 flex-1">
          <span className="block text-sm font-bold text-red-700">
            오늘은 던지지 마세요
          </span>
          <span className="mt-1 block text-xs leading-relaxed text-red-100/80">
            {plan.haltReason}
          </span>
        </span>
      </Link>
    );
  }

  const today = plan.days[0];
  if (!today) return null;

  return (
    <Link
      href="/coach"
      className={`flex flex-wrap items-center gap-x-4 gap-y-2 rounded-2xl border px-5 py-4 transition-colors ${
        today.throwing
          ? 'border-line bg-surface hover:border-sky'
          : 'border-sky-500/30 bg-sky-500/[0.06] hover:border-sky-500/60'
      }`}
    >
      <span className="text-[11px] font-medium uppercase tracking-[0.18em] text-muted">
        오늘
      </span>

      {today.throwing ? (
        <span className="flex items-baseline gap-1.5">
          <Sun className="h-4 w-4 self-center text-sky" />
          <span className="text-display text-2xl leading-none text-sky tabular-nums">
            {today.maxPitches}
          </span>
          <span className="text-sm text-muted">구 이하</span>
          <span className="mx-1 text-line-strong">·</span>
          <span className="text-sm text-muted">
            강도 <span className="text-ink">{today.maxIntensity}</span> 이하
          </span>
        </span>
      ) : (
        <span className="flex items-center gap-2 text-base font-bold text-sky-300">
          <Moon className="h-4 w-4" />
          휴식
        </span>
      )}

      <span className="text-xs text-muted">{today.reason}</span>

      <span className="ml-auto shrink-0 text-[11px] font-medium uppercase tracking-[0.18em] text-muted">
        AI 리포트 →
      </span>
    </Link>
  );
}
