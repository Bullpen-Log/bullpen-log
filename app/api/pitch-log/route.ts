import { NextResponse } from 'next/server';
import { prisma } from '@/lib/prisma';
import { getCurrentUser } from '@/lib/dal';
import { deleteVideos, isOwnedBy } from '@/lib/storage';
import { validateSessionType } from '@/lib/session-type';

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
    const {
      date,
      sessionType,
      pitchCount,
      intensity,
      maxVelocity,
      avgVelocity,
      memo,
      videoPaths,
    } = body;

    if (!date) {
      return NextResponse.json({ error: '날짜는 필수입니다' }, { status: 400 });
    }

    const checkedType = validateSessionType(String(sessionType ?? ''));
    if ('error' in checkedType) {
      return NextResponse.json({ error: checkedType.error }, { status: 400 });
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

    const paths: string[] = Array.isArray(videoPaths)
      ? videoPaths.map((p: unknown) => String(p ?? '').trim()).filter(Boolean)
      : [];

    if (paths.length > MAX_VIDEOS) {
      return NextResponse.json(
        { error: `영상은 최대 ${MAX_VIDEOS}개까지 첨부할 수 있습니다` },
        { status: 400 }
      );
    }

    // 다른 사람 폴더의 경로를 끼워 넣지 못하게 막는다.
    if (paths.some((p) => !isOwnedBy(p, user.id))) {
      return NextResponse.json(
        { error: '올바르지 않은 영상 경로입니다' },
        { status: 400 }
      );
    }

    const log = await prisma.pitchLog.create({
      data: {
        userId: user.id,
        date: parsedDate,
        sessionType: checkedType.value,
        pitchCount: parsedCount,
        intensity: parsedIntensity,
        maxVelocity: parsedMax,
        avgVelocity: parsedAvg,
        memo: memo?.trim() || null,
        videoPaths: paths,
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

    // 본인 기록인지 먼저 확인하고, 저장된 영상 경로를 챙겨둔다.
    const target = await prisma.pitchLog.findFirst({
      where: { id, userId: user.id },
      select: { id: true, videoPaths: true },
    });

    if (!target) {
      return NextResponse.json({ error: '기록을 찾을 수 없습니다' }, { status: 404 });
    }

    await prisma.pitchLog.delete({ where: { id: target.id } });

    // 기록이 사라지면 저장소에 파일만 남지 않도록 함께 지운다.
    if (target.videoPaths.length > 0) {
      await deleteVideos(target.videoPaths);
    }

    return NextResponse.json({ ok: true });
  } catch (error) {
    console.error('[DELETE /api/pitch-log]', error);
    return NextResponse.json({ error: '삭제 실패' }, { status: 500 });
  }
}
