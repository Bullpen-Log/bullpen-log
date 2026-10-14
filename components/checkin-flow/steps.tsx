'use client';

import {
  ARM_PAIN_LEVELS,
  ARM_PAIN_SPOTS,
  CHECKIN_NOTE_MAX,
  CHECKIN_PARTS as PART_LABELS,
  CONDITION_BANDS,
  MAX_CONDITION,
  MIN_CONDITION,
  SLEEP_QUALITY_LEVELS,
  conditionBand,
  type ArmPainJoint,
} from '@/lib/checkin';
import {
  SPOT_DEFS,
  partsFromSpots,
  spotId,
  spotLabel,
  type BodySpots,
  type SpotSide,
} from '@/lib/body-spots';
import { BodySpotPicker } from '@/components/body-spot-picker';
import { useState } from 'react';
import { Search } from '@/components/icon';
import { Chip } from '@/components/day-card';
import { OutlinePerson, SleepPicture } from './pictures';

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
      {/* 그림 위 · 슬라이더는 그림 밑에 가로로(2026-10-13 사용자: "스크롤은 전부 그림 하단에 가로로") */}
      <div className="flex flex-1 flex-col items-center justify-center gap-4 py-4">
        {/* 사람 윤곽 — 띠마다 자세 · 표정 · 색이 다르고 0.16초 옅어지며 바뀐다(pictures.tsx) */}
        <OutlinePerson band={band} className="h-44 w-28 shrink-0" />
        <div className="flex items-baseline gap-2">
          <p
            className={`text-6xl font-black tabular-nums leading-none ${tone}`}
            aria-hidden
          >
            {value}
          </p>
          <p className={`text-lg font-semibold ${tone}`}>{bandWord(value)}</p>
        </div>
        <input
          type="range"
          min={MIN_CONDITION}
          max={MAX_CONDITION}
          step={1}
          value={value}
          onChange={(e) => onChange(Number(e.target.value))}
          aria-label="오늘 컨디션"
          aria-valuetext={`${value}점, ${bandWord(value)}`}
          className="checkin-range w-full max-w-xs"
        />
        <ol
          className="flex w-full max-w-xs justify-between text-caption text-muted"
          aria-hidden
        >
          {CONDITION_BANDS.map((b) => (
            <li key={b.key} className={b.key === band ? 'font-semibold text-sky' : ''}>
              {b.label}
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
  /* 몸 그림이 가리키는 근육 — 이름 목록에서 고른 것도 같은 자리로(그림이 그 근육을 비추고 정도 단추가 뜬다) */
  const [active, setActive] = useState<string | null>(null);
  const pickByName = (id: string) => {
    if (!spots[id]) onSpots({ ...spots, [id]: '뻐근' });
    setActive(id);
  };
  return (
    <div className="space-y-4">
      <div>
        <h1 className={TITLE}>어디가 불편해요?</h1>
        <p className="mt-1 text-sm text-muted">
          근육을 눌러 뻐근한지 아픈지 골라요. 돌려 볼 수 있어요.
        </p>
      </div>
      {/* 3D 몸 그림 — 다리까지 보이게 전보다 높게(2026-10-13 사용자: "하단 길이를 조금 더") */}
      <BodySpotPicker
        spots={spots}
        onChange={onSpots}
        active={active}
        onActiveChange={setActive}
        heightClass="h-[26rem] desk:h-[24rem]"
      />
      <MuscleFinder spots={spots} onPick={pickByName} />
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
                className={`inline-flex min-h-10 items-center gap-1.5 rounded-full px-3 text-xs font-semibold ${
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

/**
 * 이름으로 찾기 — 그림을 눌러 찾기 어려운 근육을 글자로 찾는다(2026-10-13 사용자: "이름을 검색하거나 이름 목록에서 선택").
 * 검색 칸에 적으면 맞는 근육만, 비우면 부위(어깨 · 팔꿈치 · 손목 · 허리 · 하체)별 전체 목록. 줄마다 오른쪽 · 왼쪽 단추.
 */
function MuscleFinder({
  spots,
  onPick,
}: {
  spots: BodySpots;
  onPick: (id: string) => void;
}) {
  const [open, setOpen] = useState(false);
  const [q, setQ] = useState('');
  const query = q.trim();
  const rows = SPOT_DEFS.filter((d) => !query || d.label.includes(query));
  const groups = PART_LABELS.map((p) => ({
    part: p,
    defs: rows.filter((d) => d.part === p.key),
  })).filter((g) => g.defs.length > 0);
  const sideBtn = (id: string, word: string) => {
    const level = spots[id];
    return (
      <button
        key={id}
        type="button"
        onClick={() => onPick(id)}
        aria-pressed={Boolean(level)}
        className={`inline-flex min-h-10 items-center rounded-full px-3 text-xs font-medium transition-colors ${
          level === '통증'
            ? 'bg-danger-bg text-danger'
            : level === '뻐근'
              ? 'bg-amber-500/15 text-warn'
              : 'bg-ink/6 text-ink/80 hover:bg-ink/10'
        }`}
      >
        {word}
        {level ? ` · ${level}` : ''}
      </button>
    );
  };
  return (
    <section className="rounded-2xl bg-surface p-3" aria-label="근육 이름으로 찾기">
      <button
        type="button"
        onClick={() => setOpen((v) => !v)}
        aria-expanded={open}
        className="flex w-full items-center gap-2 text-left text-sm font-semibold text-ink"
      >
        <Search aria-hidden className="h-4 w-4 text-muted" />
        이름으로 찾기
        <span className="ml-auto text-xs font-normal text-muted">
          {open ? '접기' : '검색 · 목록'}
        </span>
      </button>
      {open && (
        <div className="mt-3 space-y-3">
          <input
            type="search"
            value={q}
            onChange={(e) => setQ(e.target.value)}
            placeholder="예) 삼각근, 광배근, 햄스트링"
            aria-label="근육 이름 검색"
            className="w-full rounded-xl border border-transparent bg-ink/5 px-4 py-2.5 text-sm text-ink placeholder:text-muted/60 focus:border-sky focus:bg-surface focus:outline-none"
          />
          {groups.length === 0 ? (
            <p className="text-xs text-muted">
              맞는 이름이 없어요. 다른 말로 찾아 봐요.
            </p>
          ) : (
            <div className="max-h-72 space-y-3 overflow-y-auto overscroll-contain pr-1">
              {groups.map((g) => (
                <div key={g.part.key} className="space-y-1.5">
                  <p className="text-caption font-semibold text-muted">{g.part.label}</p>
                  <ul className="space-y-1">
                    {g.defs.map((d) => (
                      <li key={d.key} className="flex flex-wrap items-center gap-1.5">
                        <span className="min-w-0 flex-1 text-sm text-ink">
                          {d.label}
                        </span>
                        {(['R', 'L'] as SpotSide[]).map((side) =>
                          sideBtn(spotId(side, d.key), side === 'R' ? '오른쪽' : '왼쪽')
                        )}
                      </li>
                    ))}
                  </ul>
                </div>
              ))}
            </div>
          )}
        </div>
      )}
    </section>
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
        <div className="chip-grid flex flex-wrap gap-2" data-cols="4">
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
        <p className="text-caption text-muted">여러 개 · 몰라도 돼요</p>
      </div>
      {showLevel && (
        <div className="space-y-1.5">
          <p className="text-sm font-semibold text-ink">얼마나 아파요?</p>
          <div className="chip-grid flex flex-wrap gap-2" data-cols="3">
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
        {/* 누운 사람과 달 — 잘 잔 만큼 달이 찬다(pictures.tsx) */}
        <SleepPicture quality={value} className="h-32 w-full max-w-xs" />
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
          className="flex w-full max-w-xs justify-between text-caption text-muted"
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
