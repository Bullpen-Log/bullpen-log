'use client';

import {
  useActionState,
  useEffect,
  useRef,
  useState,
  useSyncExternalStore,
} from 'react';
import { useFormStatus } from 'react-dom';
import { CheckCircle2, ChevronDown, Pencil } from 'lucide-react';
import { saveCheckin, type CheckinState } from '@/app/actions/checkin';
import {
  BODY_FEELINGS,
  CHECKIN_NOTE_MAX,
  CHECKIN_PARTS,
  CHECKIN_WEIGHT_MAX_KG,
  CHECKIN_WEIGHT_MIN_KG,
  DETAIL_SCALES,
  HYDRATION_LEVELS,
  MAX_CONDITION,
  MAX_PREFERRED_PARTS,
  MIN_CONDITION,
  NO_WORKOUT_KIND,
  NUTRITION_LEVELS,
  RESTING_HR_MAX,
  RESTING_HR_MIN,
  SLEEP_HOURS_MAX,
  SLEEP_LEVELS,
  WORKOUT_KINDS,
  type CheckinDetail,
  type CheckinParts,
  hasDetail,
  hasPain,
} from '@/lib/checkin';
import { kept, keptAll } from '@/lib/form-values';
import { toDateKey } from '@/lib/pitch-stats';
import { formatWeight, fromWeight, round1, toWeight } from '@/lib/units';
import { useWeightUnit } from '@/components/use-units';

export type CheckinData = CheckinParts &
  CheckinDetail & {
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
  toggleable,
}: {
  name: string;
  value: string;
  defaultChecked?: boolean;
  className?: string;
  children: React.ReactNode;
  required?: boolean;
  /** 골랐을 때 알린다. 접었다 폈다 하는 자리에서 요약을 다시 그리는 데 쓴다. */
  onPick?: (value: string) => void;
  /**
   * 이미 고른 것을 한 번 더 누르면 풀린다.
   *
   * 상세 체크인은 전부 안 골라도 되는 칸이다. 그런데 보통 라디오는 한 번 누르면
   * 되돌릴 길이 없어서, 잘못 누른 칸이 그대로 저장된다. 다시 누르면 '안 고름'으로
   * 돌아가게 한다.
   */
  toggleable?: boolean;
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
        /* 누르기 직전에 이미 골라져 있었는지를 적어 둔다 — 누른 뒤에는 늘 골라져 있다 */
        onPointerDown={
          toggleable
            ? (e) => {
                e.currentTarget.dataset.was = e.currentTarget.checked ? '1' : '';
              }
            : undefined
        }
        onClick={
          toggleable
            ? (e) => {
                const input = e.currentTarget;
                if (input.dataset.was === '1') input.checked = false;
                input.dataset.was = '';
              }
            : undefined
        }
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
      <div className="flex flex-wrap items-center gap-1.5">{children}</div>
    </div>
  );
}

/** 상세 쪽의 작은 묶음 제목 — 칸이 많아 한 덩어리로 보이지 않게 나눈다 */
function Section({ title, children }: { title: string; children: React.ReactNode }) {
  return (
    <div className="space-y-3">
      <p className="text-[11px] font-semibold tracking-normal text-muted/80">{title}</p>
      {children}
    </div>
  );
}

const numberInput =
  'w-24 rounded-lg border border-line bg-surface-2 px-3 py-2 text-xs text-ink outline-none transition-colors placeholder:text-muted/50 focus:border-sky';

/** 숫자 한 칸 — 뒤에 단위를 붙인다 */
function NumberRow({
  label,
  name,
  suffix,
  defaultValue,
  min,
  max,
  step,
  placeholder,
}: {
  label: string;
  name: string;
  suffix: string;
  defaultValue?: string;
  min: number;
  max: number;
  step: number;
  placeholder: string;
}) {
  return (
    <Row label={label}>
      <input
        type="number"
        name={name}
        inputMode="decimal"
        defaultValue={defaultValue}
        min={min}
        max={max}
        step={step}
        placeholder={placeholder}
        className={numberInput}
      />
      <span className="text-xs text-muted">{suffix}</span>
    </Row>
  );
}

/**
 * 오늘 몸무게 — 고른 단위(kg·lb)로 보여주고 저장은 늘 kg.
 *
 * 내 정보의 몸무게 칸과 같은 방식이다. 숫자를 그대로 두고 단위만 바꾸면 72kg 가
 * 72lb(33kg)로 저장되어 버린다.
 */
function WeightRow({ defaultKg }: { defaultKg?: string }) {
  const unit = useWeightUnit();
  const [kg, setKg] = useState(defaultKg ?? '');
  const shown = kg === '' ? '' : String(round1(toWeight(Number(kg), unit)));

  return (
    <Row label="몸무게">
      <input
        type="number"
        inputMode="decimal"
        value={shown}
        onChange={(e) => {
          const v = e.target.value;
          setKg(v === '' ? '' : String(round1(fromWeight(Number(v), unit))));
        }}
        min={round1(toWeight(CHECKIN_WEIGHT_MIN_KG, unit))}
        max={round1(toWeight(CHECKIN_WEIGHT_MAX_KG, unit))}
        step={0.1}
        placeholder={unit === 'lb' ? '159' : '72'}
        className={numberInput}
      />
      <span className="text-xs text-muted">{unit}</span>
      {/* 서버로 가는 값은 언제나 kg */}
      <input type="hidden" name="bodyWeightKg" value={kg} />
    </Row>
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

type Mode = 'quick' | 'detail';

/** 마지막으로 고른 방식을 기억해 두는 자리. 이 브라우저에서만 쓰는 편의다. */
const MODE_KEY = 'bullpen-checkin-mode';

function readMode(): Mode {
  try {
    return localStorage.getItem(MODE_KEY) === 'detail' ? 'detail' : 'quick';
  } catch {
    return 'quick';
  }
}

/**
 * [간편 체크인 | 상세 체크인] 고르개.
 *
 * 고른 쪽 밑에 깔린 하늘색 알약이 옆으로 미끄러진다. 글자 색만 바뀌면 어느 쪽이
 * 켜졌는지 한 번 더 읽어야 한다.
 */
function ModeSwitch({ mode, onChange }: { mode: Mode; onChange: (m: Mode) => void }) {
  return (
    <div
      role="radiogroup"
      aria-label="체크인 방식"
      className="relative inline-grid grid-cols-2 rounded-xl border border-line-strong bg-surface p-0.5 text-xs font-semibold"
    >
      <span
        aria-hidden
        className={`absolute inset-y-0.5 left-0.5 w-[calc(50%-2px)] rounded-lg bg-sky transition-transform duration-300 ease-[cubic-bezier(0.2,0,0,1)] ${
          mode === 'detail' ? 'translate-x-full' : 'translate-x-0'
        }`}
      />
      {(['quick', 'detail'] as const).map((m) => (
        <button
          key={m}
          type="button"
          role="radio"
          aria-checked={mode === m}
          onClick={() => onChange(m)}
          className={`relative px-4 py-1.5 transition-colors duration-200 ${
            mode === m ? 'text-white' : 'text-muted hover:text-ink'
          }`}
        >
          {m === 'quick' ? '간편 체크인' : '상세 체크인'}
        </button>
      ))}
    </div>
  );
}

/** 요약에 쓰는 상세 값 — 적은 것만 한 줄씩 */
function detailLines(d: CheckinData, weightUnit: 'kg' | 'lb'): [string, string][] {
  const out: [string, string][] = [];
  if (d.sleepHours != null) out.push(['잔 시간', `${d.sleepHours}시간`]);
  for (const s of DETAIL_SCALES) {
    const v = d[s.key];
    if (v != null) out.push([s.label, s.options[v - 1] ?? String(v)]);
  }
  if (d.bodyWeightKg != null)
    out.push(['몸무게', formatWeight(d.bodyWeightKg, weightUnit) ?? '']);
  if (d.restingHr != null) out.push(['아침 심박', `${d.restingHr}bpm`]);
  if (d.hydration) out.push(['수분', d.hydration]);
  if (d.nutrition) out.push(['식사', d.nutrition]);
  return out;
}

/**
 * 오늘 컨디션 체크인.
 *
 * 두 곳에서 쓴다 — 홈의 체크인 상자를 눌러 뜨는 창, 그리고 그날 첫 접속 때 뜨는
 * 체크인 관문(components/checkin-gate.tsx). 그래서 자기 껍데기(테두리·제목)를
 * 만들지 않는다 — 감싸는 쪽이 이미 가지고 있어서 겹친다.
 *
 * 간편과 상세 두 가지로 받는다. 간편은 몸 상태·컨디션·수면만 — 매일 쓰는 것이라
 * 몇 초 안에 끝나야 한다. 상세는 운동 선호와 더 많은 기록(잔 시간·피로·팔 피로·
 * 몸무게·메모 등)까지 받되, 전부 안 채워도 된다.
 *
 * 간편으로 저장하면 상세 기록은 건드리지 않는다. 아침에 상세로 적어 둔 것을
 * 저녁에 간편으로 고쳐도 몸무게·메모가 지워지지 않는다(app/actions/checkin.ts).
 */
export function CheckinForm({
  recent,
  parts,
  onSaved,
}: {
  recent: CheckinData[];
  /** 고를 수 있는 운동 부위 — 라이브러리에서 뽑아 넘어온다 */
  parts: string[];
  /** 저장에 성공했을 때. 저장한 날짜를 준다. 체크인 관문이 이것을 보고 닫힌다. */
  onSaved?: (dateKey: string) => void;
}) {
  // 서버(UTC)와 한국 시간의 날짜가 다른 시간대가 있어,
  // '오늘'은 화면이 뜬 뒤 사용자 시간 기준으로 정한다.
  const todayKey = useClientTodayKey();
  const weightUnit = useWeightUnit();

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
  /*
   * 간편·상세 중 무엇으로 적는가. 지난번에 고른 쪽에서 시작한다 — 늘 상세로 적는
   * 사람에게 매번 상세를 누르게 할 까닭이 없다. 폼은 화면이 뜬 뒤에만 그리므로
   * (todayKey) 서버와 화면이 어긋나지 않는다.
   */
  const [mode, setMode] = useState<Mode>(readMode);
  const [state, formAction] = useActionState<CheckinState, FormData>(
    saveCheckin,
    undefined
  );

  // 저장에 성공하면 입력 폼을 닫고 요약으로 돌아간다.
  // (렌더 중 상태 보정 — effect에서 setState를 부르지 않기 위한 패턴)
  const [seenState, setSeenState] = useState<CheckinState>(undefined);
  /*
   * 저장할 때마다 폼을 새로 그린다(key). 오류로 돌아오면 방금 고른 값으로, 성공하면
   * 저장된 값으로 칸들이 다시 채워진다. 몸무게처럼 화면이 따로 들고 있는 칸은 이렇게
   * 해야 새 값으로 바뀐다.
   */
  const [formKey, setFormKey] = useState(0);
  if (state !== seenState) {
    setSeenState(state);
    setFormKey((k) => k + 1);
    if (state?.success) setEditing(false);
    // 저장에 실패해 돌아오면 서버가 준 값으로 다시 시작한다
    setPartEdits(null);
  }

  /*
   * 저장했다고 감싸는 쪽(체크인 관문)에 알린다. 그리는 도중에 남의 상태를 바꿀
   * 수는 없어서 effect 로 한다.
   */
  useEffect(() => {
    if (state?.success && state.savedDate) onSaved?.(state.savedDate);
  }, [state, onSaved]);

  /*
   * 저장이 막히면 알림이 보이는 곳까지 올라간다. 알림은 폼 맨 위에 뜨는데 저장
   * 단추는 맨 아래라, 상세까지 적은 날에는 알림이 화면 밖에 떠서 눌러도 아무 일이
   * 없는 것처럼 보였다.
   */
  const errorRef = useRef<HTMLParagraphElement>(null);
  useEffect(() => {
    if (!state?.error) return;
    const reduce = window.matchMedia('(prefers-reduced-motion: reduce)').matches;
    errorRef.current?.scrollIntoView({
      block: 'nearest',
      behavior: reduce ? 'auto' : 'smooth',
    });
  }, [state]);

  const pickMode = (m: Mode) => {
    setMode(m);
    try {
      localStorage.setItem(MODE_KEY, m);
    } catch {
      /* 저장을 못 해도 이번에는 고른 대로 된다 */
    }
  };

  const today = todayKey ? (recent.find((c) => c.date === todayKey) ?? null) : null;
  const painToday = today ? hasPain(today) : false;

  /*
   * 오류로 되돌아왔을 때 방금 고른 것들을 그대로 다시 보여준다.
   * 부위가 여러 줄이라, 저장 전 상태로 돌아가면 처음부터 다시 골라야 한다.
   */
  const before = state?.values;
  const pick = (name: string, fallback: string | number | null | undefined) =>
    before
      ? kept(before, name)
      : fallback === undefined || fallback === null
        ? undefined
        : String(fallback);
  const pickedParts = before
    ? (keptAll(before, 'preferredParts') ?? [])
    : (today?.preferredParts ?? []);
  /** 고른 운동 종류. '' 는 추천대로 — 안 고른 것과 같은 뜻이다. */
  const pickedWorkout = before
    ? (kept(before, 'preferredWorkout') ?? '')
    : (today?.preferredWorkout ?? '');

  /*
   * 지금 몸 상태. 손댄 것이 있으면 그것을, 없으면 서버가 준 값을 본다.
   * 하나라도 정상이 아니면 접지 않는다 — 불편한 곳을 숨기면 안 된다.
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

  const detailed = mode === 'detail';

  return (
    <div>
      {/*
        제목과 설명은 감싸는 쪽에 있으므로 여기서 다시 적지 않는다.
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
            수정 · 더 적기
          </button>
        </div>
      )}

      {/* 아직 오늘 날짜를 모르는 첫 순간에는 내용을 그리지 않는다. */}
      {todayKey && (
        <div>
          {today && !editing ? (
            <div className="motion-safe:animate-fade-in">
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

              {/* 상세로 적은 것이 있으면 한 줄 더 */}
              {hasDetail(today) && (
                <dl className="mt-3 flex flex-wrap gap-x-5 gap-y-1.5 border-t border-line pt-3 text-xs text-muted">
                  {detailLines(today, weightUnit).map(([k, v]) => (
                    <div key={k} className="flex items-baseline gap-1.5">
                      <dt>{k}</dt>
                      <dd className="text-ink">{v}</dd>
                    </div>
                  ))}
                </dl>
              )}
              {today.note && (
                <p className="mt-3 rounded-xl bg-surface-2 px-3 py-2 text-xs leading-relaxed break-keep whitespace-pre-wrap text-ink">
                  {today.note}
                </p>
              )}

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
                  통증이 있는 날은 던지거나 무리한 운동을 하지 마세요. 통증이 이어지면
                  전문의 진료를 받아보는 것이 좋습니다. 통증이 있는 동안에는 운동 추천도
                  제공하지 않습니다.
                </p>
              )}
            </div>
          ) : (
            <form key={formKey} action={formAction} className="space-y-4">
              <input type="hidden" name="date" value={todayKey} />

              <div className="flex flex-wrap items-center gap-x-3 gap-y-2">
                <ModeSwitch mode={mode} onChange={pickMode} />
                <span className="text-[11px] leading-relaxed text-muted">
                  {detailed
                    ? '더 적을수록 추천이 오늘에 맞춰집니다. 비워 둔 칸은 저장하지 않습니다.'
                    : '몸 상태 · 컨디션 · 수면만 — 몇 초면 끝납니다.'}
                </span>
              </div>

              {state?.error && (
                <p
                  ref={errorRef}
                  role="alert"
                  className="motion-safe:animate-fade-in rounded-lg border border-danger-line bg-danger-bg px-4 py-3 text-sm text-danger"
                >
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
               * 지우지 않는다. 불편한 곳이 있는 날에는 저절로 펴진다.
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
                    불편한 곳이 있으면 접는 단추를 아예 내지 않는다. 못 누르는
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
                      {partsExpanded ? '접기' : '불편한 곳 있어요'}
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
                          defaultChecked={
                            pick(part.key, today?.[part.key] ?? '정상') === v
                          }
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
               * 상세 쪽.
               *
               * 간편일 때는 접어 두되 지우지 않는다 — 적다가 간편으로 돌아갔다가
               * 다시 상세로 오면 적던 것이 그대로 있다.
               *
               * 접혀 있을 때는 fieldset 을 꺼 둔다(disabled). 꺼진 칸은 폼이 보내지
               * 않으므로 detail=1 도 안 가고, 서버는 상세 기록을 건드리지 않는다.
               *
               * 높이를 grid-rows 로 연다. 픽셀로 적으면 칸 수가 바뀔 때마다 맞춰야
               * 하고, display 로 끄면 부드럽게 열 수 없다.
               */}
              <div
                className={`grid transition-[grid-template-rows,opacity] duration-300 ease-[cubic-bezier(0.2,0,0,1)] ${
                  detailed ? 'grid-rows-[1fr] opacity-100' : 'grid-rows-[0fr] opacity-0'
                }`}
              >
                <fieldset
                  disabled={!detailed}
                  inert={!detailed}
                  className="min-h-0 space-y-5 overflow-hidden"
                >
                  <input type="hidden" name="detail" value="1" />

                  <div className="border-t border-line pt-4">
                    <Section title="오늘 하고 싶은 운동">
                      {/*
                       * 운동 종류를 부위보다 앞에 둔다. "오늘 하체"보다 "오늘 파워"가
                       * 몸에 걸리는 부담을 더 크게 가르기 때문이다.
                       *
                       * '추천대로'는 빈 값으로 보낸다. '고르지 않음'을 값으로 저장하면
                       * 나중에 목록을 고칠 때 그게 무엇이었는지 다시 따져야 한다.
                       */}
                      <Row label="종류">
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
                       * 하고 싶은 부위. 안 골라도 되고, 골라도 안전 규칙을 뚫지는
                       * 않는다 — 통과한 후보 중 순서만 앞당긴다.
                       */}
                      {parts.length > 0 && (
                        <Row label="부위">
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
                    </Section>
                  </div>

                  <Section title="몸과 마음 · 고른 것을 다시 누르면 풀립니다">
                    <NumberRow
                      label="잔 시간"
                      name="sleepHours"
                      suffix="시간"
                      defaultValue={pick('sleepHours', today?.sleepHours)}
                      min={0}
                      max={SLEEP_HOURS_MAX}
                      step={0.5}
                      placeholder="7.5"
                    />
                    {DETAIL_SCALES.map((s) => (
                      <Row key={s.key} label={s.label}>
                        {s.options.map((label, i) => (
                          <ChipRadio
                            key={label}
                            name={s.key}
                            value={String(i + 1)}
                            toggleable
                            defaultChecked={
                              pick(s.key, today?.[s.key]) === String(i + 1)
                            }
                          >
                            {label}
                          </ChipRadio>
                        ))}
                      </Row>
                    ))}
                    <WeightRow defaultKg={pick('bodyWeightKg', today?.bodyWeightKg)} />
                    <NumberRow
                      label="아침 심박"
                      name="restingHr"
                      suffix="bpm"
                      defaultValue={pick('restingHr', today?.restingHr)}
                      min={RESTING_HR_MIN}
                      max={RESTING_HR_MAX}
                      step={1}
                      placeholder="60"
                    />
                  </Section>

                  <Section title="먹고 마신 것">
                    <Row label="수분">
                      {HYDRATION_LEVELS.map((v) => (
                        <ChipRadio
                          key={v}
                          name="hydration"
                          value={v}
                          toggleable
                          defaultChecked={pick('hydration', today?.hydration) === v}
                        >
                          {v}
                        </ChipRadio>
                      ))}
                    </Row>
                    <Row label="식사">
                      {NUTRITION_LEVELS.map((v) => (
                        <ChipRadio
                          key={v}
                          name="nutrition"
                          value={v}
                          toggleable
                          defaultChecked={pick('nutrition', today?.nutrition) === v}
                        >
                          {v}
                        </ChipRadio>
                      ))}
                    </Row>
                  </Section>

                  <Section title="메모">
                    <textarea
                      name="note"
                      rows={3}
                      maxLength={CHECKIN_NOTE_MAX}
                      defaultValue={pick('note', today?.note) ?? ''}
                      placeholder="예) 어제 불펜 60구 뒤로 팔이 평소보다 무거움"
                      className="w-full resize-y rounded-xl border border-line bg-surface-2 px-3 py-2 text-xs leading-relaxed text-ink outline-none transition-colors placeholder:text-muted/50 focus:border-sky"
                    />
                  </Section>
                </fieldset>
              </div>

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
