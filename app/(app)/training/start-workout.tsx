import { Play } from 'lucide-react';
import { startWorkout } from '@/app/actions/workout';
import { SafeForm } from '@/components/safe-form';

/**
 * 운동을 시작하는 단추.
 *
 * 누르면 사이드바도 탭바도 없는 전용 화면으로 들어가, 한 세트를 마칠 때마다
 * 무게와 횟수를 남긴다. 들어가는 순간 오늘 목록을 찍어 두므로 운동하는 동안
 * 목록이 바뀌지 않는다.
 *
 * '이어서 하기'로 글자가 바뀌는 것은, 하루에 판이 하나이기 때문이다. 오후에
 * 다시 들어와도 오전에 열어 둔 판을 그대로 잇는다.
 */
export function StartWorkout({
  resume,
  compact = false,
  className = '',
}: {
  resume: boolean;
  /** 트레이닝 홈의 앱 카드 — 작은 알약(2026-10-04, training-home.tsx) */
  compact?: boolean;
  className?: string;
}) {
  return (
    /* 체육관처럼 신호가 약한 곳에서 누르는 단추라, 못 보내면 오류 화면 대신 밑에 한 줄로(components/safe-form.tsx) */
    <SafeForm action={startWorkout} className={className}>
      {compact ? (
        <button
          type="submit"
          className="inline-flex min-h-10 items-center gap-1 rounded-full bg-app-training px-4 text-sm font-bold text-white transition-transform motion-safe:active:scale-[0.97]"
        >
          <Play aria-hidden className="h-3.5 w-3.5" fill="currentColor" />
          {resume ? '이어서' : '시작'}
        </button>
      ) : (
        <button
          type="submit"
          className="flex w-full items-center justify-center gap-2 rounded-2xl bg-sky py-4 text-base font-bold text-white transition-transform motion-safe:active:scale-[0.98]"
        >
          <Play className="h-5 w-5" />
          {resume ? '운동 이어서 하기' : '운동 시작'}
        </button>
      )}
    </SafeForm>
  );
}
