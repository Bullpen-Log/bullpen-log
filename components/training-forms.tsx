'use client';

import { useState } from 'react';
import { useFormStatus } from 'react-dom';
import { ChevronDown, RefreshCw, Settings2 } from 'lucide-react';
import { CheckboxGroup, RadioGroup } from '@/components/choice-inputs';
import { SELECTABLE_EQUIPMENT } from '@/lib/report/equipment';
import { TRAINING_GOALS, TRAINING_LEVELS } from '@/lib/report/personalize';
import {
  generateTodayPlan,
  saveTrainingSettings,
} from '@/app/actions/training-setup';
import { WORKOUT_MINUTES_CHOICES } from '@/lib/report/theme';

/**
 * 트레이닝 설정과 일정 만들기 폼.
 *
 * 홈과 트레이닝 두 화면이 함께 쓴다. 홈에서는 "오늘 것을 만든다", 트레이닝에서는
 * "조건을 바꿔 다시 만든다"로 쓰임이 다르지만 폼은 같다. 그래서 화면 폴더가 아니라
 * components 에 둔다.
 *
 * 두 덩이로 나눠 놓았다.
 *   경력·목표·가진 장비 — 어쩌다 한 번 고치므로 접어 둔다
 *   오늘 시간·장비    — 일정을 만들 때마다 고르므로 만들기 버튼과 한 폼에 둔다
 */

function SubmitButton({ label, busy = '만드는 중…' }: { label: string; busy?: string }) {
  const { pending } = useFormStatus();
  return (
    <button
      type="submit"
      disabled={pending}
      className="rounded-xl bg-sky px-4 py-2.5 text-sm font-semibold text-white transition-colors hover:bg-sky-strong disabled:opacity-60"
    >
      {pending ? busy : label}
    </button>
  );
}

/**
 * 오늘의 운동 일정을 만드는 폼.
 *
 * 예전에는 화면을 열면 일정이 이미 만들어져 있었다. 만든 적도 없는 것이 떠
 * 있으니 "이걸 하라는 건가" 싶고, 새로고침하면 내용이 달라지기도 했다.
 * 이제는 여기서 오늘 조건을 고르고 눌러야 생긴다.
 *
 * 시간과 장비를 한 폼에 두는 이유는, 둘 다 일정을 만드는 재료이기 때문이다.
 * 따로 저장했다가 따로 만들게 하면 무엇이 반영된 것인지 알기 어렵다.
 */
export function PlanForm({
  owned,
  availableToday,
  minutes,
  defaultMinutes,
  generated,
  returnTo,
}: {
  /** 가지고 있는 장비 (맨몸 포함) */
  owned: string[];
  /** 오늘 고른 장비. 안 골랐으면 null */
  availableToday: string[] | null;
  /** 이번에 쓸 시간(분) */
  minutes: number;
  /** 프로필에 저장된 기본 시간(분) */
  defaultMinutes: number;
  /** 오늘 일정을 이미 만들었는가 */
  generated: boolean;
  /** 만들고 나서 돌아올 화면. 홈과 트레이닝 두 곳에서 쓴다. */
  returnTo: '/today' | '/training';
}) {
  /*
   * 이미 만든 날에는 접어 둔다. 다 만들어 놓고도 만들기 폼이 계속 펼쳐져 있으면
   * 무엇을 더 해야 하는 화면처럼 보인다.
   */
  const [open, setOpen] = useState(!generated);

  const choices = owned.filter((name) => name !== '맨몸');
  // 안 골랐으면 가진 것을 다 쓸 수 있다는 뜻이라, 전부 켜서 보여준다.
  const equipmentSelected = availableToday ?? owned;

  if (generated && !open) {
    return (
      <button
        type="button"
        onClick={() => setOpen(true)}
        className="rounded-lg border border-line-strong px-3 py-1.5 text-xs font-semibold text-ink transition-colors hover:border-sky hover:text-sky"
      >
        <RefreshCw className="mr-1.5 inline h-3.5 w-3.5" />
        다시 만들기
      </button>
    );
  }

  return (
    <form action={generateTodayPlan} className="space-y-4">
      <input type="hidden" name="returnTo" value={returnTo} />
      <RadioGroup
        name="minutes"
        label="오늘 운동 시간"
        options={WORKOUT_MINUTES_CHOICES.map((m) => ({
          name: `${m}분`,
          desc: m === defaultMinutes ? '기본값' : undefined,
        }))}
        selected={`${minutes}분`}
      />

      {choices.length > 0 && (
        <CheckboxGroup
          name="availableEquipment"
          label="오늘 쓸 수 있는 장비"
          hint="헬스장에 안 가는 날처럼 오늘 못 쓰는 것이 있으면 꺼주세요. 맨몸 운동은 항상 나옵니다."
          options={choices}
          selected={equipmentSelected}
        />
      )}

      <label className="flex items-center gap-2.5 text-xs text-muted">
        <input
          type="checkbox"
          name="saveMinutes"
          value="on"
          className="h-4 w-4 rounded border-line-strong accent-sky"
        />
        이 시간을 앞으로도 기본으로 쓰기
      </label>

      <div className="flex flex-wrap items-center gap-3">
        <SubmitButton label={generated ? '이 조건으로 다시 만들기' : '오늘 운동 일정 만들기'} />
        {generated && (
          <button
            type="button"
            onClick={() => setOpen(false)}
            className="text-xs text-muted transition-colors hover:text-ink"
          >
            취소
          </button>
        )}
      </div>
    </form>
  );
}

/** 어쩌다 한 번 고치는 설정. 기본은 접혀 있다. */
export function TrainingSettings({
  trainingLevel,
  trainingGoal,
  ownedEquipment,
  returnTo,
}: {
  trainingLevel: string | null;
  trainingGoal: string | null;
  ownedEquipment: string[];
  /** 저장하고 나서 돌아올 화면 */
  returnTo: '/today' | '/training';
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
          <input type="hidden" name="returnTo" value={returnTo} />
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
          <SubmitButton label="설정 저장" busy="저장 중…" />
        </form>
      )}
    </div>
  );
}
