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
 * 투구 기록 팝업의 틀 — 창은 여기서 곧바로 뜨고, 안의 내용(page.tsx)은 뒤따라 채워진다.
 *
 * 그날 기록을 읽는 데는 오늘 계획 셈까지 들어 있어 잠깐 걸린다. 창을 내용과 한 덩이로
 * 두면 날짜를 눌러도 그동안 아무 일이 없는 것처럼 보인다. 틀(창)과 내용을 나눠, 누르는
 * 즉시 창이 떠오르고 안에서 자리(loading.tsx)가 먼저 보인다. 내용이 와도 창은 새로 뜨지
 * 않는다 — 틀은 그대로 있고 안만 바뀐다.
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
