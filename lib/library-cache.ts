import 'server-only';
import { unstable_cache, updateTag } from 'next/cache';
import type { ExerciseVideo, MechanicsGuide } from '@prisma/client';
import { prisma } from '@/lib/prisma';
import { clearPlaybackUrlCache } from '@/lib/storage';

/**
 * 운동·드릴 목록을 한 번만 읽어 두고 돌려쓴다.
 *
 * 이 둘은 누가 보든 똑같다. 그런데 화면을 열 때마다 405개를 통째로 다시
 * 읽고 있었다 — 홈·트레이닝·일정 만들기·체크인·리포트까지 여덟 군데다.
 * 재보니 한 번에 157ms 였고, 캐시에서 꺼내면 0ms 였다.
 *
 * ■ 날짜를 문자열로 바꿔서 내보낸다
 *
 * Next 의 캐시는 꺼낼 때 Date 를 문자열로 돌려준다. 실제로 재보니 처음
 * 호출에서는 Date 였다가 두 번째부터 String 이 됐다. 타입은 Date 라고 하는데
 * 값은 문자열인 상태가 되어, 어딘가에서 .toISOString() 을 부르는 순간 터진다.
 *
 * 그래서 여기서 미리 문자열로 바꾸고 타입에도 그렇게 적는다. 타입이 거짓말을
 * 안 하면 잘못 쓰는 곳은 빌드가 잡아준다.
 *
 * ■ 숨긴 것까지 다 담는다
 *
 * 걸러서 담으면 두 벌을 들고 있어야 한다. 이미 만들어 둔 일정이 나중에 숨긴
 * 운동을 가리키는 일이 있어서, 아이디로 찾을 때는 숨긴 것도 나와야 한다.
 * 한 벌만 두고 쓰는 쪽에서 거른다.
 */

/** 캐시를 비울 때 쓰는 이름. 운동이나 드릴을 고치면 이것을 지운다. */
export const LIBRARY_TAG = 'library';

/** 날짜를 문자열로 바꾼 운동 한 줄. 캐시에서 나오는 실제 모양이다. */
export type CachedExercise = Omit<
  ExerciseVideo,
  'createdAt' | 'hiddenAt' | 'detailsFilledAt'
> & {
  createdAt: string;
  hiddenAt: string | null;
  detailsFilledAt: string | null;
};

/** 날짜를 문자열로 바꾼 드릴 한 줄 */
export type CachedGuide = Omit<MechanicsGuide, 'createdAt'> & {
  createdAt: string;
};

const iso = (d: Date | null) => (d ? d.toISOString() : null);

/**
 * 운동 전체 (숨긴 것 포함). 등록순으로 온다.
 *
 * 순서를 여기서 못박아 두는 것은, 쓰는 쪽마다 orderBy 를 따로 적으면 언젠가
 * 어긋나기 때문이다. 운동을 고르는 규칙이 등록순을 기준으로 로테이션을 돌린다.
 */
export const allExercises = unstable_cache(
  async (): Promise<CachedExercise[]> => {
    const rows = await prisma.exerciseVideo.findMany({
      orderBy: { createdAt: 'asc' },
    });
    return rows.map((r) => ({
      ...r,
      createdAt: r.createdAt.toISOString(),
      hiddenAt: iso(r.hiddenAt),
      detailsFilledAt: iso(r.detailsFilledAt),
    }));
  },
  /*
   * 운동 표에 칸을 더하면 이 이름을 바꾼다(:v2 — 2026-09-25 targetMuscles).
   *
   * 캐시는 시간으로 비워지지 않고, 배포해도 남는다 — 이름(과 함수 모양)이 같으면
   * 새 칸이 없는 옛 줄이 계속 나온다. 그대로 두면 암케어의 부위별 보강이 텅 비고
   * 오늘의 암케어가 루틴을 못 짠다. 관리자가 운동을 하나 저장해야(clearLibraryCache)
   * 풀리는데, 그것을 기다릴 일이 아니다.
   */
  ['library:exercises:v2'],
  { tags: [LIBRARY_TAG] }
);

/** 드릴 전체. 화면에 나가는 순서 그대로 */
export const allGuides = unstable_cache(
  async (): Promise<CachedGuide[]> => {
    const rows = await prisma.mechanicsGuide.findMany({
      orderBy: [{ sortOrder: 'asc' }, { createdAt: 'asc' }],
    });
    return rows.map((r) => ({ ...r, createdAt: r.createdAt.toISOString() }));
  },
  ['library:guides'],
  { tags: [LIBRARY_TAG] }
);

/** 숨기지 않은 운동만. 새 일정에 나갈 수 있는 것들이다. */
export async function visibleExercises(): Promise<CachedExercise[]> {
  return (await allExercises()).filter((ex) => ex.hiddenAt == null);
}

/**
 * 아이디로 찾는다. 숨긴 것도 나온다 — 이미 만들어 둔 일정이 가리킬 수 있다.
 *
 * DB 를 다시 묻지 않고 이미 들고 있는 목록에서 고른다. 아이디 몇 개를 찾자고
 * 왕복을 한 번 더 할 이유가 없다.
 */
export async function exercisesByIds(ids: string[]): Promise<CachedExercise[]> {
  if (ids.length === 0) return [];
  const want = new Set(ids);
  return (await allExercises()).filter((ex) => want.has(ex.id));
}

/** 영상 주소로 운동·드릴이 실제로 있는지 본다 (주소 발급 전 확인용) */
export async function libraryVideoPaths(paths: string[]): Promise<Set<string>> {
  if (paths.length === 0) return new Set();
  const want = new Set(paths);
  const found = new Set<string>();
  for (const ex of await allExercises()) {
    if (ex.videoPath && want.has(ex.videoPath)) found.add(ex.videoPath);
  }
  for (const g of await allGuides()) {
    if (g.videoPath && want.has(g.videoPath)) found.add(g.videoPath);
  }
  return found;
}

/**
 * 운동이나 드릴을 고친 뒤에 부른다.
 *
 * 안 부르면 관리자가 고쳐도 화면이 옛것을 계속 보여준다. 고치는 곳이 아홉
 * 군데라 한 곳에 모아 두고, 새 동작을 만들 때도 이것만 부르면 되게 한다.
 *
 * revalidateTag 가 아니라 updateTag 를 쓴다. 저쪽은 '다음 사람부터 새것'이라
 * 고친 관리자 본인은 옛 화면을 다시 보게 된다 — 고쳤는데 안 바뀐 것처럼 보인다.
 * updateTag 는 서버 동작 안에서 그 자리에서 비운다(Next 16 권장).
 */
export function clearLibraryCache() {
  updateTag(LIBRARY_TAG);

  /*
   * 영상 주소도 함께 버린다.
   *
   * 미리보기 주소를 잠시 돌려쓰고 있어서(lib/storage.ts), 안 버리면 같은
   * 자리에 새 그림을 올려도 주소가 그대로다. 브라우저는 받아둔 옛 그림을
   * 계속 보여준다 — 고쳤는데 안 바뀐 것처럼 보인다.
   */
  clearPlaybackUrlCache();
}
