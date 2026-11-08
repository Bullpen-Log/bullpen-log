import { shiftDateKey } from '@/lib/pitch-stats';

/** 12주와 바로 앞 12주. 분석 기준일까지 읽으며 미래 기록은 포함하지 않는다. */
export const ANALYSIS_SERIES_DAYS = 168;
export const analysisWindow = (date: string) => ({
  from: shiftDateKey(date, -(ANALYSIS_SERIES_DAYS - 1)),
  to: date,
});

export type AnalysisPeriod = '4w' | '12w' | 'custom';
export type AnalysisRange = { from: string; to: string };
const validDay = (value: unknown): value is string =>
  typeof value === 'string' &&
  /^\d{4}-\d{2}-\d{2}$/.test(value) &&
  Number.isFinite(Date.parse(value + 'T12:00:00Z')) &&
  new Date(value + 'T12:00:00Z').toISOString().slice(0, 10) === value;

export function readAnalysisRange(raw: unknown, earliest: string, asOf: string): { period: AnalysisPeriod; custom: AnalysisRange } {
  const fallback = { from: shiftDateKey(asOf, -27), to: asOf };
  if (!raw || typeof raw !== 'object') return { period: '4w', custom: fallback };
  const saved = raw as Record<string, unknown>;
  const valid = validDay(saved.from) && validDay(saved.to) && saved.from >= earliest && saved.from <= saved.to && saved.to <= asOf;
  const custom = valid ? { from: saved.from as string, to: saved.to as string } : fallback;
  const period = saved.period === '12w' ? '12w' : saved.period === 'custom' && valid ? 'custom' : '4w';
  return { period, custom };
}
