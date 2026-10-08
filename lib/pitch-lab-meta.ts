/**
 * 투구 분석 실험실(베타)의 샘플 정보 — 순수 함수(저장소를 모른다). 저장 · 목록은 lib/pitch-lab.ts.
 *
 * 2026-10-08 사용자: "3루(옆) · 2루(뒤)에서 동시에 찍으면 3D 분석이 되지 않을까 — 샘플을 올릴 공간을 만들어 줘".
 * 샘플 하나 = 옆 · 뒤 영상 짝 + 이 정보(meta.json). 분석은 샘플이 모인 뒤에 만든다.
 */

export const LAB_VIEWS = ['side', 'back'] as const;
export type LabView = (typeof LAB_VIEWS)[number];

export const LAB_VIEW_LABELS: Record<LabView, string> = {
  side: '옆 · 3루 쪽',
  back: '뒤 · 2루 쪽',
};

export type LabMeta = {
  /** 같은 공을 두 대로 동시에 찍었는가 — 아니면 한 대로 옆 · 뒤를 나눠 찍은 것 */
  synced: boolean;
  /** 슬로모 초당 장수 — 모르면 null */
  slowmoFps: 120 | 240 | null;
  /** 원본이 아니라 재생 화면을 녹화한 것인가(실제 시간 비율이 영상마다 다를 수 있다) */
  screenRecorded: boolean;
  hand: 'R' | 'L';
  heightCm: number | null;
  /** 폰에서 투수까지(m) — 모르면 null */
  distanceM: number | null;
  memo: string | null;
  /** 올린 파일 이름 · 크기(분석 때 원본을 가려내려고) */
  files: Partial<Record<LabView, { name: string; size: number }>>;
  createdAt: string;
};

const UUID = /^[0-9a-f]{8}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{12}$/i;

/** 샘플 번호인가 — 저장소 경로에 들어가므로 이 모양만 받는다('..' 같은 것을 막는다) */
export function isLabId(id: unknown): id is string {
  return typeof id === 'string' && UUID.test(id);
}

export function isLabView(view: unknown): view is LabView {
  return view === 'side' || view === 'back';
}

const num = (v: unknown, min: number, max: number): number | null =>
  typeof v === 'number' && Number.isFinite(v) && v >= min && v <= max ? v : null;

const text = (v: unknown, max: number): string | null =>
  typeof v === 'string' && v.trim() ? v.trim().slice(0, max) : null;

/**
 * 받은 정보를 고른다 — 화면이 보낸 값(서버 동작)과 저장소에서 읽은 meta.json 둘 다 이것을 거친다.
 * 모양이 틀린 칸은 기본값으로, createdAt 은 부르는 쪽이 준다.
 */
export function readLabMeta(raw: unknown, createdAt: string): LabMeta {
  const v = (raw && typeof raw === 'object' ? raw : {}) as Record<string, unknown>;
  const files: LabMeta['files'] = {};
  const rawFiles = (v.files && typeof v.files === 'object' ? v.files : {}) as Record<
    string,
    unknown
  >;
  for (const view of LAB_VIEWS) {
    const f = rawFiles[view] as Record<string, unknown> | undefined;
    const name = text(f?.name, 200);
    const size = num(f?.size, 0, 10 * 1024 * 1024 * 1024);
    if (name && size != null) files[view] = { name, size };
  }
  return {
    synced: v.synced !== false,
    slowmoFps: v.slowmoFps === 120 || v.slowmoFps === 240 ? v.slowmoFps : null,
    screenRecorded: v.screenRecorded !== false,
    hand: v.hand === 'L' ? 'L' : 'R',
    heightCm: num(v.heightCm, 120, 230),
    distanceM: num(v.distanceM, 1, 60),
    memo: text(v.memo, 500),
    files,
    createdAt: typeof v.createdAt === 'string' ? v.createdAt : createdAt,
  };
}

/** 카드의 작은 표시들 — '동시 촬영 · 슬로모 240 · 오른손 · 화면 녹화' */
export function labMetaChips(meta: LabMeta): string[] {
  return [
    meta.synced ? '동시 촬영' : '한 대로 나눠 찍음',
    meta.slowmoFps ? `슬로모 ${meta.slowmoFps}` : '슬로모 모름',
    meta.hand === 'L' ? '왼손' : '오른손',
    meta.screenRecorded ? '화면 녹화' : '원본',
    ...(meta.heightCm ? [`키 ${meta.heightCm}cm`] : []),
    ...(meta.distanceM ? [`거리 ${meta.distanceM}m`] : []),
  ];
}
