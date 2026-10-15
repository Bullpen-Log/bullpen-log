import { redirect } from 'next/navigation';

/** 옛 측정 주소 — 첫 화면이 카메라가 된 뒤(2026-10-15) 구속 측정은 /velocity 하나다. ?resume=1 은 그대로 넘긴다 */
export default async function VelocityMeasurePage({
  searchParams,
}: {
  searchParams: Promise<{ [key: string]: string | string[] | undefined }>;
}) {
  const { resume } = await searchParams;
  redirect(resume === '1' ? '/velocity?resume=1' : '/velocity');
}
