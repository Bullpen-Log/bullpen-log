import { NextResponse } from 'next/server';
import { getCurrentUser } from '@/lib/dal';
import { prisma } from '@/lib/prisma';
import { appNow } from '@/lib/clock';
import { shiftDateKey, toDateKey } from '@/lib/pitch-stats';
import { dbDate, keyOfDbDate } from '@/lib/nutrition/days';

/** 기록 표 CSV(2026-10-21 개편 4단계 4-2) — 내 투구 기록만, 엑셀이 한글을 읽게 BOM */
export async function GET(req: Request) {
  const user = await getCurrentUser();
  if (!user) return NextResponse.json({ error: 'unauthorized' }, { status: 401 });
  const url = new URL(req.url);
  const days = Math.min(
    3650,
    Math.max(1, Number.parseInt(url.searchParams.get('days') ?? '28', 10) || 28)
  );
  const type = url.searchParams.get('type') ?? '';
  const todayKey = toDateKey(appNow());
  const from = shiftDateKey(todayKey, -(days - 1));
  const logs = await prisma.pitchLog.findMany({
    where: {
      userId: user.id,
      date: { gte: dbDate(from), lte: dbDate(todayKey) },
      ...(type ? { sessionType: type } : {}),
    },
    orderBy: [{ date: 'asc' }, { createdAt: 'asc' }],
    select: {
      date: true,
      sessionType: true,
      pitchCount: true,
      intensity: true,
      effortPct: true,
      maxVelocity: true,
      avgVelocity: true,
      memo: true,
    },
  });
  const cell = (v: unknown) => {
    const s = v == null ? '' : String(v);
    return /[",\n]/.test(s) ? `"${s.replace(/"/g, '""')}"` : s;
  };
  const rows = [
    [
      '날짜',
      '종류',
      '공 수',
      '강도(1~10)',
      '체감 강도(%)',
      '최고 구속',
      '평균 구속',
      '메모',
    ],
    ...logs.map((l) => [
      keyOfDbDate(l.date),
      l.sessionType,
      l.pitchCount,
      l.intensity,
      l.effortPct,
      l.maxVelocity,
      l.avgVelocity,
      l.memo,
    ]),
  ];
  const body = '﻿' + rows.map((r) => r.map(cell).join(',')).join('\r\n');
  return new NextResponse(body, {
    headers: {
      'Content-Type': 'text/csv; charset=utf-8',
      'Content-Disposition': `attachment; filename="sinker-log-${todayKey}.csv"`,
      'Cache-Control': 'no-store',
    },
  });
}
