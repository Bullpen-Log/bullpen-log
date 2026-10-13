'use client';

import {
  ARM_PAIN_LEVELS,
  ARM_PAIN_SPOTS,
  CHECKIN_NOTE_MAX,
  CONDITION_BANDS,
  MAX_CONDITION,
  MIN_CONDITION,
  SLEEP_QUALITY_LEVELS,
  conditionBand,
  type ArmPainJoint,
} from '@/lib/checkin';
import { partsFromSpots, spotLabel, type BodySpots } from '@/lib/body-spots';
import { BodySpotPicker } from '@/components/body-spot-picker';
import { Chip } from '@/components/day-card';

/**
 * 체크인 3판의 질문 화면 넷(components/checkin-flow/flow.tsx 가 차례로 띄운다).
 * 제목은 한 줄 질문, 고르는 것은 크게 — 한 화면에 하나.
 */

const TITLE = 'text-2xl font-bold leading-tight text-ink';

const bandWord = (score: number) =>
  CONDITION_BANDS.find((b) => b.key === conditionBand(score))?.label ?? '';

/** 컨디션 1~10 — 세로 슬라이더, 큰 숫자, 띠의 말(아파요 · 보통이에요 · 좋아요), 어제 · 평소, '불편한 곳' 확인 */
export function ConditionStep({
  value,
  onChange,
  painOn,
  forced,
  onPainToggle,
  yesterday,
  usual,
}: {
  value: number;
  onChange: (v: number) => void;
  painOn: boolean;
  /** 컨디션이 낮아 확인이 켜진 채 고정 */
  forced: boolean;
  onPainToggle: (on: boolean) => void;
  yesterday: number | null;
  usual: number | null;
}) {
  const band = conditionBand(value);
  const tone =
    band === 'sick' ? 'text-warn' : band === 'good' ? 'text-sky' : 'text-ink';
  return (
    <div className="flex h-full flex-col">
      <h1 className={TITLE}>오늘 컨디션은 어때요?</h1>
      <div className="flex flex-1 items-center justify-center gap-8 py-4">
        {/* 그림 자리 — 3단계에서 사람 윤곽(세 상태)이 들어온다 */}
        <div data-person={band} className="w-32 shrink-0" />
        <div className="flex flex-col items-center gap-3">
          <p
            className={`text-6xl font-black tabular-nums leading-none ${tone}`}
            aria-hidden
          >
            {value}
          </p>
          <input
            type="range"
            min={MIN_CONDITION}
            max={MAX_CONDITION}
            step={1}
            value={value}
            onChange={(e) => onChange(Number(e.target.value))}
            aria-label="오늘 컨디션"
            aria-valuetext={`${value}점, ${bandWord(value)}`}
            className="checkin-range"
            data-vertical
          />
          <p className={`text-base font-semibold ${tone}`}>{bandWord(value)}</p>
        </div>
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
 * 불편한 곳 — 네(김민) 3D 몸 그림 그대로(components/body-spot-picker.tsx). 고른 근육이 밑에 칩으로 늘어서고,
 * 어깨 · 팔꿈치가 '통증'이면 자리 · 정도를 더 묻는다(암케어 · 안내가 읽는 ARM_PAIN_SPOTS · ARM_PAIN_LEVELS).
 */
export function PainStep({
  spots,
  onSpots,
  armSpots,
  onArmSpots,
  armLevel,
  onArmLevel,
}: {
  spots: BodySpots;
  onSpots: (s: BodySpots) => void;
  armSpots: string[];
  onArmSpots: (s: string[]) => void;
  armLevel: number | null;
  onArmLevel: (l: number | null) => void;
}) {
  const parts = partsFromSpots(spots);
  const joints = (['shoulder', 'elbow'] as const).filter((j) => parts[j] === '통증');
  const picked = Object.entries(spots);
  const toggleArm = (key: string) =>
    onArmSpots(
      armSpots.includes(key) ? armSpots.filter((k) => k !== key) : [...armSpots, key]
    );
  return (
    <div className="space-y-4">
      <div>
        <h1 className={TITLE}>어디가 불편해요?</h1>
        <p className="mt-1 text-sm text-muted">
          근육을 눌러 뻐근한지 아픈지 골라요. 돌려 볼 수 있어요.
        </p>
      </div>
      <BodySpotPicker spots={spots} onChange={onSpots} />
      {picked.length > 0 && (
        <ul className="flex flex-wrap gap-2" aria-label="고른 근육">
          {picked.map(([id, level]) => (
            <li key={id}>
              <button
                type="button"
                onClick={() => {
                  const next = { ...spots };
                  delete next[id];
                  onSpots(next);
                }}
                className={`inline-flex min-h-9 items-center gap-1.5 rounded-full px-3 text-xs font-semibold ${
                  level === '통증'
                    ? 'bg-danger-bg text-danger'
                    : 'bg-amber-500/15 text-warn'
                }`}
                aria-label={`${spotLabel(id)} ${level} 빼기`}
              >
                {spotLabel(id)} · {level}
                <span aria-hidden>×</span>
              </button>
            </li>
          ))}
        </ul>
      )}
      {joints.map((joint) => (
        <ArmDetail
          key={joint}
          joint={joint}
          armSpots={armSpots}
          onToggle={toggleArm}
          showLevel={joint === joints[joints.length - 1]}
          level={armLevel}
          onLevel={onArmLevel}
        />
      ))}
    </div>
  );
}

function ArmDetail({
  joint,
  armSpots,
  onToggle,
  showLevel,
  level,
  onLevel,
}: {
  joint: ArmPainJoint;
  armSpots: string[];
  onToggle: (key: string) => void;
  showLevel: boolean;
  level: number | null;
  onLevel: (l: number | null) => void;
}) {
  const label = joint === 'shoulder' ? '어깨' : '팔꿈치';
  return (
    <section
      className="space-y-3 rounded-2xl bg-surface p-4"
      aria-label={`${label} 통증 자세히`}
    >
      <div className="space-y-1.5">
        <p className="text-sm font-semibold text-ink">{label} 어디가 아파요?</p>
        <div className="flex flex-wrap gap-2">
          {ARM_PAIN_SPOTS[joint].map((s) => (
            <Chip
              key={s.key}
              pressed={armSpots.includes(s.key)}
              onClick={() => onToggle(s.key)}
            >
              {s.chip}
            </Chip>
          ))}
        </div>
        <p className="text-[11px] text-muted">여러 개 · 몰라도 돼요</p>
      </div>
      {showLevel && (
        <div className="space-y-1.5">
          <p className="text-sm font-semibold text-ink">얼마나 아파요?</p>
          <div className="flex flex-wrap gap-2">
            {ARM_PAIN_LEVELS.map((l) => (
              <Chip
                key={l.value}
                pressed={level === l.value}
                onClick={() => onLevel(level === l.value ? null : l.value)}
              >
                {l.label}
              </Chip>
            ))}
          </div>
        </div>
      )}
    </section>
  );
}

/** 어젯밤 수면의 질 1~5 — 가로 슬라이더와 다섯 말. 그림(누운 사람 · 달)은 3단계에서 */
export function SleepStep({
  value,
  onChange,
}: {
  value: number;
  onChange: (v: number) => void;
}) {
  const word = SLEEP_QUALITY_LEVELS[value - 1] ?? '';
  return (
    <div className="flex h-full flex-col">
      <h1 className={TITLE}>어젯밤 잠은요?</h1>
      <div className="flex flex-1 flex-col items-center justify-center gap-6 py-4">
        <div data-sleep={value} className="h-32 w-full max-w-xs" />
        <p className="text-3xl font-black text-sky">{word}</p>
        <input
          type="range"
          min={1}
          max={SLEEP_QUALITY_LEVELS.length}
          step={1}
          value={value}
          onChange={(e) => onChange(Number(e.target.value))}
          aria-label="어젯밤 수면의 질"
          aria-valuetext={word}
          className="checkin-range w-full max-w-xs"
        />
        <ol
          className="flex w-full max-w-xs justify-between text-[11px] text-muted"
          aria-hidden
        >
          {SLEEP_QUALITY_LEVELS.map((w, i) => (
            <li key={w} className={i + 1 === value ? 'font-semibold text-sky' : ''}>
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
  error,
}: {
  value: string;
  onChange: (v: string) => void;
  error: string | null;
}) {
  return (
    <div className="flex h-full flex-col gap-3">
      <div>
        <h1 className={TITLE}>남길 말이 있나요?</h1>
        <p className="mt-1 text-sm text-muted">
          캘린더 그날 메모에 남아요. 없으면 그냥 완료.
        </p>
      </div>
      <textarea
        value={value}
        onChange={(e) => onChange(e.target.value.slice(0, CHECKIN_NOTE_MAX))}
        maxLength={CHECKIN_NOTE_MAX}
        rows={5}
        placeholder="예) 어제 롱토스 뒤 어깨 뒤가 당겼다"
        className="w-full flex-1 resize-none rounded-2xl border border-transparent bg-surface px-4 py-3 text-base text-ink placeholder:text-muted/60 focus:border-sky focus:outline-none"
      />
      <p className="text-right text-[11px] tabular-nums text-muted">
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
