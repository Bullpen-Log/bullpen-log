'use client';

import { useActionState, useState, useSyncExternalStore } from 'react';
import { useFormStatus } from 'react-dom';
import { CheckCircle2, ChevronDown, Pencil } from 'lucide-react';
import { saveCheckin, type CheckinState } from '@/app/actions/checkin';
import {
  BODY_FEELINGS,
  CHECKIN_PARTS,
  MAX_CONDITION,
  MAX_PREFERRED_PARTS,
  MIN_CONDITION,
  NO_WORKOUT_KIND,
  SLEEP_LEVELS,
  WORKOUT_KINDS,
  type CheckinParts,
  hasPain,
} from '@/lib/checkin';
import { kept, keptAll } from '@/lib/form-values';
import { toDateKey } from '@/lib/pitch-stats';

export type CheckinData = CheckinParts & {
  /** YYYY-MM-DD */
  date: string;
  condition: number;
  sleep: string;
  /** 오늘 하고 싶다고 고른 운동 부위 */
  preferredParts: string[];
  /** 오늘 하고 싶다고 고른 운동 종류. 안 골랐으면 null */
  preferredWorkout: string | null;
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
  onPick,
}: {
  name: string;
  value: string;
  defaultChecked?: boolean;
  className?: string;
  children: React.ReactNode;
  required?: boolean;
  /** 골랐을 때 알린다. 접었다 폈다 하는 자리에서 요약을 다시 그리는 데 쓴다. */
  onPick?: (value: string) => void;
}) {
  return (
    <label className="inline-flex">
      <input
        type="radio"
        name={name}
        value={value}
        defaultChecked={defaultChecked}
        required={required}
        onChange={() => onPick?.(value)}
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

/** 여러 개를 고를 수 있는 칩. 다시 누르면 꺼진다. */
function ChipCheckbox({
  name,
  value,
  defaultChecked,
  children,
}: {
  name: string;
  value: string;
  defaultChecked?: boolean;
  children: React.ReactNode;
}) {
  return (
    <label className="inline-flex">
      <input
        type="checkbox"
        name={name}
        value={value}
        defaultChecked={defaultChecked}
        className="peer sr-only"
      />
      <span
        className={`${chipBase} peer-checked:border-sky peer-checked:bg-sky/10 peer-checked:font-medium peer-checked:text-sky peer-focus-visible:ring-1 peer-focus-visible:ring-sky`}
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

/**
 * 오늘 컨디션 체크인.
 *
 * 홈의 상자를 누르면 뜨는 창 안에서 쓴다. 그래서 자기 껍데기(테두리·제목)를
 * 만들지 않는다 — 창이 이미 가지고 있어서 겹친다.
 */
export function CheckinForm({
  recent,
  parts,
}: {
  recent: CheckinData[];
  /** 고를 수 있는 운동 부위 — 라이브러리에서 뽑아 넘어온다 */
  parts: string[];
}) {
  // 서버(UTC)와 한국 시간의 날짜가 다른 시간대가 있어,
  // '오늘'은 화면이 뜬 뒤 사용자 시간 기준으로 정한다.
  const todayKey = useClientTodayKey();

  const [editing, setEditing] = useState(false);
  /**
   * 몸 상태 칸을 폈는가.
   *
   * 지금 고른 값도 함께 들고 있어야 한다. 라디오는 폼이 직접 들고 있으므로
   * (defaultChecked), 접었을 때 "다 정상"이라고 말하려면 바뀐 값을 따로 알아야
   * 한다. 아무것도 안 건드렸으면 null 이고, 그때는 서버가 준 값을 그대로 쓴다.
   */
  const [partsOpen, setPartsOpen] = useState(false);
  const [partEdits, setPartEdits] = useState<Record<string, string> | null>(null);
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
    // 저장에 실패해 돌아오면 서버가 준 값으로 다시 시작한다
    setPartEdits(null);
  }

  const today = todayKey
    ? recent.find((c) => c.date === todayKey) ?? null
    : null;
  const painToday = today ? hasPain(today) : false;

  /*
   * 오류로 되돌아왔을 때 방금 고른 것들을 그대로 다시 보여준다.
   * 부위가 여러 줄이라, 저장 전 상태로 돌아가면 처음부터 다시 골라야 한다.
   */
  const before = state?.values;
  const pick = (name: string, fallback: string | number | undefined) =>
    before ? kept(before, name) : fallback === undefined ? undefined : String(fallback);
  const pickedParts = before
    ? keptAll(before, 'preferredParts') ?? []
    : today?.preferredParts ?? [];
  /** 고른 운동 종류. '' 는 추천대로 — 안 고른 것과 같은 뜻이다. */
  const pickedWorkout = before
    ? (kept(before, 'preferredWorkout') ?? '')
    : (today?.preferredWorkout ?? '');

  /*
   * 지금 몸 상태. 손댄 것이 있으면 그것을, 없으면 서버가 준 값을 본다.
   * 하나라도 정상이 아니면 접지 않는다 — 아픈 곳을 숨기면 안 된다.
   */
  const partNow = (key: string, fallback: string) =>
    partEdits?.[key] ?? pick(key, fallback) ?? fallback;
  const hurting = CHECKIN_PARTS.filter(
    (p) => partNow(p.key, today?.[p.key] ?? '정상') !== '정상'
  );
  const partsExpanded = partsOpen || hurting.length > 0;
  const partsSummary =
    hurting.length === 0
      ? null
      : hurting
          .map((p) => `${p.label} ${partNow(p.key, today?.[p.key] ?? '정상')}`)
          .join(' · ');

  return (
    <div>
      {/*
        제목과 설명은 창 머리에 있으므로 여기서 다시 적지 않는다.
        이미 남긴 날에는 요약을 보여주고, 고칠 수 있게 단추를 하나 둔다.
      */}
      {today && !editing && (
        <div className="mb-4 flex items-center gap-2">
          <span className="inline-flex items-center gap-1.5 text-xs font-semibold text-ok">
            <CheckCircle2 className="h-4 w-4" />
            오늘 체크인을 남겼습니다
          </span>
          <button
            type="button"
            onClick={() => setEditing(true)}
            className="ml-auto inline-flex items-center gap-1 rounded-lg border border-line px-2.5 py-1.5 text-xs text-muted transition-colors hover:border-sky hover:text-sky"
          >
            <Pencil className="h-3 w-3" />
            수정
          </button>
        </div>
      )}

      {/* 아직 오늘 날짜를 모르는 첫 순간에는 내용을 그리지 않는다. */}
      {todayKey && (
        <div>
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
                          ? 'font-semibold text-danger'
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

              {/* 고른 게 있으면 보여준다. 안 보이면 저장됐는지 알 수 없다. */}
              {today.preferredWorkout && (
                <p className="mt-3 flex flex-wrap items-center gap-1.5 text-xs text-muted">
                  오늘 하고 싶은 운동
                  <span className="rounded-lg border border-sky-soft/60 bg-sky/10 px-2 py-0.5 font-medium text-sky-strong">
                    {today.preferredWorkout}
                  </span>
                </p>
              )}
              {today.preferredParts.length > 0 && (
                <p className="mt-3 flex flex-wrap items-center gap-1.5 text-xs text-muted">
                  오늘 하고 싶은 부위
                  {today.preferredParts.map((part) => (
                    <span
                      key={part}
                      className="rounded-lg border border-sky-soft/60 bg-sky/10 px-2 py-0.5 font-medium text-sky-strong"
                    >
                      {part}
                    </span>
                  ))}
                </p>
              )}

              {painToday && (
                <p className="mt-4 rounded-xl border border-danger-line bg-danger-bg px-4 py-3 text-xs leading-relaxed text-danger">
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
                <p className="rounded-lg border border-danger-line bg-danger-bg px-4 py-3 text-sm text-danger">
                  {state.error}
                </p>
              )}

              {/*
                * 몸 상태는 접어 둔다.
                *
                * 다섯 부위가 저마다 세 칸이라 화면의 대부분을 먹는데, 다섯 개
                * 모두 이미 '정상'이 기본값이라 대개 손댈 일이 없다. 매일 지나쳐
                * 스크롤해야 하는 것이 실제 부담이었다.
                *
                * 접혀 있어도 값은 그대로 폼에 들어간다 — 라디오를 숨기기만 하고
                * 지우지 않는다. 아픈 곳이 있는 날에는 저절로 펴진다.
                */}
              <div className="rounded-xl border border-line bg-surface-2/50 px-3 py-2.5">
                <div className="flex flex-wrap items-center gap-x-3 gap-y-1.5">
                  <span className="text-xs font-medium text-muted">몸 상태</span>
                  <span
                    className={`text-xs ${partsSummary ? 'font-medium text-warn' : 'text-ink'}`}
                  >
                    {partsSummary ?? '다 정상'}
                  </span>
                  {/*
                    아픈 곳이 있으면 접는 단추를 아예 내지 않는다. 못 누르는
                    단추를 남겨두면 고장 난 줄 안다. 다시 정상으로 바꾸면
                    단추가 돌아온다.
                  */}
                  {hurting.length === 0 && (
                    <button
                      type="button"
                      onClick={() => setPartsOpen((v) => !v)}
                      aria-expanded={partsExpanded}
                      className="ml-auto inline-flex items-center gap-1 rounded-lg border border-line px-2.5 py-1 text-xs text-muted transition-colors hover:border-sky hover:text-sky"
                    >
                      <ChevronDown
                        aria-hidden
                        className={`h-3.5 w-3.5 transition-transform ${partsExpanded ? 'rotate-180' : ''}`}
                      />
                      {partsExpanded ? '접기' : '아픈 데 있어요'}
                    </button>
                  )}
                </div>

                <div className={partsExpanded ? 'mt-3 space-y-3' : 'hidden'}>
                  {CHECKIN_PARTS.map((part) => (
                    <Row key={part.key} label={part.label}>
                      {BODY_FEELINGS.map((v) => (
                        <ChipRadio
                          key={v}
                          name={part.key}
                          value={v}
                          required
                          defaultChecked={pick(part.key, today?.[part.key] ?? '정상') === v}
                          className={feelingChipClass(v)}
                          onPick={(v) =>
                            setPartEdits((prev) => ({
                              ...(prev ??
                                Object.fromEntries(
                                  CHECKIN_PARTS.map((q) => [
                                    q.key,
                                    partNow(q.key, today?.[q.key] ?? '정상'),
                                  ])
                                )),
                              [part.key]: v,
                            }))
                          }
                        >
                          {v}
                        </ChipRadio>
                      ))}
                    </Row>
                  ))}
                </div>
              </div>

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
                    defaultChecked={pick('condition', today?.condition) === String(n)}
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
                    defaultChecked={pick('sleep', today?.sleep) === v}
                  >
                    {v}
                  </ChipRadio>
                ))}
              </Row>

              {/*
                * 오늘 하고 싶은 운동 종류.
                *
                * 부위보다 앞에 둔다. "오늘 하체"보다 "오늘 파워"가 몸에 걸리는
                * 부담을 더 크게 가르기 때문이다.
                *
                * '추천대로'는 빈 값으로 보낸다. '고르지 않음'을 값으로 저장하면
                * 나중에 목록을 고칠 때 그게 무엇이었는지 다시 따져야 한다.
                */}
              <Row label="오늘 하고 싶은 운동">
                <ChipRadio
                  name="preferredWorkout"
                  value=""
                  defaultChecked={pickedWorkout === ''}
                >
                  {NO_WORKOUT_KIND}
                </ChipRadio>
                {WORKOUT_KINDS.map((k) => (
                  <ChipRadio
                    key={k.name}
                    name="preferredWorkout"
                    value={k.name}
                    defaultChecked={pickedWorkout === k.name}
                  >
                    {k.name}
                  </ChipRadio>
                ))}
                <span className="ml-1 self-center text-[10px] leading-relaxed text-muted/60">
                  {WORKOUT_KINDS.map((k) => `${k.name} ${k.desc}`).join(' · ')}
                </span>
              </Row>

              {/*
                * 오늘 하고 싶은 부위. 안 골라도 되고, 골라도 안전 규칙을
                * 뚫지는 않는다 — 통과한 후보 중 순서만 앞당긴다.
                * 목록은 라이브러리에 실제로 있는 부위에서 뽑아 넘어온다.
                */}
              {parts.length > 0 && (
                <Row label="오늘 하고 싶은 부위">
                  {parts.map((part) => (
                    <ChipCheckbox
                      key={part}
                      name="preferredParts"
                      value={part}
                      defaultChecked={pickedParts.includes(part)}
                    >
                      {part}
                    </ChipCheckbox>
                  ))}
                  <span className="ml-1 self-center text-[10px] text-muted/60">
                    최대 {MAX_PREFERRED_PARTS}개 · 안 골라도 됩니다
                  </span>
                </Row>
              )}

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
    </div>
  );
}
