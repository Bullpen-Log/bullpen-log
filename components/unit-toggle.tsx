'use client';

import { useSyncExternalStore } from 'react';
import {
  applyLengthUnit,
  applySpeedUnit,
  applyWeightUnit,
  LENGTH_UNITS,
  readLengthUnit,
  readWeightUnit,
  readSpeedUnit,
  serverLengthUnit,
  serverSpeedUnit,
  serverWeightUnit,
  SPEED_UNITS,
  subscribeUnits,
  WEIGHT_UNITS,
} from '@/lib/units';
import { Segmented } from '@/components/segmented';

/**
 * 길이와 무게를 어떤 단위로 볼지 고르는 두 줄.
 *
 * 테마 고르기와 같은 방식으로 읽는다(useSyncExternalStore) — 지금 값이
 * localStorage 에 있어서 서버는 알 수가 없다. 서버가 그릴 때와 화면에 붙는
 * 순간에는 기본값(cm·kg)을 쓰고, 붙고 난 뒤 진짜 값으로 바꿔 그린다.
 *
 * 바꾼다고 저장된 숫자가 달라지지는 않는다. 키는 늘 cm 로, 무게는 늘 kg 로
 * 남고 보여줄 때만 바뀐다.
 */
export function UnitToggle() {
  const length = useSyncExternalStore(subscribeUnits, readLengthUnit, serverLengthUnit);
  const weight = useSyncExternalStore(subscribeUnits, readWeightUnit, serverWeightUnit);
  const speed = useSyncExternalStore(subscribeUnits, readSpeedUnit, serverSpeedUnit);

  return (
    <div className="space-y-2.5">
      <Row
        label="길이"
        hint="키 · 윙스팬"
        options={LENGTH_UNITS}
        current={length}
        onPick={applyLengthUnit}
      />
      <Row
        label="무게"
        hint="몸무게 · 운동에서 든 무게"
        options={WEIGHT_UNITS}
        current={weight}
        onPick={applyWeightUnit}
      />
      <Row
        label="구속"
        hint="투구 기록과 목표 구속"
        options={SPEED_UNITS}
        current={speed}
        onPick={applySpeedUnit}
      />
    </div>
  );
}

function Row<V extends string>({
  label,
  hint,
  options,
  current,
  onPick,
}: {
  label: string;
  hint: string;
  options: readonly { value: V; label: string; hint: string }[];
  current: V;
  onPick: (value: V) => void;
}) {
  return (
    <div className="flex items-center justify-between gap-3">
      <span className="min-w-0">
        <span className="block text-sm text-ink">{label}</span>
        <span className="block text-[11px] text-muted">{hint}</span>
      </span>

      {/*
        세 줄의 칸 크기를 맞춘다.

        예전에는 글자 길이가 폭을 정했다(px-3). 'cm'은 두 글자, 'km/h'는 네
        글자라 줄마다 칸이 다른 크기로 서고, 오른쪽 끝도 들쭉날쭉했다.

        폭을 못 박고(w-36) 두 칸으로 나누면(grid) 어떤 글자가 와도 같은
        크기가 된다. 가장 긴 'km/h'가 들어가고도 남는 폭으로 잡았다.
      */}
      <Segmented
        role="radiogroup"
        layout="grid"
        label={`${label} 단위`}
        value={current}
        onChange={onPick}
        options={options}
        className="w-36 shrink-0"
        itemClassName="px-1 py-1.5"
      />
    </div>
  );
}
