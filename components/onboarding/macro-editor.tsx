'use client';

import { useState } from 'react';
import { RotateCcw } from 'lucide-react';
import { MacroBar } from '@/components/onboarding/plan-stats';
import { INPUT_LARGE, invalidProps } from '@/components/onboarding/step-card';
import { useSyncedText } from '@/components/onboarding/use-synced-text';
import { Input } from '@/components/ui';
import {
  FAT_G_MAX,
  FAT_G_MIN,
  PROTEIN_G_MAX,
  PROTEIN_G_MIN,
  kcalText,
} from '@/lib/nutrition/meta';
import { kcalOfMacros } from '@/lib/nutrition/onboarding';
import type { NutritionAnswers, Preview } from '@/lib/nutrition/onboarding-answers';

/**
 * 탄단지 g 고치기 — 주인은 kcal 이다(docs/designs/inout-onboarding.md ④).
 *
 *   단백질 g  → proteinTargetG(직접 정한 하루 단백질)
 *   지방 g    → fatTargetG
 *   탄수화물 g → kcalTarget = 4C + 4P + 9F — 탄수화물은 '나머지'라 칸이 없고, 고치면 하루 칼로리가 따라 바뀐다
 *
 * 비우면 계산으로 돌아간다(null). 범위 밖 값은 저장 전 검사(checkNutritionStep · buildProfileData)가 막는다.
 */
export function MacroEditor({
  p,
  a,
  onChange,
  invalid,
}: {
  p: Preview;
  a: NutritionAnswers;
  onChange: (patch: Partial<NutritionAnswers>) => void;
  invalid: (field: string) => boolean;
}) {
  const t = p.targets;
  return (
    <div className="space-y-4">
      <div className="rounded-2xl border border-line bg-surface-2/60 p-3">
        <p className="text-xs font-medium text-muted">
          하루{' '}
          <strong className="font-semibold text-ink">{kcalText(t.base)}kcal</strong>
          {t.manual ? ' · 직접 정함' : ''}
        </p>
        <div className="mt-2">
          <MacroBar carbs={t.carbs} protein={t.protein} fat={t.fat} compact />
        </div>
      </div>

      <GramRow
        name="carbsG"
        label="탄수화물"
        value={t.carbs}
        auto={p.auto.carbs}
        manual={a.kcalTarget !== null}
        hint="고치면 하루 칼로리가 따라 바뀌어요"
        invalid={invalid('kcalTarget')}
        onEdit={(g) =>
          onChange({
            kcalTarget: g === null ? null : kcalOfMacros(g, t.protein, t.fat),
          })
        }
        row={0}
      />
      <GramRow
        name="proteinTargetG"
        label="단백질"
        value={t.protein}
        auto={p.auto.protein}
        manual={a.proteinTargetG !== null}
        hint={`체중 1kg 당 ${t.proteinPerKg}g 으로 계산 · ${PROTEIN_G_MIN}~${PROTEIN_G_MAX}g`}
        invalid={invalid('proteinTargetG')}
        onEdit={(g) => onChange({ proteinTargetG: g })}
        row={1}
      />
      <GramRow
        name="fatTargetG"
        label="지방"
        value={t.fat}
        auto={p.auto.fat}
        manual={a.fatTargetG !== null}
        hint={`하루 칼로리의 ${Math.round(t.fatShare * 100)}%, 바닥은 체중 0.8g/kg · ${FAT_G_MIN}~${FAT_G_MAX}g`}
        invalid={invalid('fatTargetG')}
        onEdit={(g) => onChange({ fatTargetG: g })}
        row={2}
      />
    </div>
  );
}

function GramRow({
  name,
  label,
  value,
  auto,
  manual,
  hint,
  invalid,
  onEdit,
  row,
}: {
  name: string;
  label: string;
  /** 지금 계산된 g(직접 값 포함) */
  value: number;
  /** 직접 값 없이 계산한 g */
  auto: number;
  manual: boolean;
  hint: string;
  invalid: boolean;
  /** null 은 계산으로 되돌리기 */
  onEdit: (g: number | null) => void;
  row: number;
}) {
  const [focused, setFocused] = useState(false);
  const [text, setText] = useSyncedText(String(Math.round(value)), focused);
  return (
    <div
      style={{ '--row': row } as React.CSSProperties}
      className="motion-safe:animate-row-in flex items-end gap-2"
    >
      <label className="min-w-0 flex-1">
        <span className="flex items-center gap-2 text-xs font-medium text-muted">
          {label}
          {manual && (
            <span className="rounded-full bg-sky/15 px-2 py-0.5 text-[11px] font-medium text-sky-strong">
              직접 · 계산 {Math.round(auto)}g
            </span>
          )}
        </span>
        <div className="relative mt-1.5">
          <Input
            id={`${name}-field`}
            type="text"
            inputMode="numeric"
            value={text}
            onChange={(e) => {
              setText(e.target.value);
              const s = e.target.value.trim();
              if (s === '') return onEdit(null);
              const n = Number(s);
              if (Number.isFinite(n)) onEdit(Math.round(n));
            }}
            onFocus={() => setFocused(true)}
            onBlur={() => {
              setFocused(false);
              setText(String(Math.round(value)));
            }}
            className={`${INPUT_LARGE} pr-10 text-lg tabular-nums`}
            {...invalidProps(invalid)}
          />
          <span
            aria-hidden
            className="pointer-events-none absolute inset-y-0 right-4 flex items-center text-sm text-muted"
          >
            g
          </span>
        </div>
        <span className="mt-1 block text-xs leading-relaxed break-keep text-muted/80">
          {hint}
        </span>
      </label>
      <button
        type="button"
        disabled={!manual}
        onClick={() => {
          onEdit(null);
          setText(String(Math.round(auto)));
        }}
        aria-label={`${label}을 계산값으로 되돌리기`}
        className="mb-6 inline-flex h-12 w-12 shrink-0 items-center justify-center rounded-xl text-muted transition-colors hover:bg-ink/5 hover:text-ink focus-visible:outline-2 focus-visible:outline-offset-2 focus-visible:outline-sky-strong disabled:opacity-25"
      >
        <RotateCcw aria-hidden className="h-4 w-4" />
      </button>
    </div>
  );
}
