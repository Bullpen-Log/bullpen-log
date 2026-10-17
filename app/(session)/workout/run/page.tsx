import { headers } from 'next/headers';
import { redirect } from 'next/navigation';
import { requireUser } from '@/lib/dal';
import { expoLevel } from '@/lib/app-env';
import { featureLocks, SETUP_PATH } from '@/lib/feature-locks';
import { openRunSession, runPayload } from '@/lib/workout/run-load';
import { OpenNative } from '@/app/(session)/velocity/open-native';
import { SessionClient, type RunSet } from './session-client';

/**
 * 본운동 화면.
 *
 * 세션이 시작할 때 찍어 둔 목록을 그대로 돌린다. 오늘 일정을 다시 읽지
 * 않는다 — 운동 중에 목록이 바뀌면 안 되기 때문이다 (lib/workout/session-plan.ts).
 * 어느 판을 열지(지난 판 닫기 · 빈 목록 · 워밍업)는 앱 화면과 같이 쓰는 lib/workout/run-load.ts 가 정한다.
 */
export default async function RunPage() {
  const user = await requireUser();
  /* 처음 가입한 사람은 첫 설정(2026-10-09, lib/feature-locks.ts)을 마쳐야 연다 */
  if (featureLocks(user).training) redirect(SETUP_PATH.training);

  const open = await openRunSession(user.id);
  if (!open.ok) redirect(open.to);

  /*
   * 새 아이폰 앱(Expo)이 운동 진행 화면을 아는 판(BullpenNative/2 부터)이면 앱 화면으로 연다(native/src/app/workout.tsx) — 웹 화면은
   * 화면 켜 두기 · 떨림이 웹뷰 것이라 약하다. 옛 판(1)은 /workout 화면이 없어 넘기면 화면이 사라지므로 웹 화면 그대로.
   * 판을 고르는 일(위)은 넘기기 전에 한다 — 열 판이 없으면 앱 화면을 띄울 것 없이 웹이 그리로 간다.
   */
  if (expoLevel((await headers()).get('user-agent')) >= 2)
    return <OpenNative path="/workout" cover={true} />;

  const run = await runPayload(user.id, open.session, open.plan);
  const initialSets: RunSet[] = run.initialSets;

  return (
    <SessionClient
      sessionId={run.sessionId}
      themeLabel={run.themeLabel}
      /* 근력 · 파워 프로그램 날이면 그 일차 — 끝내기 창이 '다음 일차로 가려면'을 말한다 */
      programDay={run.programDay}
      exercises={run.exercises}
      initialSets={initialSets}
      /* 이 판을 연 시각 — 휴식 시계는 이 뒤에 남긴 세트만 센다(lib/workout/run-load.ts) */
      openedAt={run.openedAt}
      /* 다시 연 판이면 앞서 마친 구간의 시간. 종료 요약이 여기에 더해 보여준다. */
      priorSeconds={run.priorSeconds}
    />
  );
}
