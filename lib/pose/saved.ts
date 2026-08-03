import type { PitchMetric } from '@/lib/pose/measure';

/**
 * 저장하는 폼 분석 결과의 형태와 검증.
 *
 * 영상 하나당 최신 분석 1개를 보관한다. 측면 촬영이 아니거나 인식이
 * 나쁜 분석은 애초에 저장 버튼이 뜨지 않지만(비교 오염 방지), 서버도
 * 값의 범위를 한 번 더 확인한다.
 */

export type SavedAnalysisInput = {
  pitchLogId: string;
  videoPath: string;
  throwingSide: 'left' | 'right';
  wristSide: 'left' | 'right';
  leadSide: 'left' | 'right';
  direction: 1 | -1;
  quality: number;
  coverage: number;
  kneeUpT: number | null;
  footPlantT: number | null;
  releaseT: number | null;
  kneeUpManualT: number | null;
  footPlantManualT: number | null;
  releaseManualT: number | null;
  metrics: PitchMetric[];
};

/** 페이지가 내려주는 저장된 분석 (비교·재표시용) */
export type SavedAnalysisView = Omit<SavedAnalysisInput, 'pitchLogId'> & {
  /** 해당 투구 기록 날짜 (YYYY-MM-DD) */
  date: string;
  updatedAt: string;
};

const SIDES = ['left', 'right'] as const;

const isSide = (v: unknown): v is 'left' | 'right' =>
  typeof v === 'string' && (SIDES as readonly string[]).includes(v);

const isRatio = (v: unknown): v is number =>
  typeof v === 'number' && Number.isFinite(v) && v >= 0 && v <= 1;

const isTimeOrNull = (v: unknown): v is number | null =>
  v === null || (typeof v === 'number' && Number.isFinite(v) && v >= 0 && v <= 3600);

/** 지표 하나의 모양 검사 — 서버에 이상한 JSON이 저장되는 것을 막는다. */
function isMetric(v: unknown): boolean {
  if (typeof v !== 'object' || v === null) return false;
  const m = v as Record<string, unknown>;
  return (
    typeof m.key === 'string' &&
    m.key.length <= 40 &&
    typeof m.label === 'string' &&
    m.label.length <= 40 &&
    typeof m.phase === 'string' &&
    ['kneeUp', 'footPlant', 'release'].includes(m.phase) &&
    (m.value === null || (typeof m.value === 'number' && Number.isFinite(m.value) && Math.abs(m.value) <= 1000)) &&
    (m.display === null || (typeof m.display === 'string' && m.display.length <= 60)) &&
    typeof m.confidence === 'number'
  );
}

export function validateSavedAnalysis(
  raw: unknown
): { error: string } | { value: SavedAnalysisInput } {
  if (typeof raw !== 'object' || raw === null) return { error: '잘못된 요청입니다.' };
  const r = raw as Record<string, unknown>;

  if (typeof r.pitchLogId !== 'string' || !r.pitchLogId) return { error: '기록 정보가 없습니다.' };
  if (typeof r.videoPath !== 'string' || !r.videoPath) return { error: '영상 정보가 없습니다.' };
  if (!isSide(r.throwingSide) || !isSide(r.wristSide) || !isSide(r.leadSide))
    return { error: '분석 값이 올바르지 않습니다.' };
  if (r.direction !== 1 && r.direction !== -1) return { error: '분석 값이 올바르지 않습니다.' };
  if (!isRatio(r.quality) || !isRatio(r.coverage)) return { error: '분석 값이 올바르지 않습니다.' };

  for (const k of ['kneeUpT', 'footPlantT', 'releaseT', 'kneeUpManualT', 'footPlantManualT', 'releaseManualT']) {
    if (!isTimeOrNull(r[k] ?? null)) return { error: '구간 값이 올바르지 않습니다.' };
  }

  if (!Array.isArray(r.metrics) || r.metrics.length === 0 || r.metrics.length > 12 || !r.metrics.every(isMetric))
    return { error: '지표 값이 올바르지 않습니다.' };

  return {
    value: {
      pitchLogId: r.pitchLogId,
      videoPath: r.videoPath,
      throwingSide: r.throwingSide as 'left' | 'right',
      wristSide: r.wristSide as 'left' | 'right',
      leadSide: r.leadSide as 'left' | 'right',
      direction: r.direction as 1 | -1,
      quality: r.quality as number,
      coverage: r.coverage as number,
      kneeUpT: (r.kneeUpT ?? null) as number | null,
      footPlantT: (r.footPlantT ?? null) as number | null,
      releaseT: (r.releaseT ?? null) as number | null,
      kneeUpManualT: (r.kneeUpManualT ?? null) as number | null,
      footPlantManualT: (r.footPlantManualT ?? null) as number | null,
      releaseManualT: (r.releaseManualT ?? null) as number | null,
      metrics: r.metrics as PitchMetric[],
    },
  };
}

/**
 * 두 분석의 지표 차이. 둘 다 측정된 항목만 비교한다.
 * 단위: 각도 지표는 °, 길이 지표(무릎 높이·스트라이드)는 %p.
 */
export type MetricDelta = {
  key: string;
  label: string;
  phase: string;
  current: number;
  previous: number;
  delta: number;
  unit: '°' | '%p';
};

const PCT_KEYS = new Set(['kneeLift', 'stride']);

export function compareMetrics(
  current: PitchMetric[],
  previous: PitchMetric[]
): MetricDelta[] {
  const out: MetricDelta[] = [];
  for (const m of current) {
    if (m.value == null) continue;
    const prev = previous.find((p) => p.key === m.key && p.phase === m.phase);
    if (!prev || prev.value == null) continue;
    const delta = Math.round((m.value - prev.value) * 10) / 10;
    out.push({
      key: m.key,
      label: m.label,
      phase: m.phase,
      current: m.value,
      previous: prev.value,
      delta,
      unit: PCT_KEYS.has(m.key) ? '%p' : '°',
    });
  }
  return out;
}
