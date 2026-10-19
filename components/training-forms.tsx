'use client';

import { useRef, useState } from 'react';
import { useFormStatus } from 'react-dom';
import { RefreshCw } from '@/components/icon';
import { CheckboxGroup, RadioGroup } from '@/components/choice-inputs';
import { OpenCheckinButton } from '@/components/notice-bell';
import { SELECTABLE_EQUIPMENT } from '@/lib/report/equipment';
import { TRAINING_LEVELS } from '@/lib/report/personalize';
import { generateTodayPlan, saveTrainingSettings } from '@/app/actions/training-setup';
import { SafeForm } from '@/components/safe-form';
import { Button } from '@/components/ui';

/**
 * 트레이닝 설정과 일정 만들기 폼.
 *
 * 홈과 트레이닝 두 화면이 함께 쓴다. 홈에서는 "오늘 것을 만든다", 트레이닝에서는
 * "조건을 바꿔 다시 만든다"로 쓰임이 다르지만 폼은 같다. 그래서 화면 폴더가 아니라
 * components 에 둔다.
 *
 * 두 덩이로 나눠 놓았다.
 *   경력          — 어쩌다 한 번 고치므로 설정 창에
 *   오늘 쓸 장비  — 일정을 만들 때마다 고르므로 만들기 버튼과 한 폼에 둔다
 *
 * 목표 · 시간 · 부위는 자동 맞춤이 정한다(2026-10-20 '직접 고르기'를 뺐다 — '오늘 하고 싶은 운동' 카드와 겹쳤다).
 */

function SubmitButton({
  label,
  busy = '만드는 중…',
}: {
  label: string;
  busy?: string;
}) {
  const { pending } = useFormStatus();
  return (
    <Button type="submit" disabled={pending}>
      {pending ? busy : label}
    </Button>
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
  availableToday,
  generated,
  checkedIn,
  returnTo,
  clash = null,
  checkinAction,
}: {
  /** 오늘 고른 장비. 안 골랐으면 null — 장비를 다 켜서 보인다 */
  availableToday: string[] | null;
  /** 오늘 일정을 이미 만들었는가 */
  generated: boolean;
  /**
   * 오늘 체크인을 남겼는가. 안 남겼으면 폼 대신 '체크인 먼저'를 낸다.
   *
   * 일정은 오늘 몸 상태를 보고 짠다. 체크인이 없으면 통증이 있어도 멈추지
   * 못하므로 만들지 않는다 (2026-09-23 사용자분과 정함). 서버도 같은 것을 본다.
   */
  checkedIn: boolean;
  /**
   * 저장하고 나서 돌아올 화면.
   *
   * 여기서 좁히지 않는다. 실제로 어디까지 허용할지는 app/actions/training-setup.ts 의 목록이
   * 정하고, 목록에 없으면 홈으로 떨어진다.
   */
  returnTo: string;
  /**
   * 오늘 고른 운동 종류가 몸 상태와 부딪힐 때만 들어온다 — 자동 맞춤은 몸 상태 쪽으로 가고 까닭을 말한다.
   * (통증만은 예외라, 그날은 애초에 이 값이 들어오지 않는다.)
   */
  clash?: { kind: string; reason: string; fallbackLabel: string } | null;
  /**
   * 체크인이 없을 때 '체크인 먼저' 안에 놓을 것 — 그 자리에서 체크인 창을 여는 단추.
   *
   * 트레이닝 화면이 넘긴다. 이 폼은 체크인 창을 모른다 — 창에 들어갈 재료(부위
   * 목록)는 화면 쪽이 들고 있다. 안 넘기면 알림(종)의 체크인 창을 여는 단추를 둔다.
   */
  checkinAction?: React.ReactNode;
}) {
  /*
   * 이미 만든 날에는 접어 둔다. 다 만들어 놓고도 만들기 폼이 계속 펼쳐져 있으면
   * 무엇을 더 해야 하는 화면처럼 보인다.
   */
  const [open, setOpen] = useState(!generated);

  /*
   * 오늘 쓸 수 있는 장비 — 처음엔 다 켜 둔다(2026-10-20 김민: "기본으로 모든 장비 선택"). 가진 장비 설정을 없애
   * 장비는 여기와 프로그램 시작에서만 고른다. 오늘 이미 골랐으면(다시 만들기) 그 선택을 살린다.
   */
  const equipmentSelected = availableToday ?? [...SELECTABLE_EQUIPMENT];

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
        <p className="text-sm font-bold text-ink">오늘 체크인을 먼저 남겨 주세요</p>
        {/* 체크인 단추를 넘긴 곳(트레이닝 화면)은 그 부품이 제 안내 한 줄('20초면 돼요 …')을 단다 — 두 줄이 겹쳐 30초 · 20초로 엇갈렸다 */}
        {!checkinAction && (
          <p className="text-footnote leading-relaxed text-muted">
            오늘 몸 상태를 보고 짜요. 30초면 돼요.
          </p>
        )}
        {checkinAction ?? (
          <OpenCheckinButton className="min-h-10 rounded-full bg-sky px-4 text-sm font-semibold text-white transition-colors hover:bg-sky-strong desk:rounded-xl">
            오늘 체크인하기
          </OpenCheckinButton>
        )}
      </div>
    );
  }

  const cancel = generated && (
    <button
      type="button"
      onClick={() => setOpen(false)}
      className="text-xs text-muted transition-colors hover:text-ink"
    >
      취소
    </button>
  );

  /*
   * 자동 맞춤 하나 — 목표 · 시간 · 부위는 앱이 오늘 체크인 · 투구 · 운동 기록과 '오늘 하고 싶은 운동' 카드의 답(종류 · 오늘 할 부위)을
   * 보고 정한다(app/actions/training-setup.ts decideAutoSetup). '직접 고르기'는 그 카드와 겹쳐 2026-10-20 뺐다(김민).
   */
  return (
    <SafeForm action={generateTodayPlan} className="space-y-4">
      <input type="hidden" name="returnTo" value={returnTo} />
      <input type="hidden" name="mode" value="auto" />

      <p className="text-footnote leading-relaxed text-muted">목표 · 시간은 앱이 정해요.</p>

      {/* 체크인 · 카드에서 고른 운동이 몸 상태와 부딪히는 날 — 몸 상태에 맞춰 가고 까닭을 말한다 */}
      {clash && (
        <div className="space-y-1 rounded-xl border border-warn-line bg-warn-bg px-4 py-3">
          <p className="text-sm font-bold text-warn">
            {clash.kind} 운동을 하고 싶다고 하셨는데, {clash.reason}.
          </p>
          <p className="text-footnote leading-relaxed text-warn">
            그래서 몸 상태에 맞춰 {clash.fallbackLabel} 위주로 만들어요.
          </p>
        </div>
      )}

      <CheckboxGroup
        name="availableEquipment"
        label="오늘 쓸 수 있는 장비"
        hint="없는 것은 꺼 주세요. 다 끄면 맨몸 운동만 나와요."
        options={SELECTABLE_EQUIPMENT}
        selected={equipmentSelected}
      />

      <div className="flex flex-wrap items-center gap-3">
        <SubmitButton
          label={generated ? '자동 맞춤으로 다시 만들기' : '자동 맞춤으로 만들기'}
          busy="오늘 몸 상태에 맞추고 있어요…"
        />
        {cancel}
      </div>
    </SafeForm>
  );
}

/**
 * 어쩌다 한 번 고치는 설정 — 웨이트 경력. 홈과 트레이닝 화면의 창 안에서 쓴다.
 *
 * 가진 장비는 2026-10-20 뺐다(김민: 장비는 프로그램을 시작할 때 · 오늘 운동을 만들 때만 고른다). 저장된 칸(User.ownedEquipment)은 그대로 둔다.
 */
export function TrainingSettingsForm({
  trainingLevel,
  returnTo,
}: {
  trainingLevel: string | null;
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
  const levelBox = useRef<HTMLDivElement>(null);

  return (
    <div className="space-y-6">
      {/*
        경력은 고르면 바로 저장된다 — 아이폰 설정처럼(2026-10-04 '앱 느낌' 4단계). 예전에는 고른 뒤 밑의 '경력 저장'을 따로
        눌러야 했고, 안 누르고 창을 닫으면 고른 것이 사라졌다. 저장되면 토스트로 알린다(SafeForm doneToast).
      */}
      <SafeForm action={saveTrainingSettings} doneToast="경력을 저장했어요">
        <input type="hidden" name="returnTo" value={returnTo} />
        <div ref={levelBox}>
          <RadioGroup
            name="trainingLevel"
            label="웨이트 트레이닝 경력"
            hint="경력에 비해 이른 운동을 빼는 기준이에요. 고르면 바로 저장돼요."
            options={TRAINING_LEVELS.map((l) => ({ name: l.name, desc: l.desc }))}
            selected={trainingLevel}
            onChange={() => levelBox.current?.closest('form')?.requestSubmit()}
          />
        </div>
      </SafeForm>
    </div>
  );
}
