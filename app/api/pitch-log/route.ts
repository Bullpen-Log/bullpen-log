import { NextResponse } from 'next/server';
import { appNowMs } from '@/lib/clock';
import { prisma } from '@/lib/prisma';
import { getCurrentUser } from '@/lib/dal';
import { deleteVideos, isOwnedBy } from '@/lib/storage';
import { isRestSession, validateSessionType } from '@/lib/session-type';
import { isFutureDateKey, toDateKey } from '@/lib/pitch-stats';
import { cleanCues, isRatedSession, readSatisfaction } from '@/lib/pitch-satisfaction';
import { effortUpdate, readEffortInput } from '@/lib/pitch-effort';

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
  /** 체감 강도 5~100%(2판 D2). 쉰 날 · 옛 화면이 intensity 만 보낸 기록은 null — lib/pitch-effort.ts */
  effortPct: number | null;
  maxVelocity: number | null;
  avgVelocity: number | null;
  memo: string | null;
};

/** 이 안에 똑같은 기록이 또 오면 새로 만들지 않는다(POST — 답을 못 받아 다시 누른 것) */
const DUPLICATE_WINDOW_MS = 2 * 60 * 1000;

/**
 * 폼에서 온 기록 값을 검사한다.
 *
 * 새로 남길 때(POST)와 고칠 때(PATCH)가 같은 규칙을 써야 하므로
 * 한 곳에 모아둔다. 따로 두면 한쪽만 고쳐져 서로 어긋난다.
 */
function checkEntry(
  body: Record<string, unknown>
): { error: string } | { entry: CheckedEntry; legacyEffort: boolean } {
  /* 투구 종류는 꼭 — 비면 '불펜'으로 넣던 것을 없앴다(2026-10-18 사용자). 캐치볼이 불펜 날로 셈됐다 */
  if (String(body.sessionType ?? '').trim() === '') return { error: '투구 종류를 골라 주세요.' };
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

  if (!resting) {
    if (Number.isNaN(pitchCount)) {
      return { error: '투구수를 올바르게 입력해 주세요' };
    }
    if (pitchCount < 1) {
      return {
        error: '투구수는 1개 이상이어야 해요. 안 던진 날은 종류에서 휴식을 고르세요',
      };
    }
    if (pitchCount > MAX_PITCH_COUNT) {
      return {
        error: `투구수가 ${MAX_PITCH_COUNT}구를 넘어요. 자릿수를 잘못 누르지 않았는지 확인해 주세요. 나눠 던졌다면 따로 나눠 남겨 주세요`,
      };
    }
  }

  /*
   * 체감 강도 — 새 화면은 effortPct(5~100%)를, 옛 화면(배포 직전에 열어 둔 탭 · 옛 앱)은 intensity(1~10)를 보낸다.
   * 둘 다 같은 규칙으로 읽어 두 칸을 채운다(lib/pitch-effort.ts). 쉰 날은 effortPct null · intensity 0.
   */
  const effort = readEffortInput(body, resting);
  if ('error' in effort) return effort;

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
      return { error: `${label}을 숫자로 입력해 주세요` };
    }
    if (value < MIN_VELOCITY || value > MAX_VELOCITY) {
      return {
        error: `${label}은 ${MIN_VELOCITY}~${MAX_VELOCITY} km/h 사이로 입력해 주세요. 단위가 mph 라면 km/h 로 바꿔서 넣어주세요`,
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
    return { error: '평균 구속이 최고 구속보다 클 수 없어요' };
  }

  return {
    entry: {
      sessionType: checkedType.value,
      pitchCount,
      intensity: effort.intensity,
      effortPct: effort.effortPct,
      maxVelocity,
      avgVelocity,
      memo: String(body.memo ?? '').trim() || null,
    },
    legacyEffort: effort.legacy,
  };
}

/**
 * 투구 만족도 · 좋았던 것 · 아쉬웠던 것을 검사한다.
 *
 * 보낼 때만 손댄다(data 가 null 이면 그대로 둔다) — 영상 목록과 같은 까닭이다. 이 칸이 생기기 전 화면은
 * 값을 안 보내서, 없을 때 비운다고 치면 그 화면에서 메모만 고쳐도 매겨 둔 만족도가 날아간다.
 * 만족도를 받지 않는 종류(캐치볼 · 휴식)면 늘 비운다.
 */
function checkSatisfaction(
  body: Record<string, unknown>,
  sessionType: string
):
  | { error: string }
  | { data: { satisfaction: number | null; cuesGood: string[]; cuesBad: string[] } | null } {
  if (!isRatedSession(sessionType)) {
    return { data: { satisfaction: null, cuesGood: [], cuesBad: [] } };
  }
  if (body.satisfaction === undefined) return { data: null };
  const read = readSatisfaction(body.satisfaction);
  if ('error' in read) return read;
  return { data: { satisfaction: read.value, ...cleanCues(body.cuesGood, body.cuesBad) } };
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
    return { error: `영상은 최대 ${MAX_VIDEOS}개까지 첨부할 수 있어요` };
  }

  // 다른 사람 폴더의 경로를 끼워 넣지 못하게 막는다.
  if (paths.some((p) => !isOwnedBy(p, userId))) {
    return { error: '올바르지 않은 영상 경로예요' };
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
    return NextResponse.json({ error: '로그인이 필요해요' }, { status: 401 });
  }

  const month = new URL(req.url).searchParams.get('month');
  /* 달은 01~12 만 — 2026-13 은 모양이 맞아도 Invalid Date 로 Prisma 가 던져 500 이었다(2026-10-18) */
  if (month != null && !/^\d{4}-(0[1-9]|1[0-2])$/.test(month)) {
    return NextResponse.json(
      { error: '달은 2026-08 형식이어야 해요' },
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
      /* 같은 날은 남긴 차례로 — 홈 캘린더가 처음 읽을 때와 같은 차례여야 한다 */
      orderBy: [{ date: 'asc' }, { createdAt: 'asc' }],
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

/**
 * 구속 측정으로 채운 기록이면 그 세션들을 이 기록에 잇는다(2026-10-16 — 측정은 투구 기록을 만들지 않고, 투구 탭 카드가 '아직 안 남긴
 * 측정'을 알린다. 이으면 그 알림이 사라진다). 본인 것 · 같은 날 · 아직 안 이어진 세션만 — 못 이어도 기록 저장은 끝났다.
 */
async function linkVelocitySessions(raw: unknown, userId: string, date: Date, logId: string) {
  const ids = Array.isArray(raw)
    ? raw.filter((x): x is string => typeof x === 'string').slice(0, 20)
    : [];
  if (ids.length === 0) return;
  await prisma.velocitySession
    .updateMany({
      where: { id: { in: ids }, userId, date, pitchLogId: null },
      data: { pitchLogId: logId },
    })
    .catch((err: unknown) => console.error('[POST /api/pitch-log] 구속 세션 잇기 실패', err));
}

export async function POST(req: Request) {
  const user = await getCurrentUser();
  if (!user) {
    return NextResponse.json({ error: '로그인이 필요해요' }, { status: 401 });
  }

  try {
    const body = await req.json();
    const { date, videoPaths } = body;

    if (!date) {
      return NextResponse.json({ error: '날짜가 필요해요' }, { status: 400 });
    }

    const parsedDate = new Date(date);
    /* 날짜 키(YYYY-MM-DD)인데 없는 날(2026-02-31)이면 Date 가 3월로 넘겨 다른 날에 저장됐다 — 되돌려 맞춰 본다(2026-10-18) */
    const asKey = typeof date === 'string' && /^\d{4}-\d{2}-\d{2}$/.test(date);
    if (
      Number.isNaN(parsedDate.getTime()) ||
      (asKey && parsedDate.toISOString().slice(0, 10) !== date)
    ) {
      return NextResponse.json({ error: '날짜가 올바르지 않아요' }, { status: 400 });
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
        { error: '아직 오지 않은 날짜에는 기록할 수 없어요.' },
        { status: 400 }
      );
    }

    const read = checkEntry(body);
    if ('error' in read) {
      return NextResponse.json({ error: read.error }, { status: 400 });
    }
    /* 새로 남길 때는 옛 화면이 보낸 1~10 도 그대로 받는다 — effortPct 는 비운 채(null) 남는다 */
    const checked = read.entry;

    const rating = checkSatisfaction(body, checked.sessionType);
    if ('error' in rating) {
      return NextResponse.json({ error: rating.error }, { status: 400 });
    }

    const checkedPaths = checkVideoPaths(videoPaths, user.id);
    if ('error' in checkedPaths) {
      return NextResponse.json({ error: checkedPaths.error }, { status: 400 });
    }
    const paths = checkedPaths.paths;

    /*
     * 같은 것을 두 번 남기지 않는다. 휴대폰 신호가 약하면 저장은 됐는데 답만 못 받아 '저장에 실패'가 뜨고, 다시 누르면 같은
     * 기록이 두 줄이 되어 그날 투구수 · 부하 지수가 두 배가 됐다. 방금(2분 안) 똑같은 값(종류 · 투구수 · 강도 · 체감 강도 % ·
     * 구속 · 메모 · 영상)으로 만든 기록이 있으면 새로 만들지 않고 그것을 돌려준다 — 사람이 2분 안에 똑같은 기록을 두 번 남길 일은 없다.
     */
    const duplicate = await prisma.pitchLog.findFirst({
      where: {
        userId: user.id,
        date: parsedDate,
        /* pitchLog.createdAt 은 시험 계정이면 앱 시계로 적힌다(lib/prisma.ts TIME_FIELDS) — 그래서 appNowMs 와 견준다(2026-10-18, 하루 Date.now 로 잘못 바꿨던 것 되돌림) */
        createdAt: { gte: new Date(appNowMs() - DUPLICATE_WINDOW_MS) },
        ...checked,
        videoPaths: { equals: paths },
      },
      orderBy: { createdAt: 'desc' },
    });
    if (duplicate) {
      await linkVelocitySessions(body.velocitySessionIds, user.id, parsedDate, duplicate.id);
      return NextResponse.json(duplicate, { status: 200 });
    }

    const log = await prisma.pitchLog.create({
      data: {
        userId: user.id,
        date: parsedDate,
        ...checked,
        ...rating.data,
        videoPaths: paths,
      },
    });
    await linkVelocitySessions(body.velocitySessionIds, user.id, parsedDate, log.id);

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
    return NextResponse.json({ error: '로그인이 필요해요' }, { status: 401 });
  }

  try {
    const body = await req.json();
    const id = String(body.id ?? '');
    if (!id) {
      return NextResponse.json({ error: 'id가 필요해요' }, { status: 400 });
    }

    // 남의 기록을 고치지 못하게 본인 것인지 먼저 확인한다.
    const target = await prisma.pitchLog.findFirst({
      where: { id, userId: user.id },
      select: { id: true, videoPaths: true, intensity: true },
    });

    if (!target) {
      return NextResponse.json({ error: '기록을 찾을 수 없어요' }, { status: 404 });
    }

    const read = checkEntry(body);
    if ('error' in read) {
      return NextResponse.json({ error: read.error }, { status: 400 });
    }
    /*
     * 체감 강도 칸은 저장된 강도를 보고 넣는다(lib/pitch-effort.ts effortUpdate). 옛 화면은 1~10 만 보내서, 그대로 덮으면
     * 85% 로 남긴 기록을 옛 탭에서 메모만 고쳐도 % 가 지워진다 — 같은 강도면 % 칸을 안 건드리고, 다르면 비운다.
     */
    const { effortPct, intensity, ...rest } = read.entry;
    const checked = {
      ...rest,
      ...effortUpdate(
        { effortPct, intensity, legacy: read.legacyEffort },
        target.intensity
      ),
    };
    const rating = checkSatisfaction(body, checked.sessionType);
    if ('error' in rating) {
      return NextResponse.json({ error: rating.error }, { status: 400 });
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
      /*
       * 폼이 열릴 때의 목록(baseVideoPaths)을 함께 받으면, 이 폼에서 뺀 것만 빼고 그사이 다른 기기에서 더한 영상은 남긴다.
       * 예전에는 지금 DB 목록과 견줘서, 폰으로 영상을 더한 뒤 PC 에 열어 둔 폼으로 메모만 고쳐 저장해도 그 영상 · 미리보기 ·
       * 폼 분석이 지워졌다. 안 보내는 옛 화면은 예전처럼 보낸 목록이 전부다.
       */
      const base = Array.isArray(body.baseVideoPaths)
        ? new Set(body.baseVideoPaths.map((p: unknown) => String(p ?? '')))
        : null;
      const sent = new Set(checkedPaths.paths);
      const finalPaths = base
        ? [
            ...checkedPaths.paths,
            ...target.videoPaths.filter((p) => !base.has(p) && !sent.has(p)),
          ]
        : checkedPaths.paths;
      if (finalPaths.length > MAX_VIDEOS) {
        return NextResponse.json(
          {
            error:
              '그사이 다른 곳에서 영상이 더해져 개수를 넘었어요. 기록을 다시 열어 고쳐주세요.',
          },
          { status: 409 }
        );
      }
      const next = new Set(finalPaths);
      removed = target.videoPaths.filter((p) => !next.has(p));

      const log = await prisma.pitchLog.update({
        where: { id: target.id },
        data: { ...checked, ...rating.data, videoPaths: finalPaths },
      });

      if (removed.length > 0) {
        // 저장소에 못 찾는 파일이 쌓이지 않게 함께 지운다(옛 폼 분석 표 PoseAnalysis 는 2026-10-16 에 지웠다).
        await deleteVideos(removed);
      }

      return NextResponse.json(log);
    }

    const log = await prisma.pitchLog.update({
      where: { id: target.id },
      data: { ...checked, ...rating.data },
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
    return NextResponse.json({ error: '로그인이 필요해요' }, { status: 401 });
  }

  try {
    const { id } = await req.json();
    /* 글자만 — 객체를 보내면 Prisma 거름({ not: … })으로 읽혀 아무 기록이나 찾아 지웠다(본인 것만이지만, 2026-10-18) */
    if (typeof id !== 'string' || !id) {
      return NextResponse.json({ error: 'id가 필요해요' }, { status: 400 });
    }

    // 본인 기록인지 먼저 확인하고, 저장된 영상 경로를 챙겨둔다.
    const target = await prisma.pitchLog.findFirst({
      where: { id, userId: user.id },
      select: { id: true, videoPaths: true },
    });

    if (!target) {
      return NextResponse.json({ error: '기록을 찾을 수 없어요' }, { status: 404 });
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
