'use client';

import { useEffect } from 'react';
import Link from 'next/link';
import { Check, Trophy } from 'lucide-react';
import { buzz } from '@/lib/haptics';
import { useWeightUnit } from '@/components/use-units';
import { formatSeconds } from '@/lib/exercise-meta';
import { formatWeight, type WeightUnit } from '@/lib/units';
import { formatSummary, volumeIn, type ExerciseSummary } from '@/lib/workout/summarize';
import type { NewRecord } from '@/lib/workout/bests';

export type DoneRow = {
  id: string;
  title: string;
  /** 무게는 kg 숫자로 — 고른 단위(kg · lb)는 브라우저에만 있어 여기서 글자로 만든다 */
  summary: ExerciseSummary;
  /** 오늘 지난 최고를 넘었으면 그 기록과 넘기 전 값 */
  record: (NewRecord & { before: number | null }) | null;
};

/** 기록 값을 사람 말로 — 102.5kg · 15회 · 1분 05초 */
function recordText(kind: NewRecord['kind'], value: number, unit: WeightUnit) {
  if (kind === 'weight') return formatWeight(value, unit);
  if (kind === 'reps') return `${value}회`;
  return formatSeconds(value);
}

/**
 * 운동 끝 화면의 그림 — 링이 한 바퀴 그려지고 체크가 톡 뜨며 손에 두 번 떤다. 아래 덩이는 차례로
 * 떠오른다(globals.css 'done-ring' · 'rise-in', 움직임 줄이기면 처음부터 다 보인다). [완료]는 처음부터
 * 서 있다 — 축하가 끝나기를 기다리게 하지 않는다.
 */
export function DoneClient({
  themeLabel,
  dateLabel,
  minutes,
  setCount,
  volumeKg,
  rows,
  program = null,
}: {
  /** 근력 · 파워 프로그램 날이면 — 일차 넘김 · 고비 한 줄 · 운동별 추천 → 실제(설계 §13-9) */
  program?: {
    headline: string;
    note: string | null;
    lifts: {
      title: string;
      suggested: number;
      actual: number | null;
      rir: number | null;
    }[];
  } | null;
  themeLabel: string;
  dateLabel: string;
  minutes: number;
  setCount: number;
  volumeKg: number;
  rows: DoneRow[];
}) {
  const unit = useWeightUnit();
  const records = rows.filter((r) => r.record);

  /* 체크가 뜨는 순간에 맞춰 떤다 — 축하는 손으로도 */
  useEffect(() => {
    const t = window.setTimeout(() => buzz([15, 120, 15]), 550);
    return () => window.clearTimeout(t);
  }, []);

  const numbers = [
    { label: '운동 시간', value: `${minutes}`, unit: '분' },
    { label: '세트', value: `${setCount}`, unit: '세트' },
    {
      label: '볼륨',
      value: volumeKg > 0 ? volumeIn(volumeKg, unit).toLocaleString('ko-KR') : '—',
      unit: volumeKg > 0 ? unit : '',
    },
  ];

  return (
    <div className="flex min-h-0 flex-1 flex-col">
      <div className="no-scrollbar flex-1 overflow-y-auto px-5 pt-[calc(env(safe-area-inset-top)+2.5rem)] pb-6">
        <div className="mx-auto max-w-md">
          <div className="relative mx-auto h-24 w-24">
            <svg
              aria-hidden
              viewBox="0 0 100 100"
              className="absolute inset-0 -rotate-90"
            >
              <circle
                cx="50"
                cy="50"
                r="46"
                fill="none"
                strokeWidth="6"
                className="stroke-sky/15"
              />
              <circle
                cx="50"
                cy="50"
                r="46"
                fill="none"
                strokeWidth="6"
                strokeLinecap="round"
                pathLength={100}
                strokeDasharray="100"
                className="done-ring stroke-sky"
              />
            </svg>
            <span
              aria-hidden
              className="finish-pop done-check absolute inset-3 grid place-items-center rounded-full bg-sky text-white"
            >
              <Check className="h-10 w-10" strokeWidth={3} />
            </span>
          </div>

          <h1 className="rise-in mt-5 text-center text-3xl font-bold text-ink [--rise-delay:600ms]">
            운동 끝!
          </h1>
          <p className="rise-in mt-1 text-center text-sm text-muted [--rise-delay:650ms]">
            {themeLabel} · {dateLabel}
          </p>

          {/* 세 숫자 — 트레이닝의 완료 카드와 같은 셋, 같은 차례 */}
          <dl className="rise-in mt-7 grid grid-cols-3 divide-x divide-line rounded-2xl bg-surface py-4 [--rise-delay:750ms]">
            {numbers.map((n) => (
              <div key={n.label} className="px-1 text-center">
                <dt className="text-xs text-muted">{n.label}</dt>
                <dd className="text-numeric mt-1.5 text-2xl leading-none text-ink">
                  {n.value}
                  <span className="ml-0.5 font-sans text-xs font-medium text-muted">
                    {n.unit}
                  </span>
                </dd>
              </div>
            ))}
          </dl>

          {program && (
            <section className="rise-in mt-6 [--rise-delay:800ms]">
              <h2 className="px-1 text-sm font-semibold text-muted">
                근력 · 파워 프로그램
              </h2>
              <div className="mt-2 space-y-2 rounded-2xl bg-surface px-4 py-3">
                <p className="text-[15px] font-semibold text-ink">{program.headline}</p>
                {program.lifts.length > 0 && (
                  <ul className="divide-y divide-line">
                    {program.lifts.map((l) => (
                      <li
                        key={l.title}
                        className="flex items-center justify-between gap-3 py-2 text-sm"
                      >
                        <span className="min-w-0 truncate text-ink">{l.title}</span>
                        <span className="text-numeric shrink-0 text-muted">
                          추천 {l.suggested} → 실제 {l.actual}
                          {l.rir != null && ` · 여유 ${l.rir >= 4 ? '4+' : l.rir}`}
                        </span>
                      </li>
                    ))}
                  </ul>
                )}
                {program.note && <p className="text-xs text-muted">{program.note}</p>}
              </div>
            </section>
          )}

          {records.length > 0 && (
            <section className="rise-in mt-6 [--rise-delay:900ms]">
              <h2 className="px-1 text-sm font-semibold text-muted">
                새 최고 기록 {records.length}개
              </h2>
              <ul className="mt-2 divide-y divide-line overflow-hidden rounded-2xl bg-surface">
                {records.map(({ id, title, record }) =>
                  record ? (
                    <li key={id} className="flex items-center gap-3 px-4 py-3">
                      <span className="grid h-9 w-9 shrink-0 place-items-center rounded-full bg-sky text-white">
                        <Trophy aria-hidden className="h-4 w-4" strokeWidth={2.4} />
                      </span>
                      <span className="min-w-0 flex-1">
                        <span className="block truncate text-[15px] font-semibold text-ink">
                          {title}
                        </span>
                        {record.before != null && (
                          <span className="block text-xs text-muted">
                            지난 최고 {recordText(record.kind, record.before, unit)}
                          </span>
                        )}
                      </span>
                      <span className="text-numeric shrink-0 text-lg text-sky">
                        {recordText(record.kind, record.value, unit)}
                      </span>
                    </li>
                  ) : null
                )}
              </ul>
            </section>
          )}

          <section className="rise-in mt-6 [--rise-delay:1000ms]">
            <h2 className="px-1 text-sm font-semibold text-muted">오늘 한 운동</h2>
            <ul className="mt-2 divide-y divide-line overflow-hidden rounded-2xl bg-surface">
              {rows.map((r) => (
                <li key={r.id} className="flex items-center gap-3 px-4 py-3">
                  <span className="min-w-0 flex-1 truncate text-[15px] text-ink">
                    {r.title}
                  </span>
                  <span className="shrink-0 text-[13px] tabular-nums text-muted">
                    {formatSummary(r.summary, unit)}
                  </span>
                </li>
              ))}
            </ul>
          </section>
        </div>
      </div>

      <div className="shrink-0 px-5 pt-3 pb-[max(1rem,env(safe-area-inset-bottom))]">
        <Link
          href="/training"
          replace
          className="mx-auto flex h-14 max-w-md items-center justify-center rounded-full bg-sky text-lg font-bold text-white transition-transform motion-safe:active:scale-[0.98]"
        >
          완료
        </Link>
      </div>
    </div>
  );
}
