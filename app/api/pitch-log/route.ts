import { NextResponse } from 'next/server';
import { prisma } from '@/lib/prisma';
import { getCurrentUser } from '@/lib/dal';

export async function GET() {
  const user = await getCurrentUser();
  if (!user) {
    return NextResponse.json({ error: '로그인이 필요합니다' }, { status: 401 });
  }

  try {
    const logs = await prisma.pitchLog.findMany({
      where: { userId: user.id },
      orderBy: { date: 'asc' },
    });
    return NextResponse.json(logs);
  } catch (error) {
    console.error('[GET /api/pitch-log]', error);
    return NextResponse.json({ error: '데이터 조회 실패' }, { status: 500 });
  }
}

export async function POST(req: Request) {
  const user = await getCurrentUser();
  if (!user) {
    return NextResponse.json({ error: '로그인이 필요합니다' }, { status: 401 });
  }

  try {
    const body = await req.json();
    const { date, velocity, pitchCount, intensity, memo } = body;

    if (!date) {
      return NextResponse.json({ error: '날짜는 필수입니다' }, { status: 400 });
    }

    const parsedDate = new Date(date);
    const parsedVelocity = Number.parseFloat(velocity);
    const parsedCount = Number.parseInt(pitchCount, 10);
    const parsedIntensity = Number.parseInt(intensity, 10);

    if (
      Number.isNaN(parsedDate.getTime()) ||
      Number.isNaN(parsedVelocity) ||
      Number.isNaN(parsedCount) ||
      Number.isNaN(parsedIntensity)
    ) {
      return NextResponse.json({ error: '입력값 형식이 올바르지 않습니다' }, { status: 400 });
    }

    const log = await prisma.pitchLog.create({
      data: {
        userId: user.id,
        date: parsedDate,
        velocity: parsedVelocity,
        pitchCount: parsedCount,
        intensity: parsedIntensity,
        memo: memo || null,
      },
    });

    return NextResponse.json(log, { status: 201 });
  } catch (error) {
    console.error('[POST /api/pitch-log]', error);
    return NextResponse.json({ error: '데이터 저장 실패' }, { status: 500 });
  }
}

export async function DELETE(req: Request) {
  const user = await getCurrentUser();
  if (!user) {
    return NextResponse.json({ error: '로그인이 필요합니다' }, { status: 401 });
  }

  try {
    const { id } = await req.json();
    if (!id) {
      return NextResponse.json({ error: 'id가 필요합니다' }, { status: 400 });
    }

    // 본인 기록만 삭제할 수 있도록 userId를 함께 조건에 넣는다.
    const result = await prisma.pitchLog.deleteMany({
      where: { id, userId: user.id },
    });

    if (result.count === 0) {
      return NextResponse.json({ error: '기록을 찾을 수 없습니다' }, { status: 404 });
    }

    return NextResponse.json({ ok: true });
  } catch (error) {
    console.error('[DELETE /api/pitch-log]', error);
    return NextResponse.json({ error: '삭제 실패' }, { status: 500 });
  }
}
