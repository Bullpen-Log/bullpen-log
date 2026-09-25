import { prisma } from '@/lib/prisma';
import { requireUser } from '@/lib/dal';
import { toDateKey } from '@/lib/pitch-stats';
import { VideosClient } from './videos-client';

/**
 * 투구 영상 — 올린 영상을 모아 보고, 두 개를 골라 견주는 곳.
 *
 * 한동안 투구 일지 안의 탭 하나였다. 그런데 이 앱에서 영상은 곁다리가 아니라
 * 폼을 고치는 근거다 — 날짜를 아는 기록보다 오히려 더 자주 열게 된다. 탭 안에
 * 두면 투구 일지를 거쳐야 닿고, 무엇보다 밖에서 보이지 않는다.
 *
 * 영상이 여럿인 날은 여기서 그날의 대표를 고른다. 홈 캘린더에서 날짜를 누르면 그
 * 영상이 뜬다.
 */
export default async function VideosPage({
  searchParams,
}: {
  searchParams: Promise<{ [key: string]: string | string[] | undefined }>;
}) {
  const user = await requireUser();
  const params = await searchParams;
  /* 캘린더의 '대표 바꾸기'로 들어오면 그 날짜의 달을 펴 둔다(?month=2026-08) */
  const month = readMonthParam(params.month);
  /* 홈에서 그날 영상으로 들어오면 영상 캘린더가 그날을 열어 둔다(?date=2026-08-30) */
  const date = readDateParam(params.date);

  /*
   * 영상이 붙은 기록만, 기간을 자르지 않고 전부 읽는다.
   *
   * 투구 일지는 열세 달만 읽는다 — 달력은 한 번에 한 달만 보여주니 그만큼이면
   * 되고, 몇 해 쓴 사람의 천 건을 매번 넘길 이유가 없다. 여기는 반대다.
   * 2분할 비교는 예전 폼과 지금을 견주는 것이라 몇 해 전 영상이야말로 필요하다.
   * 영상은 한 기록에 최대 두 개고 올리는 사람이 많지 않아 다 읽어도 작다.
   */
  const [logs, featured] = await Promise.all([
    prisma.pitchLog.findMany({
      where: { userId: user.id, NOT: { videoPaths: { isEmpty: true } } },
      /*
       * 오래된 순 — 비교 화면의 영상 고르개가 이 순서로 늘어놓는다. 같은 날은 남긴
       * 차례로 — 대표를 안 고른 날은 그날 처음 올린 영상이 대표라, 홈 캘린더와 같은
       * 차례여야 둘이 같은 영상을 가리킨다.
       */
      orderBy: [{ date: 'asc' }, { createdAt: 'asc' }],
      select: {
        id: true,
        date: true,
        sessionType: true,
        pitchCount: true,
        intensity: true,
        maxVelocity: true,
        videoPaths: true,
      },
    }),
    prisma.dailyFeaturedVideo.findMany({
      where: { userId: user.id },
      select: { date: true, videoPath: true },
    }),
  ]);

  // Date 객체는 클라이언트로 그대로 넘길 수 없어 문자열로 바꿔 전달한다.
  return (
    <VideosClient
      logs={logs.map((log) => ({ ...log, date: log.date.toISOString() }))}
      featured={Object.fromEntries(
        featured.map((f) => [toDateKey(f.date), f.videoPath])
      )}
      initialMonth={month ?? (date ? date.slice(0, 7) : null)}
      initialDate={date}
    />
  );
}

/** ?date=2026-08-30 처럼 넘어온 값만 받는다 */
function readDateParam(raw: string | string[] | undefined): string | null {
  const value = Array.isArray(raw) ? raw[0] : raw;
  return value && /^\d{4}-\d{2}-\d{2}$/.test(value) ? value : null;
}

/** ?month=2026-08 처럼 넘어온 값만 받는다. 형식이 아니면 무시하고 가장 최근 달을 편다. */
function readMonthParam(raw: string | string[] | undefined): string | null {
  const value = Array.isArray(raw) ? raw[0] : raw;
  return value && /^\d{4}-\d{2}$/.test(value) ? value : null;
}
