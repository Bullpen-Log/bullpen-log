import { prisma } from '@/lib/prisma';
import { requireUser } from '@/lib/dal';
import { toDateKey } from '@/lib/pitch-stats';
import { VideosClient } from './videos-client';

/**
 * 투구 기록 — 남긴 투구와 그날 영상을 한곳에서 보고, 영상 둘을 골라 견주는 곳.
 *
 * 한동안 영상만 모은 '투구 영상' 탭이었다. 그런데 영상을 볼 때 알고 싶은 것은 그날
 * 몇 구를 어떤 강도로 던졌는가였고, 기록을 볼 때도 그날 영상이 곁에 있어야 했다.
 * 이제 영상이 없는 날의 기록까지 한 캘린더 · 한 목록에 나온다. 기록을 남기고 고치는
 * 것은 날짜 화면(/pitch-log/<날짜>)이 맡고, 메뉴에서는 그 화면도 이 탭에 속한다.
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
   * 기록을 기간을 자르지 않고 전부 읽는다 — 영상이 없는 날도.
   *
   * 홈 캘린더는 열세 달만 읽는다 — 달력은 한 번에 한 달만 보여주니 그만큼이면
   * 되고, 몇 해 쓴 사람의 천 건을 매번 넘길 이유가 없다. 여기는 반대다.
   * 2분할 비교는 예전 폼과 지금을 견주는 것이라 몇 해 전 영상이야말로 필요하고,
   * 목록은 기록 전체를 훑는 자리다. 한 줄이 숫자 몇 개와 짧은 메모라, 매일 3년을
   * 남겨도 천 줄 남짓이다.
   */
  const [logs, featured] = await Promise.all([
    prisma.pitchLog.findMany({
      where: { userId: user.id },
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
        memo: true,
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
      today={toDateKey(now())}
    />
  );
}

/** 렌더 중에 현재 시각을 직접 읽지 않도록 함수로 감싼다. */
function now() {
  return new Date();
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
