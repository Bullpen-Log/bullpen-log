'use client';

import { useEffect, useRef, useState, type PointerEvent } from 'react';
import { NotebookPen } from 'lucide-react';
import { exerciseHistory } from '@/app/actions/exercise-history';
import { useWeightUnit } from '@/components/use-units';
import { useBoxSize } from '@/components/use-box-size';
import { haptic } from '@/lib/haptics';
import { formatAmount, formatSeconds } from '@/lib/exercise-meta';
import { formatWeight, type WeightUnit } from '@/lib/units';
import { volumeIn } from '@/lib/workout/summarize';
import type { ExerciseHistory, HistoryDay, HistoryKind } from '@/lib/workout/history';
import { MoreButton } from '@/components/disclosure';

/**
 * 운동 하나의 기록과 흐름 — 최고 기록, 볼륨 흐름, 최근 날짜별 기록.
 *
 * 세 곳에서 같은 것을 연다.
 *   운동 화면   — 지금 하는 운동의 지난 기록 ([내 기록])
 *   라이브러리  — 운동 상세의 '내 기록'
 *   트레이닝    — 날짜별 기록에서 운동마다 있는 기록 단추
 * 따로 만들면 한쪽에서만 추정 1RM 이 보이는 식으로 어긋난다.
 *
 * 열릴 때 서버에서 받는다(app/actions/exercise-history.ts). 계산은
 * lib/workout/history.ts 에 있다.
 */
export function ExerciseHistoryPanel({
  exerciseId,
  excludeSessionId,
  compact = false,
  showNote = false,
}: {
  exerciseId: string;
  /** 운동 화면에서 열었으면 지금 하는 판 — 그 판은 '지난 기록'에서 뺀다 */
  excludeSessionId?: string;
  /** 운동 화면처럼 좁은 곳 — 최근 기록을 적게 보여준다 */
  compact?: boolean;
  /** 내 메모도 함께 — 메모가 이미 보이는 곳(운동 화면·라이브러리)에서는 끈다 */
  showNote?: boolean;
}) {
  const unit = useWeightUnit();
  const [loaded, setLoaded] = useState<
    | { id: string; history: ExerciseHistory; note: string | null }
    | { id: string; error: string }
    | null
  >(null);

  useEffect(() => {
    let alive = true;
    exerciseHistory({ exerciseId, excludeSessionId })
      .then((res) => {
        if (alive) setLoaded({ id: exerciseId, ...res });
      })
      .catch(() => {
        if (alive) {
          setLoaded({
            id: exerciseId,
            error:
              '신호가 없어 기록을 불러오지 못했어요. 신호가 잡히면 다시 열어 주세요.',
          });
        }
      });
    return () => {
      alive = false;
    };
  }, [exerciseId, excludeSessionId]);

  /* 다른 운동으로 옮긴 참이면 앞 운동의 기록을 잠깐이라도 보여주지 않는다 */
  const current = loaded?.id === exerciseId ? loaded : null;

  if (!current) {
    return <p className="py-6 text-center text-xs text-muted">기록을 불러오는 중…</p>;
  }
  if ('error' in current) {
    return (
      <p className="rounded-xl bg-surface-2 px-4 py-4 text-center text-xs leading-relaxed break-keep text-muted">
        {current.error}
      </p>
    );
  }
  return (
    <ExerciseHistoryView
      history={current.history}
      note={showNote ? current.note : null}
      unit={unit}
      compact={compact}
    />
  );
}

/* ------------------------------ 모양 ------------------------------ */

const THIS_YEAR = new Date().getFullYear();

/** '2026-09-20' → '9월 20일'. 올해가 아니면 해를 붙인다. */
function dayLabel(key: string) {
  const [y, m, d] = key.split('-').map(Number);
  return y === THIS_YEAR ? `${m}월 ${d}일` : `${y}년 ${m}월 ${d}일`;
}

/** 그날 한 양을 사람 말로 — '1,240kg' · '45회' · '3분 20초' */
function volumeText(kind: HistoryKind, value: number, unit: WeightUnit) {
  if (kind === 'weight') {
    return `${Math.round(volumeIn(value, unit)).toLocaleString('ko-KR')}${unit}`;
  }
  if (kind === 'reps') return `${value.toLocaleString('ko-KR')}회`;
  return formatSeconds(value);
}

/** 세트 하나 — '62.5kg×8' · '12회' · '45초' */
function setText(
  s: { weightKg: number | null; reps: number | null; holdSeconds: number | null },
  unit: WeightUnit
) {
  const w =
    s.weightKg != null && s.weightKg > 0 ? formatWeight(s.weightKg, unit) : null;
  const amount =
    s.holdSeconds != null
      ? formatSeconds(s.holdSeconds)
      : s.reps != null
        ? `${s.reps}회`
        : '?';
  return w ? `${w}×${amount.replace('회', '')}` : amount;
}

/** 하루의 기록을 한 줄로. 세트별로 남긴 날은 세트를, 아니면 요약을 적는다 */
function dayText(day: HistoryDay, unit: WeightUnit) {
  if (day.sets) return day.sets.map((s) => setText(s, unit)).join(' · ');
  return formatAmount(day, unit) ?? '한 것으로 표시함';
}

function Stat({
  label,
  value,
  sub,
}: {
  label: string;
  value: string;
  sub?: string | null;
}) {
  return (
    <div className="min-w-0 rounded-xl bg-surface-2 px-3 py-2.5">
      <p className="text-[11px] text-muted">{label}</p>
      <p className="mt-0.5 truncate text-base font-bold tabular-nums text-ink">
        {value}
      </p>
      {sub && (
        <p className="mt-0.5 truncate text-[11px] tabular-nums text-muted">{sub}</p>
      )}
    </div>
  );
}

/**
 * 볼륨 흐름 — 운동한 날마다 막대 하나, 오래된 것부터(건강 앱의 운동 기록처럼, 2026-10-04 '앱 느낌').
 *
 * 예전에는 가로로 늘린 꺾은선이었다. 운동한 날 사이 간격이 제각각이라(사흘 · 열흘) 선으로 이으면 그 사이에 무언가 한 것처럼
 * 보였다 — 한 번 한 것은 한 칸이 맞다. 바닥은 0 에 둔다: 가장 적은 날을 바닥으로 잡으면 10% 차이가 화면 끝에서 끝으로 벌어진다.
 * 누르고 옆으로 훑으면 위 줄이 그날 날짜 · 양으로 바뀐다(칸마다 '톡'), 떼면 1.5초 뒤 돌아온다.
 */
function VolumeTrend({
  points,
  kind,
  unit,
}: {
  points: { date: string; value: number }[];
  kind: HistoryKind;
  unit: WeightUnit;
}) {
  const box = useRef<HTMLDivElement>(null);
  const size = useBoxSize(box);
  const [hover, setHover] = useState<number | null>(null);
  const hideTimer = useRef(0);
  useEffect(() => () => window.clearTimeout(hideTimer.current), []);

  const n = points.length;
  const w = size?.w ?? 0;
  const h = size?.h ?? 0;
  const padL = 2;
  const padR = 2;
  const padT = 6;
  const base = h - 2;
  const slotW = (w - padL - padR) / n;
  const max = Math.max(...points.map((p) => p.value));
  const y = (v: number) => base - (v / max) * (base - padT);
  const peak = points.reduce((a, b) => (b.value > a.value ? b : a));
  const picked = hover == null ? null : points[hover];

  const pick = (e: PointerEvent<HTMLDivElement>) => {
    const r = e.currentTarget.getBoundingClientRect();
    const i = Math.min(
      n - 1,
      Math.max(0, Math.floor((e.clientX - r.left - padL) / slotW))
    );
    window.clearTimeout(hideTimer.current);
    if (e.pointerType !== 'mouse' && i !== hover) haptic('selection');
    setHover(i);
  };

  return (
    <div>
      <div className="flex min-h-4 items-baseline justify-between gap-2 text-[11px] text-muted">
        {picked ? (
          <>
            <span>{dayLabel(picked.date)}</span>
            <span className="font-semibold tabular-nums text-sky-strong">
              {volumeText(kind, picked.value, unit)}
            </span>
          </>
        ) : (
          <>
            <span>
              {kind === 'weight'
                ? '볼륨(무게×횟수)'
                : kind === 'reps'
                  ? '횟수 합'
                  : '버틴 시간 합'}{' '}
              · 최근 {n}번
            </span>
            <span className="tabular-nums">
              가장 많이 {volumeText(kind, peak.value, unit)}
            </span>
          </>
        )}
      </div>
      <div
        ref={box}
        role="img"
        aria-label={`날짜별 ${kind === 'weight' ? '볼륨' : '양'}: ${points
          .map((p) => `${dayLabel(p.date)} ${volumeText(kind, p.value, unit)}`)
          .join(', ')}`}
        className="relative mt-1.5 h-16 touch-pan-y text-sky select-none"
        onPointerDown={pick}
        onPointerMove={(e) => {
          if (e.pointerType === 'mouse' || e.buttons > 0) pick(e);
        }}
        onPointerLeave={(e) => {
          if (e.pointerType === 'mouse') setHover(null);
        }}
        onPointerUp={(e) => {
          if (e.pointerType === 'mouse') return;
          window.clearTimeout(hideTimer.current);
          hideTimer.current = window.setTimeout(() => setHover(null), 1500);
        }}
        onPointerCancel={() => setHover(null)}
      >
        {size && (
          <svg aria-hidden width={w} height={h} className="absolute inset-0">
            <line x1={padL} x2={w - padR} y1={base} y2={base} className="stroke-line" />
            {points.map((p, i) => {
              /* 위쪽만 둥근 막대 — 훑는 동안만 고른 칸 밖을 옅게 */
              const bw = Math.max(4, Math.min(slotW * 0.6, 22));
              const top = y(p.value);
              const r = Math.min(3, bw / 2, Math.max(0, base - top));
              const left = padL + slotW * (i + 0.5) - bw / 2;
              return (
                <path
                  key={p.date}
                  d={`M${left},${base} V${top + r} Q${left},${top} ${left + r},${top} H${left + bw - r} Q${left + bw},${top} ${left + bw},${top + r} V${base} Z`}
                  className={`origin-bottom fill-current transition-opacity duration-150 [transform-box:fill-box] motion-safe:animate-[trend-rise_560ms_cubic-bezier(0.22,1,0.36,1)_both] ${
                    hover != null && hover !== i ? 'opacity-35' : ''
                  }`}
                  style={{ animationDelay: `${Math.round((i / n) * 260)}ms` }}
                />
              );
            })}
          </svg>
        )}
      </div>
      <div className="mt-1 flex justify-between text-[10px] tabular-nums text-muted">
        <span>{dayLabel(points[0].date)}</span>
        {n > 1 && <span>{dayLabel(points[n - 1].date)}</span>}
      </div>
    </div>
  );
}

/** 한 번에 보여주는 최근 기록 수 — 좁은 곳과 넓은 곳 */
const SHOWN = { compact: 3, full: 8 };
/** 흐름에 올리는 날 수. 더 많으면 점이 뭉쳐 읽히지 않는다. */
const TREND_POINTS = 12;

export function ExerciseHistoryView({
  history,
  note,
  unit,
  compact,
}: {
  history: ExerciseHistory;
  note: string | null;
  unit: WeightUnit;
  compact: boolean;
}) {
  const [expanded, setExpanded] = useState(false);
  const { kind, days } = history;

  const noteBox = note && (
    <div className="rounded-xl border border-line bg-surface-2 px-3 py-2.5">
      <p className="flex items-center gap-1.5 text-[11px] font-semibold text-muted">
        <NotebookPen aria-hidden className="h-3.5 w-3.5" />내 메모
      </p>
      <p className="mt-1 whitespace-pre-wrap break-keep text-sm leading-relaxed text-ink">
        {note}
      </p>
    </div>
  );

  if (days.length === 0) {
    return (
      <div className="space-y-3">
        {noteBox}
        <p className="rounded-xl bg-surface-2 px-4 py-5 text-center text-xs leading-relaxed break-keep text-muted">
          아직 이 운동을 한 기록이 없어요. 운동을 마치면 여기에 쌓여요.
        </p>
      </div>
    );
  }

  /* 흐름에 올리는 날 — 양을 셀 수 있는 최근 날들, 그래프는 오래된 것부터 */
  const trendDays = days
    .filter((d): d is HistoryDay & { volume: number } => d.volume != null)
    .slice(0, TREND_POINTS);
  const trend = [...trendDays]
    .reverse()
    .map((d) => ({ date: d.date, value: d.volume }));
  const approx = trendDays.some((d) => d.approx);

  const limit = expanded ? days.length : compact ? SHOWN.compact : SHOWN.full;
  const w = (kg: number) => formatWeight(kg, unit) ?? '';

  /* 첫째 칸 — 무엇으로 재는 운동인지에 따라 */
  const first =
    kind === 'weight' && history.bestWeight ? (
      <Stat
        label="최고 무게"
        value={w(history.bestWeight.kg)}
        sub={dayLabel(history.bestWeight.date)}
      />
    ) : kind === 'hold' && history.bestHold ? (
      <Stat
        label="가장 오래"
        value={formatSeconds(history.bestHold.seconds)}
        sub={dayLabel(history.bestHold.date)}
      />
    ) : history.bestReps ? (
      <Stat
        label="한 세트 최다"
        value={`${history.bestReps.reps}회`}
        sub={dayLabel(history.bestReps.date)}
      />
    ) : (
      <Stat label="마지막" value={dayLabel(days[0].date)} />
    );

  /* 둘째 칸 — 무게 운동이면 추정 1RM, 아니면 모두 몇 번 */
  const second =
    kind === 'weight' && history.bestSet ? (
      <Stat
        label="추정 1RM"
        value={w(history.bestSet.e1rm)}
        sub={`${w(history.bestSet.weightKg)} × ${history.bestSet.reps}회`}
      />
    ) : (
      <Stat
        label="모두"
        value={`${history.total}번`}
        sub={`마지막 ${dayLabel(days[0].date)}`}
      />
    );

  return (
    <div className="space-y-4">
      {noteBox}

      <div className="grid grid-cols-3 gap-2">
        {first}
        {second}
        <Stat
          label="최근 4주"
          value={`${history.last28}번`}
          sub={kind === 'weight' && history.bestSet ? `모두 ${history.total}번` : null}
        />
      </div>

      {trend.length >= 2 && (
        <div>
          <VolumeTrend points={trend} kind={kind} unit={unit} />
          {approx && (
            <p className="mt-1.5 text-[10px] leading-relaxed break-keep text-muted/80">
              세트를 하나씩 남기지 않은 날은 요약(세트 × 횟수 × 가장 무거운 무게)으로
              어림했어요.
            </p>
          )}
        </div>
      )}

      <div>
        <p className="mb-1.5 text-[11px] font-semibold text-muted">최근 기록</p>
        <ul className="divide-y divide-line rounded-xl border border-line">
          {days.slice(0, limit).map((day) => (
            <li key={day.date} className="px-3 py-2">
              <div className="flex items-baseline justify-between gap-2">
                <span className="text-xs font-semibold text-ink">
                  {dayLabel(day.date)}
                </span>
                {day.volume != null && (
                  <span className="shrink-0 text-[11px] tabular-nums text-muted">
                    {day.approx && '약 '}
                    {volumeText(kind, day.volume, unit)}
                  </span>
                )}
              </div>
              <p className="mt-0.5 text-xs leading-relaxed break-keep tabular-nums text-muted">
                {dayText(day, unit)}
              </p>
            </li>
          ))}
        </ul>
        {days.length > limit && (
          <MoreButton
            count={days.length - limit}
            unit="번"
            onClick={() => setExpanded(true)}
          />
        )}
      </div>
    </div>
  );
}
