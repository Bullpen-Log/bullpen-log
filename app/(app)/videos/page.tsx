import { prisma } from '@/lib/prisma';
import { requireUser } from '@/lib/dal';
import { VideosClient } from './videos-client';

/**
 * 투구 영상 — 올린 영상을 모아 보고, 두 개를 골라 견주는 곳.
 *
 * 한동안 투구 일지 안의 탭 하나였다. 그런데 이 앱에서 영상은 곁다리가 아니라
 * 폼을 고치는 근거다 — 날짜를 아는 기록보다 오히려 더 자주 열게 된다. 탭 안에
 * 두면 투구 일지를 거쳐야 닿고, 무엇보다 밖에서 보이지 않는다.
 */
export default async function VideosPage() {
  const user = await requireUser();

  /*
   * 영상이 붙은 기록만, 기간을 자르지 않고 전부 읽는다.
   *
   * 투구 일지는 열세 달만 읽는다 — 달력은 한 번에 한 달만 보여주니 그만큼이면
   * 되고, 몇 해 쓴 사람의 천 건을 매번 넘길 이유가 없다. 여기는 반대다.
   * 2분할 비교는 예전 폼과 지금을 견주는 것이라 몇 해 전 영상이야말로 필요하다.
   * 영상은 한 기록에 최대 두 개고 올리는 사람이 많지 않아 다 읽어도 작다.
   */
  const logs = await prisma.pitchLog.findMany({
    where: { userId: user.id, NOT: { videoPaths: { isEmpty: true } } },
    // 오래된 순 — 비교 화면의 영상 고르개가 이 순서로 늘어놓는다.
    orderBy: { date: 'asc' },
    select: {
      id: true,
      date: true,
      sessionType: true,
      pitchCount: true,
      intensity: true,
      maxVelocity: true,
      videoPaths: true,
    },
  });

  // Date 객체는 클라이언트로 그대로 넘길 수 없어 문자열로 바꿔 전달한다.
  return (
    <VideosClient
      logs={logs.map((log) => ({ ...log, date: log.date.toISOString() }))}
    />
  );
}
