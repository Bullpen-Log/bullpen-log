import { headers } from 'next/headers';
import { notFound } from 'next/navigation';
import { isExpoUserAgent } from '@/lib/app-env';
import { OpenNative } from '@/app/(session)/velocity/open-native';
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
  searchParams,
}: {
  params: Promise<{ date: string }>;
  /** ?drill=40&pct=70 — 트레이닝의 드릴 공 카드가 붙여 온다(load.ts drillPrefillOf) */
  searchParams: Promise<{ drill?: string | string[]; pct?: string | string[] }>;
}) {
  const { date } = await params;
  /* 새 아이폰 앱(Expo)은 그날 화면을 앱 화면으로 연다 — 폰에 둔 영상을 웹 화면이 못 꺼낸다(앱 영상 부품은 앱 화면만) */
  if (isExpoUserAgent((await headers()).get('user-agent')) && /^\d{4}-\d{2}-\d{2}$/.test(date))
    return <OpenNative path={`/pitch/${date}`} cover={true} />;
  const data = await loadPitchDay(date, await searchParams);
  if (!data) notFound();
  return <DayClient {...data} />;
}
