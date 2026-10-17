import { headers } from 'next/headers';
import { notFound, redirect } from 'next/navigation';
import { requireUser } from '@/lib/dal';
import { expoLevel } from '@/lib/app-env';
import { featureLocks, SETUP_PATH } from '@/lib/feature-locks';
import { loadArmcarePlay } from '@/lib/armcare/play-load';
import { OpenNative } from '@/app/(session)/velocity/open-native';
import { ArmcarePlayer } from './armcare-player';

/**
 * 루틴 따라하기 — /armcare/play/today (그날의 맞춤 루틴), /armcare/play/<내 루틴 id>,
 * /armcare/play/rehab (오늘 재활 — 재활 2편: 위에 '아프면 바로 멈추세요', 끝에 3문항), /armcare/play/focus (빈 곳 보강).
 *
 * 운동 판(/workout/run)처럼 메뉴가 없는 전체 화면이다((session) 틀). 루틴 목록을 읽지
 * 않고 한 운동씩 따라 하게 한다(2026-09-26, armcare-player.tsx).
 * 무엇을 띄울지(어느 루틴 · 어느 날 · 경고)는 앱 화면과 같이 쓰는 lib/armcare/play-load.ts 가 정한다.
 */
export default async function ArmcarePlayPage({
  params,
  searchParams,
}: {
  params: Promise<{ id: string }>;
  searchParams: Promise<{ [key: string]: string | string[] | undefined }>;
}) {
  const user = await requireUser();
  /* 처음 가입한 사람은 첫 설정(2026-10-09, lib/feature-locks.ts)을 마쳐야 연다 */
  if (featureLocks(user).training) redirect(SETUP_PATH.training);
  const [{ id }, { d, areas }] = await Promise.all([params, searchParams]);

  const play = await loadArmcarePlay(user, id, d, areas);
  if (!play.ok) {
    if (play.missing) notFound();
    redirect(play.to);
  }

  /*
   * 새 아이폰 앱(Expo)이 암케어 따라 하기를 아는 판(BullpenNative/3 부터)이면 앱 화면으로 연다(native/src/app/armcare/[id].tsx) — 웹 화면은
   * 화면 켜 두기 · 떨림 · 시계가 웹뷰 것이라 약하다. 고르는 일(위)은 넘기기 전에 한다 — 열 루틴이 없으면 앱 화면을 띄울 것 없이 웹이 그리로 간다.
   */
  if (expoLevel((await headers()).get('user-agent')) >= 3) {
    const query = new URLSearchParams();
    if (typeof d === 'string' && d) query.set('d', d);
    if (typeof areas === 'string' && areas) query.set('areas', areas);
    const q = query.toString();
    return <OpenNative path={`/armcare/${id}${q ? `?${q}` : ''}`} cover={true} />;
  }

  return (
    <ArmcarePlayer
      title={play.title}
      backHref={play.backHref}
      dateKey={play.dateKey}
      notice={play.notice}
      items={play.items}
      rehabCheck={play.rehabCheck}
    />
  );
}
