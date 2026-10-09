/**
 * 짧은 영상 컷 편집의 순수 계산 — 브라우저 · 노드 어디서나(lib/clip/edit.ts 가 쓰고, scripts/clip-selftest.mts 가 시험한다).
 *
 * 트레이닝 영상 촬영 모드(관리자)에서 아이폰으로 찍은 영상을 앞뒤로 잘라 소리 없이 올린다. 여기는 '얼마나 · 어떤 크기로'만
 * 정한다 — 실제 자르기는 edit.ts(mediabunny).
 */

/** 찍은 영상 하나의 모양 — 가로 · 세로는 회전을 적용한 뒤(세로로 찍었으면 세로가 길다) */
export type ClipInfo = {
  /** 길이(초) */
  duration: number;
  /** 첫 장면 시각(초) — 보통 0, 아이폰 영상은 가끔 0.0x */
  startTime: number;
  codec: string | null;
  width: number;
  height: number;
  rotation: 0 | 90 | 180 | 270;
  /** 초당 장면 수(평균) */
  fps: number;
  /** HDR(아이폰 12 이후 기본 촬영) — 그대로 넘기면 색이 바래 보여 일반 색으로 다시 그린다 */
  hdr: boolean;
  /** 이 브라우저가 이 영상을 풀 수 있나 — 못 풀면 다시 만들지 못하고 잘라 붙이기만 한다 */
  canDecode: boolean;
  /** 소리 트랙이 있었나 — 결과에는 늘 없다 */
  hasAudio: boolean;
  bytes: number;
};

/** 가장 짧게 자를 수 있는 길이(초) */
export const MIN_CLIP_SEC = 1;

/**
 * 올릴 수 있는 크기 — 저장소 한 파일 상한은 50MB(lib/storage.ts MAX_VIDEO_BYTES). 상자 · 끝맺음 몫을 남겨 48MB 로 맞춘다.
 */
export const CLIP_BUDGET_BYTES = 48 * 1024 * 1024;

/** 라이브러리 재생용 비트레이트(H.264) — 1080p 30 ≈ 6Mbps · 60 ≈ 8Mbps, 720p 30 ≈ 3.5 · 60 ≈ 5 */
const RATE = {
  p1080: { normal: 6_000_000, high: 8_000_000 },
  p720: { normal: 3_500_000, high: 5_000_000 },
} as const;

/** 짝수로 — H.264 는 가로 · 세로가 짝수여야 한다 */
export function even(n: number): number {
  return Math.max(2, Math.round(n / 2) * 2);
}

export type ClipTarget = {
  width: number;
  height: number;
  /** 비트 / 초 */
  bitrate: number;
  /** 원본보다 줄였나 */
  scaled: boolean;
  /** 긴 변 */
  longSide: 1920 | 1280;
};

/**
 * 결과 크기 고르기 — 긴 변 1920(1080p)이 기본, 길어서 48MB 를 넘길 것 같으면 1280(720p)으로. 원본보다 키우지는 않는다.
 * 비트레이트는 길이로 나눈 예산을 넘지 않게(상자 몫 8% 남김).
 */
export function pickTarget(
  info: Pick<ClipInfo, 'width' | 'height' | 'fps'>,
  seconds: number,
  budgetBytes = CLIP_BUDGET_BYTES,
  /** 다시 만들 때 — 처음 쓴 비트레이트를 넘은 비율만큼 낮춘 값(edit.ts exportMutedClip) */
  maxBitrate = Infinity
): ClipTarget {
  const fast = info.fps > 45;
  const want1080 = fast ? RATE.p1080.high : RATE.p1080.normal;
  const want720 = fast ? RATE.p720.high : RATE.p720.normal;
  const maxByBudget = Math.min(
    maxBitrate,
    Math.floor((budgetBytes * 8 * 0.92) / Math.max(seconds, 1))
  );
  const longSide: 1920 | 1280 = maxByBudget >= want1080 * 0.8 ? 1920 : 1280;
  const bitrate = Math.min(longSide === 1920 ? want1080 : want720, maxByBudget);
  const long = Math.max(info.width, info.height, 1);
  const scale = Math.min(1, longSide / long);
  return {
    width: even(info.width * scale),
    height: even(info.height * scale),
    bitrate,
    scaled: scale < 1,
    longSide,
  };
}

/** 예상 크기(바이트) — 비트레이트 × 길이 + 상자 몫 */
export function estimateBytes(bitrate: number, seconds: number): number {
  return Math.round((bitrate * seconds) / 8 + 64 * 1024);
}

/**
 * 자를 구간 다듬기 — 0 ~ 길이 안으로, 끝은 시작보다 MIN_CLIP_SEC 뒤. 손잡이를 끌 때 늘 이것을 거친다.
 * @param which 지금 끄는 손잡이 — 그쪽을 먼저 맞추고 다른 쪽은 밀리지 않는다(최소 길이를 못 지키면 끄는 쪽이 멈춘다)
 */
export function clampTrim(
  start: number,
  end: number,
  duration: number,
  which: 'start' | 'end' | null = null,
  minLen = MIN_CLIP_SEC
): { start: number; end: number } {
  const d = Math.max(0, duration);
  const min = Math.min(minLen, d);
  let s = Math.min(Math.max(0, start), d);
  let e = Math.min(Math.max(0, end), d);
  if (e - s < min) {
    if (which === 'start') s = Math.max(0, e - min);
    else if (which === 'end') e = Math.min(d, s + min);
    else {
      e = Math.min(d, s + min);
      s = Math.max(0, e - min);
    }
  }
  return { start: round3(s), end: round3(e) };
}

/** 처음 열 때의 구간 — 통째로. 찍은 뒤 바로 '올리기'를 눌러도 되게 */
export function initialTrim(duration: number): { start: number; end: number } {
  return clampTrim(0, duration, duration);
}

/** 손잡이 사이를 움직이는 단위(초) — 손가락으로는 0.1초면 충분하다 */
export function snapTime(t: number, step = 0.1): number {
  return round3(Math.round(t / step) * step);
}

function round3(n: number): number {
  return Math.round(n * 1000) / 1000;
}

/** 0:07.3 — 편집 화면의 시각 글자 */
export function clipTimeText(sec: number): string {
  const s = Math.max(0, sec);
  const m = Math.floor(s / 60);
  const rest = s - m * 60;
  return `${m}:${rest.toFixed(1).padStart(4, '0')}`;
}

/** 12.4MB · 830KB */
export function sizeText(bytes: number): string {
  if (bytes >= 1024 * 1024) return `${(bytes / 1024 / 1024).toFixed(1)}MB`;
  return `${Math.max(1, Math.round(bytes / 1024))}KB`;
}

/** 원본 화질 알림 — 웹 카메라로 찍으면 아이폰이 480×360 쯤으로 줄여 보낸다(WebKit). 라이브러리에 쓰기엔 작다 */
export function lowResolution(info: Pick<ClipInfo, 'width' | 'height'>): boolean {
  // 짧은 변 700px 아래 = 720p 보다 작다(웹 카메라 480×360, 옛 640×480)
  return Math.min(info.width, info.height) < 700;
}
