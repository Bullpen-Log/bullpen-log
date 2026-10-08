'use client';

import { useState } from 'react';
import { Pencil, RotateCcw } from 'lucide-react';
import { CountUp } from '@/components/onboarding/count-up';
import { INPUT_LARGE, invalidProps } from '@/components/onboarding/step-card';
import { useSyncedText } from '@/components/onboarding/use-synced-text';
import { WeightForecast } from '@/components/onboarding/weight-forecast';
import { Input } from '@/components/ui';
import { kgText, paceText } from '@/components/onboarding/format';
import { useWeightUnit } from '@/components/use-units';
import { ageRule } from '@/lib/nutrition/age';
import { ACTIVITIES, kcalText } from '@/lib/nutrition/meta';
import { macroSplit } from '@/lib/nutrition/onboarding';
import {
  periodDate,
  type NutritionAnswers,
  type OnboardingBody,
  type Preview,
} from '@/lib/nutrition/onboarding-answers';
import { dateText } from '@/lib/nutrition/period';

/**
 * 추천 계획 — 기초대사량 · 활동대사량 · 하루 목표(✎) · 탄단지 g · 예상 체중 선.
 *
 * 가입의 끼움 화면, 기존 사용자 온보딩(/nutrition/setup), 영양 탭 '내 계획' 카드가 같은 부품이다. 숫자는 모두
 * computeTargets 에서 온다(lib/nutrition/onboarding-answers.ts preview) — 저장 뒤 영양 탭이 보일 숫자와 같다.
 *
 * 하루 목표만 여기서 고칠 수 있다(kcalTarget). 탄단지 g 은 다음 화면(MacroEditor)에서 — 한 화면에 고칠 것이 많으면
 * 무엇이 무엇을 바꾸는지 흐려진다.
 */
export function PlanStats({
  p,
  a,
  body,
  today,
  active,
  onChange,
  invalid = false,
}: {
  p: Preview;
  a: NutritionAnswers;
  body: OnboardingBody;
  today: string;
  active: boolean;
  /** 없으면 보기만(영양 탭 카드) */
  onChange?: (patch: Partial<NutritionAnswers>) => void;
  invalid?: boolean;
}) {
  const unit = useWeightUnit();
  const t = p.targets;
  const rule = ageRule(p.age);
  const activity = ACTIVITIES.find((x) => x.key === p.draft.activity) ?? ACTIVITIES[1];
  const sign = t.delta > 0 ? '+' : t.delta < 0 ? '−' : '';
  const kg = (n: number) => kgText(n, unit);

  return (
    <div className="space-y-5">
      {/* ── 세 숫자 ── */}
      <div className="grid grid-cols-3 gap-2">
        <Stat
          label="기초대사량"
          value={<CountUp value={t.bmr} active={active} />}
          sub="가만히 있어도"
          row={0}
        />
        <Stat
          label="활동대사량"
          value={<CountUp value={t.tdee} active={active} />}
          sub={`× ${activity.factor} ${activity.label}`}
          row={1}
        />
        <Stat
          label="하루 목표"
          value={<CountUp value={t.base} active={active} />}
          sub={
            t.manual
              ? '직접 정함'
              : t.delta === 0
                ? '유지'
                : `${sign}${kcalText(Math.abs(t.delta))} 목표`
          }
          row={2}
          strong
        />
      </div>

      {/* ── 하루 목표 고치기 ── */}
      {onChange && <KcalEditor p={p} a={a} onChange={onChange} invalid={invalid} />}

      {/* ── 탄단지 ── */}
      <div>
        <MacroBar carbs={t.carbs} protein={t.protein} fat={t.fat} />
        <p className="mt-2 text-xs leading-relaxed break-keep text-muted">
          단백질은 체중 1kg 당 {t.proteinPerKg}g · 지방은 {Math.round(t.fatShare * 100)}
          %{t.manual ? ' · 탄수화물은 나머지' : ' · 탄수화물은 나머지'}. 운동 · 투구를
          적은 날은 쓴 만큼 더해요.
        </p>
      </div>

      {/* ── 예상 체중 선 ── */}
      {p.forecast.length > 1 && p.etaWeeks !== null && a.targetWeightKg !== null && (
        <div className="rounded-2xl border border-line bg-surface-2/60 p-3">
          <WeightForecast points={p.forecast} active={active} />
          <p className="mt-1 text-center text-xs leading-relaxed break-keep text-muted">
            계획대로면 약{' '}
            <strong className="font-semibold text-ink">{p.etaWeeks}주</strong>,{' '}
            {dateText(periodDate(today, p.etaWeeks))}쯤 {kg(a.targetWeightKg)}
            {p.targets.paceKg ? ` · ${paceText(p.targets.paceKg, unit)}씩` : ''}
          </p>
        </div>
      )}

      <p className="text-xs leading-relaxed break-keep text-muted/80">
        계산에 쓴 몸:{' '}
        {body.weightKg !== null ? kg(body.weightKg) : `${kg(t.weightKg)}(짐작)`}
        {body.heightCm !== null ? ` · ${body.heightCm}cm` : ' · 178cm(짐작)'}
        {p.age !== null ? ` · 만 ${p.age}세` : ' · 20세(짐작)'}
        {body.sex ? (body.sex === 'M' ? ' · 남' : ' · 여') : ' · 성별 모름'} ·{' '}
        {rule.bmrName}
      </p>
    </div>
  );
}

function Stat({
  label,
  value,
  sub,
  row,
  strong = false,
}: {
  label: string;
  value: React.ReactNode;
  sub: string;
  row: number;
  strong?: boolean;
}) {
  return (
    <div
      style={{ '--row': row } as React.CSSProperties}
      className={`motion-safe:animate-row-in min-w-0 rounded-2xl border px-3 py-3 ${
        strong ? 'border-sky/40 bg-sky/10' : 'border-line bg-surface-2/60'
      }`}
    >
      <p className="truncate text-[11px] font-medium text-muted">{label}</p>
      <p
        className={`text-heading mt-1 text-xl leading-none break-keep sm:text-2xl ${strong ? 'text-sky-strong' : 'text-ink'}`}
      >
        {value}
        <span className="ml-0.5 text-xs font-normal text-muted">kcal</span>
      </p>
      <p className="mt-1.5 truncate text-[11px] text-muted">{sub}</p>
    </div>
  );
}

/** 하루 목표(운동 전 kcal)를 직접 정하기 — 연필을 누르면 칸이 열린다. 비우면 계산으로 돌아간다 */
function KcalEditor({
  p,
  a,
  onChange,
  invalid,
}: {
  p: Preview;
  a: NutritionAnswers;
  onChange: (patch: Partial<NutritionAnswers>) => void;
  invalid: boolean;
}) {
  const [open, setOpen] = useState(a.kcalTarget !== null);
  const [focused, setFocused] = useState(false);
  const [text, setText] = useSyncedText(
    a.kcalTarget === null ? '' : String(a.kcalTarget),
    focused
  );
  const manual = a.kcalTarget !== null;

  if (!open) {
    return (
      <button
        type="button"
        onClick={() => setOpen(true)}
        className="inline-flex min-h-11 items-center gap-1.5 rounded-xl px-3 py-2 text-sm font-medium text-sky-strong transition-colors hover:bg-sky/10 focus-visible:outline-2 focus-visible:outline-offset-2 focus-visible:outline-sky-strong"
      >
        <Pencil aria-hidden className="h-3.5 w-3.5" />
        하루 목표를 직접 정하기
      </button>
    );
  }

  return (
    <div className="rounded-2xl border border-line bg-surface-2/60 p-3">
      <div className="flex items-end gap-2">
        <label className="min-w-0 flex-1">
          <span className="block text-xs font-medium text-muted">
            하루 목표(운동 전)
          </span>
          <div className="relative mt-1.5">
            <Input
              id="kcalTarget-field"
              type="text"
              inputMode="numeric"
              value={text}
              onChange={(e) => {
                setText(e.target.value);
                const n = Number(e.target.value.trim());
                onChange({
                  kcalTarget:
                    e.target.value.trim() === '' || !Number.isFinite(n)
                      ? null
                      : Math.round(n),
                });
              }}
              onFocus={() => setFocused(true)}
              onBlur={() => setFocused(false)}
              placeholder={String(p.auto.base)}
              className={`${INPUT_LARGE} pr-14 text-lg tabular-nums`}
              {...invalidProps(invalid)}
            />
            <span
              aria-hidden
              className="pointer-events-none absolute inset-y-0 right-4 flex items-center text-sm text-muted"
            >
              kcal
            </span>
          </div>
        </label>
        <button
          type="button"
          onClick={() => {
            onChange({ kcalTarget: null });
            setText('');
            setOpen(false);
          }}
          className="inline-flex h-12 items-center gap-1.5 rounded-xl px-3 text-sm font-medium text-muted transition-colors hover:bg-ink/5 hover:text-ink focus-visible:outline-2 focus-visible:outline-offset-2 focus-visible:outline-sky-strong"
          aria-label="계산값으로 되돌리기"
        >
          <RotateCcw aria-hidden className="h-3.5 w-3.5" />
          계산으로
        </button>
      </div>
      <p className="mt-2 text-xs leading-relaxed break-keep text-muted">
        계산으로는 {kcalText(p.auto.base)}kcal
        {manual
          ? ' · 직접 정하면 체중 흐름을 보고 권하는 조정은 쉬어요.'
          : '. 1,000~6,000 사이로.'}
      </p>
    </div>
  );
}

/** 탄 · 단 · 지 한 줄 막대 + g — 추천 계획 · 탄단지 프리셋 · 탄단지 고치기가 같이 쓴다 */
export function MacroBar({
  carbs,
  protein,
  fat,
  compact = false,
}: {
  carbs: number;
  protein: number;
  fat: number;
  compact?: boolean;
}) {
  const s = macroSplit(carbs, protein, fat);
  const cells = [
    { key: 'c', label: '탄수화물', g: carbs, pct: s.c, cls: 'bg-sky' },
    { key: 'p', label: '단백질', g: protein, pct: s.p, cls: 'bg-ink/70' },
    { key: 'f', label: '지방', g: fat, pct: s.f, cls: 'bg-warn' },
  ];
  return (
    <div>
      <div
        className="flex h-2.5 w-full overflow-hidden rounded-full bg-line/60"
        role="img"
        aria-label={`탄수화물 ${s.c}% · 단백질 ${s.p}% · 지방 ${s.f}%`}
      >
        {cells.map((c) => (
          <div
            key={c.key}
            className={`${c.cls} transition-[width] duration-500 ease-[cubic-bezier(0.22,1,0.36,1)] motion-reduce:transition-none`}
            style={{ width: `${c.pct}%` }}
          />
        ))}
      </div>
      <dl className={`mt-2 grid grid-cols-3 ${compact ? 'gap-1' : 'gap-2'}`}>
        {cells.map((c) => (
          <div key={c.key} className="flex min-w-0 items-start gap-1.5">
            <span
              aria-hidden
              className={`mt-1.5 h-2 w-2 shrink-0 rounded-full ${c.cls}`}
            />
            <div className="min-w-0">
              <dt className="truncate text-[11px] text-muted">{c.label}</dt>
              <dd
                className={`tabular-nums text-ink ${compact ? 'text-sm' : 'text-[15px] font-semibold'}`}
              >
                {Math.round(c.g)}g{' '}
                <span className="text-xs font-normal text-muted">{c.pct}%</span>
              </dd>
            </div>
          </div>
        ))}
      </dl>
    </div>
  );
}
