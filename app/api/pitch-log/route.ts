import { NextResponse } from 'next/server';
import { prisma } from '@/lib/prisma';
import { getCurrentUser } from '@/lib/dal';
import { deleteVideos, isOwnedBy } from '@/lib/storage';
import { isRestSession, validateSessionType } from '@/lib/session-type';
import { isFutureDateKey, toDateKey } from '@/lib/pitch-stats';

const MAX_VIDEOS = 2;

/*
 * 값의 범위.
 *
 * 규칙으로 무엇을 하라고 시키려는 것이 아니라 오타를 잡으려는 것이다. 450 을
 * 치려다 4500 을 치면 그 하루가 부하 지수를 끌어올리는데, 지수는 28일을
 * 되돌아보므로 한 달 내내 '위험'이 뜬다. 그 숫자로 휴식일과 운동 강도가
 * 정해지니 앱이 통째로 헛돈다.
 *
 * 그래서 선은 넉넉하게 긋는다. 실제로 있을 법한 값은 하나도 막지 않고,
 * 자릿수를 잘못 친 것만 걸리는 자리다.
 *   투구수 500 — 한 번에 500구를 던지는 사람은 없다(경기 최다가 120구쯤)
 *   구속 30~200 — 세계 기록이 169km/h 이고, 초등학생도 30km/h 는 넘는다
 */
const MAX_PITCH_COUNT = 500;
const MIN_VELOCITY = 30;
const MAX_VELOCITY = 200;

/** 저장할 수 있는 형태로 다듬은 기록 값 */
type CheckedEntry = {
  sessionType: string;
  pitchCount: number;
  intensity: number;
  maxVelocity: number | null;
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

  /*
   * 쉰 날은 투구수와 강도가 0이다.
   *
   * 화면에서 그 칸을 감추므로 값이 아예 안 오거나 빈 값으로 온다.
   * 여기서 0으로 못박아, 부하에 아무것도 더하지 않게 한다.
   */
  const resting = isRestSession(checkedType.value);

  const pitchCount = resting ? 0 : Number.parseInt(String(body.pitchCount), 10);
  const intensity = resting ? 0 : Number.parseInt(String(body.intensity), 10);

  if (!resting) {
    if (Number.isNaN(pitchCount) || Number.isNaN(intensity)) {
      return { error: '투구수와 강도를 올바르게 입력해주세요' };
    }
    if (pitchCount < 1) {
      return {
        error: '투구수는 1개 이상이어야 합니다. 안 던진 날은 종류에서 휴식을 고르세요',
      };
    }
    if (pitchCount > MAX_PITCH_COUNT) {
      return {
        error: `투구수가 ${MAX_PITCH_COUNT}구를 넘습니다. 자릿수를 잘못 누르지 않았는지 확인해주세요. 나눠 던졌다면 세션을 나눠 남기시면 됩니다`,
      };
    }
    if (intensity < 1 || intensity > 10) {
      return { error: '투구 강도는 1에서 10 사이여야 합니다' };
    }
  }

  /*
   * 구속은 둘 다 선택 항목이다.
   *
   * 스피드건이 없는 선수가 훨씬 많은데, 구속을 필수로 두면 그 선수들은 기록을
   * 아예 못 남긴다. 기록이 없으면 부하 지수도 트레이닝도 돌지 않으므로
   * 앱이 통째로 멈춘다. 부하는 투구수 × 강도라서 구속 없이도 계산된다.
   */
  const readVelocity = (
    raw: unknown,
    label: string
  ): { error: string } | { value: number | null } => {
    if (raw === '' || raw == null) return { value: null };
    const value = Number.parseFloat(String(raw));
    if (Number.isNaN(value) || value <= 0) {
      return { error: `${label}을 숫자로 입력해주세요` };
    }
    if (value < MIN_VELOCITY || value > MAX_VELOCITY) {
      return {
        error: `${label}은 ${MIN_VELOCITY}~${MAX_VELOCITY} km/h 사이로 입력해주세요. 단위가 mph 라면 km/h 로 바꿔서 넣어주세요`,
      };
    }
    return { value };
  };

  const max = resting ? { value: null } : readVelocity(body.maxVelocity, '최고 구속');
  if ('error' in max) return max;
  const avg = resting ? { value: null } : readVelocity(body.avgVelocity, '평균 구속');
  if ('error' in avg) return avg;

  const maxVelocity = max.value;
  const avgVelocity = avg.value;

  // 최고 구속이 없으면 견줄 대상이 없으므로 이 검사도 건너뛴다.
  if (maxVelocity != null && avgVelocity != null && avgVelocity > maxVelocity) {
    return { error: '평균 구속이 최고 구속보다 클 수 없습니다' };
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

/**
 * 폼에서 온 영상 경로를 검사한다.
 *
 * 새로 남길 때와 고칠 때가 같은 규칙을 써야 한다. 따로 두면 한쪽만 고쳐져
 * 서로 어긋난다 — 실제로 고치는 쪽에는 검사가 아예 없던 때가 있었다.
 */
function checkVideoPaths(
  raw: unknown,
  userId: string
): { error: string } | { paths: string[] } {
  const paths: string[] = Array.isArray(raw)
    ? raw.map((p: unknown) => String(p ?? '').trim()).filter(Boolean)
    : [];

  if (paths.length > MAX_VIDEOS) {
    return { error: `영상은 최대 ${MAX_VIDEOS}개까지 첨부할 수 있습니다` };
  }

  // 다른 사람 폴더의 경로를 끼워 넣지 못하게 막는다.
  if (paths.some((p) => !isOwnedBy(p, userId))) {
    return { error: '올바르지 않은 영상 경로입니다' };
  }

  return { paths };
}

/**
 * 기록 읽기.
 *
 * ?month=2026-08 을 주면 그 달만 준다. 안 주면 예전처럼 전부 준다.
 *
 * 달로 자를 수 있게 한 이유: 일지 화면이 가입 이래 모든 기록을 한 번에 읽고
 * 있었다. 지금은 수십 건이라 순식간이지만 매일 남기는 선수라면 3년에 천 건이
 * 넘는다. 달력은 한 번에 한 달만 보여주므로 그 달치만 있으면 된다.
 */
export async function GET(req: Request) {
  const user = await getCurrentUser();
  if (!user) {
    return NextResponse.json({ error: '로그인이 필요합니다' }, { status: 401 });
  }

  const month = new URL(req.url).searchParams.get('month');
  if (month != null && !/^\d{4}-\d{2}$/.test(month)) {
    return NextResponse.json(
      { error: '달은 2026-08 형식이어야 합니다' },
      { status: 400 }
    );
  }

  try {
    const logs = await prisma.pitchLog.findMany({
      where: {
        userId: user.id,
        ...(month
          ? {
              /*
               * 그 달의 1일부터 다음 달 1일 직전까지.
               * 날짜는 UTC 자정으로 저장하므로 여기서도 UTC로 자른다.
               */
              date: {
                gte: new Date(`${month}-01T00:00:00.000Z`),
                lt: nextMonthStart(month),
              },
            }
          : {}),
      },
      orderBy: { date: 'asc' },
    });
    return NextResponse.json(logs);
  } catch (error) {
    console.error('[GET /api/pitch-log]', error);
    return NextResponse.json({ error: '데이터 조회 실패' }, { status: 500 });
  }
}

/** 2026-12 → 2027-01-01 (UTC). 해 넘김은 Date.UTC 가 알아서 한다. */
function nextMonthStart(month: string) {
  const [y, m] = month.split('-').map(Number);
  return new Date(Date.UTC(y, m, 1));
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

    /*
     * 앞으로 올 날짜에는 남길 수 없다.
     *
     * 던진 것을 적는 곳이지 계획을 적는 곳이 아니다. 미리 적어두면 "최근 7일
     * 부하"에 아직 던지지 않은 것이 들어가, 그 숫자로 정해지는 휴식일과 운동
     * 강도가 통째로 어긋난다. 화면에서도 앞날은 못 누르게 해두었지만,
     * 여기서 한 번 더 본다 — 화면을 거치지 않고 들어올 수 있다.
     */
    if (isFutureDateKey(toDateKey(parsedDate))) {
      return NextResponse.json(
        { error: '아직 오지 않은 날짜에는 기록할 수 없습니다.' },
        { status: 400 }
      );
    }

    const checked = checkEntry(body);
    if ('error' in checked) {
      return NextResponse.json({ error: checked.error }, { status: 400 });
    }

    const checkedPaths = checkVideoPaths(videoPaths, user.id);
    if ('error' in checkedPaths) {
      return NextResponse.json({ error: checkedPaths.error }, { status: 400 });
    }
    const paths = checkedPaths.paths;

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
 * 이미 남긴 기록을 고친다. 영상도 함께 바꿀 수 있다.
 *
 * 예전에는 수치와 느낀점만 고칠 수 있었다. 영상을 빼면 거기 붙은 폼 분석이
 * 주인 없이 남기 때문인데, 그러다 보니 영상 하나 바꾸려고 기록을 통째로
 * 지우고 다시 써야 했다. 지금은 뺀 영상의 분석을 여기서 같이 지운다.
 *
 * 지우는 순서가 중요하다. 기록을 먼저 고치고, 그 다음 분석을 지우고, 저장소
 * 파일은 맨 마지막이다. 파일부터 지웠다가 기록 고치기가 실패하면 화면에는
 * 영상이 있는데 열리지 않는 상태가 된다.
 *
 * 날짜는 여전히 못 옮긴다. 옮기면 다른 날 기록과 뒤섞인다.
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
      select: { id: true, videoPaths: true },
    });

    if (!target) {
      return NextResponse.json({ error: '기록을 찾을 수 없습니다' }, { status: 404 });
    }

    const checked = checkEntry(body);
    if ('error' in checked) {
      return NextResponse.json({ error: checked.error }, { status: 400 });
    }

    /*
     * 영상 목록은 보낼 때만 손댄다.
     *
     * 예전 화면은 이 값을 아예 안 보냈다. 없을 때 빈 목록으로 치면 그런
     * 화면에서 고치는 순간 영상이 통째로 날아간다.
     */
    const touchesVideos = body.videoPaths !== undefined;
    let removed: string[] = [];

    if (touchesVideos) {
      const checkedPaths = checkVideoPaths(body.videoPaths, user.id);
      if ('error' in checkedPaths) {
        return NextResponse.json({ error: checkedPaths.error }, { status: 400 });
      }
      const next = new Set(checkedPaths.paths);
      removed = target.videoPaths.filter((p) => !next.has(p));

      const log = await prisma.pitchLog.update({
        where: { id: target.id },
        data: { ...checked, videoPaths: checkedPaths.paths },
      });

      if (removed.length > 0) {
        /*
         * 뺀 영상의 폼 분석을 지운다.
         *
         * 안 지우면 어느 기록에도 안 붙은 분석이 남아, 지난 세션과 견주는
         * 자리에 사라진 영상의 값이 계속 끼어든다.
         */
        await prisma.poseAnalysis.deleteMany({
          where: { userId: user.id, videoPath: { in: removed } },
        });
        // 저장소에 못 찾는 파일이 쌓이지 않게 함께 지운다.
        await deleteVideos(removed);
      }

      return NextResponse.json(log);
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
