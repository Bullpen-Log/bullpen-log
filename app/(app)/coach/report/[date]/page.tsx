import { notFound, redirect } from 'next/navigation';

/**
 * 지난 리포트 한 편이 있던 주소. 리포트는 2026-10-07 AI 를 빼며 지웠다 — 이 주소를 저장해 둔 사람은
 * 그날의 분석 · 그래프(/coach)로 넘겨 준다.
 */
const DATE_RE = /^\d{4}-\d{2}-\d{2}$/;

export default async function PastReportPage({
  params,
}: {
  params: Promise<{ date: string }>;
}) {
  const { date } = await params;
  if (!DATE_RE.test(date)) notFound();
  redirect(`/coach?date=${date}`);
}
