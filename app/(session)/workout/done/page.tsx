import { headers } from 'next/headers';
import { redirect } from 'next/navigation';
import { requireUser } from '@/lib/dal';
import { expoLevel } from '@/lib/app-env';
import { loadWorkoutDone } from '@/lib/workout/done-load';
import { OpenNative } from '@/app/(session)/velocity/open-native';
import { DoneClient } from './done-client';

/** 운동을 마친 순간 — 축하 화면. 재료는 앱과 같은 곳(lib/workout/done-load.ts — 마친 판만, 세트가 없으면 트레이닝으로) */
export default async function WorkoutDonePage({
  searchParams,
}: {
  searchParams: Promise<{ id?: string }>;
}) {
  const user = await requireUser();
  const { id } = await searchParams;
  /* 새 아이폰 앱(Expo)이 축하 화면을 아는 판(BullpenNative/7 부터)이면 앱 화면으로 연다(native/src/app/workout-done.tsx) */
  if (typeof id === 'string' && id && expoLevel((await headers()).get('user-agent')) >= 7) {
    return <OpenNative path={`/workout-done?id=${encodeURIComponent(id)}`} cover={false} />;
  }
  const got = await loadWorkoutDone(user, id);
  if ('to' in got) redirect(got.to);
  return <DoneClient {...got} />;
}
