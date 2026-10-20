import { notFound } from 'next/navigation';
import { headers } from 'next/headers';
import { requirePermission } from '@/lib/dal';
import { expoLevel } from '@/lib/app-env';
import { OpenNative } from '@/app/(session)/velocity/open-native';
import { BackLink } from '@/components/ui';
import { loadShootWeek } from '@/lib/shoot/load';
import { WeekView } from './week-view';

/**
 * 트레이닝 영상 촬영 — 주차 시간표. 자리별로 시각 · 번호 · 운동 · 시범 방법을 늘어놓고 찍은 것을 체크한다.
 * 지금 · 다음을 표시하고, 앞 주에서 못 찍은 것은 끝에 이어 붙인다. 운동을 누르면 참고 영상 · 진행 방법 · 상태 · 메모 창.
 */
export default async function ShootWeekPage({
  params,
}: {
  params: Promise<{ week: string }>;
}) {
  const me = await requirePermission('shoot');
  const n = Number((await params).week);
  /* 새 아이폰 앱(판 9~)은 앱 화면(native/src/app/admin/shoot/[week].tsx) */
  if (Number.isInteger(n) && expoLevel((await headers()).get('user-agent')) >= 9)
    return <OpenNative path={`/admin/shoot/${n}`} cover={false} />;
  const data = Number.isInteger(n) ? await loadShootWeek(n) : null;
  if (!data) notFound();
  return (
    <div className="stack-page">
      <BackLink href="/admin/shoot">트레이닝 영상 촬영</BackLink>
      <WeekView data={data} me={me.nickname} />
    </div>
  );
}
