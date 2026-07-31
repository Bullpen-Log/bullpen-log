import { NextResponse } from 'next/server';
import { prisma } from '@/lib/prisma';
import { getCurrentUser } from '@/lib/dal';
import { getYouTubeId } from '@/lib/youtube';

const MAX_VIDEOS = 2;

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
    const { date, pitchCount, intensity, maxVelocity, avgVelocity, memo, videoUrls } =
      body;

    if (!date) {
      return NextResponse.json({ error: '날짜는 필수입니다' }, { status: 400 });
    }

    const parsedDate = new Date(date);
    const parsedCount = Number.parseInt(pitchCount, 10);
    const parsedIntensity = Number.parseInt(intensity, 10);
    const parsedMax = Number.parseFloat(maxVelocity);

    if (
      Number.isNaN(parsedDate.getTime()) ||
      Number.isNaN(parsedCount) ||
      Number.isNaN(parsedIntensity) ||
      Number.isNaN(parsedMax)
    ) {
      return NextResponse.json(
        { error: '투구수, 강도, 최고 구속을 올바르게 입력해주세요' },
        { status: 400 }
      );
    }

    if (parsedIntensity < 1 || parsedIntensity > 10) {
      return NextResponse.json(
        { error: '투구 강도는 1에서 10 사이여야 합니다' },
        { status: 400 }
      );
    }

    // 평균 구속은 선택 항목이라 값이 있을 때만 검사한다.
    let parsedAvg: number | null = null;
    if (avgVelocity !== '' && avgVelocity != null) {
      parsedAvg = Number.parseFloat(avgVelocity);
      if (Number.isNaN(parsedAvg)) {
        return NextResponse.json(
          { error: '평균 구속을 숫자로 입력해주세요' },
          { status: 400 }
        );
      }
      if (parsedAvg > parsedMax) {
        return NextResponse.json(
          { error: '평균 구속이 최고 구속보다 클 수 없습니다' },
          { status: 400 }
        );
      }
    }

    const urls: string[] = Array.isArray(videoUrls)
      ? videoUrls.map((u: unknown) => String(u ?? '').trim()).filter(Boolean)
      : [];

    if (urls.length > MAX_VIDEOS) {
      return NextResponse.json(
        { error: `영상은 최대 ${MAX_VIDEOS}개까지 첨부할 수 있습니다` },
        { status: 400 }
      );
    }

    const invalid = urls.find((u) => !getYouTubeId(u));
    if (invalid) {
      return NextResponse.json(
        { error: '영상은 유튜브 링크만 첨부할 수 있습니다' },
        { status: 400 }
      );
    }

    const log = await prisma.pitchLog.create({
      data: {
        userId: user.id,
        date: parsedDate,
        pitchCount: parsedCount,
        intensity: parsedIntensity,
        maxVelocity: parsedMax,
        avgVelocity: parsedAvg,
        memo: memo?.trim() || null,
        videoUrls: urls,
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
