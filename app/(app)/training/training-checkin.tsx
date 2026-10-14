'use client';

import { ChevronRight } from '@/components/icon';
import { OpenCheckinButton } from '@/components/notice-bell';

/**
 * 트레이닝에서 바로 남기는 체크인.
 *
 * 운동 일정은 오늘 체크인을 보고 짜서, 체크인이 없으면 만들기 폼 대신 '체크인 먼저'가 뜬다. 예전에는 여기서 제 창에
 * 옛 폼을 띄웠는데, 3판(2026-10-13)부터 체크인은 한 화면 흐름 하나다 — 신호(OpenCheckinButton)를 보내면 틀
 * (components/app-shell.tsx)이 PC 는 창으로, 휴대폰은 전체 화면(app/(session)/checkin)으로 연다. 저장하면 서버가
 * 트레이닝 화면을 다시 그려 보내고, 이제 체크인이 있으니 이 단추가 있던 자리에 만들기 폼이 선다.
 */
export function TrainingCheckin({
  description = '20초면 돼요. 남기면 바로 오늘 운동 일정을 만들 수 있어요.',
}: {
  /** 옛 호출 호환 — 3판 체크인은 부위를 묻지 않아 쓰지 않는다 */
  parts?: string[];
  /** 단추 위의 한 줄 — 암케어 화면은 '오늘의 암케어를 만들 수 있습니다'로 바꾼다 */
  description?: string;
}) {
  return (
    <div className="space-y-2">
      <p className="text-sm text-muted">{description}</p>
      <OpenCheckinButton className="inline-flex min-h-11 items-center gap-1 rounded-full bg-sky px-5 text-sm font-semibold text-white transition-colors hover:bg-sky-strong desk:min-h-10 desk:rounded-xl">
        체크인하기
        <ChevronRight aria-hidden className="h-4 w-4" />
      </OpenCheckinButton>
    </div>
  );
}
