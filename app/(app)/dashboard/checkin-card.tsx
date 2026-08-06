'use client';

import { useActionState, useState, useSyncExternalStore } from 'react';
import { useFormStatus } from 'react-dom';
import { AlertTriangle, CheckCircle2, ClipboardList, Pencil } from 'lucide-react';
import { saveCheckin, type CheckinState } from '@/app/actions/checkin';
import {
  BODY_FEELINGS,
  CHECKIN_PARTS,
  MAX_CONDITION,
  MIN_CONDITION,
  SLEEP_LEVELS,
  type CheckinParts,
  hasPain,
} from '@/lib/checkin';
import { toDateKey } from '@/lib/pitch-stats';

export type CheckinData = CheckinParts & {
  /** YYYY-MM-DD */
  date: string;
  condition: number;
  sleep: string;
};

/** 값에 따라 칩 색이 달라진다. '통증'은 항상 빨간색으로 도드라지게. */
function feelingChipClass(value: string) {
  if (value === '통증')
    return 'peer-checked:border-red-500/70 peer-checked:bg-red-500/10 peer-checked:text-red-700';
  if (value === '뻐근')
    return 'peer-checked:border-amber-500/60 peer-checked:bg-amber-500/10 peer-checked:text-warn';
  return 'peer-checked:border-sky peer-checked:bg-sky/10 peer-checked:text-sky';
}

const chipBase =
  'cursor-pointer select-none rounded-lg border border-line bg-surface-2 px-3 py-2 text-xs text-muted transition-colors hover:border-sky-soft hover:text-ink peer-checked:font-medium';

function ChipRadio({
  name,
  value,
  defaultChecked,
  className,
  children,
  required,
}: {
  name: string;
  value: string;
  defaultChecked?: boolean;
  className?: string;
  children: React.ReactNode;
  required?: boolean;
}) {
  return (
    <label className="inline-flex">
      <input
        type="radio"
        name={name}
        value={value}
        defaultChecked={defaultChecked}
        required={required}
        className="peer sr-only"
      />
      <span
        className={`${chipBase} ${className ?? 'peer-checked:border-sky peer-checked:bg-sky/10 peer-checked:text-sky'} peer-focus-visible:ring-1 peer-focus-visible:ring-sky`}
      >
        {children}
      </span>
    </label>
  );
}

function Row({ label, children }: { label: string; children: React.ReactNode }) {
  return (
    <div className="flex flex-col gap-2 sm:flex-row sm:items-center">
      <span className="w-28 shrink-0 text-xs font-medium text-muted">{label}</span>
      <div className="flex flex-wrap gap-1.5">{children}</div>
    </div>
  );
}

function SubmitButton() {
  const { pending } = useFormStatus();
  return (
    <button
      type="submit"
      disabled={pending}
      className="rounded-xl bg-sky px-5 py-2.5 text-sm font-semibold text-white transition-colors hover:bg-sky-strong disabled:cursor-not-allowed disabled:opacity-50"
    >
      {pending ? '저장 중…' : '체크인 저장'}
    </button>
  );
}

/** 서버에서는 null, 화면에 뜬 뒤에는 사용자 시간대 기준의 오늘 날짜. */
function useClientTodayKey() {
  return useSyncExternalStore(
    () => () => {},
    () => toDateKey(new Date()),
    () => null
  );
}

export function CheckinCard({ recent }: { recent: CheckinData[] }) {
  // 서버(UTC)와 한국 시간의 날짜가 다른 시간대가 있어,
  // '오늘'은 화면이 뜬 뒤 사용자 시간 기준으로 정한다.
  const todayKey = useClientTodayKey();

  const [editing, setEditing] = useState(false);
  const [state, formAction] = useActionState<CheckinState, FormData>(
    saveCheckin,
    undefined
  );

  // 저장에 성공하면 입력 폼을 닫고 요약으로 돌아간다.
  // (렌더 중 상태 보정 — effect에서 setState를 부르지 않기 위한 패턴)
  const [seenState, setSeenState] = useState<CheckinState>(undefined);
  if (state !== seenState) {
    setSeenState(state);
    if (state?.success) setEditing(false);
  }

  const today = todayKey
    ? recent.find((c) => c.date === todayKey) ?? null
    : null;
  const painToday = today ? hasPain(today) : false;

  return (
    <section
      className={`rounded-2xl border p-5 sm:p-6 ${
        painToday
          ? 'border-red-200 bg-red-50'
          : 'border-line bg-surface'
      }`}
    >
      {/* 제목 줄 */}
      <div className="flex flex-wrap items-center gap-3">
        <span
          className={`flex h-9 w-9 items-center justify-center rounded-xl border ${
            painToday
              ? 'border-red-300 text-red-600'
              : 'border-line-strong text-sky'
          }`}
        >
          {painToday ? (
            <AlertTriangle className="h-4 w-4" />
          ) : (
            <ClipboardList className="h-4 w-4" />
          )}
        </span>
        <div className="min-w-0 flex-1">
          <h2 className="text-sm font-bold text-ink">오늘 컨디션 체크인</h2>
          <p className="mt-0.5 text-xs text-muted">
            30초면 됩니다. 리포트와 운동 추천의 기준이 됩니다.
          </p>
        </div>

        {today && !editing && (
          <span className="flex items-center gap-2">
            <span className="inline-flex items-center gap-1.5 text-xs text-emerald-600">
              <CheckCircle2 className="h-4 w-4" />
              완료
            </span>
            <button
              type="button"
              onClick={() => setEditing(true)}
              className="inline-flex items-center gap-1 rounded-lg border border-line px-2.5 py-1.5 text-xs text-muted transition-colors hover:border-sky hover:text-sky"
            >
              <Pencil className="h-3 w-3" />
              수정
            </button>
          </span>
        )}
      </div>

      {/* 아직 오늘 날짜를 모르는 첫 순간에는 내용을 그리지 않는다. */}
      {todayKey && (
        <div className="mt-4">
          {today && !editing ? (
            <>
              {/* 완료 요약 */}
              <dl className="flex flex-wrap gap-x-5 gap-y-1.5 text-xs text-muted">
                {[
                  ...CHECKIN_PARTS.map((p) => [p.label, today[p.key]] as const),
                  ['컨디션', `${today.condition}/10`],
                  ['수면', today.sleep],
                ].map(([k, v]) => (
                  <div key={k} className="flex items-baseline gap-1.5">
                    <dt>{k}</dt>
                    <dd
                      className={
                        v === '통증'
                          ? 'font-semibold text-red-600'
                          : v === '뻐근'
                            ? 'font-medium text-warn'
                            : 'text-ink'
                      }
                    >
                      {v}
                    </dd>
                  </div>
                ))}
              </dl>

              {painToday && (
                <p className="mt-4 rounded-xl border border-red-200 bg-red-50 px-4 py-3 text-xs leading-relaxed text-red-700">
                  통증이 있는 날은 던지거나 무리한 운동을 하지 마세요. 통증이
                  이어지면 전문의 진료를 받아보는 것이 좋습니다. 통증이 있는
                  동안에는 운동 추천도 제공하지 않습니다.
                </p>
              )}
            </>
          ) : (
            <form action={formAction} className="space-y-4">
              <input type="hidden" name="date" value={todayKey} />

              {state?.error && (
                <p className="rounded-lg border border-red-200 bg-red-50 px-4 py-3 text-sm text-red-700">
                  {state.error}
                </p>
              )}

              <p className="text-xs text-muted">
                아픈 곳만 바꿔주세요. 나머지는 정상으로 저장됩니다.
              </p>

              {CHECKIN_PARTS.map((part) => (
                <Row key={part.key} label={part.label}>
                  {BODY_FEELINGS.map((v) => (
                    <ChipRadio
                      key={v}
                      name={part.key}
                      value={v}
                      required
                      defaultChecked={(today?.[part.key] ?? '정상') === v}
                      className={feelingChipClass(v)}
                    >
                      {v}
                    </ChipRadio>
                  ))}
                </Row>
              ))}

              <Row label="전신 컨디션">
                {Array.from(
                  { length: MAX_CONDITION - MIN_CONDITION + 1 },
                  (_, i) => MIN_CONDITION + i
                ).map((n) => (
                  <ChipRadio
                    key={n}
                    name="condition"
                    value={String(n)}
                    required
                    defaultChecked={today?.condition === n}
                  >
                    {n}
                  </ChipRadio>
                ))}
                <span className="ml-1 self-center text-[10px] text-muted/60">
                  1 안 좋음 · 10 최상
                </span>
              </Row>

              <Row label="수면">
                {SLEEP_LEVELS.map((v) => (
                  <ChipRadio
                    key={v}
                    name="sleep"
                    value={v}
                    required
                    defaultChecked={today?.sleep === v}
                  >
                    {v}
                  </ChipRadio>
                ))}
              </Row>

              <div className="flex items-center gap-3 pt-1">
                <SubmitButton />
                {today && (
                  <button
                    type="button"
                    onClick={() => setEditing(false)}
                    className="text-xs text-muted transition-colors hover:text-ink"
                  >
                    취소
                  </button>
                )}
              </div>
            </form>
          )}
        </div>
      )}
    </section>
  );
}
