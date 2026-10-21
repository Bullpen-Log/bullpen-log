import Link from 'next/link';
import { ArrowRight } from '@/components/icon';
import { prisma } from '@/lib/prisma';
import { toDateKey } from '@/lib/pitch-stats';
import {
  armStatusFor,
  checkinTodayOf,
  pitchSummaryOf,
  USER_FOR_FACTS,
} from '@/lib/org/player-data';

/**
 * 내 싱커 요약 줄(2026-10-21 2단계 2-5, docs/designs/sinker-dugout.md 5-1) — 로그인한 선수의 덕아웃 홈 맨 위.
 * 오늘 체크인 · 최근 7일 투구 · 팔 상태 · 마지막 등판. 자료는 코치 화면이 읽는 것과 같은 함수(lib/org/player-data.ts).
 */
export async function SinkerStrip({ userId }: { userId: string }) {
  const now = new Date();
  const todayKey = toDateKey(now);
  const user = await prisma.user.findUnique({
    where: { id: userId },
    select: USER_FOR_FACTS,
  });
  if (!user) return null;
  const [pitch, checkin, arm] = await Promise.all([
    pitchSummaryOf(userId, todayKey),
    checkinTodayOf(userId, todayKey),
    armStatusFor(user, now),
  ]);
  const cells = [
    {
      label: '오늘 체크인',
      value: checkin ? `컨디션 ${checkin.condition}` : '아직',
      href: '/today',
    },
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
  return (
    <section className="rounded-2xl border border-sky-soft/60 bg-sky-tint px-4 py-3 md:px-5">
      <div className="flex flex-wrap items-center gap-x-6 gap-y-2">
        <span className="text-sm font-bold text-sky-strong">내 싱커</span>
        {cells.map((c) => (
          <Link
            key={c.label}
            href={c.href}
            className="flex items-baseline gap-1.5 text-sm"
          >
            <span className="text-xs text-muted">{c.label}</span>
            <span className="font-semibold text-ink">{c.value}</span>
          </Link>
        ))}
        <Link
          href="/today"
          className="ml-auto inline-flex items-center gap-0.5 text-sm font-semibold text-sky-strong"
        >
          대시보드 <ArrowRight className="h-4 w-4" />
        </Link>
      </div>
    </section>
  );
}
