'use client';

import { useState } from 'react';
import Link from 'next/link';
import { useFormStatus } from 'react-dom';
import { RefreshCw, Sparkles } from 'lucide-react';
import { CheckboxGroup, RadioGroup } from '@/components/choice-inputs';
import { Segmented } from '@/components/segmented';
import { SELECTABLE_EQUIPMENT } from '@/lib/report/equipment';
import {
  TRAINING_GOALS,
  TRAINING_LEVELS,
  focusesFor,
  validFocus,
} from '@/lib/report/personalize';
import {
  generateTodayPlan,
  saveOwnedEquipment,
  saveTrainingSettings,
} from '@/app/actions/training-setup';
import {
  minutesChoicesFor,
  nearestMinutesChoice,
  PREVENTION_GOAL,
} from '@/lib/report/theme';

/**
 * 트레이닝 설정과 일정 만들기 폼.
 *
 * 홈과 트레이닝 두 화면이 함께 쓴다. 홈에서는 "오늘 것을 만든다", 트레이닝에서는
 * "조건을 바꿔 다시 만든다"로 쓰임이 다르지만 폼은 같다. 그래서 화면 폴더가 아니라
 * components 에 둔다.
 *
 * 두 덩이로 나눠 놓았다.
 *   경력·가진 장비      — 어쩌다 한 번 고치므로 접어 둔다
 *   오늘 시간·목표·장비 — 일정을 만들 때마다 고르므로 만들기 버튼과 한 폼에 둔다
 *
 * 목표는 원래 설정 쪽에 있었다. 그런데 한 번 '파워 향상'으로 정해두면 그다음
 * 모든 날이 파워 위주가 된다 — 오늘은 어깨가 뻐근해서 관리에 쓰고 싶은 날도
 * 마찬가지였다. 목표는 날마다 달라지는 것이므로 만들 때 함께 고른다.
 */

/** 일정을 만드는 두 방식 */
const PLAN_MODES = [
  { value: 'auto', label: 'AI 맞춤', icon: Sparkles },
  { value: 'manual', label: '직접 고르기' },
] as const;

function SubmitButton({
  label,
  busy = '만드는 중…',
}: {
  label: string;
  busy?: string;
}) {
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
  goal,
  focus,
  generated,
  checkedIn,
  returnTo,
  clash = null,
  startMode = 'auto',
}: {
  /** 가지고 있는 장비 (맨몸 포함) */
  owned: string[];
  /** 오늘 고른 장비. 안 골랐으면 null */
  availableToday: string[] | null;
  /** 이번에 쓸 시간(분) */
  minutes: number;
  /** 프로필에 저장된 기본 시간(분) */
  defaultMinutes: number;
  /** 지난번에 고른 훈련 목표. 한 번도 안 골랐으면 null */
  goal: string | null;
  /** 지난번에 좁힌 부위. 한 번도 안 골랐으면 null */
  focus: string | null;
  /** 오늘 일정을 이미 만들었는가 */
  generated: boolean;
  /**
   * 오늘 체크인을 남겼는가. 안 남겼으면 폼 대신 '체크인 먼저'를 낸다.
   *
   * 일정은 오늘 몸 상태를 보고 짠다. 체크인이 없으면 통증이 있어도 멈추지
   * 못하므로 만들지 않는다 (2026-09-23 사용자분과 정함). 서버도 같은 것을 본다.
   */
  checkedIn: boolean;
  /** 만들고 나서 돌아올 화면. 홈과 트레이닝 두 곳에서 쓴다. */
  /**
   * 저장하고 나서 돌아올 화면.
   *
   * 여기서 좁히지 않는다. 설정이 창으로 열리면서 '지금 보던 화면'이 값이
   * 되는데, 그 목록을 화면 쪽과 서버 쪽 두 군데에 적어 두면 어긋난다.
   * 실제로 어디까지 허용할지는 app/actions/training-setup.ts 의 목록이
   * 정하고, 목록에 없으면 홈으로 떨어진다.
   */
  returnTo: string;
  /**
   * 오늘 고른 운동 종류가 몸 상태와 부딪힐 때만 들어온다.
   *
   * 부딪혀도 막지 않는다. 왜 가벼운 쪽을 권하는지 말하고, 그래도 하겠다면
   * 하게 한다 — 최종 선택은 사용자 몫이다. (통증만은 예외라, 그날은 애초에
   * 이 값이 들어오지 않는다.)
   */
  clash?: { kind: string; reason: string; fallbackLabel: string } | null;
  /**
   * 처음 펼칠 방식. 오늘 직접 골라 만들었으면 다시 만들 때도 그쪽으로 연다.
   * 아직 안 만든 날은 AI 맞춤이 먼저다 — 장비만 고르면 되는 간편한 쪽이다.
   */
  startMode?: 'auto' | 'manual';
}) {
  /*
   * 이미 만든 날에는 접어 둔다. 다 만들어 놓고도 만들기 폼이 계속 펼쳐져 있으면
   * 무엇을 더 해야 하는 화면처럼 보인다.
   */
  const [open, setOpen] = useState(!generated);

  /*
   * AI 맞춤 / 직접 고르기.
   *
   * AI 맞춤은 장비만 고른다. 목표·시간·부위는 앱이 오늘 체크인·투구·운동
   * 기록을 보고 정한다(app/actions/training-setup.ts 의 decideAutoSetup).
   * 직접 고르기는 예전 그대로다 — 둘 다 남겨 두기로 했다(사용자분과 정함).
   */
  const [mode, setMode] = useState<'auto' | 'manual'>(startMode);

  /*
   * 목표에 따라 고를 수 있는 시간이 다르다.
   *
   * 무게를 드는 세 목표는 60·90·120분, 부상 방지는 40·60·90분이다. 목표를
   * 바꾸면 시간 칸도 바로 바뀌어야 한다 — 부상 방지로 옮겼는데 120분이 그대로
   * 남아 있으면 고를 수 없는 조합이 화면에 남는다. 그럴 때는 가장 가까운
   * 값으로 내려 짚는다(120 → 90).
   */
  const [pickedGoal, setPickedGoal] = useState(goal ?? TRAINING_GOALS[0].name);
  const minuteChoices = minutesChoicesFor(pickedGoal);
  const pickedMinutes = nearestMinutesChoice(minutes, pickedGoal);

  /*
   * 목표 안에서 부위를 좁힐 수 있는 날인가.
   *
   * 근력 향상과 파워 향상만 나눈다. 균형 잡힌 관리와 부상 방지는 '고르게'가
   * 그 목표의 뜻이라 한쪽으로 좁히면 이름과 어긋난다.
   */
  const focusChoices = focusesFor(pickedGoal);
  /*
   * 지난번에 고른 것을 짚어 둔다.
   *
   * 한 번도 안 골랐으면 아무것도 안 짚는다. 그대로 만들면 예전처럼 앱이
   * 최근 기록을 보고 상체·하체를 번갈아 정한다 — 고르지 않은 것도 하나의
   * 답이라 아무 쪽이나 미리 찍어 둘 이유가 없다.
   *
   * 목표에 없는 값은 validFocus 가 걸러 준다(근력의 '당기기'가 파워에 남지 않게).
   */
  const pickedFocus = validFocus(pickedGoal, focus) ?? '';

  const choices = owned.filter((name) => name !== '맨몸');
  /*
   * 미리 켜 두지 않는다.
   *
   * 예전에는 가진 것을 전부 켜 놓고 시작했다. 그러면 헬스장에 안 가는 날에도
   * 그대로 만들기를 누르게 되고, 앱은 바벨이 있다고 보고 일정을 짠다. 무엇을
   * 쓸 수 있는지는 날마다 다르고, 그것은 앱이 아니라 사람이 안다.
   *
   * 이미 오늘 고른 적이 있으면(다시 만들기) 그 선택은 그대로 살려 둔다.
   */
  const equipmentSelected = availableToday ?? [];

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

  if (!checkedIn) {
    return (
      <div className="space-y-2 rounded-xl border border-line bg-surface-2 px-4 py-3">
        <p className="text-sm font-bold text-ink">오늘 체크인을 먼저 남겨주세요</p>
        <p className="text-[13px] leading-relaxed text-muted">
          운동 일정은 오늘 몸 상태를 보고 짭니다. 체크인이 없으면 통증이나 뻐근한 곳을
          모른 채 짜게 됩니다. 30초면 됩니다.
        </p>
        {/*
          홈에서는 체크인 상자가 같은 화면에 있다. 이 창을 닫으면 바로 보이는
          자리라 주소 대신 위치를 말한다.

          '첫 번째 상자'라고 하지 않는다. 홈 맨 위에 투구 달력이 올라오면서
          (2026-09-24) 첫 번째로 보이는 것이 체크인이 아니게 됐다. 상자가 든
          묶음 이름('오늘 할 일')으로 가리키면 순서가 바뀌어도 맞는다.
        */}
        {returnTo === '/training' ? (
          <Link
            href="/today"
            className="inline-block rounded-xl bg-sky px-4 py-2.5 text-sm font-semibold text-white transition-colors hover:bg-sky-strong"
          >
            홈에서 체크인하기
          </Link>
        ) : (
          <p className="text-[13px] font-medium leading-relaxed text-ink">
            이 창을 닫고 ‘오늘 할 일’의 ‘오늘 체크인’에서 남길 수 있습니다.
          </p>
        )}
      </div>
    );
  }

  /* 오늘 쓸 수 있는 장비 — 두 방식 모두 사람이 고른다. 앱은 모르는 일이다. */
  const equipmentField =
    choices.length > 0 ? (
      <CheckboxGroup
        name="availableEquipment"
        label="오늘 쓸 수 있는 장비"
        hint="오늘 실제로 쓸 수 있는 것만 켜주세요. 아무것도 안 켜면 맨몸 운동만 나옵니다."
        options={choices}
        selected={equipmentSelected}
      />
    ) : null;

  const cancel = generated && (
    <button
      type="button"
      onClick={() => setOpen(false)}
      className="text-xs text-muted transition-colors hover:text-ink"
    >
      취소
    </button>
  );

  return (
    <form action={generateTodayPlan} className="space-y-4">
      <input type="hidden" name="returnTo" value={returnTo} />
      <input type="hidden" name="mode" value={mode} />

      {/*
        방식 고르기 — 고른 쪽 밑의 알약이 미끄러진다(다른 고르개들과 같은 것).
        고르개의 칸은 type="button" 이라 폼 안에서 눌러도 일정이 만들어지지 않는다.
      */}
      <Segmented
        label="만드는 방식"
        value={mode}
        onChange={setMode}
        options={PLAN_MODES}
        size="md"
        tone="raised"
        itemClassName="px-3 py-2"
      />

      {mode === 'auto' ? (
        <>
          <p className="text-[13px] leading-relaxed text-muted">
            오늘 체크인 · 최근 투구 · 운동 기록 · 남긴 메모를 보고 AI가 목표와 시간을
            정합니다. 장비만 골라주세요.
          </p>

          {/*
            체크인에서 고른 운동이 몸 상태와 부딪히는 날.

            AI 맞춤은 몸 상태에 맞춰 가고 이유를 말한다(사용자분과 정함). 경고를
            넘기는 체크는 여기 두지 않는다 — 그건 직접 고르기에서 한다.
          */}
          {clash && (
            <div className="space-y-1 rounded-xl border border-warn-line bg-warn-bg px-4 py-3">
              <p className="text-sm font-bold text-warn">
                {clash.kind} 운동을 하고 싶다고 하셨는데, {clash.reason}.
              </p>
              <p className="text-[13px] leading-relaxed text-warn">
                AI 맞춤은 몸 상태에 맞춰 {clash.fallbackLabel} 위주로 만들고, 그 이유를
                함께 알려드립니다. 그래도 {clash.kind} 운동을 하고 싶으시면 ‘직접
                고르기’에서 만들 수 있습니다.
              </p>
            </div>
          )}

          {equipmentField}

          <div className="flex flex-wrap items-center gap-3">
            <SubmitButton
              label={generated ? 'AI 맞춤으로 다시 만들기' : 'AI 맞춤으로 만들기'}
              busy="AI가 오늘 몸 상태를 보고 있습니다…"
            />
            {cancel}
          </div>
        </>
      ) : (
        <>
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

          {/*
            목표를 먼저 고른다. 시간 선택지가 목표에 따라 달라지므로 순서가 이쪽이다.

            설정에 두었을 때는 한 번 정한 것이 계속 따라와 매일 같은 쪽으로만
            쏠렸다. 지난번에 고른 것을 미리 짚어 두되, 만들 때마다 눈에 보이므로
            바꾸고 싶은 날에는 바로 바꿀 수 있다.
          */}
          <RadioGroup
            key="goal"
            name="trainingGoal"
            label="오늘 훈련 목표"
            hint="같은 시간을 어디에 더 쓸지 정합니다. 몸 상태가 안 좋은 날에는 목표와 상관없이 회복이 먼저입니다."
            options={TRAINING_GOALS.map((g) => ({ name: g.name, desc: g.desc }))}
            selected={pickedGoal}
            onChange={setPickedGoal}
          />

          {/*
            부위 좁히기 — 고를 수 있는 목표에서만 낸다.

            기본값이 '앱이 정함'이다. 상체·하체를 번갈아 도는 규칙이 대개 옳고,
            그것을 끄는 것은 "오늘은 당기기만"처럼 뜻이 분명할 때뿐이다. 기본을
            비워 두면 지금까지 쓰던 사람은 아무것도 달라지지 않는다.
          */}
          {focusChoices.length > 0 && (
            <RadioGroup
              /* 목표가 바뀌면 선택지가 통째로 달라지므로 다시 그린다 */
              key={`focus-${pickedGoal}`}
              name="trainingFocus"
              label="오늘 할 부위"
              hint="안 고르면 최근에 한 것을 보고 상체·하체를 번갈아 골라드립니다. 몸 상태가 안 좋은 날에는 부위와 상관없이 회복이 먼저입니다."
              options={focusChoices.map((f) => ({
                name: f.label,
                value: f.key,
                desc: f.desc,
              }))}
              selected={pickedFocus}
              compact
            />
          )}

          <RadioGroup
            /* 목표가 바뀌면 고른 값도 새로 짚어야 하므로 통째로 다시 그린다 */
            key={`minutes-${pickedGoal}`}
            name="minutes"
            label="오늘 운동 시간"
            hint={
              pickedGoal === PREVENTION_GOAL
                ? '몸을 지키는 날이라 짧게 끝낼 수 있습니다. 두 시간은 이 날의 뜻이 아닙니다.'
                : undefined
            }
            options={minuteChoices.map((m) => ({
              name: `${m}분`,
              desc:
                m === nearestMinutesChoice(defaultMinutes, pickedGoal)
                  ? '기본값'
                  : undefined,
            }))}
            selected={`${pickedMinutes}분`}
            compact
          />

          {equipmentField}

          <label className="flex items-center gap-2.5 text-xs text-muted">
            <input
              type="checkbox"
              name="saveDefaults"
              value="on"
              className="h-4 w-4 rounded border-line-strong accent-sky"
            />
            이 시간과 목표를 앞으로도 기본으로 쓰기
          </label>

          <div className="flex flex-wrap items-center gap-3">
            <SubmitButton
              label={generated ? '이 조건으로 다시 만들기' : '오늘 운동 일정 만들기'}
            />
            {cancel}
          </div>
        </>
      )}
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
  ownedEquipment,
  returnTo,
}: {
  trainingLevel: string | null;
  ownedEquipment: string[];
  /** 저장하고 나서 돌아올 화면 */
  /**
   * 저장하고 나서 돌아올 화면.
   *
   * 여기서 좁히지 않는다. 설정이 창으로 열리면서 '지금 보던 화면'이 값이
   * 되는데, 그 목록을 화면 쪽과 서버 쪽 두 군데에 적어 두면 어긋난다.
   * 실제로 어디까지 허용할지는 app/actions/training-setup.ts 의 목록이
   * 정하고, 목록에 없으면 홈으로 떨어진다.
   */
  returnTo: string;
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
        <SubmitButton label="경력 저장" busy="저장 중…" />
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
