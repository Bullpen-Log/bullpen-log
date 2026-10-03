/**
 * 구속 측정 카메라의 화질 · 프레임 — 측정 화면 오른쪽 위 카메라 정보를 누르면 고른다(2026-10-03 사용자: "화질과 프레임을
 * 자유롭게 선택").
 *
 * 60fps 아래(30fps)는 공이 장면 사이에 1m 넘게 날아가 몇 장 안 찍혀 값이 크게 흔들리거나 아예 안 잡힌다. 예전에는 막았는데
 * 사용자(2026-10-04): "경고는 띄우되 막지는 않게, 처음 고를 때부터 색을 다르게" — 고를 수 있되 주황색 · 경고 문구로 알린다.
 * 고른 값은 기기마다 남는다(lib/velocity-setup.ts camMode). 카메라가 못 내는 조합이면 가장 가까운 것으로 켜지고, 그 결과를
 * 그대로 알린다(예전에는 30fps 로 켜지면 고르기 전으로 되돌려 '1080 으로 안 넘어간다'로 보였다). 켜 보고 안 그 카메라의
 * 화질별 최고 fps 는 기기에 적어 두어 다음에 고를 때부터 보인다(noteCamLimit).
 */

/** 고른 화질(짧은 변 픽셀) · 프레임 */
export type CamMode = { short: number; fps: number };

/** 카메라가 낼 수 있는 화질 하나 — 짧은 변 · 긴 변 · 그 화질의 최고 fps */
export type CamModeOption = { short: number; long: number; maxFps: number };

/** 측정이 잘 되는 가장 낮은 fps — 이보다 낮으면 주황 경고(59.94 를 받게 59). 막지는 않는다 */
export const MIN_MEASURE_FPS = 59;

/** 60fps 아래를 고르거나 그렇게 켜졌을 때 — 시트 · 알림이 같은 말을 쓴다 */
export const LOW_FPS_WARNING =
  '60fps 아래는 측정이 잘 안 돼요. 공이 장면 사이에 1m 넘게 날아가 몇 장 안 찍혀서 구속이 크게 틀리거나 아예 안 잡힐 수 있어요.';

/** 고르는 칸 — 30 은 주황(측정 부정확) */
export const FPS_CHOICES = [30, 60, 120, 240] as const;
export const SIZE_CHOICES = [720, 1080, 2160] as const;

/** 아무것도 안 골랐을 때(자동) — 엔진을 맞춘 조건 */
export const DEFAULT_CAM_MODE: CamMode = { short: 1080, fps: 60 };

export const sizeLabel = (short: number) => (short >= 2160 ? '4K' : `${short}p`);

export const camModeLabel = (m: CamMode) => `${sizeLabel(m.short)} · ${m.fps}fps`;

/** 측정이 잘 되는 fps 인가 — 아니면 주황 경고(고르는 것은 막지 않는다) */
export const fpsGood = (fps: number) => fps >= MIN_MEASURE_FPS;

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
    fps >= 15 &&
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

/* ── 켜 보고 안 한계 — 브라우저는 화질 · fps 조합을 안 알려 줘서, 켜 본 결과를 기기에 적어 둔다 ── */

const LIMITS_KEY = 'bullpen-velocity-cam-limits';
type Limits = Record<string, Record<string, number>>;

function readLimits(): Limits {
  try {
    const raw = JSON.parse(localStorage.getItem(LIMITS_KEY) ?? '{}');
    return raw && typeof raw === 'object' ? (raw as Limits) : {};
  } catch {
    return {};
  }
}

/**
 * 켜 본 결과 — 카메라(label)가 그 화질(short)에서 낸 fps. asked 보다 낮게 나왔으면 '그 화질의 최고'로 적고, 더 높게 나온
 * 적이 있으면 그것을 지킨다(다른 때 더 냈으면 그게 한계가 아니다).
 */
export function noteCamLimit(
  label: string,
  short: number,
  askedFps: number,
  gotFps: number
) {
  if (!label || !(short > 0) || !(gotFps > 0)) return;
  try {
    const all = readLimits();
    const cam = (all[label] ??= {});
    const key = String(short);
    const prev = cam[key];
    if (gotFps >= askedFps - 2) {
      /* 고른 만큼 냈다 — 한계로 적어 둔 값이 그보다 낮으면 지운다 */
      if (prev != null && prev < gotFps) delete cam[key];
    } else {
      cam[key] = Math.max(prev ?? 0, Math.round(gotFps));
    }
    localStorage.setItem(LIMITS_KEY, JSON.stringify(all));
  } catch {
    /* 저장이 막혀도 고르기는 된다 */
  }
}

/** 고를 수 있는 화질에 켜 보고 안 한계를 덧씌운다 — 브라우저가 '최대 60'이라 해도 켜 보니 30 이었으면 30 */
export function withCamLimits(
  label: string,
  options: CamModeOption[]
): CamModeOption[] {
  if (!label) return options;
  const cam = readLimits()[label];
  if (!cam) return options;
  return options.map((o) => {
    const seen = cam[String(o.short)];
    return seen != null && seen < o.maxFps ? { ...o, maxFps: seen } : o;
  });
}
