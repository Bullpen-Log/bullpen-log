import type { ReactNode } from 'react';
import { DayModal } from '@/app/(app)/pitch-log/[date]/day-modal';

const WEEKDAYS = ['일', '월', '화', '수', '목', '금', '토'];

/** 2026-08-28 → 8월 28일 (금). 꼴이 틀린 주소면 그대로 — 안쪽 페이지가 404 를 낸다. */
function spokenDate(key: string) {
  const at = new Date(`${key}T00:00:00.000Z`);
  if (Number.isNaN(at.getTime())) return key;
  return `${at.getUTCMonth() + 1}월 ${at.getUTCDate()}일 (${WEEKDAYS[at.getUTCDay()]})`;
}

/**
 * 투구 기록 팝업의 틀 — 창과 안의 내용(page.tsx)이 한 번에 뜬다.
 *
 * 한때는 틀과 내용을 나눠, 누르는 즉시 창이 뜨고 안에서 회색 자리(loading.tsx)가 먼저
 * 보이다가 내용이 채워지게 했다. 그런데 창 가득 회색 덩어리가 깜빡이는 것이 '이상한
 * 화면'으로 보였다(오늘 기록 남기기를 누를 때마다). 그 자리를 없앴다 — 이 경로에는
 * 기다리는 자리가 없어서, 내용이 다 올 때까지 보던 화면이 그대로 있다가 채워진 창이 뜬다.
 * 그 사이의 기다림은 누른 링크의 아이콘이 돌아 알린다(components/link-pending.tsx).
 */
export default async function PitchDayModalLayout({
  children,
  params,
}: {
  children: ReactNode;
  params: Promise<{ date: string }>;
}) {
  const { date } = await params;
  return <DayModal title={spokenDate(date)}>{children}</DayModal>;
}
