import { headers } from 'next/headers';
import { redirect } from 'next/navigation';
import { requireUser } from '@/lib/dal';
import { expoLevel } from '@/lib/app-env';
import { featureLocks, SETUP_PATH } from '@/lib/feature-locks';
import { loadMechanicsPlay } from '@/lib/mechanics/play-load';
import { OpenNative } from '@/app/(session)/velocity/open-native';
import { MechanicsPlayer } from './mechanics-player';

/**
 * 메커니즘 세션 따라 하기 — /mechanics/play(2026-10-04).
 *
 * 암케어 따라 하기(/armcare/play)처럼 메뉴 없는 전체 화면이다((session) 틀). 오늘의 세션을 한 드릴씩 — 영상 · 몇 번 ·
 * 느낌 신호를 보고, 마치면 느낌(어려움 · 적당 · 쉬움)을 누르면 다음 드릴로 간다. 끝 화면에서 오른 단계를 알려 준다.
 * 무엇을 띄울지(세션 · 이어서 할 자리 · 아픈 날 접기 · ?anyway=1)는 앱 화면과 같이 쓰는 lib/mechanics/play-load.ts 가 정한다.
 */
export default async function MechanicsPlayPage({
  searchParams,
}: {
  searchParams: Promise<{ [key: string]: string | string[] | undefined }>;
}) {
  const user = await requireUser();
  /* 처음 가입한 사람은 첫 설정(2026-10-09, lib/feature-locks.ts)을 마쳐야 연다 */
  if (featureLocks(user).training) redirect(SETUP_PATH.training);
  const { anyway } = await searchParams;

  const play = await loadMechanicsPlay(user, anyway);
  if (!play.ok) redirect(play.to);

  /*
   * 새 아이폰 앱(Expo)이 메커니즘 따라 하기를 아는 판(BullpenNative/4 부터)이면 앱 화면으로 연다(native/src/app/mechanics.tsx) — 웹 화면은
   * 화면 켜 두기 · 떨림이 웹뷰 것이라 약하다. 고르는 일(위)은 넘기기 전에 한다 — 할 드릴이 없으면 앱 화면을 띄울 것 없이 웹이 그리로 간다.
   */
  if (expoLevel((await headers()).get('user-agent')) >= 4) {
    return <OpenNative path={`/mechanics${anyway === '1' ? '?anyway=1' : ''}`} cover={true} />;
  }

  return (
    <MechanicsPlayer
      backHref={play.backHref}
      items={play.items}
      startAt={play.startAt}
      label={play.label}
      sessionNumber={play.sessionNumber}
      isAdmin={play.isAdmin}
      partial={play.partial}
      painLabel={play.painLabel}
      focus={play.focus}
    />
  );
}
