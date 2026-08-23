'use client';

import { useState } from 'react';
import { useFormStatus } from 'react-dom';
import { ChevronDown, Settings2 } from 'lucide-react';
import { CheckboxGroup, RadioGroup } from '@/components/choice-inputs';
import { SELECTABLE_EQUIPMENT } from '@/lib/report/equipment';
import { TRAINING_GOALS, TRAINING_LEVELS } from '@/lib/report/personalize';
import {
  saveTodayEquipment,
  saveTrainingSettings,
} from '@/app/actions/training-setup';

/**
 * AI 트레이닝 화면의 설정.
 *
 * 고르는 곳을 결과 옆에 둔다. 예전에는 프로필에 있었는데, 정작 결과를 보는 곳은
 * 여기라서 "왜 이 운동이지?" 싶을 때마다 다른 화면으로 건너가야 했다.
 *
 * 두 덩이로 나눠 놓았다.
 *   경력·목표·가진 장비 — 어쩌다 한 번 고치므로 맨 위에 접어 둔다
 *   오늘 쓸 수 있는 장비 — 날마다 바뀌므로 결과 바로 옆에 펼쳐 둔다
 */

function SaveButton({ label }: { label: string }) {
  const { pending } = useFormStatus();
  return (
    <button
      type="submit"
      disabled={pending}
      className="rounded-lg bg-sky px-3 py-1.5 text-xs font-semibold text-white transition-colors hover:bg-sky-strong disabled:opacity-60"
    >
      {pending ? '저장 중…' : label}
    </button>
  );
}

/**
 * 오늘 쓸 수 있는 장비.
 *
 * 가진 것이 없으면(아직 안 고름) 아무것도 보여주지 않는다. 고를 것이 없는
 * 빈 칸을 내놓느니, 맨 위 '트레이닝 설정'에서 가진 장비부터 고르게 하는 편이 낫다.
 */
export function TodayEquipment({
  owned,
  availableToday,
}: {
  /** 가지고 있는 장비 (맨몸 포함) */
  owned: string[];
  /** 오늘 고른 장비. 안 골랐으면 null */
  availableToday: string[] | null;
}) {
  const choices = owned.filter((name) => name !== '맨몸');
  if (choices.length === 0) return null;

  // 안 골랐으면 가진 것을 다 쓸 수 있다는 뜻이라, 전부 켜서 보여준다.
  const selected = availableToday ?? owned;

  return (
    <form action={saveTodayEquipment} className="space-y-3 border-t border-line pt-3">
      <CheckboxGroup
        name="availableEquipment"
        label="오늘 쓸 수 있는 장비"
        hint={
          availableToday
            ? '오늘 고른 장비에 맞춰 운동을 골랐습니다. 바꾸면 다시 짭니다.'
            : '헬스장에 안 가는 날처럼 오늘 못 쓰는 것이 있으면 꺼주세요. 맨몸 운동은 항상 나옵니다.'
        }
        options={choices}
        selected={selected}
      />
      <SaveButton label="오늘 이걸로 다시 짜기" />
    </form>
  );
}

/** 어쩌다 한 번 고치는 설정. 기본은 접혀 있다. */
export function TrainingSettings({
  trainingLevel,
  trainingGoal,
  ownedEquipment,
}: {
  trainingLevel: string | null;
  trainingGoal: string | null;
  ownedEquipment: string[];
}) {
  const [open, setOpen] = useState(false);

  /*
   * 한 번도 안 고른 사람에게는 장비를 전부 켜서 보여준다.
   *
   * 빈 목록을 그대로 보여주면, 저장하는 순간 "아무 장비도 없음"이 되어 맨몸
   * 운동만 나온다. 경력을 고치러 열었을 뿐인데 훈련이 반토막 나는 셈이라,
   * 없는 것을 직접 끄게 한다.
   */
  const equipmentSelected =
    ownedEquipment.length > 0 ? ownedEquipment : [...SELECTABLE_EQUIPMENT];

  const summary = [
    trainingLevel ? `경력 ${trainingLevel}` : '경력 미설정',
    trainingGoal ?? '목표 미설정',
    ownedEquipment.length > 0
      ? `장비 ${ownedEquipment.length}개`
      : '장비 미설정',
  ].join(' · ');

  return (
    <div className="rounded-2xl border border-line bg-surface px-5 py-4">
      <button
        type="button"
        onClick={() => setOpen((v) => !v)}
        aria-expanded={open}
        className="flex w-full items-center gap-2 text-left"
      >
        <Settings2 className="h-4 w-4 shrink-0 text-sky" />
        <span className="text-sm font-medium text-ink">트레이닝 설정</span>
        <span className="min-w-0 flex-1 truncate text-xs text-muted">{summary}</span>
        <ChevronDown
          className={`h-4 w-4 shrink-0 text-muted transition-transform ${open ? 'rotate-180' : ''}`}
        />
      </button>

      {open && (
        <form action={saveTrainingSettings} className="mt-4 space-y-5">
          <RadioGroup
            name="trainingLevel"
            label="웨이트 트레이닝 경력"
            hint="경력에 비해 이른 운동을 빼는 기준입니다. 안 고르면 아무것도 빼지 않습니다."
            options={TRAINING_LEVELS.map((l) => ({ name: l.name, desc: l.desc }))}
            selected={trainingLevel}
          />
          <RadioGroup
            name="trainingGoal"
            label="훈련 목표"
            hint="같은 시간을 어디에 더 쓸지 정합니다. 몸 상태가 안 좋은 날에는 목표와 상관없이 회복이 먼저입니다."
            options={TRAINING_GOALS.map((g) => ({ name: g.name, desc: g.desc }))}
            selected={trainingGoal}
          />
          <CheckboxGroup
            name="ownedEquipment"
            label="가지고 있는 장비"
            hint="여기서 고른 것 중에 오늘 쓸 수 있는 것을 아래 ‘오늘 쓸 수 있는 장비’에서 다시 고릅니다."
            options={SELECTABLE_EQUIPMENT}
            selected={equipmentSelected}
          />
          <SaveButton label="설정 저장" />
        </form>
      )}
    </div>
  );
}
