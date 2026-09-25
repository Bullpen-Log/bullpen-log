'use client';

import { useState } from 'react';
import { Modal } from '@/components/modal';
import { CheckinForm } from '@/components/checkin-form';

/**
 * 트레이닝에서 바로 남기는 체크인.
 *
 * 운동 일정은 오늘 체크인을 보고 짜서, 체크인이 없으면 만들기 폼 대신 '체크인
 * 먼저'가 뜬다. 예전에는 거기서 홈으로 보냈다 — 홈으로 가서 체크인하고, 다시
 * 트레이닝으로 돌아와 만들기를 눌러야 했다. 이제 이 자리에서 창을 띄워 남긴다.
 *
 * 창 안은 홈의 체크인 상자·첫 접속 창과 같은 폼(components/checkin-form.tsx)이라
 * 간편·상세가 그대로다. 저장하면 서버가 트레이닝 화면을 다시 그려 보내고, 이제
 * 체크인이 있으니 이 단추가 있던 자리에 만들기 폼이 선다 — 창은 그와 함께 닫힌다.
 * 폼이 저장을 알려 오면(onSaved) 여기서도 한 번 더 닫는다.
 *
 * 폼에 지난 체크인을 넘기지 않는다(recent=[]). 폼은 그 목록에서 '오늘 것'만 찾아
 * 채우는데, 이 단추는 오늘 체크인이 없을 때만 뜨기 때문이다.
 */
export function TrainingCheckin({
  parts,
  description = '30초면 됩니다. 남기면 바로 오늘 운동 일정을 만들 수 있습니다.',
}: {
  parts: string[];
  /** 창 위의 한 줄 — 암케어 화면은 '오늘의 암케어를 만들 수 있습니다'로 바꾼다 */
  description?: string;
}) {
  const [open, setOpen] = useState(false);

  return (
    <>
      <button
        type="button"
        onClick={() => setOpen(true)}
        className="inline-block rounded-xl bg-sky px-4 py-2.5 text-sm font-semibold text-white transition-colors hover:bg-sky-strong"
      >
        체크인하기
      </button>

      <Modal
        open={open}
        onClose={() => setOpen(false)}
        title="오늘 컨디션 체크인"
        description={description}
      >
        {/* 열릴 때만 그린다 — 닫았다 다시 열면 새 폼으로 시작한다 */}
        {open && <CheckinForm recent={[]} parts={parts} onSaved={() => setOpen(false)} />}
      </Modal>
    </>
  );
}
