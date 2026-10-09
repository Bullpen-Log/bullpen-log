import { redirect } from 'next/navigation';
import { requireUser } from '@/lib/dal';
import { featureLocks, SETUP_PATH } from '@/lib/feature-locks';
import { loadMechanicsProgram } from '@/lib/mechanics/load';
import { mechanicsLevel } from '@/lib/mechanics/levels';
import { MechanicsPlayer } from './mechanics-player';

const BACK = '/training?view=mechanics';

/**
 * 메커니즘 세션 따라 하기 — /mechanics/play(2026-10-04).
 *
 * 암케어 따라 하기(/armcare/play)처럼 메뉴 없는 전체 화면이다((session) 틀). 오늘의 세션을 한 드릴씩 — 영상 · 몇 번 ·
 * 느낌 신호를 보고, 마치면 느낌(어려움 · 적당 · 쉬움)을 누르면 다음 드릴로 간다. 끝 화면에서 오른 단계를 알려 준다.
 *
 * 세션은 이 화면을 열 때 한 번 짜서 넘긴다 — 도중에 단계가 올라도 하던 차례가 바뀌지 않는다(서버 동작이 화면을 다시
 * 그리지 않는다, app/actions/mechanics.ts). 오늘 마친 세션이 없으면 오늘 이미 한 드릴부터는 건너뛴다(이어서 하기).
 */
export default async function MechanicsPlayPage() {
  const user = await requireUser();
  /* 처음 가입한 사람은 첫 설정(2026-10-09, lib/feature-locks.ts)을 마쳐야 연다 */
  if (featureLocks(user).training) redirect(SETUP_PATH.training);
  const { program, session, doneToday } = await loadMechanicsProgram(user.id);
  if (!program || session.length === 0) redirect(BACK);

  const done = new Set(program.finishedToday ? [] : doneToday);
  const first = session.findIndex((s) => !done.has(s.guideId));

  return (
    <MechanicsPlayer
      backHref={BACK}
      items={session}
      startAt={first < 0 ? 0 : first}
      label={
        program.level && program.week
          ? `${mechanicsLevel(program.level).name} ${program.week}주차 ${program.day}번째`
          : `${program.sessionsDone + 1}번째 세션`
      }
      sessionNumber={program.sessionsDone + 1}
      isAdmin={user.role === 'ADMIN'}
    />
  );
}
