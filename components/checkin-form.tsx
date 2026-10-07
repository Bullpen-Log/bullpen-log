'use client';

import {
  Fragment,
  useActionState,
  useEffect,
  useRef,
  useState,
  useSyncExternalStore,
} from 'react';
import { useFormStatus } from 'react-dom';
import {
  CheckCircle2,
  ChevronDown,
  ChevronRight,
  Minus,
  Pencil,
  Plus,
} from 'lucide-react';
import { saveCheckin, type CheckinState } from '@/app/actions/checkin';
import { ArmPainGuideButton } from '@/app/(app)/training/arm-pain-guide';
import {
  ARM_PAIN_LEVELS,
  ARM_PAIN_SPOTS,
  BODY_FEELINGS,
  CHECKIN_NOTE_MAX,
  CHECKIN_PARTS,
  CHECKIN_WEIGHT_MAX_KG,
  CHECKIN_WEIGHT_MIN_KG,
  DETAIL_SCALES,
  APPETITE_LEVELS,
  HIGH_SORENESS,
  MAX_CONDITION,
  MAX_PREFERRED_PARTS,
  MIN_CONDITION,
  NO_WORKOUT_KIND,
  THROW_PLANS,
  SLEEP_HOURS_MAX,
  SLEEP_HOURS_MIN,
  SLEEP_HOURS_STEP,
  SLEEP_LEVELS,
  SORENESS_LEVELS,
  WORKOUT_KINDS,
  type ArmPain,
  type ArmPainJoint,
  type CheckinBody,
  type CheckinDetail,
  type CheckinParts,
  armPainLevelLabel,
  armPainSpotLabel,
  armPainSpotsFor,
  clampSleepHours,
  formatSleepHours,
  hasDetail,
  hasPain,
  parseSleepHours,
  sleepLevelFromHours,
  sorenessWord,
  MEAL_AMOUNTS,
  SKIPPABLE_MEALS,
  mealSummary,
} from '@/lib/checkin';
import { kept, keptAll, withInput } from '@/lib/form-values';
import { OFFLINE_MESSAGE, orOffline } from '@/lib/action-offline';
import { toDateKey } from '@/lib/pitch-stats';
import { formatWeight, fromWeight, round1, toWeight } from '@/lib/units';
import { useWeightUnit } from '@/components/use-units';

export type CheckinData = CheckinParts &
  CheckinBody &
  CheckinDetail &
  /* 팔 통증 자리 · 정도 — 어깨 · 팔꿈치 '통증'인 날 그 줄 밑에서 고른 것(lib/checkin.ts) */
  ArmPain & {
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
    /* 테마 색(danger) — 다크 · 네이비에서 text-red-700 은 검은 바탕에 거의 안 보였다 */
    return 'peer-checked:border-danger-line peer-checked:bg-danger-bg peer-checked:text-danger';
  if (value === '뻐근')
    return 'peer-checked:border-amber-500/60 peer-checked:bg-amber-500/10 peer-checked:text-warn';
  return 'peer-checked:border-sky peer-checked:bg-sky/10 peer-checked:text-sky';
}

/*
 * 칩 — 휴대폰은 테두리 없는 회색 알약(아이폰), 고른 것은 파랑으로 두르고 옅게 칠한다. PC 는 예전 네모 칩
 * (2026-10-01 '애플처럼'). 휴대폰은 높이 40px 를 채운다(칩 규칙) — 37px 라 옆 칩을 잘못 누르곤 했다(2026-10-03).
 */
const chipBase =
  'inline-flex min-h-10 items-center cursor-pointer select-none rounded-full border border-transparent bg-ink/6 px-3.5 py-2 text-[13px] text-ink/80 transition-colors hover:text-ink peer-checked:font-semibold desk:rounded-lg desk:border-line desk:bg-surface-2 desk:px-3 desk:min-h-0 desk:text-xs desk:text-muted desk:hover:border-sky-soft desk:peer-checked:font-medium';

/**
 * 누르는 자리만 44px 로 키운 칩(휴대폰) — 보이는 칩(span)은 그대로 두고 감싸는 라벨의 높이만 늘린다. 라벨 어디를
 * 눌러도 칩이 눌린다. 팔 통증 자리 · 정도 칩이 쓴다(2026-10-03, 누르는 것 44pt). PC 는 마우스라 예전 그대로.
 */
const CHIP_TALL = 'inline-flex min-h-11 items-center desk:min-h-0';

function ChipRadio({
  name,
  value,
  defaultChecked,
  checked,
  className,
  children,
  required,
  onPick,
  toggleable,
  tall,
}: {
  name: string;
  value: string;
  defaultChecked?: boolean;
  /**
   * 부모가 고른 값을 들고 있을 때(제어형). 주면 이것을 쓰고 defaultChecked 는 안 쓴다 —
   * 둘을 같이 넘기지 않는다. 잔 시간을 고르면 잔 느낌이 따라 골라지는 자리(SleepRow)에서 쓴다.
   * 누른 것은 onPick 으로 받아 부모가 값을 바꿔야 한다. toggleable 과는 같이 쓰지 않는다
   * (그쪽은 라디오를 직접 끄는데, 제어형은 다음에 그릴 때 부모 값으로 되돌아간다).
   */
  checked?: boolean;
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
  /** 누르는 자리를 휴대폰에서 44px 로(CHIP_TALL) — 칩 모양은 그대로 */
  tall?: boolean;
}) {
  return (
    <label
      className={tall ? CHIP_TALL : 'inline-flex'}
      /*
       * 누르기 직전에 이미 골라져 있었는지를 적어 둔다 — 누른 뒤에는 늘 골라져 있다.
       *
       * 라벨에서 받는다. 라디오는 숨겨져 있고(sr-only) 손가락이 닿는 것은 보이는 칩(span)이라,
       * 라디오에 걸어 두면 pointerdown 이 거기까지 가지 않아 '다시 누르면 풀림'이 듣지 않는다.
       */
      onPointerDown={
        toggleable
          ? (e) => {
              const input = e.currentTarget.control as HTMLInputElement | null;
              if (input) input.dataset.was = input.checked ? '1' : '';
            }
          : undefined
      }
      /*
       * 누르다 만 것(칩에 손가락을 댄 채 화면을 밀어 올림)은 click 이 오지 않는다. 적어 둔 표시가
       * 남으면, 나중에 pointerdown 없이 오는 click(키보드 화살표 · 화면 읽기)이 고르자마자 풀어 버린다.
       */
      onPointerCancel={
        toggleable
          ? (e) => {
              const input = e.currentTarget.control as HTMLInputElement | null;
              if (input) input.dataset.was = '';
            }
          : undefined
      }
    >
      <input
        type="radio"
        name={name}
        value={value}
        checked={checked}
        defaultChecked={checked === undefined ? defaultChecked : undefined}
        required={required}
        onChange={() => onPick?.(value)}
        /* 키보드(스페이스)로 누를 때도 같은 것을 적는다 — 이때는 pointerdown 이 없다 */
        onKeyDown={
          toggleable
            ? (e) => {
                if (e.key === ' ')
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
  tall,
  children,
}: {
  name: string;
  value: string;
  defaultChecked?: boolean;
  /** 누르는 자리를 휴대폰에서 44px 로(CHIP_TALL) */
  tall?: boolean;
  children: React.ReactNode;
}) {
  return (
    <label className={tall ? CHIP_TALL : 'inline-flex'}>
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

function Row({
  label,
  top,
  radios,
  children,
}: {
  label: string;
  /**
   * 하나만 고르는 칩 줄일 때 — 묶음에 이 칸의 이름을 붙인다(화면 읽기).
   * 이름은 옆의 글자일 뿐 라디오와 이어져 있지 않다. 근육통 · 팔 피로처럼 보기가 같은 칸이 여럿이라
   * (없음 ~ 심함), 이름이 없으면 '보통, 3/5'만 읽혀 어느 칸인지 알 수 없다.
   */
  radios?: boolean;
  /**
   * 칸이 여러 줄일 때 — 이름을 가운데가 아니라 첫 줄에 맞춘다(수면).
   * 첫 줄의 단추가 44px 이라 그 가운데에 오게 위를 조금 띄운다.
   */
  top?: boolean;
  children: React.ReactNode;
}) {
  return (
    <div
      className={`flex flex-col gap-2 sm:flex-row ${top ? 'sm:items-start' : 'sm:items-center'}`}
    >
      <span
        className={`w-28 shrink-0 text-xs font-medium text-muted ${top ? 'sm:pt-3.5' : ''}`}
      >
        {label}
      </span>
      <div
        role={radios ? 'radiogroup' : undefined}
        aria-label={radios ? label : undefined}
        className="flex min-w-0 flex-wrap items-center gap-1.5"
      >
        {children}
      </div>
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

/*
 * 팔 통증 — 어깨 · 팔꿈치 줄이 '통증'이면 그 줄 바로 밑에 열린다(2026-10-03 팔 통증 안내, lib/checkin.ts).
 *
 *   어디가 아파요?   그 관절의 자리 넷, 여러 개 — 관절마다 한 줄
 *   얼마나 아파요?   셋 중 하나, 다시 누르면 풀림 — 한 번만(마지막으로 '통증'인 관절 밑)
 *
 * 둘 다 안 골라도 저장된다 — 모르면 암케어는 쉬는 쪽으로 본다. 고른 것은 암케어(통증 루틴 · 쉬기)와
 * 안내 시트가 읽는다. 트레이닝 일정 · 투구 계획은 읽지 않는다.
 */
function ArmPainSpotsRow({
  joint,
  picked,
}: {
  joint: ArmPainJoint;
  picked: readonly string[];
}) {
  const spots: readonly { key: string; chip: string }[] = ARM_PAIN_SPOTS[joint];
  return (
    <Row label="어디가 아파요?">
      {spots.map((spot) => (
        <ChipCheckbox
          key={spot.key}
          name="armPainSpots"
          value={spot.key}
          defaultChecked={picked.includes(spot.key)}
          tall
        >
          {spot.chip}
        </ChipCheckbox>
      ))}
      <span className="ml-1 self-center text-[10px] text-muted/60">
        여러 개 · 몰라도 돼요
      </span>
    </Row>
  );
}

/**
 * 정도 줄. 어깨만 아프다가 팔꿈치도 '통증'으로 고르면 이 줄이 팔꿈치 밑으로 옮겨 가며 새로 그려진다 —
 * 그때 방금 고른 것이 풀리지 않게, 고를 때마다(풀 때도) 부모에게 알려 그 값으로 다시 그린다(onChange).
 * 고른 라디오를 다시 누르면 풀리는 것(toggleable)은 change 가 오지 않아, 누른 뒤 실제로 골라진 것을 읽는다.
 */
function ArmPainLevelRow({
  picked,
  onChange,
}: {
  picked: string | undefined;
  onChange: (value: string) => void;
}) {
  return (
    <div
      onClick={(e) => {
        if (!(e.target instanceof HTMLInputElement)) return;
        const on = e.currentTarget.querySelector<HTMLInputElement>(
          'input[name="armPainLevel"]:checked'
        );
        onChange(on?.value ?? '');
      }}
    >
      <Row label="얼마나 아파요?" radios>
        {ARM_PAIN_LEVELS.map((level) => (
          <ChipRadio
            key={level.value}
            name="armPainLevel"
            value={String(level.value)}
            toggleable
            tall
            defaultChecked={picked === String(level.value)}
          >
            {level.label}
          </ChipRadio>
        ))}
        <span className="ml-1 self-center text-[10px] text-muted/60">
          다시 누르면 풀려요
        </span>
      </Row>
    </div>
  );
}

const numberInput =
  'w-24 rounded-lg border border-line bg-surface-2 px-3 py-2 text-xs text-ink outline-none transition-colors placeholder:text-muted/50 focus:border-sky';

/**
 * 오늘 몸무게 — 고른 단위(kg·lb)로 보여주고 저장은 늘 kg.
 *
 * 내 정보의 몸무게 칸과 같은 방식이다. 숫자를 그대로 두고 단위만 바꾸면 72kg 가
 * 72lb(33kg)로 저장되어 버린다.
 */
function WeightRow({ defaultKg }: { defaultKg?: string }) {
  const unit = useWeightUnit();
  const [kg, setKg] = useState(defaultKg ?? '');
  /*
   * 적는 중인 글자와 그 단위 — kg 를 되돌려 보이면(0.1kg 로 반올림) lb 로 적는 사이 글자가 바뀌어(1 → 1.1, 1.16 → 1.1)
   * 몸무게를 적을 수 없었다. 적는 동안은 적은 그대로 보이고, 단위를 바꾸면 kg 에서 다시 보인다.
   */
  const [draft, setDraft] = useState<{ text: string; unit: string } | null>(null);
  const shown =
    draft && draft.unit === unit
      ? draft.text
      : kg === ''
        ? ''
        : String(round1(toWeight(Number(kg), unit)));

  return (
    <Row label="몸무게">
      <input
        type="number"
        inputMode="decimal"
        value={shown}
        onChange={(e) => {
          const v = e.target.value;
          setDraft({ text: v, unit });
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

/** 잔 시간을 한 번에 고르는 빠른 칩 — 대부분의 밤이 이 안에 든다. 그 밖은 −/+ 로 맞춘다 */
const SLEEP_QUICK_HOURS = [5, 6, 7, 8, 9] as const;

/** 지난 기록이 없을 때 −/+ 가 시작하는 자리(시간) */
const SLEEP_SEED_HOURS = 7;

/*
 * 잔 시간 줄의 누르는 것들 — 손가락으로 누르는 자리라 높이 44px 을 채운다.
 * 빠른 칩은 폭만 40px 이다 — 다섯 칩과 '지우기'가 360px 휴대폰의 한 줄(안쪽 약 294px)에 들어가야
 * 가로로 넘치지도, '지우기'만 다음 줄로 떨어지지도 않는다.
 */
const sleepStepButton =
  'inline-flex h-11 w-11 shrink-0 cursor-pointer items-center justify-center rounded-full border border-transparent bg-ink/6 text-ink outline-none transition-colors focus-visible:ring-1 focus-visible:ring-sky active:bg-sky/10 disabled:cursor-not-allowed disabled:opacity-40 desk:rounded-lg desk:border-line desk:bg-surface-2 desk:text-muted desk:hover:border-sky-soft desk:hover:text-ink desk:disabled:hover:border-line desk:disabled:hover:text-muted';
const sleepQuickChip =
  'inline-flex min-h-11 min-w-11 cursor-pointer select-none items-center justify-center rounded-full border px-3 py-2 text-[13px] tabular-nums outline-none transition-colors focus-visible:ring-1 focus-visible:ring-sky desk:min-w-10 desk:rounded-lg desk:text-xs';

/**
 * 수면 — 어젯밤 잔 시간(선택)과 잔 느낌(충분 · 보통 · 부족, 필수)을 한 칸에서 받는다.
 *
 * 시간은 글자로 치지 않고 고른다(−/+ 30분씩, 빠른 칩). 시간을 고르면 잔 느낌이 따라 골라져서
 * 숫자 하나만 눌러도 수면이 끝난다. 둘을 따로 두면 같은 것을 두 번 묻게 된다.
 *
 * 느낌을 직접 누른 뒤에는 시간이 느낌을 덮지 않는다(pinned) — 6시간을 자도 개운한 날이 있고,
 * 8시간을 자도 못 잔 것 같은 날이 있다. 본인이 고친 것이 이긴다. 시간을 지워도 느낌은 그대로 둔다.
 *
 * 따라 골라진 느낌은 추천을 바꾸지 않는다 — 6시간 미만은 느낌과 상관없이 이미 짧은 밤이다
 * (lib/checkin.ts 의 isShortSleep). 그래서 저절로 골라져도 안전하다.
 *
 * 상태는 누를 때(이벤트 처리기) 같이 바꾼다. 효과(useEffect)로 맞추지 않는다 — 한 번 더 그리고,
 * 직접 고친 느낌까지 덮게 된다.
 */
function SleepRow({
  defaultLevel,
  defaultHours,
  seedHours,
}: {
  /** 저장된(또는 오류로 돌아온) 잔 느낌 */
  defaultLevel?: string;
  /** 저장된(또는 오류로 돌아온) 잔 시간 — 폼 값이라 글자다 */
  defaultHours?: string;
  /** 비어 있을 때 −/+ 가 시작하는 시간 — 지난번에 적은 잔 시간 */
  seedHours: number;
}) {
  /* 예전에 0~16 으로 적은 기록은 고르는 범위(3~12 · 30분 단위)로 맞춰서 시작한다 */
  const [hours, setHours] = useState<number | null>(() =>
    parseSleepHours(defaultHours ?? '')
  );
  const [level, setLevel] = useState(defaultLevel ?? '');
  /*
   * 저장된(또는 오류로 돌아온) 느낌이 본인이 고른 것인가.
   *
   * 시간이 없는데 느낌이 있으면 그 느낌은 반드시 본인이 누른 것이다 — 시간이 골라 줄 수 없었다.
   * 시간이 있는데 거기서 나올 값과 다르면 본인이 고친 것이다. 둘 다 그대로 둔다.
   *
   * 앞의 것을 빼먹으면, 아침에 '부족'만 적어 둔 사람이 나중에 8시간을 더하는 순간 느낌이 말없이
   * '충분'으로 바뀌고 짧은 밤 제한이 풀린다 — 시간은 '부족'을 더할 수만 있고 뺄 수는 없다
   * (lib/checkin.ts 의 isShortSleep)는 원칙이 화면에서 깨진다.
   */
  const [pinned, setPinned] = useState(
    () =>
      Boolean(defaultLevel) &&
      (hours == null || sleepLevelFromHours(hours) !== defaultLevel)
  );
  /* 시간을 지우면 누르던 단추('지우기')가 사라진다 — 초점을 옮겨 둘 자리 */
  const firstQuickRef = useRef<HTMLButtonElement>(null);

  const change = (next: number | null) => {
    setHours(next);
    if (next != null && !pinned) setLevel(sleepLevelFromHours(next));
  };
  /* 비어 있을 때는 지난번 값에서 시작한다(한 칸 움직이지 않는다) — 대개 어제와 비슷하게 잔다 */
  const step = (dir: 1 | -1) =>
    change(clampSleepHours(hours == null ? seedHours : hours + dir * SLEEP_HOURS_STEP));

  return (
    <Row label="수면" top>
      <div className="flex w-full min-w-0 flex-col gap-3">
        <div className="space-y-1.5">
          {/* 좁은 화면에서는 '증감 단추 / 빠른 칩' 두 줄로 접힌다 */}
          <div
            role="group"
            aria-label="어젯밤 잔 시간"
            className="flex flex-wrap items-center gap-x-3 gap-y-2"
          >
            <div className="flex items-center gap-1.5">
              <button
                type="button"
                onClick={() => step(-1)}
                disabled={hours != null && hours <= SLEEP_HOURS_MIN}
                aria-label="30분 줄이기"
                className={sleepStepButton}
              >
                <Minus aria-hidden className="h-4 w-4" />
              </button>
              {/* 읽어 주는 자리(output)는 그대로 두고 안쪽 글만 새로 그린다 — 값이 바뀔 때마다 조용히 나타난다 */}
              <output
                aria-live="polite"
                className="min-w-[4.5rem] text-center text-sm tabular-nums"
              >
                <span
                  key={hours ?? 'none'}
                  className={`inline-block motion-safe:animate-fade-in ${
                    hours == null ? 'text-muted' : 'font-semibold text-ink'
                  }`}
                >
                  {hours == null ? '—' : formatSleepHours(hours)}
                </span>
              </output>
              <button
                type="button"
                onClick={() => step(1)}
                disabled={hours != null && hours >= SLEEP_HOURS_MAX}
                aria-label="30분 늘리기"
                className={sleepStepButton}
              >
                <Plus aria-hidden className="h-4 w-4" />
              </button>
            </div>

            <div className="flex flex-wrap items-center gap-1.5">
              {SLEEP_QUICK_HOURS.map((n) => {
                const on = hours === n;
                return (
                  <button
                    key={n}
                    ref={n === SLEEP_QUICK_HOURS[0] ? firstQuickRef : undefined}
                    type="button"
                    aria-pressed={on}
                    aria-label={formatSleepHours(n)}
                    /* 고른 숫자를 다시 누르면 지워진다 */
                    onClick={() => change(on ? null : n)}
                    className={`${sleepQuickChip} ${
                      on
                        ? 'border-sky bg-sky/10 font-medium text-sky'
                        : 'border-transparent bg-ink/6 text-ink/80 desk:border-line desk:bg-surface-2 desk:text-muted desk:hover:border-sky-soft desk:hover:text-ink'
                    }`}
                  >
                    {n}
                  </button>
                );
              })}
              {/*
               * 값이 있을 때만 보인다. 자리는 늘 잡아 둔다 — 시간을 고르는 순간 단추가 생기면서
               * 칩 줄이 다음 줄로 밀리면(창 폭에 따라 그렇게 된다) 누르던 칩이 손가락 밑에서 달아난다.
               */}
              <button
                type="button"
                /*
                 * 지우면 이 단추가 꺼지고 숨는다. 초점이 여기 있었으면(키보드) 갈 곳을 잃으므로
                 * 첫 빠른 칩으로 옮겨 둔다 — 거기서 바로 다시 고를 수 있다.
                 */
                onClick={(e) => {
                  const focused = document.activeElement === e.currentTarget;
                  change(null);
                  if (focused) firstQuickRef.current?.focus();
                }}
                disabled={hours == null}
                className={`inline-flex min-h-11 cursor-pointer items-center rounded-lg px-1.5 text-xs text-muted underline-offset-4 outline-none transition-[opacity,color] duration-200 hover:text-ink hover:underline focus-visible:ring-1 focus-visible:ring-sky ${
                  hours == null ? 'invisible opacity-0' : 'opacity-100'
                }`}
              >
                지우기
              </button>
            </div>
          </div>
          <p className="text-[10px] text-muted/60">
            어젯밤 잔 시간 · 30분 단위 · 몰라도 돼요
          </p>
          {/* 서버로 가는 값 — 비어 있으면 안 적은 것(null)으로 저장된다 */}
          <input type="hidden" name="sleepHours" value={hours ?? ''} />
        </div>

        {/*
         * 이미 골라진 칩을 다시 눌러도 직접 고른 것으로 친다(pinned). 골라진 라디오를 또 누르면
         * change 가 오지 않아 onPick 이 안 불린다 — 시간이 골라 준 느낌을 '맞다'고 눌러 확인한 것을
         * 놓치고, 그 뒤 시간을 고치면 느낌이 따라 바뀐다. 칩(라벨)을 누르면 라디오에 click 이 가고
         * 그것이 여기로 올라오므로 그때 잡는다.
         */}
        <div
          role="radiogroup"
          aria-label="잔 느낌"
          onClick={(e) => {
            if (e.target instanceof HTMLInputElement) setPinned(true);
          }}
          className="flex flex-wrap items-center gap-1.5"
        >
          {SLEEP_LEVELS.map((v) => (
            <ChipRadio
              key={v}
              name="sleep"
              value={v}
              required
              checked={level === v}
              onPick={(picked) => {
                setLevel(picked);
                setPinned(true);
              }}
            >
              {v}
            </ChipRadio>
          ))}
          <span className="ml-1 self-center text-[10px] text-muted/60">
            잔 느낌 · 시간을 고르면 따라 골라져요
          </span>
        </div>
      </div>
    </Row>
  );
}

function SubmitButton() {
  const { pending } = useFormStatus();
  return (
    <button
      type="submit"
      disabled={pending}
      /* 휴대폰은 폭 전체의 큰 알약(아이폰 시트의 주 단추), PC 는 예전 크기 */
      className="w-full rounded-full bg-sky px-5 py-3.5 text-base font-semibold text-white transition-colors hover:bg-sky-strong disabled:cursor-not-allowed disabled:opacity-50 desk:w-auto desk:rounded-xl desk:py-2.5 desk:text-sm"
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
      className="relative inline-grid grid-cols-2 rounded-xl bg-ink/8 p-0.5 text-xs font-semibold"
    >
      <span
        aria-hidden
        className={`absolute inset-y-0.5 left-0.5 w-[calc(50%-2px)] rounded-lg bg-raised shadow-[0_1px_3px_rgb(0_0_0/0.12)] transition-transform duration-300 ease-[cubic-bezier(0.2,0,0,1)] ${
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
          className={`relative min-h-10 px-4 transition-colors duration-200 desk:min-h-0 desk:py-1.5 ${
            mode === m ? 'text-ink' : 'font-medium text-ink/60 hover:text-ink'
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
  for (const s of DETAIL_SCALES) {
    const v = d[s.key];
    if (v != null) out.push([s.label, s.options[v - 1] ?? String(v)]);
  }
  if (d.bodyWeightKg != null)
    out.push(['몸무게', formatWeight(d.bodyWeightKg, weightUnit) ?? '']);
  if (d.appetite != null)
    out.push(['식욕', APPETITE_LEVELS[d.appetite - 1] ?? String(d.appetite)]);
  if (d.throwPlan) out.push(['던지는 일정', d.throwPlan]);
  return out;
}

/*
 * 저장을 신호 끊김에서 지킨다. useActionState 는 액션이 던진 오류를 가장 가까운 오류 화면으로 올리는데, 이 폼은 (app)
 * 레이아웃(체크인 관문 · 알림 창)에 있어 그 자리가 로그인 밖 오류 화면(app/error.tsx, '로그인으로')이다 — 신호가 약한 곳에서
 * 저장을 누르면 앱 전체가 그 화면으로 바뀌고 고른 것도 사라졌다. 실패로 돌려주고 고른 것을 되살린다.
 */
function saveCheckinSafely(
  prev: CheckinState,
  formData: FormData
): Promise<CheckinState> {
  return orOffline(
    saveCheckin(prev, formData),
    withInput({ error: OFFLINE_MESSAGE }, formData)
  );
}

/**
 * 오늘 컨디션 체크인.
 *
 * 두 곳에서 쓴다 — 오른쪽 위 알림(종)에서 여는 창(components/app-shell.tsx), 그리고
 * 그날 첫 접속 때 뜨는 체크인 관문(components/checkin-gate.tsx). 그래서 자기 껍데기(테두리·제목)를
 * 만들지 않는다 — 감싸는 쪽이 이미 가지고 있어서 겹친다.
 *
 * 간편과 상세 두 가지로 받는다. 간편은 몸 상태·컨디션·수면, 그리고 선택 칸인 근육통 ·
 * 잔 시간만 — 매일 쓰는 것이라 몇 초 안에 끝나야 한다. 상세는 운동 선호와 앱이 실제로 쓰는
 * 기록(팔 피로 · 몸무게 · 식욕 · 던지는 일정)과 메모까지 받되, 전부 안 채워도 된다.
 *
 * 근육통 · 잔 시간은 2026-09-30 에 상세에서 뺐다가 같은 날 되살렸다 — 트레이닝 추천이 읽는다
 * (사용자: "둘다 트레이닝을 추천함에 있어서 필요한 데이터야"). 상세가 아니라 간편 쪽(늘 보이는 자리)에
 * 둔다. 기본이 간편이라 상세에 두면 대부분 영영 안 적고, 그러면 추천이 읽을 값이 안 쌓인다.
 * 꼭 적게 하지는 않는다 — 안 적은 날은 아무것도 바꾸지 않는다(lib/checkin.ts).
 *
 * 간편으로 저장하면 상세 기록은 건드리지 않는다. 아침에 상세로 적어 둔 것을
 * 저녁에 간편으로 고쳐도 몸무게·메모가 지워지지 않는다(app/actions/checkin.ts).
 * 근육통 · 잔 시간은 어느 쪽으로 저장하든 같이 간다(body=1) — 비우면 비운 대로 저장된다.
 */
export function CheckinForm({
  recent,
  parts,
  onSaved,
  age = null,
  onLeave,
}: {
  recent: CheckinData[];
  /** 고를 수 있는 운동 부위 — 라이브러리에서 뽑아 넘어온다 */
  parts: string[];
  /** 저장에 성공했을 때. 저장한 날짜를 준다. 체크인 관문이 이것을 보고 닫힌다. */
  onSaved?: (dateKey: string) => void;
  /**
   * 만 나이 — 요약의 팔 통증 안내가 쓴다(만 15세 미만은 루틴 대신 진료). 모르면 null(안 막는다 —
   * 암케어와 같은 규칙, lib/checkin.ts 의 canDoPainRoutine).
   */
  age?: number | null;
  /** 팔 통증 안내의 [통증 루틴 하기]로 다른 화면에 갈 때 — 감싸는 창을 닫는 데 쓴다 */
  onLeave?: () => void;
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
   * 팔 통증 정도를 고를 때마다 적어 둔다 — 정도 줄이 어깨 밑에서 팔꿈치 밑으로 옮겨 가며 새로 그려져도
   * 방금 고른 것이 남게(ArmPainLevelRow). 저장하거나 고치기를 새로 열면 비운다(저장된 값으로 시작).
   */
  const [painLevelDraft, setPainLevelDraft] = useState<string | null>(null);
  /*
   * 간편·상세 중 무엇으로 적는가. 지난번에 고른 쪽에서 시작한다 — 늘 상세로 적는
   * 사람에게 매번 상세를 누르게 할 까닭이 없다. 폼은 화면이 뜬 뒤에만 그리므로
   * (todayKey) 서버와 화면이 어긋나지 않는다.
   */
  const [mode, setMode] = useState<Mode>(readMode);
  const [state, formAction] = useActionState<CheckinState, FormData>(
    saveCheckinSafely,
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
    setPainLevelDraft(null);
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
   * 팔(어깨 · 팔꿈치) 통증 — 요약의 통증 카드에 고른 자리 · 정도 한 줄과 [통증 안내 보기]가 붙는다.
   * 허리 · 하체만 아픈 날에는 없다(팔 통증 안내만 있다). 자리는 오늘 '통증'인 관절의 것만.
   */
  const armPainToday =
    today != null && (today.shoulder === '통증' || today.elbow === '통증');
  const armPainSpots = today ? armPainSpotsFor(today, today.armPainSpots) : [];
  const armPainLine = today
    ? [
        armPainSpots.map((s) => armPainSpotLabel(s) ?? s).join(' · '),
        armPainLevelLabel(today.armPainLevel),
      ]
        .filter(Boolean)
        .join(' · ')
    : '';

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
  /* 팔 통증 자리 · 정도 — 오류로 돌아오면 방금 고른 것, 아니면 저장된 것 */
  const pickedPainSpots = before
    ? (keptAll(before, 'armPainSpots') ?? [])
    : (today?.armPainSpots ?? []);
  const pickedPainLevel = painLevelDraft ?? pick('armPainLevel', today?.armPainLevel);

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
  /* 지금 '통증'인 팔 관절 — 그 줄 밑에 아픈 자리 · 정도 줄이 열린다(ArmPainSpotsRow · ArmPainLevelRow) */
  const painJoints = (['shoulder', 'elbow'] as const).filter(
    (joint) => partNow(joint, today?.[joint] ?? '정상') === '통증'
  );
  const partsSummary =
    hurting.length === 0
      ? null
      : hurting
          .map((p) => `${p.label} ${partNow(p.key, today?.[p.key] ?? '정상')}`)
          .join(' · ');

  const detailed = mode === 'detail';

  /*
   * 오늘 체크인 요약의 첫 줄. 수면은 잔 시간을 적은 날만 '보통 · 6.5시간'으로 붙이고,
   * 근육통은 적은 날만 한 칸 더한다 — 안 적은 칸을 '없음'처럼 보이게 하지 않는다.
   */
  const todaySoreness = sorenessWord(today?.soreness);
  const todayMeals = mealSummary(today?.nutrition, today?.skippedMeals);
  const summaryLines: [string, string][] = today
    ? [
        ...CHECKIN_PARTS.map((p): [string, string] => [p.label, today[p.key]]),
        ['컨디션', `${today.condition}/10`],
        [
          '수면',
          today.sleepHours != null
            ? `${today.sleep} · ${formatSleepHours(today.sleepHours)}`
            : today.sleep,
        ],
        ...(todaySoreness ? [['근육통', todaySoreness] as [string, string]] : []),
        ...(todayMeals ? [['식사', todayMeals] as [string, string]] : []),
      ]
    : [];
  /* 걸른 끼니(여러 개) — 오류로 돌아온 폼 값이 있으면 그것, 아니면 저장된 것 */
  const skippedPicked: readonly string[] =
    (before ? keptAll(before, 'skippedMeals') : undefined) ?? today?.skippedMeals ?? [];

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
            오늘 체크인을 남겼어요
          </span>
          <button
            type="button"
            onClick={() => {
              setPainLevelDraft(null);
              setEditing(true);
            }}
            className="ml-auto inline-flex min-h-9 items-center gap-1 rounded-full bg-ink/6 px-3 text-xs font-medium text-ink transition-colors desk:min-h-0 desk:rounded-lg desk:border desk:border-line desk:bg-transparent desk:px-2.5 desk:py-1.5 desk:font-normal desk:text-muted desk:hover:border-sky desk:hover:text-sky"
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
                {summaryLines.map(([k, v]) => (
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
                <div className="mt-4 rounded-xl border border-danger-line bg-danger-bg px-4 py-3 text-xs leading-relaxed text-danger">
                  {/*
                    2026-10-03 부터 통증이 있는 날도 운동은 아픈 곳을 피해서 추천한다(lib/report/prescription.ts).
                    예전 문구('운동 추천도 하지 않아요')가 사실과 달라져 바꿨다. 던지기는 그대로 멈춘다.
                  */}
                  <p>
                    통증이 있는 날은 던지지 마세요. 운동은 아픈 곳을 피해서 추천해요.
                    통증이 이어지면 전문의 진료를 받아보세요.
                  </p>
                  {/*
                    팔 통증 안내(2026-10-03) — 어깨 · 팔꿈치가 아픈 날만. 고른 자리 · 정도를 한 줄로 보여
                    저장된 것을 알 수 있게 하고, 자세한 것(참고 부상 · 위험 신호 · 오늘 할 일)은 시트에서.
                  */}
                  {armPainToday && (
                    <>
                      {armPainLine && (
                        <p className="mt-1.5 font-semibold">아픈 곳 · {armPainLine}</p>
                      )}
                      <ArmPainGuideButton
                        pain={{
                          spots: armPainSpots,
                          level: today.armPainLevel,
                          age,
                        }}
                        routineHref="/training?view=armcare"
                        onGo={onLeave}
                        className="mt-2.5 inline-flex min-h-11 items-center gap-1 rounded-full bg-surface px-4 text-sm font-semibold text-danger transition-colors hover:bg-surface-2"
                      >
                        통증 안내 보기
                        <ChevronRight aria-hidden className="h-4 w-4" />
                      </ArmPainGuideButton>
                    </>
                  )}
                </div>
              )}
            </div>
          ) : (
            <form key={formKey} action={formAction} className="space-y-4">
              <input type="hidden" name="date" value={todayKey} />
              {/*
               * 근육통 · 잔 시간을 담아 보낸다는 표시. 서버는 이것이 왔을 때만 두 칸을 쓴다
               * (비우면 null). 배포 전에 열려 있던 옛 화면에는 이 표시가 없어, 아침에 적은 값을
               * 빈 값으로 덮지 않는다(app/actions/checkin.ts). 상세 fieldset 밖이라 간편에서도 간다.
               */}
              <input type="hidden" name="body" value="1" />
              {/*
               * 팔 통증 자리 · 정도를 담아 보낸다는 표시(armpain=1). 서버는 이것이 왔을 때만 두 칸을 쓴다 —
               * 어깨 · 팔꿈치가 '통증'이 아니면 [] · null 로 지운다. 옛 화면에는 이 표시가 없어 값을 지우지
               * 않는다(app/actions/checkin.ts). body=1 과 같은 방식이다.
               */}
              <input type="hidden" name="armpain" value="1" />

              <div className="flex flex-wrap items-center gap-x-3 gap-y-2">
                <ModeSwitch mode={mode} onChange={pickMode} />
                <span className="text-[11px] leading-relaxed text-muted">
                  {detailed
                    ? '더 적을수록 추천이 오늘에 맞춰져요. 비워 둔 칸은 저장하지 않아요.'
                    : '몸 상태 · 근육통 · 컨디션 · 수면. 몇 초면 끝나요.'}
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
              <div className="rounded-2xl bg-ink/4 px-3.5 py-3 desk:rounded-xl desk:border desk:border-line desk:bg-surface-2/50 desk:px-3 desk:py-2.5">
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
                      className="ml-auto inline-flex min-h-10 items-center gap-1 rounded-full bg-surface px-3 text-xs font-medium text-ink transition-colors desk:min-h-0 desk:rounded-lg desk:border desk:border-line desk:bg-transparent desk:px-2.5 desk:py-1 desk:font-normal desk:text-muted desk:hover:border-sky desk:hover:text-sky"
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
                    <Fragment key={part.key}>
                      <Row label={part.label} radios>
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
                      {/* 팔 통증 — 어깨 · 팔꿈치가 '통증'이면 그 줄 바로 밑에(관절마다 자리, 정도는 한 번) */}
                      {(part.key === 'shoulder' || part.key === 'elbow') &&
                        painJoints.includes(part.key) && (
                          <ArmPainSpotsRow joint={part.key} picked={pickedPainSpots} />
                        )}
                      {part.key === painJoints.at(-1) && (
                        <ArmPainLevelRow
                          picked={pickedPainLevel}
                          onChange={setPainLevelDraft}
                        />
                      )}
                    </Fragment>
                  ))}
                </div>
              </div>

              {/*
               * 전신 근육통(선택). 몸 상태 상자 바로 밑에 둔다 — 부위의 '뻐근 · 통증'과 헷갈리는
               * 칸이라 나란히 놓고 글로 가른다. 근육통 '심함'은 통증 관문을 열지 않는다
               * (운동 추천을 멈추는 것은 부위 통증뿐이다).
               *
               * 색은 '많이' · '심함'만 주황 — 추천이 가벼워지는 눈금(HIGH_SORENESS)부터다.
               * 빨강은 통증만 쓴다.
               */}
              <Row label="근육통" radios>
                {SORENESS_LEVELS.map((label, i) => (
                  <ChipRadio
                    key={label}
                    name="soreness"
                    value={String(i + 1)}
                    toggleable
                    defaultChecked={pick('soreness', today?.soreness) === String(i + 1)}
                    className={
                      i + 1 >= HIGH_SORENESS ? feelingChipClass('뻐근') : undefined
                    }
                  >
                    {label}
                  </ChipRadio>
                ))}
                <span className="ml-1 self-center text-[10px] leading-relaxed break-keep text-muted/60">
                  {
                    "온몸 알배김 · 다시 누르면 풀려요 · 한곳이 콕 집어 아프면 위 '몸 상태'에서 통증으로"
                  }
                </span>
              </Row>

              <Row label="전신 컨디션" radios>
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

              <SleepRow
                defaultLevel={pick('sleep', today?.sleep)}
                defaultHours={pick('sleepHours', today?.sleepHours)}
                /* 오늘이 아닌 가장 최근 기록의 잔 시간(recent 는 최근 날부터) — 없으면 7시간 */
                seedHours={
                  recent.find((c) => c.date !== todayKey && c.sleepHours != null)
                    ?.sleepHours ?? SLEEP_SEED_HOURS
                }
              />

              {/*
               * 식사(선택) 두 줄 — 영양 조언(lib/nutrition/advice.ts)이 읽는다. 음식을 적지 않아도 홈 카드가 오늘 몇 g 더
               * 먹을지를 이걸로 어림한다. '부족'만 주황 — 조언이 바뀌는 답이다. 안 적은 날은 조언이 '모름'으로 본다.
               */}
              <Row label="끼니 양" radios>
                {MEAL_AMOUNTS.map((v) => (
                  <ChipRadio
                    key={v}
                    name="mealAmount"
                    value={v}
                    toggleable
                    defaultChecked={pick('mealAmount', today?.nutrition) === v}
                    className={v === '부족' ? feelingChipClass('뻐근') : undefined}
                  >
                    {v}
                  </ChipRadio>
                ))}
                <span className="ml-1 self-center text-[10px] leading-relaxed break-keep text-muted/60">
                  지금까지 먹은 끼니로 · 다시 누르면 풀려요
                </span>
              </Row>
              <Row label="걸른 끼니">
                {SKIPPABLE_MEALS.map((m) => (
                  <ChipCheckbox
                    key={m.key}
                    name="skippedMeals"
                    value={m.key}
                    defaultChecked={skippedPicked.includes(m.key)}
                  >
                    {m.label}
                  </ChipCheckbox>
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
              {/*
                relative overflow-hidden — 접힌 상세 속 칩의 숨긴 라디오(sr-only, absolute)는 가장 가까운 '자리 잡힌'
                조상을 기준으로 놓여 이 칸의 잘라내기를 빠져나갔고, 창을 끝까지 굴리면 [저장] 밑에 빈 자리가 500px 남았다
                (2026-10-01 시트로 바꾸며 발견). 이 칸을 기준(relative)으로 삼아 함께 잘라낸다.
              */}
              <div
                className={`relative grid overflow-hidden transition-[grid-template-rows,opacity] duration-300 ease-[cubic-bezier(0.2,0,0,1)] ${
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
                      <Row label="종류" radios>
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
                            최대 {MAX_PREFERRED_PARTS}개 · 안 골라도 돼요
                          </span>
                        </Row>
                      )}
                    </Section>
                  </div>

                  <Section title="몸 · 고른 것을 다시 누르면 풀려요">
                    {DETAIL_SCALES.map((s) => (
                      <Row key={s.key} label={s.label} radios>
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
                  </Section>

                  {/* 식욕 · 던지는 일정은 영양 탭의 가이드가 쓴다(lib/checkin.ts) */}
                  <Section title="영양 가이드에 써요">
                    <Row label="식욕" radios>
                      {APPETITE_LEVELS.map((label, i) => (
                        <ChipRadio
                          key={label}
                          name="appetite"
                          value={String(i + 1)}
                          toggleable
                          defaultChecked={
                            pick('appetite', today?.appetite) === String(i + 1)
                          }
                        >
                          {label}
                        </ChipRadio>
                      ))}
                    </Row>
                    <Row label="던지는 일정" radios>
                      {THROW_PLANS.map((v) => (
                        <ChipRadio
                          key={v}
                          name="throwPlan"
                          value={v}
                          toggleable
                          defaultChecked={pick('throwPlan', today?.throwPlan) === v}
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

              <div className="flex flex-col gap-1 pt-1 desk:flex-row desk:items-center desk:gap-3">
                <SubmitButton />
                {today && (
                  <button
                    type="button"
                    onClick={() => setEditing(false)}
                    className="min-h-10 text-sm text-muted transition-colors hover:text-ink desk:min-h-0 desk:text-xs"
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
