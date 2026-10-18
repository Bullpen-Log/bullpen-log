import { headers } from 'next/headers';
import { redirect } from 'next/navigation';
import { requireUser } from '@/lib/dal';
import { expoLevel } from '@/lib/app-env';
import { loadWarmup } from '@/lib/workout/warmup-load';
import { OpenNative } from '@/app/(session)/velocity/open-native';
import { WarmupClient } from './warmup-client';

/** 워밍업 창 — 재료는 앱과 같은 곳(lib/workout/warmup-load.ts). 열 수 없으면 그 주소로 */
export default async function WarmupPage() {
  const user = await requireUser();
  /* 새 아이폰 앱(Expo)이 워밍업을 아는 판(BullpenNative/7 부터)이면 앱 화면으로 연다(native/src/app/warmup.tsx) */
  if (expoLevel((await headers()).get('user-agent')) >= 7) return <OpenNative path="/warmup" cover={false} />;
  const got = await loadWarmup(user);
  if ('to' in got) redirect(got.to);
  return <WarmupClient themeLabel={got.themeLabel} cards={got.cards} />;
}
