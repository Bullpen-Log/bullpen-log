'use client';

import { useEffect, useState } from 'react';
import { NotebookPen } from 'lucide-react';
import { exerciseHistory } from '@/app/actions/exercise-history';
import { useWeightUnit } from '@/components/use-units';
import { formatAmount, formatSeconds } from '@/lib/exercise-meta';
import { formatWeight, type WeightUnit } from '@/lib/units';
import { volumeIn } from '@/lib/workout/summarize';
import type { ExerciseHistory, HistoryDay, HistoryKind } from '@/lib/workout/history';

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
              '신호가 없어 기록을 불러오지 못했습니다. 신호가 잡히면 다시 열어 주세요.',
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
 * 볼륨 흐름 — 날마다 한 양을 오래된 것부터 잇는다.
 *
 * 바닥을 0 에 둔다. 가장 적은 날을 바닥으로 잡으면 10% 차이가 화면 끝에서
 * 끝으로 벌어져, 늘지 않은 것이 크게 는 것처럼 보인다.
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
  const W = 300;
  const H = 72;
  const PAD = 6;
  const max = Math.max(...points.map((p) => p.value));
  const x = (i: number) =>
    points.length === 1 ? W / 2 : PAD + (i * (W - 2 * PAD)) / (points.length - 1);
  const y = (v: number) => H - PAD - (v / max) * (H - 2 * PAD);
  const peak = points.reduce((a, b) => (b.value > a.value ? b : a));

  return (
    <div>
      <div className="flex items-baseline justify-between gap-2 text-[11px] text-muted">
        <span>
          {kind === 'weight'
            ? '볼륨(무게×횟수)'
            : kind === 'reps'
              ? '횟수 합'
              : '버틴 시간 합'}{' '}
          — 최근 {points.length}번
        </span>
        <span className="tabular-nums">
          가장 많이 {volumeText(kind, peak.value, unit)}
        </span>
      </div>
      <svg
        viewBox={`0 0 ${W} ${H}`}
        preserveAspectRatio="none"
        className="mt-1.5 h-16 w-full"
        role="img"
        aria-label={`날짜별 ${kind === 'weight' ? '볼륨' : '양'}: ${points
          .map((p) => `${dayLabel(p.date)} ${volumeText(kind, p.value, unit)}`)
          .join(', ')}`}
      >
        <line
          x1="0"
          y1={H - PAD}
          x2={W}
          y2={H - PAD}
          className="stroke-line"
          strokeWidth="1"
          vectorEffect="non-scaling-stroke"
        />
        {points.length > 1 && (
          <polyline
            points={points.map((p, i) => `${x(i)},${y(p.value)}`).join(' ')}
            fill="none"
            className="stroke-sky"
            strokeWidth="2"
            strokeLinejoin="round"
            strokeLinecap="round"
            vectorEffect="non-scaling-stroke"
          />
        )}
        {/* 점 — 길이 0 인 선에 둥근 끝을 달면, 가로세로가 늘어나도 동그랗게 남는다 */}
        {points.map((p, i) => (
          <line
            key={p.date}
            x1={x(i)}
            y1={y(p.value)}
            x2={x(i)}
            y2={y(p.value)}
            className={i === points.length - 1 ? 'stroke-sky-strong' : 'stroke-sky'}
            strokeWidth={i === points.length - 1 ? 8 : 6}
            strokeLinecap="round"
            vectorEffect="non-scaling-stroke"
          />
        ))}
      </svg>
      <div className="mt-1 flex justify-between text-[10px] tabular-nums text-muted">
        <span>{dayLabel(points[0].date)}</span>
        {points.length > 1 && <span>{dayLabel(points[points.length - 1].date)}</span>}
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
          아직 이 운동을 한 기록이 없습니다. 운동을 마치면 여기에 쌓입니다.
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
              어림했습니다.
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
          <button
            type="button"
            onClick={() => setExpanded(true)}
            className="mt-2 w-full rounded-xl border border-line-strong py-2 text-xs font-semibold text-ink transition-colors active:bg-surface-2"
          >
            {days.length - limit}번 더 보기
          </button>
        )}
      </div>
    </div>
  );
}
