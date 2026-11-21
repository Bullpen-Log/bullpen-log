import { notFound } from 'next/navigation';
import { requirePermission } from '@/lib/dal';
import { loadShootWeek } from '@/lib/shoot/load';
import { crewWeek, crewsOf } from '@/lib/shoot/crews';
import { ShootGuideMode } from '@/components/shoot/guide-mode';
import { RunClient } from './run-client';

/**
 * 촬영 모드 — 휴대폰(앱) 한 화면. 지금 찍을 운동(번호 · 시범 방법 · 기구 · 참고 영상 · 진행 방법)과 다음 운동,
 * 자리 옮김 · 쉬기 알림, 계획 대비, [찍음 · 다음으로]. (session) 껍데기라 탭 막대 · 사이드바가 없다.
 * ?at=1-23 — 주차 화면의 '이 운동부터'. ?crew=A — 두 사람이 나눠 찍는 주에서 그 사람 몫만(lib/shoot/crews.ts).
 */
export default async function ShootRunPage({
  params,
  searchParams,
}: {
  params: Promise<{ week: string }>;
  searchParams: Promise<{ at?: string | string[]; crew?: string | string[]; mode?: string | string[] }>;
}) {
  const me = await requirePermission('shoot');
  const n = Number((await params).week);
  const data = Number.isInteger(n) ? await loadShootWeek(n) : null;
  if (!data) notFound();
  const { at, crew, mode } = await searchParams;
  const mine = typeof crew === 'string' && crewsOf(data.week).includes(crew) ? crew : null;
  const scoped = mine ? { ...data, week: crewWeek(data.week, mine) } : data;
  const startAt = typeof at === 'string' ? at : null;
  if (mode === 'guide') {
    return <ShootGuideMode key={`${n}:${mine}:${startAt}`} data={scoped} crew={mine} startAt={startAt} />;
  }
  return (
    <RunClient
      /* ?at= 만 바뀌어도 새로 — Next 는 같은 쪽을 다시 쓰고 고른 운동(state)이 남아 앱의 '이 운동부터'가 안 먹었다 */
      key={`${n}:${mine}:${startAt}`}
      data={scoped}
      crew={mine}
      me={me.nickname}
      startAt={startAt}
    />
  );
}
