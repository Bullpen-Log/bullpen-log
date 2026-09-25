import { notFound, redirect } from 'next/navigation';

/**
 * 지난 리포트 한 편 — 예전에는 한 페이지였다.
 *
 * 이제 홈 캘린더에서 그날을 고르면 밑의 분석 칸이 그날 리포트를 보여 준다(만들 때의
 * 수치와 계획 그대로). 이 주소를 저장해 둔 사람을 위해 그 자리로 넘겨 준다.
 */
const DATE_RE = /^\d{4}-\d{2}-\d{2}$/;

export default async function PastReportPage({
  params,
}: {
  params: Promise<{ date: string }>;
}) {
  const { date } = await params;
  if (!DATE_RE.test(date)) notFound();
  redirect(`/today?date=${date}&analysis=report#analysis`);
}
