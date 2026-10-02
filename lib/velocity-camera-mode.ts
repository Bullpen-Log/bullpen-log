/**
 * 구속 측정 카메라의 화질 · 프레임 — 측정 화면 오른쪽 위 카메라 정보를 누르면 고른다(2026-10-03 사용자: "화질과 프레임을
 * 자유롭게 선택, 다만 측정용 카메라는 30프레임 이하 사용 못 하게").
 *
 * 30fps 는 공이 장면 사이에 1m 넘게 날아가 몇 장 안 찍혀 값이 크게 흔들린다 — 그래서 고르는 칸에서는 막는다(보이되 못 누름).
 * 고른 값은 기기마다 남는다(lib/velocity-setup.ts camMode). 카메라가 못 내는 조합이면 가장 가까운 것으로 켜지고, 그 결과가
 * 30fps 이하면 화면이 고르기 전으로 되돌린다.
 */

/** 고른 화질(짧은 변 픽셀) · 프레임 */
export type CamMode = { short: number; fps: number };

/** 카메라가 낼 수 있는 화질 하나 — 짧은 변 · 긴 변 · 그 화질의 최고 fps */
export type CamModeOption = { short: number; long: number; maxFps: number };

/** 측정 카메라의 가장 낮은 fps — 이보다 낮은 칸은 못 고른다(59.94 를 받게 59) */
export const MIN_MEASURE_FPS = 59;

/** 고르는 칸 — 30 은 보이되 막는다 */
export const FPS_CHOICES = [30, 60, 120, 240] as const;
export const SIZE_CHOICES = [720, 1080, 2160] as const;

/** 아무것도 안 골랐을 때(자동) — 엔진을 맞춘 조건 */
export const DEFAULT_CAM_MODE: CamMode = { short: 1080, fps: 60 };

export const sizeLabel = (short: number) => (short >= 2160 ? '4K' : `${short}p`);

export const camModeLabel = (m: CamMode) => `${sizeLabel(m.short)} · ${m.fps}fps`;

export const fpsAllowed = (fps: number) => fps >= MIN_MEASURE_FPS;

export function isCamMode(v: unknown): v is CamMode {
  if (!v || typeof v !== 'object') return false;
  const { short, fps } = v as Record<string, unknown>;
  return (
    typeof short === 'number' &&
    Number.isFinite(short) &&
    short >= 240 &&
    short <= 4320 &&
    typeof fps === 'number' &&
    Number.isFinite(fps) &&
    fpsAllowed(fps) &&
    fps <= 240
  );
}

/** 그 화질의 최고 fps — 목록에 없으면 null */
export function maxFpsFor(options: CamModeOption[], short: number): number | null {
  return options.find((o) => o.short === short)?.maxFps ?? null;
}

/**
 * 웹 카메라(getUserMedia)가 알려 주는 범위로 고를 수 있는 화질을 짐작한다 — 브라우저는 화질 · fps 의 조합을 알려 주지
 * 않아서 모든 화질에 같은 최고 fps 를 붙인다(못 내는 조합은 켜 본 뒤 실제 값으로 알린다).
 */
export function webCamOptions(
  caps: {
    width?: { max?: number };
    height?: { max?: number };
    frameRate?: { max?: number };
  } | null,
  current: { width: number; height: number; fps: number | null }
): CamModeOption[] {
  const curShort = Math.min(current.width, current.height);
  const curLong = Math.max(current.width, current.height);
  const w = caps?.width?.max;
  const h = caps?.height?.max;
  const fpsMax = caps?.frameRate?.max;
  if (!w || !h || !fpsMax) {
    return curShort > 0
      ? [{ short: curShort, long: curLong, maxFps: Math.round(current.fps ?? 30) }]
      : [];
  }
  const longMax = Math.max(w, h);
  const shortMax = Math.min(w, h);
  const out: CamModeOption[] = SIZE_CHOICES.filter(
    (s) => s <= shortMax + 1 && Math.round((s * 16) / 9) <= longMax + 1
  ).map((s) => ({
    short: s,
    long: Math.round((s * 16) / 9),
    maxFps: Math.round(fpsMax),
  }));
  if (curShort > 0 && !out.some((o) => o.short === curShort))
    out.push({ short: curShort, long: curLong, maxFps: Math.round(fpsMax) });
  return out.sort((a, b) => a.short - b.short);
}
