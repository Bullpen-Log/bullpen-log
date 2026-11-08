'use client';

import {
  ARM_PAIN_LEVELS,
  CHECKIN_NOTE_MAX,
  MAX_CONDITION,
  MIN_CONDITION,
  SLEEP_QUALITY_LEVELS,
  conditionBand,
} from '@/lib/checkin';
import { spotLabel, spotOf, type BodySpots, type SpotSide } from '@/lib/body-spots';
import { BodySpotPicker } from '@/components/body-spot-picker';
import { Chip } from '@/components/day-card';
import { OutlinePerson, SleepPicture } from './pictures';
import { CONDITION_VISUAL_STAGES, conditionVisualStage } from './condition-visual';

/**
 * 체크인 3판의 질문 화면 넷(components/checkin-flow/flow.tsx 가 차례로 띄운다).
 * 제목은 한 줄 질문, 고르는 것은 크게 — 한 화면에 하나.
 */

const TITLE = 'text-2xl font-bold leading-tight text-ink';
/** 안 고른 슬라이더가 놓일 자리(손잡이는 숨김) — 가운데쯤 */
const UNSET_CONDITION = 6;
const UNSET_SLEEP = 3;

const bandWord = (score: number) => conditionVisualStage(score).label;

/** 컨디션 1~10 — 가로 슬라이더, 큰 숫자, 5단계 그림·문구, 어제 · 평소, '불편한 곳' 확인 */

/*
 * 밀어서 고르기 — 손가락 자리로 값을 바로 셈한다(2026-10-20 김민: "아이패드에서 컨디션 밀어서 고르기 작동 안 됨"). 기본 range 는
 * touch-action pan-x 라 옆으로 끄는 손가락을 브라우저가 화면 밀기로 가져갔고, 안 고른 동안엔 손잡이가 숨어 잡을 데도 없었다.
 * 막대 어디를 눌러도 · 끌어도 그 자리 값으로 고른다(키보드 · 화면 읽기는 range 그대로).
 */
function rangePointer(min: number, max: number, onChange: (v: number) => void) {
  const pick = (e: React.PointerEvent<HTMLInputElement>) => {
    const r = e.currentTarget.getBoundingClientRect();
    if (r.width <= 0) return;
    const f = Math.min(1, Math.max(0, (e.clientX - r.left) / r.width));
    onChange(Math.round(min + f * (max - min)));
  };
  return {
    onPointerDown: (e: React.PointerEvent<HTMLInputElement>) => {
      e.currentTarget.setPointerCapture(e.pointerId);
      pick(e);
    },
    onPointerMove: (e: React.PointerEvent<HTMLInputElement>) => {
      if (e.currentTarget.hasPointerCapture(e.pointerId)) pick(e);
    },
  };
}

export function ConditionStep({
  value,
  onChange,
  painOn,
  forced,
  onPainToggle,
  yesterday,
  usual,
}: {
  /** 안 고르면 null — 손잡이를 숨기고 '밀어서 골라요' */
  value: number | null;
  onChange: (v: number) => void;
  painOn: boolean;
  /** 컨디션이 낮아 확인이 켜진 채 고정 */
  forced: boolean;
  onPainToggle: (on: boolean) => void;
  yesterday: number | null;
  usual: number | null;
}) {
  const unset = value == null;
  const band = conditionBand(value ?? UNSET_CONDITION);
  const tone = unset
    ? 'text-muted'
    : band === 'sick'
      ? 'text-warn'
      : band === 'good'
        ? 'text-sky'
        : 'text-ink';
  return (
    <div className="flex h-full flex-col">
      <h1 className={TITLE}>오늘 컨디션은 어때요?</h1>
      <p className="mt-1 text-sm text-muted">지금 몸 상태를 점수로 골라 주세요.</p>
      <div className="flex flex-1 flex-col justify-center gap-5 py-3">
        <div className="flex items-center justify-center gap-5 rounded-3xl bg-surface px-4 py-3">
          {/* 기존 5단계 야구 선수 그림을 유지하고, 화면 안에서 점수와 나란히 본다. */}
          <OutlinePerson score={value} className="h-36 w-24 shrink-0" />
          <div className="min-w-0 text-left">
            <p className="text-[11px] font-bold tracking-wide text-muted">TODAY&apos;S CONDITION</p>
            <div className="mt-1 flex items-baseline gap-1">
              <p className={`text-6xl font-black tabular-nums leading-none ${tone}`} aria-hidden>
                {unset ? '?' : value}
              </p>
              <span className="text-sm font-semibold text-muted">/ 10</span>
            </div>
            <p className={`mt-1 text-base font-bold ${tone}`}>
              {value == null ? '밀어서 골라요' : bandWord(value)}
            </p>
          </div>
        </div>
        <p className="text-center text-xs font-medium text-muted">막대를 누르거나 밀어 점수를 선택하세요</p>
        <input
          type="range"
          min={MIN_CONDITION}
          max={MAX_CONDITION}
          step={1}
          value={value ?? UNSET_CONDITION}
          onChange={(e) => onChange(Number(e.target.value))}
          {...rangePointer(MIN_CONDITION, MAX_CONDITION, onChange)}
          aria-label="오늘 컨디션"
          aria-valuetext={
            value == null ? '아직 안 고름' : `${value}점, ${bandWord(value)}`
          }
          className={`checkin-range w-full ${unset ? 'checkin-range-unset' : ''}`}
        />
        <ol className="flex w-full text-caption text-muted" aria-hidden>
          {CONDITION_VISUAL_STAGES.map((stage) => (
            <li
              key={stage.key}
              className={`min-w-0 flex-1 text-center ${!unset && stage.key === conditionVisualStage(value).key ? 'font-semibold text-sky' : ''}`}
            >
              {stage.shortLabel}
            </li>
          ))}
        </ol>
      </div>
      {(yesterday != null || usual != null) && (
        <p className="text-center text-sm text-muted">
          {[
            yesterday != null ? `어제 ${yesterday}` : null,
            usual != null ? `평소 ${usual}` : null,
          ]
            .filter(Boolean)
            .join(' · ')}
        </p>
      )}
      <label
        className={`mt-4 flex items-start gap-3 rounded-2xl p-4 transition-colors ${
          painOn ? 'bg-sky-tint' : 'bg-surface'
        } ${forced ? 'opacity-90' : ''}`}
      >
        <input
          type="checkbox"
          checked={painOn}
          disabled={forced}
          onChange={(e) => onPainToggle(e.target.checked)}
          className="mt-0.5 h-5 w-5 shrink-0 accent-(--color-sky)"
        />
        <span className="min-w-0">
          <span className="block text-sm font-semibold text-ink">
            몸에 불편한 곳이 있어요
          </span>
          <span className="block text-xs text-muted">
            {forced
              ? '컨디션이 낮은 날은 불편한 곳을 확인해요. 없으면 다음 화면에서 건너뛰어요.'
              : '켜면 다음 화면에서 어디가 어떤지 골라요.'}
          </span>
        </span>
      </label>
    </div>
  );
}

/**
 * 불편한 곳 — 큰 부위 넷을 펼쳐 자리 그림 카드에서 고른다(components/body-spot-picker.tsx). 고른 자리가 밑에 칩으로 늘어서고,
 * 어깨 · 팔꿈치를 '아파요'로 고르면 다음 화면에서 얼마나 아픈지 묻는다(암케어 · 안내가 읽는 ARM_PAIN_LEVELS).
 */
export function PainStep({
  spots,
  onSpots,
  side,
}: {
  spots: BodySpots;
  onSpots: (s: BodySpots) => void;
  /** 처음 펼칠 쪽 — 던지는 팔 */
  side: SpotSide;
}) {
  return (
    <div className="space-y-4">
      <div>
        <h1 className={TITLE}>어디가 불편해요?</h1>
        <p className="mt-1 text-sm text-muted">부위를 누르고, 그림에서 불편한 자리를 골라요.</p>
      </div>
      <BodySpotPicker spots={spots} onChange={onSpots} defaultSide={side} />
    </div>
  );
}

/**
 * 어깨 · 팔꿈치를 '아파요'로 골랐을 때만 — 아픈 자리는 앞 화면의 카드가 곧 팔 통증 자리라(lib/body-spots.ts armSpotsFromSpots)
 * 다시 묻지 않고, 여기서는 정도만 묻는다(2026-11-06).
 */
export function ArmPainDetailStep({
  spots,
  armLevel,
  onArmLevel,
}: {
  spots: BodySpots;
  armLevel: number | null;
  onArmLevel: (l: number | null) => void;
}) {
  const where = Object.keys(spots).filter((id) => {
    const part = spotOf(id)?.def.part;
    return spots[id] === '통증' && (part === 'shoulder' || part === 'elbow');
  });
  return (
    <div className="space-y-4">
      <div>
        <h1 className={TITLE}>팔은 얼마나 아파요?</h1>
        <p className="mt-1 text-sm text-muted">정도에 맞춰 암케어 안내를 바꿔요.</p>
      </div>
      <section className="space-y-3 rounded-2xl bg-surface p-4" aria-label="팔 통증 정도">
        <ul className="flex flex-wrap gap-1.5" aria-label="아프다고 고른 곳">
          {where.map((id) => (
            <li key={id} className="rounded-full bg-danger-bg px-3 py-1.5 text-xs font-semibold text-danger">
              {spotLabel(id)}
            </li>
          ))}
        </ul>
        <div className="chip-grid flex flex-wrap gap-2" data-cols="3">
          {ARM_PAIN_LEVELS.map((l) => (
            <Chip
              key={l.value}
              pressed={armLevel === l.value}
              onClick={() => onArmLevel(armLevel === l.value ? null : l.value)}
            >
              {l.label}
            </Chip>
          ))}
        </div>
      </section>
    </div>
  );
}

/** 어젯밤 수면의 질 1~5 — 가로 슬라이더와 다섯 말. 그림(누운 사람 · 달)은 3단계에서 */
export function SleepStep({
  value,
  onChange,
}: {
  /** 안 고르면 null — 손잡이를 숨기고 '밀어서 골라요' */
  value: number | null;
  onChange: (v: number) => void;
}) {
  const unset = value == null;
  const shown = value ?? UNSET_SLEEP;
  const word = unset ? '밀어서 골라요' : (SLEEP_QUALITY_LEVELS[shown - 1] ?? '');
  return (
    <div className="flex h-full flex-col">
      <h1 className={TITLE}>어젯밤 잠은요?</h1>
      <div className="flex flex-1 flex-col items-center justify-center gap-6 py-4">
        {/* 누운 사람과 달 — 잘 잔 만큼 달이 찬다(pictures.tsx) */}
        <SleepPicture quality={shown} className="h-32 w-full max-w-xs" />
        <p className={`text-3xl font-black ${unset ? 'text-muted' : 'text-sky'}`}>
          {word}
        </p>
        <input
          type="range"
          min={1}
          max={SLEEP_QUALITY_LEVELS.length}
          step={1}
          value={shown}
          onChange={(e) => onChange(Number(e.target.value))}
          {...rangePointer(1, SLEEP_QUALITY_LEVELS.length, onChange)}
          aria-label="어젯밤 수면의 질"
          aria-valuetext={unset ? '아직 안 고름' : word}
          className={`checkin-range w-full max-w-xs ${unset ? 'checkin-range-unset' : ''}`}
        />
        <ol
          className="flex w-full max-w-xs justify-between text-caption text-muted"
          aria-hidden
        >
          {SLEEP_QUALITY_LEVELS.map((w, i) => (
            <li
              key={w}
              className={!unset && i + 1 === value ? 'font-semibold text-sky' : ''}
            >
              {w}
            </li>
          ))}
        </ol>
      </div>
    </div>
  );
}

/** 메모 — 캘린더 그날 메모에 남는다. 안 적어도 된다 */
export function MemoStep({
  value,
  onChange,
  summary,
  error,
}: {
  value: string;
  onChange: (v: string) => void;
  summary: { condition: number | null; sleep: number | null; spots: BodySpots };
  error: string | null;
}) {
  return (
    <div className="flex h-full flex-col gap-3">
      <div>
        <h1 id="checkin-memo-title" className={TITLE}>
          남길 말이 있나요?
        </h1>
        <p className="mt-1 text-sm text-muted">
          지금까지 고른 내용을 확인하고 저장해요. 메모는 선택이에요.
        </p>
      </div>
      <div className="flex flex-wrap gap-2 rounded-2xl bg-surface p-3 text-xs font-semibold text-ink" aria-label="오늘 체크인 요약">
        <span className="rounded-full bg-sky/10 px-3 py-2 text-sky">컨디션 {summary.condition ?? '—'}/10</span>
        <span className="rounded-full bg-sky/10 px-3 py-2 text-sky">잠 {summary.sleep == null ? '—' : SLEEP_QUALITY_LEVELS[summary.sleep - 1]}</span>
        <span className="rounded-full bg-ink/6 px-3 py-2">{Object.keys(summary.spots).length ? `불편한 곳 ${Object.keys(summary.spots).length}곳` : '불편한 곳 없음'}</span>
      </div>
      <textarea
        aria-labelledby="checkin-memo-title"
        value={value}
        onChange={(e) => onChange(e.target.value.slice(0, CHECKIN_NOTE_MAX))}
        maxLength={CHECKIN_NOTE_MAX}
        rows={5}
        placeholder="예) 어제 롱토스 뒤 어깨 뒤가 당겼다"
        className="h-36 w-full resize-none rounded-2xl border border-transparent bg-surface px-4 py-3 text-base text-ink placeholder:text-muted/60 focus:border-sky focus:outline-none"
      />
      <p className="text-right text-caption tabular-nums text-muted">
        {value.length} / {CHECKIN_NOTE_MAX}
      </p>
      {error && (
        <p role="alert" className="text-sm text-danger">
          {error}
        </p>
      )}
    </div>
  );
}
