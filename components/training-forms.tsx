'use client';

import { useState } from 'react';
import { useFormStatus } from 'react-dom';
import { RefreshCw } from 'lucide-react';
import { CheckboxGroup, RadioGroup } from '@/components/choice-inputs';
import { SELECTABLE_EQUIPMENT } from '@/lib/report/equipment';
import { TRAINING_GOALS, TRAINING_LEVELS } from '@/lib/report/personalize';
import {
  generateTodayPlan,
  saveOwnedEquipment,
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
  clash = null,
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
  /**
   * 오늘 고른 운동 종류가 몸 상태와 부딪힐 때만 들어온다.
   *
   * 부딪혀도 막지 않는다. 왜 가벼운 쪽을 권하는지 말하고, 그래도 하겠다면
   * 하게 한다 — 최종 선택은 사용자 몫이다. (통증만은 예외라, 그날은 애초에
   * 이 값이 들어오지 않는다.)
   */
  clash?: { kind: string; reason: string; fallbackLabel: string } | null;
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

      {clash && (
        <div className="space-y-2 rounded-xl border border-warn-line bg-warn-bg px-4 py-3">
          <p className="text-sm font-bold text-warn">
            {clash.kind} 운동을 하고 싶다고 하셨는데, {clash.reason}.
          </p>
          <p className="text-[13px] leading-relaxed text-warn">
            그래서 기본은 {clash.fallbackLabel} 위주로 만들어 드립니다. 몸이
            괜찮다고 느끼시면 원하신 대로 만들어 드릴 수도 있습니다 — 정하는 것은
            본인입니다.
          </p>
          <label className="flex items-start gap-2.5 text-[13px] font-medium leading-relaxed text-warn">
            <input
              type="checkbox"
              name="overrideCondition"
              value="on"
              className="mt-0.5 h-4 w-4 shrink-0 rounded border-warn-line accent-sky"
            />
            알겠습니다. 그래도 {clash.kind} 운동으로 만들어주세요
          </label>
        </div>
      )}

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

/**
 * 어쩌다 한 번 고치는 설정 — 경력·목표·가진 장비.
 *
 * 홈과 트레이닝 화면의 창 안에서 쓴다.
 *
 * 폼을 둘로 나눠 두었다. 예전에는 셋이 한 폼이라, 경력만 고치러 열었다가
 * 저장해도 장비가 함께 저장됐다. 그런데 아직 장비를 안 고른 사람에게는 화면이
 * 전부 켜진 채로 나오므로(안 그러면 저장하는 순간 맨몸 운동만 남는다),
 * 결과적으로 있지도 않은 장비 열여섯 개를 "가지고 있다"고 저장하게 됐다.
 * 그러면 바벨이 없는데 바벨 운동이 나온다.
 *
 * 이제 각자 자기 단추로만 저장된다 — 안 건드린 것은 안 바뀐다.
 */
export function TrainingSettingsForm({
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
  /*
   * 한 번도 안 고른 사람에게는 장비를 전부 켜서 보여준다.
   *
   * 빈 목록을 그대로 보여주면, 저장하는 순간 "아무 장비도 없음"이 되어 맨몸
   * 운동만 나온다. 그래서 전부 켜 두고 없는 것을 끄게 한다 — 다만 그 사실을
   * 안내에 적어 둔다. 예전에는 이 상태로 다른 것과 한 폼에 묶여 있어서,
   * 경력만 고치고 저장해도 장비 열여섯 개가 통째로 저장됐다.
   */
  const hasChosenEquipment = ownedEquipment.length > 0;
  const equipmentSelected = hasChosenEquipment
    ? ownedEquipment
    : [...SELECTABLE_EQUIPMENT];

  return (
    <div className="space-y-6">
      <form action={saveTrainingSettings} className="space-y-5">
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
        <SubmitButton label="경력·목표 저장" busy="저장 중…" />
      </form>

      {/*
        장비는 자기 폼과 자기 단추를 쓴다. 위에서 경력만 고치고 저장해도
        여기 값은 그대로 남는다.
      */}
      <form action={saveOwnedEquipment} className="space-y-5 border-t border-line pt-6">
        <input type="hidden" name="returnTo" value={returnTo} />
        <CheckboxGroup
          name="ownedEquipment"
          label="가지고 있는 장비"
          hint={
            hasChosenEquipment
              ? '여기서 고른 것 중에 오늘 쓸 수 있는 것을 일정을 만들 때 다시 고릅니다.'
              : '아직 고르신 적이 없어 전부 켜 두었습니다. 없는 것을 꺼주세요 — 그래야 못 하는 운동이 안 나옵니다.'
          }
          options={SELECTABLE_EQUIPMENT}
          selected={equipmentSelected}
        />
        <SubmitButton label="가진 장비 저장" busy="저장 중…" />
      </form>
    </div>
  );
}
