'use client';

import { useState, type ReactNode } from 'react';
import { Segmented } from '@/components/segmented';
import { useSyncedText } from '@/components/onboarding/use-synced-text';
import { INPUT_LARGE, invalidProps } from '@/components/onboarding/step-card';
import { Input } from '@/components/ui';
import { useLengthUnit, useWeightUnit } from '@/components/use-units';
import {
  LENGTH_UNITS,
  WEIGHT_UNITS,
  applyLengthUnit,
  applyWeightUnit,
  fromLength,
  fromWeight,
  toLength,
  toWeight,
  type LengthUnit,
  type WeightUnit,
} from '@/lib/units';

/**
 * 키 · 체중 칸 — 보이는 숫자는 고른 단위(cm｜in · kg｜lb), 서버로 가는 값은 늘 cm · kg(숨은 칸).
 *
 * 단위는 설정의 단위 고르기와 같은 저장소(localStorage, lib/units.ts)라 여기서 바꾸면 앱 전체가 따라 바뀐다 —
 * 가입 때 in 으로 적은 사람은 내 정보도 in 으로 본다. 칸 오른쪽의 단위 글자가 지금 단위를 늘 말한다.
 *
 * 저장 단위로 바꿀 때 키는 정수 cm, 체중은 0.1kg 으로 다듬는다(서버 lib/profile.ts 와 같은 선).
 */
export function NumberUnitField({
  name,
  kind,
  label,
  value,
  onChange,
  min,
  max,
  placeholder,
  invalid = false,
  hint,
  autoComplete,
  withHidden = true,
}: {
  /** 숨은 칸 이름(heightCm · weightKg · targetWeightKg) — 보이는 칸의 id 는 "{name}-field" */
  name: string;
  kind: 'length' | 'weight';
  label: string;
  /** 저장 단위 값(cm · kg). null 은 빈칸 */
  value: number | null;
  onChange: (next: number | null) => void;
  /** 저장 단위 범위 — 칸 밑에 보인다 */
  min: number;
  max: number;
  /** 저장 단위의 보기 값(178 · 72.5) — 지금 단위로 바꿔 보인다 */
  placeholder: number;
  invalid?: boolean;
  hint?: ReactNode;
  autoComplete?: string;
  /** 숨은 칸을 함께 그릴지 — 답을 따로 숨은 칸으로 보내는 화면(목표 체중, toFormFields)은 끈다(같은 이름이 두 번 가지 않게) */
  withHidden?: boolean;
}) {
  const lengthUnit = useLengthUnit();
  const weightUnit = useWeightUnit();
  const unit: LengthUnit | WeightUnit = kind === 'length' ? lengthUnit : weightUnit;
  const [focused, setFocused] = useState(false);

  const decimals = kind === 'length' ? (unit === 'in' ? 1 : 0) : 1;
  const show = (canon: number) =>
    kind === 'length'
      ? toLength(canon, unit as LengthUnit)
      : toWeight(canon, unit as WeightUnit);
  const fmt = (canon: number | null) =>
    canon === null ? '' : String(Number(show(canon).toFixed(decimals)));
  const toCanon = (n: number) => {
    const raw =
      kind === 'length'
        ? fromLength(n, unit as LengthUnit)
        : fromWeight(n, unit as WeightUnit);
    return kind === 'length' ? Math.round(raw) : Math.round(raw * 10) / 10;
  };

  const [text, setText] = useSyncedText(fmt(value), focused);

  function edit(next: string) {
    setText(next);
    const trimmed = next.trim();
    if (trimmed === '') return onChange(null);
    const n = Number(trimmed);
    if (!Number.isFinite(n)) return onChange(null);
    onChange(toCanon(n));
  }

  const rangeText = `${fmt(min)}~${fmt(max)}${unit}`;
  const units = kind === 'length' ? LENGTH_UNITS : WEIGHT_UNITS;

  return (
    <div className="space-y-2">
      <div className="flex items-end justify-between gap-3">
        <label htmlFor={`${name}-field`} className="text-xs font-medium text-muted">
          {label}
        </label>
        <Segmented
          label={kind === 'length' ? '길이 단위' : '무게 단위'}
          value={unit}
          onChange={(v) =>
            kind === 'length'
              ? applyLengthUnit(v as LengthUnit)
              : applyWeightUnit(v as WeightUnit)
          }
          options={units.map((u) => ({ value: u.value, label: u.label, hint: u.hint }))}
          size="sm"
          className="w-32"
          itemClassName="py-1"
        />
      </div>
      <div className="relative">
        {withHidden && <input type="hidden" name={name} value={value ?? ''} />}
        <Input
          id={`${name}-field`}
          type="text"
          inputMode="decimal"
          autoComplete={autoComplete ?? 'off'}
          value={text}
          onChange={(e) => edit(e.target.value)}
          onFocus={() => setFocused(true)}
          onBlur={() => {
            setFocused(false);
            /* 흘려 친 글("7a")은 저장 값으로 되돌린다 */
            setText(fmt(value));
          }}
          placeholder={fmt(placeholder)}
          className={`${INPUT_LARGE} pr-14 text-lg tabular-nums`}
          {...invalidProps(invalid)}
        />
        <span
          aria-hidden
          className="pointer-events-none absolute inset-y-0 right-4 flex items-center text-sm text-muted"
        >
          {unit}
        </span>
      </div>
      <p className="text-xs leading-relaxed break-keep text-muted/80">
        {hint ?? `${rangeText} 사이로 적어 주세요.`}
      </p>
    </div>
  );
}
