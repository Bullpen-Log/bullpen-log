import { notFound } from 'next/navigation';
import { DayClient } from './day-client';
import { loadPitchDay } from './load';

/**
 * 그날의 투구 기록 — 주소로 곧장 들어왔을 때의 한 페이지.
 *
 * 앱 안에서 날짜를 누르면 이 페이지가 아니라 지금 화면 위에 팝업으로 뜬다
 * (app/(app)/@modal/(.)pitch-log — Next 의 '가로채는 경로'). 닫으면 보던 화면(홈이든
 * 투구 기록 탭이든)으로 그대로 돌아간다. 예전에는 늘 페이지로 넘어갔고, 맨 위의 '달력'
 * 링크가 홈으로만 돌아가서 투구 기록 탭에서 들어온 사람도 홈으로 떨어졌다.
 *
 * 이 페이지는 팝업을 띄운 채 새로고침했거나, 주소를 북마크 · 링크로 열었을 때 뜬다. 그때는
 * 돌아갈 화면을 모르므로 홈 달력과 투구 기록, 두 길을 다 둔다(day-client.tsx).
 *
 * 한때 작은 창에 다 넣었다가 영상 하나에 창이 잠겨 페이지로 옮긴 적이 있다. 그래서
 * 팝업은 넓게(62rem) 두고 안에서 굴러가게 했다.
 */
export default async function PitchLogDayPage({
  params,
}: {
  params: Promise<{ date: string }>;
}) {
  const { date } = await params;
  const data = await loadPitchDay(date);
  if (!data) notFound();
  return <DayClient {...data} />;
}
