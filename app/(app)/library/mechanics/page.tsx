import { headers } from 'next/headers';
import { requireUser } from '@/lib/dal';
import { expoLevel } from '@/lib/app-env';
import { OpenNative } from '@/app/(session)/velocity/open-native';
import { loadDrillLibrary } from '@/lib/library-load';
import { MechanicsClient } from './mechanics-client';

export default async function MechanicsPage({ searchParams }: { searchParams: Promise<{ web?: string }> }) {
  const user = await requireUser();

  /* 새 아이폰 앱(Expo)이 라이브러리를 아는 판(BullpenNative/7 부터)이면 앱 화면으로 연다(native/src/app/library/mechanics.tsx) */
  /* ?web=1 — 앱 관리자가 '편집'으로 웹 화면을 연다(운동 · 드릴 고치기는 웹에만 있다, 2026-10-20 대조 검토) */
  if ((await searchParams).web !== '1' && expoLevel((await headers()).get('user-agent')) >= 7) return <OpenNative path="/library/mechanics" cover={false} />;
  /* 목록 · 별 — 앱(app-library.ts)과 같은 함수(lib/library-load.ts). 숨긴 드릴은 뺀다 */
  const items = await loadDrillLibrary(user.id);

  /*
   * 예전에는 여기에 '학습 완료 0 / 116' 카드가 있었다. 진행률로 보이니 116개를
   * 다 채워야 하는 숙제처럼 읽혔는데, 드릴은 필요한 것을 골라서 하는 것이다.
   * 세는 대신 별을 달아 다시 찾기 쉽게 하는 쪽으로 바꿨다.
   */
  return (
    <div className="stack-page">
      <MechanicsClient guides={items} isAdmin={user.role === 'ADMIN'} />
    </div>
  );
}
