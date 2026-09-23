import { Play } from 'lucide-react';
import { startWorkout } from '@/app/actions/workout';

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
export function StartWorkout({ resume }: { resume: boolean }) {
  return (
    <form action={startWorkout}>
      <button
        type="submit"
        className="flex w-full items-center justify-center gap-2 rounded-2xl bg-sky py-4 text-base font-bold text-white transition-transform motion-safe:active:scale-[0.98]"
      >
        <Play className="h-5 w-5" />
        {resume ? '운동 이어서 하기' : '운동 시작'}
      </button>
    </form>
  );
}
