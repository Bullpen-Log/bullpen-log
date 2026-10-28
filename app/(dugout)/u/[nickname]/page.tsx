import Link from 'next/link';
import { Speed } from '@/components/speed';
import type { ReactNode } from 'react';
import { DugoutPageHeader, SectionHead } from '@/components/dugout/ui';
import { notFound } from 'next/navigation';
import { Badge, Card } from '@/components/ui';
import { prisma } from '@/lib/prisma';
import { formatPrice } from '@/lib/market/specs';
import { velocitySummaryOf } from '@/lib/org/player-data';
import { ACCOUNT_LABEL } from '@/lib/public-profile';
import { formatDateTime } from '@/components/community/community-format';

/**
 * 공개 프로필(2026-10-21 개편 3단계 3-6, docs/designs/sinker-dugout.md 5-2) — 로그인 없이 본다. 닉네임 · 가입 · 올린 물건.
 * 싱커 기록은 본인이 내 것에서 켠 항목만(User.publicSinker — 기본 전부 숨김). 글은 로그인한 사람만 보는 공간이라 여기 안 보인다.
 */
export default async function PublicProfilePage({
  params,
}: {
  params: Promise<{ nickname: string }>;
}) {
  const { nickname } = await params;
  const user = await prisma.user.findFirst({
    where: { nickname: decodeURIComponent(nickname) },
    select: {
      id: true,
      nickname: true,
      createdAt: true,
      accountType: true,
      publicSinker: true,
      position: true,
      throwingHand: true,
      avatarPath: true,
    },
  });
  if (!user) notFound();
  const show = new Set(user.publicSinker);
  const [listings, velocity, pitchDays] = await Promise.all([
    prisma.listing.findMany({
      where: { userId: user.id, status: 'ACTIVE', hiddenAt: null },
      orderBy: { createdAt: 'desc' },
      take: 8,
      select: { id: true, title: true, price: true, region: true },
    }),
    show.has('velocity') ? velocitySummaryOf(user.id) : null,
    show.has('days') ? prisma.pitchLog.count({ where: { userId: user.id } }) : null,
  ]);
  const facts: { label: string; value: ReactNode }[] = [];
  if (show.has('position') && (user.position || user.throwingHand))
    facts.push({
      label: '포지션',
      value: [
        user.position,
        user.throwingHand ? `${user.throwingHand === 'L' ? '좌' : '우'}투` : null,
      ]
        .filter(Boolean)
        .join(' · '),
    });
  if (velocity?.best)
    /* 보는 사람이 고른 단위로(km/h · mph) */
    facts.push({ label: '최고 구속', value: <Speed kmh={velocity.best} /> });
  if (pitchDays != null) facts.push({ label: '투구 기록', value: `${pitchDays}회` });

  return (
    <div className="max-w-3xl space-y-8">
      <header className="flex items-center gap-4">
        <span className="grid h-16 w-16 shrink-0 place-items-center rounded-full bg-sky/12 text-2xl font-black text-sky-strong">
          {user.nickname.slice(0, 1)}
        </span>
        <DugoutPageHeader
          className="min-w-0 flex-1"
          title={user.nickname}
          subtitle={
            <>
              <Badge>{ACCOUNT_LABEL[user.accountType] ?? '회원'}</Badge> 덕아웃 {formatDateTime(user.createdAt).slice(0, 8)}부터
            </>
          }
        />
      </header>

      {facts.length > 0 && (
        <Card className="p-0">
          <dl className="grid grid-cols-3 divide-x divide-line">
            {facts.map((f) => (
              <div key={f.label} className="px-4 py-3">
                <dt className="text-[11px] text-muted">{f.label}</dt>
                <dd className="text-sm font-semibold text-ink">{f.value}</dd>
              </div>
            ))}
          </dl>
        </Card>
      )}

      <section className="space-y-4">
        <SectionHead title="판매 중인 물건" count={listings.length} />
        {listings.length === 0 ? (
          <p className="text-sm text-muted">지금 올린 물건이 없어요.</p>
        ) : (
          <Card className="divide-y divide-line p-0">
            {listings.map((l) => (
              <Link
                key={l.id}
                href={`/market/${l.id}`}
                className="flex items-center gap-3 px-4 py-3 text-sm"
              >
                <span className="min-w-0 flex-1 truncate text-ink">{l.title}</span>
                <span className="text-xs text-muted">{l.region}</span>
                <span className="font-semibold text-ink">{formatPrice(l.price)}</span>
              </Link>
            ))}
          </Card>
        )}
      </section>
    </div>
  );
}
