import { redirect } from 'next/navigation';

/**
 * 옛 장비 고르기 주소(2026-10-21) — 2026-10-23 금윤호: "장비는 따로 빠져 있을 필요가 없다, 장터 안에" → 장터의 '장비 추천' 팝업으로 넘긴다.
 * 고른 값(age · position · hand)이 주소에 있으면 그대로 넘겨 팝업이 같은 추천을 띄운다(components/dugout/gear-guide.tsx).
 */
export default async function GearRedirect({
  searchParams,
}: {
  searchParams: Promise<{ [key: string]: string | string[] | undefined }>;
}) {
  const sp = await searchParams;
  const out = new URLSearchParams({ guide: '1' });
  for (const k of ['age', 'position', 'hand']) {
    const v = sp[k];
    const one = Array.isArray(v) ? v[0] : v;
    if (one) out.set(k, one);
  }
  redirect(`/market?${out.toString()}`);
}
