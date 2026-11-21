import 'server-only';
import { unstable_cache, updateTag } from 'next/cache';
import type { ExerciseVideo, MechanicsGuide } from '@prisma/client';
import { prisma } from '@/lib/prisma';
import { clearPlaybackUrlCache } from '@/lib/storage';
import { LATER_CATEGORY } from '@/lib/categories';
import { readStoredSemanticsRows } from '@/lib/workout/load/semantics';

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
  'createdAt' | 'hiddenAt' | 'detailsFilledAt' | 'loadSemantics'
> & {
  createdAt: string;
  hiddenAt: string | null;
  detailsFilledAt: string | null;
  /**
   * EX-LOAD01 R1-04 — 관리자 뜻 설정(ExerciseVideo.loadSemantics, 보류 마이그레이션의 칸). 스키마 스위치(WORKOUT_LOAD_SCHEMA)가 켜졌을 때만
   * 실린다(없는 운동은 null). 꺼져 있으면 칸 자체가 없다(undefined) — 그때는 그 칸 이름이 든 SQL 을 보내지 않는다.
   */
  loadSemantics?: unknown;
};

/** 날짜를 문자열로 바꾼 드릴 한 줄 */
export type CachedGuide = Omit<MechanicsGuide, 'createdAt' | 'hiddenAt'> & {
  createdAt: string;
  hiddenAt: string | null;
};

const iso = (d: Date | null) => (d ? d.toISOString() : null);

/**
 * 운동 전체 (숨긴 것 포함). 등록순으로 온다.
 *
 * 순서를 여기서 못박아 두는 것은, 쓰는 쪽마다 orderBy 를 따로 적으면 언젠가
 * 어긋나기 때문이다. 운동을 고르는 규칙이 등록순을 기준으로 로테이션을 돌린다.
 */
const exerciseRows = unstable_cache(
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
   * 운동 표에 칸을 더하거나 스크립트로 운동을 넣으면 이 이름을 바꾼다(:v2 — 2026-09-25
   * targetMuscles, :v3 — 2026-09-26 암케어 참고 영상 33개, scripts/add-armcare-reference.mts,
   * :v4 — 같은 날 암케어 운동 30개의 근육, scripts/retag-armcare-muscles.mts,
   * :v5 — 같은 날 근육 넷(전면 삼각근·대흉근·상부 승모근·손가락 신전근)을 붙이고 암케어
   * 참고 영상 넷을 더함, 같은 두 스크립트, :v6 — 2026-09-27 유산소와 손가락 굽힘 암케어
   * 참고 영상, scripts/add-reference-exercises.mts, :v7 — 같은 날 그중 장비 목록에 없는
   * 도구를 쓰는 다섯을 숨기고, 우리 장비로 하는 유산소 둘(박스 오르내리기 · 셔틀 런 인터벌)을
   * 더함, :v8 — 2026-10-01 혼자 못 하는 · 특수 세팅 운동 여덟을 숨기고 장비 · 이름 · 설명을 고침,
   * scripts/library-cleanup-2026-10-01.mjs, :v9 — 2026-10-02 바벨 운동 여섯 설명에 랙 한 줄과
   * 영상과 다른 동작을 말하던 설명 70개를 영상에 맞춤, scripts/library-fixes-2026-10-02.mjs,
   * :v10 — 2026-10-03 팔 재활에 필요한 참고 영상 17개(암케어 14 · 모빌리티 스트레칭 3),
   * scripts/add-rehab-reference.mts, :v11 — 2026-10-04 암케어 검토: 고립 운동 20개를 상체 스트렝스(계열 고립)로 ·
   * 고무줄 둘 숨김 · 공 운동 넷을 플라이오볼로 · 톨 닐링 오버헤드 던지기를 파워로, scripts/library-armcare-review-2026-10-04.mjs,
   * :v12 — 같은 날 노르딕 햄스트링 · 리버스 노르딕 · 사이드 레터럴 레이즈를 계열 고립으로(하는 차례 검토),
   * scripts/library-isolation-retag-2026-10-04.mjs).
   *
   * 캐시는 시간으로 비워지지 않고, 배포해도 남는다 — 이름(과 함수 모양)이 같으면
   * 새 칸이 없는 옛 줄이 계속 나온다. 그대로 두면 암케어의 부위별 보강이 텅 비고
   * 오늘의 암케어가 루틴을 못 짠다. 관리자가 운동을 하나 저장해야(clearLibraryCache)
   * 풀리는데, 그것을 기다릴 일이 아니다.
   */
  /* :v30 — 2026-10-15 파워에 회전 메디신볼 던지기 6 · 한 발 점프 2 · 상체 플라이오 2(scripts/library-power-plyo-2026-10-15.mjs). */
  /* :v32 — 2026-10-16 회전 메디신볼 던지기 6개를 좌우 각각(perSide)으로 — 투수 파워의 던지기 양 */
  /* :v34 — 2026-10-16 불안정 지면 스냅다운을 '나중에 촬영'으로(scripts/library-later-snapdown-2026-10-16.mjs). */
  /* :v35 — 같은 날 백 페달도 '나중에 촬영'으로. */
  /* :v37 — 2026-10-17 촬영 영상 52개를 다듬은 판(앞뒤 빈 시간 · 작은 사람)으로 경로 바꿈(scripts/shoot-trim/apply.mjs). */
  /* :v38 — 2026-10-18 직접 찍은 영상과 어긋난 운동 43개의 설명 · 도구 · 좌우 · 버티기/횟수를 영상대로 고침. */
  /* :v39 — 같은 날 제목이 영상과 다른 넷(케이블 → 덤벨 셋 · TRX 로테이션) · 바텀업 캐리 설명을 영상대로. */
  /* :v40 — 2026-10-18 회전 운동 셋(케이블 와이드 스탠스 로테이션 · TRX 로테이션 · 케이블 안티 로테이션 홀드)을 좌우 따로로. */
  /* :v41 — 2026-10-18 그날 찍은 영상 93개 중 사람이 작은 6개를 잘라 키운 판으로 경로 바꿈(scripts/shoot-trim/apply.mjs). */
  /* :v42 — 같은 날 10-18 영상과 어긋난 운동 12개의 제목 · 도구 · 좌우 · 횟수 · 설명을 영상대로 고침(content-fix.mjs). */
  /* :v43 — 검토 반영: 사이드라잉 외회전 리바운드 도구를 다시 덤벨로(장비 목록은 '모두 있어야 함'이라 원판이면 덤벨만 가진 사람의 어깨 후방이 빈다). */
  /* :v48 — 2026-11-13 김민 운동영상 검수: 모빌리티 설명·제목, 중복 참고 영상, A-스킵 구도. */
  /* :v49 — 2026-11-16 암케어 어깨 후방 · 전방에서 자세만 다른 변형 8개를 숨김(scripts/library-armcare-hide-2026-11-16.mjs). */
  /* :v50 — 2026-11-16 워밍업 12 · 하체 10 · 상체 5 · 모빌리티 2를 더함(scripts/library-adds-2026-11-16.mjs) — 같은 날 v49 와 겹쳐 하나 더 올림. */
  /* :v51 — 2026-11-16 암케어 팔꿈치 후방 1 → 5: '나중에 촬영' 둘을 되돌리고 참고 영상 둘을 더함(scripts/library-elbow-back-2026-11-16.mjs). */
  /* :v52 — 2026-11-16 덤벨 벤트오버 로우를 더함(scripts/library-add-db-row-2026-11-16.mjs) — 덤벨만 있고 벤치가 없으면 '중간' 이상 로우가 0개였다. */
  /* :v53 — 2026-11-16 직접 찍은 영상 중 사람이 작은 운동 38개를 잘라 키운 판으로, 앞뒤 빈 시간이 긴 12개를 자른 판으로 경로 바꿈(scripts/shoot-trim/size/). */
  /* :v54 — 2026-11-20 김민 검수 암케어 설명 반영 후 캐시 갱신. */
  /* :v55 — 2026-11-20 암케어 참고 영상 추가 검수 문구 반영. */
  ['library:exercises:v55'],
  { tags: [LIBRARY_TAG] }
);

/*
 * EX-LOAD01 R1-04 — 관리자 뜻 설정(loadSemantics)은 위 목록과 따로 읽어 둔다(같은 이름표라 운동을 고치면 함께 비워진다).
 *
 * 왜 따로인가: 캐시는 배포를 넘어 남는다. 목록 안에 스위치에 따라 칸을 넣고 빼면, 꺼진 때 채운 목록이 켠 뒤에도(또는 그 반대로) 남아
 * 스위치와 다른 뜻으로 계약을 푼다. 그래서 스위치는 꺼낼 때마다(allExercises) 보고, 켜져 있을 때만 이 캐시를 부른다 — 꺼져 있으면
 * 이 함수가 한 번도 돌지 않아 loadSemantics 이름이 든 SQL 이 나가지 않는다. 날것(JSON)을 그대로 담는다 — 판 · 모양 판단은 쓰는 쪽
 * (lib/workout/load/semantics.ts readLoadSemantics)이 한다(모르는 판은 '미정').
 */
const storedSemanticsRows = unstable_cache(
  async (): Promise<[string, unknown][]> => readStoredSemanticsRows(prisma),
  ['library:load-semantics:v1'],
  { tags: [LIBRARY_TAG] }
);

/** 스키마 스위치 — lib/workout/load/server.ts loadStructured 와 같은 값(그 파일이 이 파일을 불러 서로 부르지 않게 여기 적는다, v2/gate.ts 와 같은 방식) */
function loadSchemaOn(): boolean {
  return process.env.WORKOUT_LOAD_SCHEMA === '1';
}

/** 운동마다 저장된 뜻 설정(날것) — 스위치가 꺼져 있으면 DB 를 묻지 않고 빈 지도 */
export async function storedLoadSemantics(): Promise<Map<string, unknown>> {
  if (!loadSchemaOn()) return new Map();
  return new Map(await storedSemanticsRows());
}

/**
 * 운동 전체 (숨긴 것 포함). 등록순으로 온다.
 *
 * 순서를 여기서 못박아 두는 것은, 쓰는 쪽마다 orderBy 를 따로 적으면 언젠가
 * 어긋나기 때문이다. 운동을 고르는 규칙이 등록순을 기준으로 로테이션을 돌린다.
 *
 * R1-04 — 스위치가 켜져 있으면 줄마다 loadSemantics(없으면 null)를 싣는다: 지금 장비 계약(lib/workout/load/server.ts currentContracts)과
 * 앞으로 얼리는 판(session-plan.ts freezeExercise)이 같은 뜻 설정을 쓰게. 꺼져 있으면 그 칸을 싣지 않는다(스키마를 합쳐 생성 클라이언트가
 * 칸을 고른 뒤에도 꺼진 동안은 쓰지 않게 뺀다).
 */
export async function allExercises(): Promise<CachedExercise[]> {
  const rows = await exerciseRows();
  if (!loadSchemaOn()) {
    if (rows.length === 0 || !('loadSemantics' in rows[0])) return rows;
    return rows.map(({ loadSemantics: _drop, ...rest }) => {
      void _drop;
      return rest;
    });
  }
  const stored = await storedLoadSemantics();
  return rows.map((r) => ({ ...r, loadSemantics: stored.get(r.id) ?? null }));
}

/** 드릴 전체. 화면에 나가는 순서 그대로 */
export const allGuides = unstable_cache(
  async (): Promise<CachedGuide[]> => {
    const rows = await prisma.mechanicsGuide.findMany({
      orderBy: [{ sortOrder: 'asc' }, { createdAt: 'asc' }],
    });
    return rows.map((r) => ({
      ...r,
      createdAt: r.createdAt.toISOString(),
      hiddenAt: iso(r.hiddenAt),
    }));
  },
  /*
   * :v2 — 2026-10-04 단계(stage) · 숨김(hiddenAt) 칸이 생기고 요소가 6가지로 바뀌었다
   * (scripts/mechanics-classify-2026-10-04.mjs). 이름이 같으면 새 칸 없는 옛 줄이 남아 숨긴 드릴이 계속 나온다.
   * :v3 — 같은 날 빈자리를 채우는 드릴 12개를 더했다(scripts/mechanics-add-drills-2026-10-04.mjs).
   * :v8 — 2026-10-09 겹치는 메디신볼 드릴 13개를 숨겼다(51 → 38).
   * :v9 — 같은 날 '스플릿 스탠스 발목 등척 밀기'를 운동 라이브러리 파워로 옮기고 '등척'을 '아이소메트릭'으로.
   * :v10 — 2026-10-14 드릴 37개를 '나중에 촬영'으로(scripts/drills-later-2026-10-14.mjs).
   * :v12 — 2026-10-16 주 요소 19묶음 · 새 분류 '근력 · 안정 드릴'(scripts/mechanics-reclass-2026-10-16.mjs).
   * :v13 — 2026-11-16 직접 찍은 드릴 22개(대부분 야외)를 잘라 키운 판으로 경로 바꿈(scripts/shoot-trim/size/apply.mjs).
   */
  ['library:guides:v16'],
  { tags: [LIBRARY_TAG] }
);

/** 숨기지 않은 드릴만 — 투구 드릴 영상 화면이 보는 목록('나중에 촬영' 칸도 보인다) */
export async function visibleGuides(): Promise<CachedGuide[]> {
  return (await allGuides()).filter((g) => g.hiddenAt == null);
}

/** 트레이닝이 고를 수 있는 드릴 — 숨긴 것과 '나중에 촬영'(영상 전)을 뺀다. 운동의 visibleExercises 와 같은 규칙 */
export async function trainingGuides(): Promise<CachedGuide[]> {
  return (await visibleGuides()).filter((g) => g.category !== LATER_CATEGORY);
}

/** 숨기지 않은 운동만. 새 일정에 나갈 수 있는 것들이다. '나중에 촬영'(영상 전)도 뺀다 — lib/categories.ts LATER_CATEGORY */
export async function visibleExercises(): Promise<CachedExercise[]> {
  return (await allExercises()).filter(
    (ex) => ex.hiddenAt == null && ex.category !== LATER_CATEGORY
  );
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
