/**
 * 투구 분석 실험실(베타)의 샘플 정보 — 순수 함수(저장소를 모른다). 저장 · 목록은 lib/pitch-lab.ts.
 *
 * 2026-10-08 사용자: "3루(옆) · 2루(뒤)에서 동시에 찍으면 3D 분석이 되지 않을까 — 샘플을 올릴 공간을 만들어 줘".
 * 샘플 하나 = 옆 · 뒤 영상 짝 + 이 정보(meta.json). 분석은 샘플이 모인 뒤에 만든다.
 */

/**
 * 투구 분석 영상 한 개 한도 — 슬로모션(240fps)은 몇 초만 찍어도 50MB 를 넘어 이곳만 150MB(2026-10-09 사용자).
 * 저장소 버킷(pitch-videos) 한도도 150MB 로 올렸다 — 다른 올리기(투구 기록 · 구속 측정 · 라이브러리)는 서버가 50MB(lib/storage.ts)로 막는다.
 */
export const LAB_MAX_VIDEO_MB = 150;
export const LAB_MAX_VIDEO_BYTES = LAB_MAX_VIDEO_MB * 1024 * 1024;

export const LAB_VIEWS = ['side', 'back'] as const;
export type LabView = (typeof LAB_VIEWS)[number];

export const LAB_VIEW_LABELS: Record<LabView, string> = {
  side: '옆 · 3루 쪽',
  back: '뒤 · 2루 쪽',
};

/**
 * 옆 폰을 놓는 쪽 — 던지는 손의 앞(가슴 쪽)이 보이는 자리. 우투는 3루, 좌투는 1루(2026-10-15 김민: "좌투면 1루 · 2루에서").
 * 엔진은 폰 자리를 가정하지 않는다 — 앞은 골반이 나아간 길, 좌우는 던지는 손으로 잡는다(lib/pitch-3d/metrics.ts worldAxes).
 */
export type LabHand = 'R' | 'L';
export const labSideBase = (hand: LabHand) => (hand === 'L' ? '1루' : '3루');
/** 영상 칸 이름 — 옆은 던지는 손에 맞춘 쪽 */
export const labViewLabel = (view: LabView, hand: LabHand) =>
  view === 'side' ? `옆 · ${labSideBase(hand)} 쪽` : LAB_VIEW_LABELS.back;
/** 안내 글의 '3루'를 던지는 손에 맞춘다(안내 글은 우투 기준으로 적혀 있다 — lib/pitch-lab-guide.ts) */
export const forHand = (text: string, hand: LabHand) =>
  hand === 'L' ? text.replaceAll('3루', '1루') : text;
/** 가입 때 고른 던지는 손(User.throwingHand '우투' · '좌투' · '양투') → 실험실의 손. 모르면 우투 */
export const labHandOf = (throwingHand: string | null | undefined): LabHand =>
  throwingHand === '좌투' ? 'L' : 'R';

export type LabGround = 'mound' | 'flat';
export const LAB_GROUND_OPTIONS = [
  { value: 'mound', label: '마운드' },
  { value: 'flat', label: '평지' },
] as const;

export type LabFile = {
  name: string;
  size: number;
  fp?: string;
  /** 찍은 시각(ISO) */
  at?: string;
  /** 찍은 시각의 출처 — apple: 아이폰 녹화 시작 · mvhd: 파일 머리(기기마다 시작 또는 끝) */
  src?: 'apple' | 'mvhd';
  /** 영상 길이(초) */
  dur?: number;
};

export type LabMeta = {
  /** 같은 공을 두 대로 동시에 찍었는가 — 아니면 한 대로 옆 · 뒤를 나눠 찍은 것 */
  synced: boolean;
  /** 슬로모 초당 장수 — 모르면 null */
  slowmoFps: 120 | 240 | null;
  /** 원본이 아니라 재생 화면을 녹화한 것인가(실제 시간 비율이 영상마다 다를 수 있다) */
  screenRecorded: boolean;
  hand: 'R' | 'L';
  /**
   * 던진 곳 — 마운드면 3D 무대에 공식 규격 마운드를 놓고 발을 그 경사 위에 세운다(2026-10-08 사용자: "마운드와 평지 두 가지로").
   * 정보가 없는 옛 샘플은 마운드(그날까지 올린 샘플이 모두 마운드였다).
   */
  ground: LabGround;
  heightCm: number | null;
  /**
   * 폰에서 투수까지(m) — 옛 샘플의 한 칸(어느 폰인지 모른다). 2026-10-15 부터는 폰마다 distances 에 적고 이 칸은 null.
   */
  distanceM: number | null;
  /**
   * 폰마다 투수까지(m) — 적은 폰만(2026-10-15 사용자: "폰까지의 거리는 카메라 2대마다 — 1배 줌이어도 폰마다 크기가 다름").
   * 지금은 기록 · 표시만 한다(3D 계산은 두 영상으로 카메라 자리를 스스로 찾는다).
   */
  distances: Partial<Record<LabView, number>>;
  memo: string | null;
  /**
   * 올린 파일 이름 · 크기(분석 때 원본을 가려내려고) · 지문(lib/pitch-lab-guard.ts — 영상 탓으로 실패한 파일을 다시 안 돌리려고, 옛 샘플은 없다) ·
   * 찍은 시각 · 그 출처 · 길이(lib/pitch-lab-file.ts — 따로 찍은 짝을 서버가 한 번 더 막으려고, 2026-10-15 부터 · 못 읽었으면 없다)
   */
  files: Partial<Record<LabView, LabFile>>;
  /**
   * 샘플 종류 — 'marker' 는 몸에 스티커(마커)를 붙여 3~4대로 찍은 정답지용(2026-10-12 사용자: "마커 샘플이라고 다르게 표시해서
   * 기존 샘플과 다른 곳에"). 실험실 목록이 따로 모아 보이고, 같은 폴더에 ③ · ④ 카메라 영상(cam3.* · cam4.*)이 더 있을 수 있다.
   */
  kind: 'sample' | 'marker';
  createdAt: string;
};

const isFingerprint = (v: unknown): v is string =>
  typeof v === 'string' && /^[0-9a-f]{64}$/.test(v);

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
    const at = typeof f?.at === 'string' && Number.isFinite(Date.parse(f.at)) ? f.at : null;
    const dur = num(f?.dur, 0, 3600);
    if (name && size != null)
      files[view] = {
        name,
        size,
        ...(isFingerprint(f?.fp) ? { fp: f.fp } : {}),
        ...(at ? { at } : {}),
        ...(f?.src === 'apple' || f?.src === 'mvhd' ? { src: f.src } : {}),
        ...(dur != null ? { dur } : {}),
      };
  }
  const distances: LabMeta['distances'] = {};
  const rawDist = (v.distances && typeof v.distances === 'object' ? v.distances : {}) as Record<
    string,
    unknown
  >;
  for (const view of LAB_VIEWS) {
    const m = num(rawDist[view], 1, 60);
    if (m != null) distances[view] = m;
  }
  return {
    synced: v.synced !== false,
    slowmoFps: v.slowmoFps === 120 || v.slowmoFps === 240 ? v.slowmoFps : null,
    screenRecorded: v.screenRecorded !== false,
    hand: v.hand === 'L' ? 'L' : 'R',
    ground: v.ground === 'flat' ? 'flat' : 'mound',
    heightCm: num(v.heightCm, 120, 230),
    distanceM: num(v.distanceM, 1, 60),
    distances,
    memo: text(v.memo, 500),
    files,
    kind: v.kind === 'marker' ? 'marker' : 'sample',
    createdAt: typeof v.createdAt === 'string' ? v.createdAt : createdAt,
  };
}

/**
 * 카드의 작은 표시들 — '마운드 · 슬로모 240 · 오른손 · 키 182cm · 옆 5m · 뒤 4.5m'.
 * 동시 촬영 · 원본은 이제 늘 그래서(2026-10-15) 안 적고, 그렇지 않은 옛 샘플에만 '한 대로 나눠 찍음' · '화면 녹화'를 단다.
 */
export function labMetaChips(meta: LabMeta): string[] {
  const dist = LAB_VIEWS.filter((v) => meta.distances[v] != null).map(
    (v) => `${v === 'side' ? '옆' : '뒤'} ${meta.distances[v]}m`
  );
  return [
    ...(meta.kind === 'marker' ? ['마커'] : []),
    meta.ground === 'flat' ? '평지' : '마운드',
    ...(meta.synced ? [] : ['한 대로 나눠 찍음']),
    meta.slowmoFps ? `슬로모 ${meta.slowmoFps}` : '슬로모 모름',
    meta.hand === 'L' ? '왼손' : '오른손',
    ...(meta.screenRecorded ? ['화면 녹화'] : []),
    ...(meta.heightCm ? [`키 ${meta.heightCm}cm`] : []),
    ...(dist.length ? dist : meta.distanceM ? [`거리 ${meta.distanceM}m`] : []),
  ];
}

/**
 * 목록 카드의 한 줄 — 기본값(마운드 · 오른손)과 모름 · 키 · 거리는 빼고 다를 때만(2026-10-16 김민 "화면 글 많은 곳 줄여줘" —
 * 카드마다 '마운드 · 슬로모 모름 · 오른손 · 화면 녹화 · 키 180cm'가 똑같이 되풀이됐다). 전부는 결과 화면 머리(labMetaChips)에.
 */
export function labCardChips(meta: LabMeta): string[] {
  return [
    ...(meta.ground === 'flat' ? ['평지'] : []),
    ...(meta.synced ? [] : ['한 대로 나눠 찍음']),
    ...(meta.hand === 'L' ? ['왼손'] : []),
    ...(meta.screenRecorded ? ['화면 녹화'] : []),
  ];
}
