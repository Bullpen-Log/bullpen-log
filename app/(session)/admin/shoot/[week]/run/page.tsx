import { notFound } from 'next/navigation';
import { requireAdmin } from '@/lib/dal';
import { loadShootWeek } from '@/lib/shoot/load';
import { RunClient } from './run-client';

/**
 * 촬영 모드 — 휴대폰(앱) 한 화면. 지금 찍을 운동(번호 · 시범 방법 · 기구 · 참고 영상 · 진행 방법)과 다음 운동,
 * 자리 옮김 · 쉬기 알림, 계획 대비, [찍음 · 다음으로]. (session) 껍데기라 탭 막대 · 사이드바가 없다.
 * ?at=1-23 — 주차 화면의 '이 운동부터'.
 */
export default async function ShootRunPage({
  params,
  searchParams,
}: {
  params: Promise<{ week: string }>;
  searchParams: Promise<{ at?: string | string[] }>;
}) {
  const me = await requireAdmin();
  const n = Number((await params).week);
  const data = Number.isInteger(n) ? await loadShootWeek(n) : null;
  if (!data) notFound();
  const at = (await searchParams).at;
  return (
    <RunClient
      data={data}
      me={me.nickname}
      startAt={typeof at === 'string' ? at : null}
    />
  );
}
