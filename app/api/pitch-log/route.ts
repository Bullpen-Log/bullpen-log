import { NextResponse } from 'next/server';
import { prisma } from '@/lib/prisma';
import { getCurrentUser } from '@/lib/dal';
import { deleteVideos, isOwnedBy } from '@/lib/storage';
import { validateSessionType } from '@/lib/session-type';

const MAX_VIDEOS = 2;

/** 저장할 수 있는 형태로 다듬은 기록 값 */
type CheckedEntry = {
  sessionType: string;
  pitchCount: number;
  intensity: number;
  maxVelocity: number;
  avgVelocity: number | null;
  memo: string | null;
};

/**
 * 폼에서 온 기록 값을 검사한다.
 *
 * 새로 남길 때(POST)와 고칠 때(PATCH)가 같은 규칙을 써야 하므로
 * 한 곳에 모아둔다. 따로 두면 한쪽만 고쳐져 서로 어긋난다.
 */
function checkEntry(body: Record<string, unknown>): { error: string } | CheckedEntry {
  const checkedType = validateSessionType(String(body.sessionType ?? ''));
  if ('error' in checkedType) return checkedType;

  const pitchCount = Number.parseInt(String(body.pitchCount), 10);
  const intensity = Number.parseInt(String(body.intensity), 10);
  const maxVelocity = Number.parseFloat(String(body.maxVelocity));

  if (
    Number.isNaN(pitchCount) ||
    Number.isNaN(intensity) ||
    Number.isNaN(maxVelocity)
  ) {
    return { error: '투구수, 강도, 최고 구속을 올바르게 입력해주세요' };
  }

  if (intensity < 1 || intensity > 10) {
    return { error: '투구 강도는 1에서 10 사이여야 합니다' };
  }

  // 평균 구속은 선택 항목이라 값이 있을 때만 검사한다.
  let avgVelocity: number | null = null;
  const rawAvg = body.avgVelocity;
  if (rawAvg !== '' && rawAvg != null) {
    avgVelocity = Number.parseFloat(String(rawAvg));
    if (Number.isNaN(avgVelocity)) {
      return { error: '평균 구속을 숫자로 입력해주세요' };
    }
    if (avgVelocity > maxVelocity) {
      return { error: '평균 구속이 최고 구속보다 클 수 없습니다' };
    }
  }

  return {
    sessionType: checkedType.value,
    pitchCount,
    intensity,
    maxVelocity,
    avgVelocity,
    memo: String(body.memo ?? '').trim() || null,
  };
}

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
    const { date, videoPaths } = body;

    if (!date) {
      return NextResponse.json({ error: '날짜는 필수입니다' }, { status: 400 });
    }

    const parsedDate = new Date(date);
    if (Number.isNaN(parsedDate.getTime())) {
      return NextResponse.json({ error: '날짜가 올바르지 않습니다' }, { status: 400 });
    }

    const checked = checkEntry(body);
    if ('error' in checked) {
      return NextResponse.json({ error: checked.error }, { status: 400 });
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
        ...checked,
        videoPaths: paths,
      },
    });

    return NextResponse.json(log, { status: 201 });
  } catch (error) {
    console.error('[POST /api/pitch-log]', error);
    return NextResponse.json({ error: '데이터 저장 실패' }, { status: 500 });
  }
}

/**
 * 이미 남긴 기록의 수치와 느낀점을 고친다.
 *
 * 영상은 건드리지 않는다. 영상을 빼면 그 영상에 붙은 폼 분석이
 * 주인 없이 남게 되고, 날짜를 옮기면 다른 날 기록과 뒤섞인다.
 * 둘 다 고칠 일이 생기면 지우고 다시 남기는 편이 안전하다.
 */
export async function PATCH(req: Request) {
  const user = await getCurrentUser();
  if (!user) {
    return NextResponse.json({ error: '로그인이 필요합니다' }, { status: 401 });
  }

  try {
    const body = await req.json();
    const id = String(body.id ?? '');
    if (!id) {
      return NextResponse.json({ error: 'id가 필요합니다' }, { status: 400 });
    }

    // 남의 기록을 고치지 못하게 본인 것인지 먼저 확인한다.
    const target = await prisma.pitchLog.findFirst({
      where: { id, userId: user.id },
      select: { id: true },
    });

    if (!target) {
      return NextResponse.json({ error: '기록을 찾을 수 없습니다' }, { status: 404 });
    }

    const checked = checkEntry(body);
    if ('error' in checked) {
      return NextResponse.json({ error: checked.error }, { status: 400 });
    }

    const log = await prisma.pitchLog.update({
      where: { id: target.id },
      data: checked,
    });

    return NextResponse.json(log);
  } catch (error) {
    console.error('[PATCH /api/pitch-log]', error);
    return NextResponse.json({ error: '수정 실패' }, { status: 500 });
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
