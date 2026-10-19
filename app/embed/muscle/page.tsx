import { getCurrentUser } from '@/lib/dal';
import { throwingSide } from '@/lib/armcare/muscle-map';
import { ARMCARE_AREAS, type ArmcareAreaKey } from '@/lib/armcare/anatomy';
import { MuscleEmbed } from './muscle-embed';

/**
 * 근육 설명 창의 3D 근육 그림만 — 아이폰 앱 근육 설명 창(native/src/armcare/muscle-info.tsx)이 작은 웹뷰로 띄운다
 * (3D 동작 분석 app/embed/lab 과 같은 방식 — 3D 는 웹 WebGL 한 벌). 앱 틀 · 하단 탭이 없는 맨 화면이다(app/(app) 밖).
 * ?m=근육 — 켤 근육(웹 armcare-info-body 의 MuscleInfo 처럼 하나), ?a=부위 — 부위 전체(AreaInfo 처럼), ?bg=#rrggbb — 앱 창 바탕(웹뷰가 비치기 전 같은 색).
 * 던지는 팔은 로그인한 사람 것(앱과 같은 'session' 쿠키), 없으면 오른팔.
 */
export default async function MuscleEmbedPage({ searchParams }: { searchParams: Promise<{ m?: string; a?: string; bg?: string }> }) {
  const { m, a, bg } = await searchParams;
  const area = ARMCARE_AREAS.find((x) => x.key === a)?.key ?? null;
  const user = await getCurrentUser().catch(() => null);
  return (
    <MuscleEmbed
      muscle={typeof m === 'string' && m.length <= 40 ? m : null}
      area={area as ArmcareAreaKey | null}
      side={throwingSide(user?.throwingHand)}
      bg={typeof bg === 'string' && /^#[0-9a-f]{6}$/i.test(bg) ? bg : null}
    />
  );
}
