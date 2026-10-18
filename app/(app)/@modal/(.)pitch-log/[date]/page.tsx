import { headers } from 'next/headers';
import { notFound } from 'next/navigation';
import { isExpoUserAgent } from '@/lib/app-env';
import { OpenNative } from '@/app/(session)/velocity/open-native';
import { DayClient } from '@/app/(app)/pitch-log/[date]/day-client';
import { loadPitchDay } from '@/app/(app)/pitch-log/[date]/load';

/**
 * 투구 기록 팝업의 내용 — 주소로 곧장 들어왔을 때의 페이지(app/(app)/pitch-log/[date])와
 * 같은 것을 읽어 같은 화면을 그린다. 창은 틀(layout.tsx)이 띄운다.
 */
export default async function PitchDayModalPage({
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
    return <OpenNative path={`/pitch/${date}`} cover={false} />;
  const data = await loadPitchDay(date, await searchParams);
  if (!data) notFound();
  return <DayClient {...data} />;
}
