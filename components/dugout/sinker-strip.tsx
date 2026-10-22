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
    /* 한 줄에 다 밀어 넣던 것을 머리 줄 + 칸 넷으로(2026-10-22 금윤호 "보기 편하게") — 휴대폰 두 칸 · PC 네 칸, 긴 글(팔 상태)은 칸 안에서 줄바꿈 */
    <section className="rounded-2xl border border-sky-soft/60 bg-sky-tint p-4 md:p-5">
      <div className="mb-3 flex items-center justify-between">
        <span className="text-sm font-bold text-sky-strong">내 싱커</span>
        <Link
          href="/sinker"
          className="inline-flex min-h-8 items-center gap-0.5 text-sm font-semibold text-sky-strong"
        >
          대시보드 <ArrowRight className="h-4 w-4" />
        </Link>
      </div>
      <div className="grid grid-cols-2 gap-2 md:grid-cols-4">
        {cells.map((c) => (
          <Link
            key={c.label}
            href={c.href}
            className="flex min-w-0 flex-col gap-1 rounded-xl bg-surface/80 px-3 py-2.5 transition-colors hover:bg-surface"
          >
            <span className="text-xs text-muted">{c.label}</span>
            <span className="text-sm leading-snug font-semibold break-keep text-ink">{c.value}</span>
          </Link>
        ))}
      </div>
    </section>
  );
}
