/** Shared web/native entry and device-scale rules for the pitch-reading scene. */
export const PITCH_READING_NATIVE_LEVEL = 12;
export const PITCH_READING_SCENE = '/pitch-reading/index.html';
export const PITCH_READING_DISPLAY_KEY = 'pitch-reading-display-v1';
export type PitchDisplay = {
  cssPixelsPerCm: number;
  viewDistanceCm: number;
  source: 'device' | 'card' | 'estimated';
  version: string;
};

/** Published Apple pixel densities; unknown devices keep the visible estimate/card fallback. */
export function iphonePpi(modelName: string | null): number | null {
  if (!modelName) return null;
  if (/^iPhone (12 Pro Max|13 Pro Max|14 Plus)$/.test(modelName)) return 458;
  if (/^iPhone (12|13) mini$/.test(modelName)) return 476;
  if (/^iPhone (12|13|14|15|16)( Pro)?( Max| Plus)?$/.test(modelName)) return 460;
  if (/^iPhone (X|XS|XS Max|11 Pro|11 Pro Max)$/.test(modelName)) return 458;
  if (/^iPhone (XR|11|SE(?: \(.+\))?|[6-8]s?)$/.test(modelName)) return 326;
  return null;
}
export function devicePitchDisplay(
  modelName: string | null,
  pixelRatio: number
): PitchDisplay | null {
  const ppi = iphonePpi(modelName);
  return ppi && Number.isFinite(pixelRatio) && pixelRatio > 0
    ? {
        cssPixelsPerCm: ppi / pixelRatio / 2.54,
        viewDistanceCm: 35,
        source: 'device',
        version: 'physical-window-1',
      }
    : null;
}
export function isPitchDisplay(value: unknown): value is PitchDisplay {
  if (!value || typeof value !== 'object') return false;
  const d = value as PitchDisplay;
  return (
    Number.isFinite(d.cssPixelsPerCm) &&
    d.cssPixelsPerCm >= 10 &&
    d.cssPixelsPerCm <= 200 &&
    Number.isFinite(d.viewDistanceCm) &&
    d.viewDistanceCm >= 25 &&
    d.viewDistanceCm <= 100 &&
    ['device', 'card', 'estimated'].includes(d.source) &&
    d.version === 'physical-window-1'
  );
}
/** Bound bridge payloads; the scene owns scoring and the server DB is not involved. */
export function isPitchHistory(value: unknown): value is Record<string, unknown>[] {
  return (
    Array.isArray(value) &&
    value.length <= 30 &&
    value.every(
      (s) =>
        s &&
        typeof s === 'object' &&
        typeof s.id === 'string' &&
        typeof s.engineVersion === 'string' &&
        Array.isArray(s.trials) &&
        s.trials.length <= 10 &&
        (s.eye === 'R' || s.eye === 'L')
    )
  );
}

/** Inline boot data must not terminate the trusted script tag. */
export function embedPitchScene(html: string, boot: unknown): string {
  return html.replace(
    '<head>',
    `<head><script>window.__SINKER_PITCH__=${JSON.stringify(boot).replace(/</g, '\\u003c')};</script>`
  );
}
