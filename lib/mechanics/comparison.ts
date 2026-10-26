import type { PitchReport } from '@/lib/pitch-3d/v2/report';
import type { LabMeta } from '@/lib/pitch-lab-meta';

/** 비교 수치 정의의 버전. 엔진 정확도·최소 검출 변화량을 뜻하지 않는다. */
export const COMPARISON_METRICS = '2026-10-26-metrics';
export type AnalysisContext = {
  v: 1;
  jobId: string;
  requestedAt: string;
  engine: string;
  hand: 'R' | 'L';
  ground: 'mound' | 'flat';
  heightCm: number | null;
  synced: boolean;
  screenRecorded: boolean;
  slowmoFps: number | null;
  /** 서버가 원본 크기·앞뒤 바이트에서 읽은 지문. 클라이언트 입력값으로 채우지 않는다. */
  files: { view: 'side' | 'back'; fp: string; at: string | null; timeSource: 'apple' | 'mvhd' | null }[];
};
/** 분석 요청에서 이미 확인한 서버 파일 정보만 보존한다. 화면의 files.fp/at로 대체하지 않는다. */
export function contextForAnalysis(
  job: { jobId: string; requestedAt: string; engine: string },
  meta: LabMeta,
  server: Partial<
    Record<'side' | 'back', { fp: string; facts: { startMs: number | null; timeSource: 'apple' | 'mvhd' | null } | null }>
  > | null
): AnalysisContext {
  return {
    v: 1,
    ...job,
    hand: meta.hand,
    ground: meta.ground,
    heightCm: meta.heightCm,
    synced: meta.synced,
    screenRecorded: meta.screenRecorded,
    slowmoFps: meta.slowmoFps,
    files: (['side', 'back'] as const).flatMap((view) => {
      const f = server?.[view];
      if (!f) return [];
      const date = f.facts?.startMs == null ? null : new Date(f.facts.startMs);
      return [
        {
          view,
          fp: f.fp,
          at: date && Number.isFinite(date.getTime()) ? date.toISOString() : null,
          timeSource: f.facts?.timeSource ?? null,
        },
      ];
    }),
  };
}
export type AnalysisSnapshot = {
  source: 'verified' | 'changed' | 'unknown';
  v: 1;
  reportId: string;
  jobId: string;
  savedAt: string;
  resultDigest: string;
  engine: string | null;
  criteria: string;
  metricsVersion: string;
  context: AnalysisContext | null;
  youth: boolean;
  hasRx: boolean;
  rows: {
    key: string;
    element: string;
    label: string;
    value: number | null;
    unit: '% 키' | '°';
    quality: string;
    validation: string;
    applicability: string;
    confidence: number | null;
  }[];
};
export type ComparisonConditions = 'same' | 'different' | 'unknown';
export type ReviewChoice = 'maintain' | 'practice' | 'new';
export const REVIEW_CHOICES: Record<ReviewChoice, string> = {
  maintain: '현재 처방 유지',
  practice: '현재 단계에서 다시 연습',
  new: '새 리포트의 처방 검토',
};
export type MechanicsReview = {
  v: 1;
  id: string;
  baseline: AnalysisSnapshot;
  origin: 'start' | 'later';
  baselinePractice: number;
  followups: { snapshot: AnalysisSnapshot; conditions: ComparisonConditions; practice: number; linkedAt: string }[];
  decisions: { jobId: string; reportId: string; choice: ReviewChoice; on: string }[];
};
const iso = (v: unknown): v is string => typeof v === 'string' && Number.isFinite(Date.parse(v));
const obj = (v: unknown): v is Record<string, unknown> => !!v && typeof v === 'object' && !Array.isArray(v);
export function readAnalysisContext(raw: unknown): AnalysisContext | null {
  if (!obj(raw)) return null;
  const c = raw as unknown as AnalysisContext;
  if (
    c.v !== 1 ||
    typeof c.jobId !== 'string' ||
    !iso(c.requestedAt) ||
    typeof c.engine !== 'string' ||
    !['R', 'L'].includes(c.hand) ||
    !['mound', 'flat'].includes(c.ground) ||
    !(c.heightCm === null || (Number.isFinite(c.heightCm) && c.heightCm! > 0)) ||
    typeof c.synced !== 'boolean' ||
    typeof c.screenRecorded !== 'boolean' ||
    !(c.slowmoFps === null || Number.isFinite(c.slowmoFps)) ||
    !Array.isArray(c.files) ||
    c.files.length > 2 ||
    new Set(c.files.map((f) => f?.view)).size !== c.files.length ||
    !c.files.every(
      (f) =>
        f &&
        ['side', 'back'].includes(f.view) &&
        /^[a-f0-9]{64}$/.test(f.fp) &&
        (f.at === null || iso(f.at)) &&
        [null, 'apple', 'mvhd'].includes(f.timeSource)
    )
  )
    return null;
  return c;
}
export function readAnalysisSnapshot(raw: unknown): AnalysisSnapshot | null {
  if (!obj(raw)) return null;
  const s = raw as unknown as AnalysisSnapshot;
  if (
    !['verified', 'changed', 'unknown'].includes(s.source) ||
    s.v !== 1 ||
    typeof s.reportId !== 'string' ||
    typeof s.jobId !== 'string' ||
    !iso(s.savedAt) ||
    !/^[a-f0-9]{64}$/.test(s.resultDigest) ||
    !(s.engine === null || typeof s.engine === 'string') ||
    typeof s.criteria !== 'string' ||
    typeof s.metricsVersion !== 'string' ||
    typeof s.youth !== 'boolean' ||
    typeof s.hasRx !== 'boolean' ||
    !(s.context === null || readAnalysisContext(s.context)?.jobId === s.jobId) ||
    !Array.isArray(s.rows) ||
    s.rows.length > 6 ||
    new Set(s.rows.map((r) => r?.key)).size !== s.rows.length ||
    !s.rows.every(
      (r) =>
        r &&
        typeof r.key === 'string' &&
        typeof r.element === 'string' &&
        typeof r.label === 'string' &&
        (r.value === null || Number.isFinite(r.value)) &&
        ['% 키', '°'].includes(r.unit) &&
        typeof r.quality === 'string' &&
        typeof r.validation === 'string' &&
        typeof r.applicability === 'string' &&
        (r.confidence === null || (Number.isFinite(r.confidence) && r.confidence >= 0 && r.confidence <= 100))
    )
  )
    return null;
  return s;
}
export function readMechanicsReview(raw: unknown): MechanicsReview | null {
  if (!obj(raw)) return null;
  const r = raw as unknown as MechanicsReview;
  if (
    r.v !== 1 ||
    typeof r.id !== 'string' ||
    !readAnalysisSnapshot(r.baseline) ||
    !['start', 'later'].includes(r.origin) ||
    !Number.isInteger(r.baselinePractice) ||
    r.baselinePractice < 0 ||
    !Array.isArray(r.followups) ||
    !r.followups.every(
      (f) =>
        f &&
        readAnalysisSnapshot(f.snapshot) &&
        ['same', 'different', 'unknown'].includes(f.conditions) &&
        Number.isInteger(f.practice) &&
        f.practice >= 0 &&
        iso(f.linkedAt)
    ) ||
    !Array.isArray(r.decisions) ||
    !r.decisions.every(
      (d) => d && typeof d.jobId === 'string' && typeof d.reportId === 'string' && Object.hasOwn(REVIEW_CHOICES, d.choice) && iso(d.on)
    )
  )
    return null;
  return r;
}
export function snapshotRows(report: PitchReport): AnalysisSnapshot['rows'] {
  return report.items.map((i) => ({
    key: i.key,
    element: i.element,
    label: i.valueLabel ?? i.element,
    value: i.gauge ? i.gauge.value * (['드리프트', '드롭'].includes(i.element) ? 100 : 1) : null,
    unit: ['드리프트', '드롭'].includes(i.element) ? '% 키' : '°',
    quality: i.measurement.quality,
    validation: i.measurement.validation,
    applicability: i.measurement.applicability,
    confidence:
      i.measurement.confidence !== null &&
      Number.isFinite(i.measurement.confidence) &&
      i.measurement.confidence >= 0 &&
      i.measurement.confidence <= 100
        ? i.measurement.confidence
        : null,
  }));
}
export const COMPARISON_NOTE =
  '한 구씩 비교한 수치 변화예요. 반복 측정 오차와 최소 검출 변화량이 검증되지 않아 개선·악화나 운동 효과를 확정하지 않아요.';
export const baselineReady = (s: AnalysisSnapshot) =>
  s.source === 'verified' &&
  !!s.engine &&
  !!s.context &&
  s.context.files.length === 2 &&
  s.context.files.every((f) => f.at && f.timeSource === 'apple') &&
  s.context.synced &&
  !s.context.screenRecorded;
export function compareAnalysis(before: AnalysisSnapshot, after: AnalysisSnapshot, conditions: ComparisonConditions) {
  const reasons: string[] = [];
  const a = before.context,
    b = after.context;
  const sameFiles = !!a && !!b && a.files.some((f) => b.files.some((g) => g.fp === f.fp));
  const recomputation = (before.reportId === after.reportId && before.jobId === after.jobId) || sameFiles;
  if (recomputation) reasons.push('같은 영상의 재계산이거나 원본 한쪽이 같아요. 새로운 투구의 전후 변화로 비교하지 않아요.');
  if (before.source !== 'verified' || after.source !== 'verified')
    reasons.push(
      before.source === 'changed' || after.source === 'changed'
        ? '분석 당시와 원본 파일이 달라 직접 비교를 보류해요.'
        : '분석 당시 원본 파일을 확인하지 못해 비교를 보류해요.'
    );
  if (!before.engine || !after.engine || before.engine !== after.engine) reasons.push('분석 엔진 버전이 다르거나 확인되지 않아요.');
  if (before.criteria !== after.criteria || before.metricsVersion !== after.metricsVersion)
    reasons.push('판정·수치 정의 버전이 달라 직접 비교하지 않아요.');
  if (!a || !b || a.files.length !== 2 || b.files.length !== 2) reasons.push('분석 당시 원본·촬영 조건 기록이 부족해요.');
  if (a && b) {
    if (
      a.hand !== b.hand ||
      a.ground !== b.ground ||
      a.heightCm !== b.heightCm ||
      before.youth !== after.youth ||
      a.slowmoFps !== b.slowmoFps
    )
      reasons.push('던지는 손·지면·키·성장기 적용 또는 촬영 속도 조건이 달라요.');
    if (!a.synced || !b.synced || a.screenRecorded || b.screenRecorded) reasons.push('동시 촬영 원본 조건을 확인하지 못했어요.');
    const times = (c: AnalysisContext) => c.files.flatMap((f) => (f.timeSource === 'apple' && f.at ? [Date.parse(f.at)] : []));
    const at = times(a),
      bt = times(b);
    if (at.length !== 2 || bt.length !== 2) reasons.push('실제 녹화 시작 시각을 확인하지 못해 촬영 순서를 비교할 수 없어요.');
    else if (Math.max(...at) > Date.parse(a.requestedAt) || Math.max(...bt) > Date.parse(b.requestedAt))
      reasons.push('녹화 시각이 분석 요청보다 미래라 촬영 순서를 확인할 수 없어요.');
    else if (Math.min(...bt) <= Math.max(...at) || Math.min(...bt) <= Date.parse(before.savedAt))
      reasons.push('기준 등록 이후에 새로 촬영한 영상이 아니에요.');
  }
  if (conditions !== 'same')
    reasons.push(
      conditions === 'different' ? '촬영 위치·배율·투구 세기가 달랐다고 확인했어요.' : '촬영 위치·배율·투구 세기가 같았는지 확인해 주세요.'
    );
  const rows = before.rows.map((x) => {
    const y = after.rows.find((r) => r.key === x.key);
    let reason = reasons[0] ?? null;
    if (!reason && (!y || x.label !== y.label || x.unit !== y.unit)) reason = '같은 지표가 양쪽 결과에 없어요.';
    if (!reason && (x.value === null || y!.value === null || x.quality !== 'sufficient' || y!.quality !== 'sufficient'))
      reason = '양쪽 측정 신뢰도가 충분하지 않아요.';
    if (
      !reason &&
      (x.validation !== 'supported' || y!.validation !== 'supported' || x.applicability !== 'supported' || y!.applicability !== 'supported')
    )
      reason = '검증 중이거나 적용 조건 밖인 참고 지표예요.';
    return {
      key: x.key,
      element: x.element,
      label: x.label,
      before: x.value,
      after: y?.value ?? null,
      unit: x.unit,
      delta: reason ? null : y!.value! - x.value!,
      reason,
    };
  });
  if (!reasons.length && !rows.some((r) => r.delta !== null)) reasons.push('양쪽에서 비교 가능한 검증 지표가 없어요.');
  return {
    kind: recomputation ? ('recomputation' as const) : reasons.length ? ('held' as const) : ('measurement' as const),
    reasons,
    rows,
    note: COMPARISON_NOTE,
  };
}
export function addFollowup(
  review: MechanicsReview,
  snapshot: AnalysisSnapshot,
  conditions: ComparisonConditions,
  practice: number,
  now: string
): MechanicsReview | { error: string } {
  if (!['same', 'different', 'unknown'].includes(conditions)) return { error: '촬영 조건을 확인해 주세요.' };
  const found = review.followups.find((f) => f.snapshot.jobId === snapshot.jobId && f.snapshot.reportId === snapshot.reportId);
  if (found)
    return found.snapshot.resultDigest !== snapshot.resultDigest
      ? { error: '같은 분석 번호의 결과 내용이 바뀌었어요. 연결을 보류해요.' }
      : found.conditions !== conditions
        ? { error: '이미 연결한 결과의 촬영 조건 응답은 유지해요.' }
        : review;
  if (review.baseline.jobId === snapshot.jobId && review.baseline.reportId === snapshot.reportId)
    return { error: '기준 분석 자체는 재측정으로 연결하지 않아요.' };
  return { ...review, followups: [...review.followups, { snapshot, conditions, practice, linkedAt: now }] };
}
export function reviewView(review: MechanicsReview) {
  return {
    ...review,
    followups: review.followups.map((f) => ({ ...f, comparison: compareAnalysis(review.baseline, f.snapshot, f.conditions) })),
  };
}
export type MechanicsReviewView = ReturnType<typeof reviewView>;
export const reviewDate = (iso: string) =>
  new Intl.DateTimeFormat('ko-KR', {
    timeZone: 'Asia/Seoul',
    year: 'numeric',
    month: '2-digit',
    day: '2-digit',
    hour: '2-digit',
    minute: '2-digit',
    hour12: false,
  }).format(new Date(iso));
