import { Suspense } from 'react';
import { headers } from 'next/headers';
import { isExpoUserAgent } from '@/lib/app-env';
import { requireUser } from '@/lib/dal';
import { featureLocks } from '@/lib/feature-locks';
import { TabLocked } from '@/components/tab-locked';
import VideosPage from '@/app/(app)/videos/videos-page';
import Loading from '@/app/(app)/@videos/videos/loading';

/** 투구 판 — 주소가 /videos 가 아니어도 판 넘기기 자리에 늘 떠 있다. 잠겨 있으면(첫 설정 전) 설정으로 보내지 않고 잠긴 판. 처음 연 탭이 먼저 뜨게 Suspense 로 감싼다(@home/default.tsx) */
export default async function VideosSlotDefault() {
  const user = await requireUser();
  if (featureLocks(user).pitch) return <TabLocked feature="pitch" />;
  /* 새 앱은 앱 투구 화면이 덮는다 — @videos/videos/page.tsx 와 같은 까닭으로 안 그린다 */
  if (isExpoUserAgent((await headers()).get('user-agent'))) return null;
  return (
    <Suspense fallback={<Loading />}>
      <VideosPage searchParams={Promise.resolve({})} />
    </Suspense>
  );
}
