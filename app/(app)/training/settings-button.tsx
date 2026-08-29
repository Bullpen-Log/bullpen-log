'use client';

import { useState } from 'react';
import { Settings2 } from 'lucide-react';
import { Modal } from '@/components/modal';
import { TrainingSettingsForm } from '@/components/training-forms';

/**
 * 트레이닝 화면에서 여는 설정.
 *
 * 홈에도 같은 것이 상자로 있다. 여기에도 두는 이유는, 설정을 고치고 싶어지는
 * 순간이 대개 여기여서다 — 운동 목록을 보다가 "이건 장비가 없어서 못 하는데"
 * 싶을 때. 그때 홈으로 건너갔다 돌아오게 하면 하던 일을 놓친다.
 *
 * 고치고 나면 이 화면으로 돌아온다. 이미 만들어 둔 오늘 일정은 그대로다 —
 * 설정을 바꿨다고 눈앞의 목록이 말없이 바뀌면 하던 운동이 어디 갔는지 알 수 없다.
 * 새 설정으로 받고 싶으면 '다시 만들기'를 누르면 된다.
 */
export function TrainingSettingsButton({
  trainingLevel,
  trainingGoal,
  ownedEquipment,
}: {
  trainingLevel: string | null;
  trainingGoal: string | null;
  ownedEquipment: string[];
}) {
  const [open, setOpen] = useState(false);

  return (
    <>
      <button
        type="button"
        onClick={() => setOpen(true)}
        className="inline-flex shrink-0 items-center gap-1.5 rounded-xl border border-line-strong px-3 py-2 text-sm font-medium text-ink transition-colors hover:border-sky hover:text-sky"
      >
        <Settings2 className="h-4 w-4" />
        트레이닝 설정
      </button>

      <Modal
        open={open}
        onClose={() => setOpen(false)}
        title="트레이닝 설정"
        description="어쩌다 한 번 고치는 것들입니다. 오늘 쓸 장비는 일정을 만들 때 따로 고릅니다."
      >
        <TrainingSettingsForm
          trainingLevel={trainingLevel}
          trainingGoal={trainingGoal}
          ownedEquipment={ownedEquipment}
          returnTo="/training"
        />
      </Modal>
    </>
  );
}
