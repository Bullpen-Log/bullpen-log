import 'server-only';
import { prisma } from '@/lib/prisma';
import { toDateKey } from '@/lib/pitch-stats';
import { armStatusFor, checkinTodayOf, pitchSummaryOf, USER_FOR_FACTS } from '@/lib/org/player-data';

/**
 * 덕아웃 홈의 '내 싱커' 요약 넷(오늘 체크인 · 최근 7일 투구 · 팔 상태 · 마지막 등판) — 휴대폰 띠(components/dugout/sinker-strip.tsx)와
 * PC 오른쪽 칸(components/dugout/home-me-column.tsx)이 같은 값을 쓴다. 페이지가 한 번만 읽어 둘에 넘긴다(2026-10-22 PC 홈 두 칸).
 */
export type SinkerCell = { label: string; value: string; href: string };

export async function loadSinkerSummary(userId: string): Promise<SinkerCell[] | null> {
  const now = new Date();
  const todayKey = toDateKey(now);
  const user = await prisma.user.findUnique({ where: { id: userId }, select: USER_FOR_FACTS });
  if (!user) return null;
  const [pitch, checkin, arm] = await Promise.all([
    pitchSummaryOf(userId, todayKey),
    checkinTodayOf(userId, todayKey),
    armStatusFor(user, now),
  ]);
  return [
    { label: '오늘 체크인', value: checkin ? `컨디션 ${checkin.condition}` : '아직', href: '/today' },
    { label: '최근 7일 투구', value: `${pitch.last7}개`, href: '/videos' },
    { label: '팔 상태', value: arm.headline, href: '/today' },
    {
      label: '마지막 등판',
      value: pitch.lastOuting
        ? `${pitch.lastOuting.key.slice(5).replace('-', '/')} · ${pitch.lastOuting.pitches}개`
        : '없음',
      href: '/videos',
    },
  ];
}
