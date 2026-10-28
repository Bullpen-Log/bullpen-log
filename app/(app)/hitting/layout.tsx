import { redirect } from 'next/navigation';
import { requireUser } from '@/lib/dal';
import { countryOf, hasHitting } from '@/lib/country';

/** 타격 화면 모두 — 타격이 없는 나라(미국 · 일본, lib/country.ts)면 홈으로. 주소를 바로 쳐 들어온 때만 걸린다(탭 · 메뉴에는 이미 없다) */
export default async function HittingLayout({ children }: { children: React.ReactNode }) {
  const user = await requireUser();
  if (!hasHitting(countryOf(user.country))) redirect('/today');
  return children;
}
