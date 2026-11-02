/**
 * 투구 영상 비교의 시간 셈(순수 — React Native 없이, 시험 scripts/native-compare-selftest.mts).
 *
 * 시간은 셋을 가른다(설계 docs/designs/sinker-pitch-video-workbench-claude-prompt.md 6절):
 * - 재생 시간(presentation) — 재생기의 currentTime. 비교 · 탐색 · 기준 장면은 모두 이 축이다.
 * - 실제 촬영 시간(capture) — 슬로모션은 재생 1초가 실제 1/8초일 수 있다. 두 영상의 촬영 · 재생 장면 수를 알 때만 바꾼다.
 * - 초당 장면 수(nominal fps) — 재생기가 알린 평균값. 장면 간격 '한 걸음'의 짐작일 뿐 정확한 장면 시각(PTS)이 아니다.
 * 모르는 값은 null 로 남긴다(지어내지 않는다).
 */

export type Range = { start: number; end: number };
export type RelRange = { min: number; max: number };

/** 재생기 · 파일 머리에서 읽은 영상 정보 — 모르면 null */
export type MediaFacts = {
  durationSec: number | null;
  /** 저장된 장면 크기(회전 전) */
  width: number | null;
  height: number | null;
  /** 화면에 보이는 가로 ÷ 세로(회전 적용 뒤) */
  displayAspect: number | null;
  rotationDeg: 0 | 90 | 180 | 270 | null;
  codec: string | null;
  /** 재생기가 알린 평균 장면 수 */
  nominalFps: number | null;
  /** 실제로 찍은 초당 장면 수(슬로모션 원본 240 등) — 확인한 값만 */
  captureFps: number | null;
  /** 장면 간격이 고르나 — 모르면 null(가변 장면은 false) */
  constantRate: boolean | null;
  /** 'none' 일반 · 'edited' 사진 앱이 늦춰 내보낸 슬로모션 · 'unknown' 모름 */
  slowMotion: 'none' | 'edited' | 'unknown';
};

export const EMPTY_FACTS: MediaFacts = {
  durationSec: null,
  width: null,
  height: null,
  displayAspect: null,
  rotationDeg: null,
  codec: null,
  nominalFps: null,
  captureFps: null,
  constantRate: null,
  slowMotion: 'unknown',
};

const finitePos = (v: unknown): number | null => (typeof v === 'number' && Number.isFinite(v) && v > 0 ? v : null);
const ROT = new Set([0, 90, 180, 270]);

/** 바깥 값(재생기 · 저장 문서)을 사실 모양으로 — NaN · 음수 · 엉뚱한 회전은 모름(null) */
export function normalizeFacts(raw: Partial<Record<keyof MediaFacts, unknown>> | null | undefined): MediaFacts {
  if (!raw || typeof raw !== 'object') return { ...EMPTY_FACTS };
  const rot = typeof raw.rotationDeg === 'number' && ROT.has(((raw.rotationDeg % 360) + 360) % 360) ? (((raw.rotationDeg % 360) + 360) % 360) : null;
  const fps = finitePos(raw.nominalFps);
  const cap = finitePos(raw.captureFps);
  return {
    durationSec: finitePos(raw.durationSec),
    width: finitePos(raw.width),
    height: finitePos(raw.height),
    displayAspect: finitePos(raw.displayAspect),
    rotationDeg: rot as MediaFacts['rotationDeg'],
    codec: typeof raw.codec === 'string' && raw.codec.trim() ? raw.codec.trim().slice(0, 40) : null,
    nominalFps: fps != null && fps <= 1000 ? fps : null,
    captureFps: cap != null && cap <= 2000 ? cap : null,
    constantRate: typeof raw.constantRate === 'boolean' ? raw.constantRate : null,
    slowMotion: raw.slowMotion === 'none' || raw.slowMotion === 'edited' ? raw.slowMotion : 'unknown',
  };
}

/**
 * 재생 시간 → 실제 촬영 시간 비율. 일반 영상으로 확인된 것은 1, 늦춘 슬로모션은 재생 장면 수 ÷ 촬영 장면 수(240 을 30 으로 → 0.125),
 * 그 밖(모름 · 슬로모션인데 촬영 장면 수 모름)은 unknown — 그때 '실제 걸린 시간'은 보이지 않는다.
 */
export type CaptureMapping = { kind: 'realtime'; factor: 1 } | { kind: 'scaled'; factor: number } | { kind: 'unknown' };
export function captureMapping(f: MediaFacts): CaptureMapping {
  if (f.slowMotion === 'none') return { kind: 'realtime', factor: 1 };
  if (f.slowMotion === 'edited' && f.captureFps && f.nominalFps && f.captureFps > f.nominalFps) return { kind: 'scaled', factor: f.nominalFps / f.captureFps };
  return { kind: 'unknown' };
}

/** 재생 시간 길이를 실제 걸린 시간으로 — 바꿀 근거가 없으면 null */
export function realSeconds(presentationSec: number, m: CaptureMapping): number | null {
  if (!Number.isFinite(presentationSec)) return null;
  return m.kind === 'unknown' ? null : presentationSec * m.factor;
}

/** 다듬은 구간(없으면 영상 전체). 길이를 모르거나 구간이 비면 null */
export function trimmedRange(duration: number | null, trim: Range | null | undefined): Range | null {
  if (duration == null || !(duration > 0)) return null;
  if (!trim) return { start: 0, end: duration };
  const start = Math.max(0, Math.min(duration, trim.start));
  const end = Math.max(0, Math.min(duration, trim.end));
  return Number.isFinite(start) && Number.isFinite(end) && end > start ? { start, end } : null;
}

/** 기준 장면이 쓸 수 있는 값인가 — null 은 '안 짚음', 0 은 맞는 값. NaN · 범위 밖은 아니다 */
export function validAnchor(t: number | null, r: Range | null): t is number {
  return t != null && Number.isFinite(t) && r != null && t >= r.start && t <= r.end;
}

/**
 * 두 기준을 0 으로 둔 공통 상대 구간 — A = ma + t, B = mb + t 가 둘 다 다듬은 구간 안. 겹치지 않거나 기준이 틀리면 null.
 * (compare-math.commonRange 를 다듬은 구간까지 넓힌 것 — 다듬지 않으면 같은 값이다)
 */
export function offsetRange(ma: number | null, mb: number | null, ra: Range | null, rb: Range | null): RelRange | null {
  if (!validAnchor(ma, ra) || !validAnchor(mb, rb) || !ra || !rb) return null;
  const min = Math.max(ra.start - ma, rb.start - mb);
  const max = Math.min(ra.end - ma, rb.end - mb);
  return max > min ? { min, max } : null;
}

/** 시작점 기준(기준 장면 없이 처음끼리) — 다듬은 구간의 처음을 0 으로 */
export function startRange(ra: Range | null, rb: Range | null): RelRange | null {
  if (!ra || !rb) return null;
  const len = Math.min(ra.end - ra.start, rb.end - rb.start);
  return len > 0 ? { min: 0, max: len } : null;
}

/**
 * 장면 한 걸음 — 장면 간격이 고르다고 확인된 영상이면 그 한 장면(exact), 아니면 짐작(approx: 평균 장면 수 또는 1/30).
 * exact 라도 디코더가 그 장면을 정확히 보였다는 증명은 아니다 — 화면에는 '이전 · 다음 장면'이라고만 쓴다.
 */
export type StepInfo = { step: number; exact: boolean; fps: number | null };
export function stepInfo(f: Pick<MediaFacts, 'nominalFps' | 'constantRate'>): StepInfo {
  const fps = f.nominalFps;
  if (fps && fps >= 10 && fps <= 1000) return { step: 1 / fps, exact: f.constantRate === true, fps };
  return { step: 1 / 30, exact: false, fps: null };
}

/** 고른 장면 간격의 영상이면 가장 가까운 장면 시각으로(29.97 처럼 소수 장면 수 포함). 아니면 그대로 */
export function snapToFrame(t: number, s: StepInfo): number {
  if (!s.exact || !s.fps || !Number.isFinite(t)) return t;
  return Math.round(t * s.fps) / s.fps;
}

/** 다음 · 이전 장면 — exact 면 장면 격자로 옮긴 뒤 한 칸, 아니면 짐작 간격만큼 */
export function stepFrom(t: number, dir: 1 | -1, s: StepInfo, r: Range | null): number {
  const base = s.exact ? snapToFrame(t, s) : t;
  const next = base + dir * s.step;
  if (!r) return Math.max(0, next);
  return Math.min(r.end, Math.max(r.start, next));
}

/* ---- 함께 재생의 어긋남 ---- */

export const SYNC_TARGET_MS = 40;

export function percentile(values: readonly number[], p: number): number | null {
  const v = values.filter((x) => Number.isFinite(x)).map(Math.abs).sort((a, b) => a - b);
  if (!v.length) return null;
  const i = Math.min(v.length - 1, Math.max(0, Math.ceil((p / 100) * v.length) - 1));
  return v[i];
}

/**
 * 어긋남 표본(ms, 재생기 시간 알림 기준) → 맞춤 상태. 'measuring' 표본 부족 · 'close' 95% 가 목표(40ms)와 한 장면 안 · 'approx' 넘음.
 * 재생기 알림 값이라 화면에 실제로 보인 장면의 어긋남은 아니다(기기에서 따로 재야 한다) — 화면 글은 '대략'까지만.
 */
export type SyncQuality = { state: 'measuring' | 'close' | 'approx'; p95: number | null; n: number };
export function syncQuality(samplesMs: readonly number[], frameMs: number | null): SyncQuality {
  const n = samplesMs.length;
  const p95 = percentile(samplesMs, 95);
  if (n < 8 || p95 == null) return { state: 'measuring', p95, n };
  const budget = Math.max(SYNC_TARGET_MS, frameMs ?? 0);
  return { state: p95 <= budget ? 'close' : 'approx', p95, n };
}

/* ---- 동작 길이 맞춤(R36 — 실제 시간과 다른 축) ---- */

/**
 * 두 영상에서 같은 순서로 짚은 장면들(예: 무릎 최고 · 착지 · 릴리스)을 같은 자리에 오게 구간마다 늘이고 줄인다.
 * 정규화 축 u 는 0(첫 장면) ~ n−1(마지막 장면). 각 구간은 0.04초 이상 · 순서대로여야 한다(아니면 거절).
 * 이 축에서는 실제 걸린 시간 · 속도를 말하지 않는다 — 화면은 '동작 길이 맞춤 · 실제 시간과 다름'을 늘 보인다.
 */
export const MIN_PHASE_SEC = 0.04;
export type NormalizedMap = { a: number[]; b: number[] };
export type NormalizedError = 'tooFew' | 'lengthMismatch' | 'notIncreasing' | 'tooShort' | 'invalid';
export function buildNormalized(a: readonly number[], b: readonly number[]): { ok: true; map: NormalizedMap } | { ok: false; error: NormalizedError } {
  if (a.length !== b.length) return { ok: false, error: 'lengthMismatch' };
  if (a.length < 2) return { ok: false, error: 'tooFew' };
  for (const side of [a, b]) {
    for (let i = 0; i < side.length; i++) {
      if (!Number.isFinite(side[i]) || side[i] < 0) return { ok: false, error: 'invalid' };
      if (i > 0) {
        if (side[i] <= side[i - 1]) return { ok: false, error: 'notIncreasing' };
        if (side[i] - side[i - 1] < MIN_PHASE_SEC) return { ok: false, error: 'tooShort' };
      }
    }
  }
  return { ok: true, map: { a: [...a], b: [...b] } };
}

/** 정규화 축 u → 두 영상 시각(구간 안 선형). u 는 [0, n−1] 로 묶는다 */
export function normalizedTimes(m: NormalizedMap, u: number): { a: number; b: number } {
  const n = m.a.length;
  const x = Math.min(n - 1, Math.max(0, Number.isFinite(u) ? u : 0));
  const i = Math.min(n - 2, Math.floor(x));
  const f = x - i;
  return { a: m.a[i] + (m.a[i + 1] - m.a[i]) * f, b: m.b[i] + (m.b[i + 1] - m.b[i]) * f };
}

/** A 의 재생 시각 → 정규화 축 u(A 를 주인 시계로 쓸 때). 구간 밖은 끝으로 묶는다 */
export function normalizedOfA(m: NormalizedMap, ta: number): number {
  const n = m.a.length;
  if (ta <= m.a[0]) return 0;
  if (ta >= m.a[n - 1]) return n - 1;
  for (let i = 0; i < n - 1; i++) if (ta <= m.a[i + 1]) return i + (ta - m.a[i]) / (m.a[i + 1] - m.a[i]);
  return n - 1;
}

/** 구간마다 B 재생 속도 ÷ A 재생 속도(B 를 A 에 맞추려면 B 를 이만큼 빠르게) — 화면의 '늘임 ×1.3' 알림 */
export function phaseStretch(m: NormalizedMap): number[] {
  const out: number[] = [];
  for (let i = 0; i < m.a.length - 1; i++) out.push((m.b[i + 1] - m.b[i]) / (m.a[i + 1] - m.a[i]));
  return out;
}

/* ---- 표시 ---- */

/** '0:03.20' */
export function clock(sec: number | null): string {
  if (sec == null || !Number.isFinite(sec)) return '—';
  const s = Math.max(0, sec);
  const m = Math.floor(s / 60);
  return `${m}:${(s - m * 60).toFixed(2).padStart(5, '0')}`;
}

/** 길이 · 불확실성 → '0.42초 ±0.03초' (불확실성이 없으면 길이만, 길이 없으면 '—') */
export function durationText(sec: number | null, plusMinus: number | null): string {
  if (sec == null || !Number.isFinite(sec)) return '—';
  const digits = plusMinus != null && plusMinus < 0.01 ? 3 : 2;
  const base = `${sec.toFixed(digits)}초`;
  return plusMinus != null && plusMinus > 0 ? `${base} ±${plusMinus.toFixed(digits)}초` : base;
}

/** 비교 재생 속도 — 0.1 · 0.75 는 재생기에 따라 다를 수 있어 화면이 '지원 안 됨'을 알린다(재생기가 거절하면) */
export const COMPARE_RATES = [0.1, 0.25, 0.5, 0.75, 1] as const;
export type CompareRate = (typeof COMPARE_RATES)[number];
export const DEFAULT_RATE: CompareRate = 0.5;
export const rateLabel = (r: number) => `${r}×`;
export const isCompareRate = (r: unknown): r is CompareRate => typeof r === 'number' && (COMPARE_RATES as readonly number[]).includes(r);
