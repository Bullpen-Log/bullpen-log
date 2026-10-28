import { redirect } from 'next/navigation';
import { requireUser } from '@/lib/dal';
import { countryOf, hasNutrition } from '@/lib/country';

/** 영양 화면 모두 — 영양이 없는 나라(미국 · 일본, lib/country.ts)면 홈으로. 탭 · 메뉴에는 이미 없다 */
export default async function NutritionLayout({ children }: { children: React.ReactNode }) {
  const user = await requireUser();
  if (!hasNutrition(countryOf(user.country))) redirect('/today');
  return children;
}
