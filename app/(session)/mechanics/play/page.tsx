import { redirect } from 'next/navigation';
import { requireUser } from '@/lib/dal';
import { featureLocks, SETUP_PATH } from '@/lib/feature-locks';
import { loadMechanicsProgram } from '@/lib/mechanics/load';
import { mechanicsLevel } from '@/lib/mechanics/levels';
import { playItemsFor, resumeAt } from '@/lib/mechanics/program';
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
 *
 * 어깨 · 팔꿈치가 아픈 날(2판 P6-5, 사용자 결정 D5 — lib/mechanics/program.ts playItemsFor): ?anyway=1 이 없으면 무브먼트
 * 드릴만, 그 '다른 드릴' · 도구도 무브먼트만 넘긴다. 접은 드릴이 있었으면 마쳐도 세션 수를 안 올린다(partial). 할 드릴이
 * 없으면 프로그램 칸으로 돌려보낸다(거기에 '그래도 하기'가 있다). ?anyway=1 이면 세션 그대로, 팔에 싣는 드릴마다 주의 한 줄.
 */
export default async function MechanicsPlayPage({
  searchParams,
}: {
  searchParams: Promise<{ [key: string]: string | string[] | undefined }>;
}) {
  const user = await requireUser();
  /* 처음 가입한 사람은 첫 설정(2026-10-09, lib/feature-locks.ts)을 마쳐야 연다 */
  if (featureLocks(user).training) redirect(SETUP_PATH.training);
  const { program, session, doneToday, painFold } = await loadMechanicsProgram(user.id);
  if (!program || session.length === 0) redirect(BACK);

  const anyway = (await searchParams).anyway === '1';
  const { items, partial } = playItemsFor(session, painFold, anyway);
  if (items.length === 0) redirect(BACK);

  const done = new Set(program.finishedToday ? [] : doneToday);

  return (
    <MechanicsPlayer
      backHref={BACK}
      items={items}
      startAt={resumeAt(items, done)}
      label={
        program.level && program.week
          ? `${mechanicsLevel(program.level).name} ${program.week}주차 ${program.day}번째`
          : `${program.sessionsDone + 1}번째 세션`
      }
      sessionNumber={program.sessionsDone + 1}
      isAdmin={user.role === 'ADMIN'}
      partial={partial}
      painLabel={painFold && anyway ? painFold.label : null}
    />
  );
}
