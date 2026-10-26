/**
 * 직전 리포트와 견주기(2026-10-26 김민 — 3주 처방 대신 개선 드릴을 보이면서, '다시 찍어 견주기'의 기준을 처방 시작 때 숫자 → 바로 앞 리포트로).
 * 화면(웹 · 앱)이 그리는 모양 · 글과 견주기 셈(순수). 두 결과를 읽는 것은 서버 lib/pitch-lab-compare.ts, 비교 규칙은 compareAnalysis 그대로.
 */
import { compareAnalysis, type AnalysisSnapshot } from '@/lib/mechanics/comparison';

export type PreviousComparison = {
  reportId: string;
  /** 지난 분석을 요청한 때(ISO) */
  requestedAt: string;
  /** 숫자를 견줬나 — 아니면 reason 이 견주지 않은 까닭 */
  compared: boolean;
  reason: string | null;
  /** 양쪽 다 평가한 지표만(참고 · 확인 못 함은 빠진다) */
  rows: { key: string; element: string; label: string; before: number; after: number; delta: number; unit: '% 키' | '°' }[];
  note: string;
};

/** 숫자는 촬영 조건이 같을 때만 뜻이 있다 — 사용자가 확인해야 펴진다(전후 비교의 conditions 'same') */
export const PREV_CONFIRM = '지난번과 같은 자리 · 배율 · 세기로 찍었어요';

const num = (v: number) => `${v < 0 ? '−' : ''}${Math.abs(v).toFixed(1)}`;

/** 비교 칸 숫자 '키의 8.2% → 10.1%' — 드리프트는 키의 %, 드롭은 다리 길이의 %(비교 기록의 단위 칸은 둘 다 '% 키'), 나머지는 각도 */
export function compareRangeText(element: string, unit: '% 키' | '°', before: number, after: number): string {
  if (unit === '°') return `${num(before)}° → ${num(after)}°`;
  return `${element === '드롭' ? '다리 길이의' : '키의'} ${num(before)}% → ${num(after)}%`;
}

export function compareDeltaText(unit: '% 키' | '°', d: number): string {
  return `${d > 0 ? '+' : ''}${num(d)}${unit === '°' ? '°' : '%p'}`;
}

export const prevDateText = (iso: string) =>
  new Intl.DateTimeFormat('ko-KR', { timeZone: 'Asia/Seoul', month: 'long', day: 'numeric' }).format(new Date(iso));

/**
 * 지난 리포트(before) → 이번(after). 기준 등록 시각 = 지난 영상을 찍은 때(처방 전후 비교는 처방 시작 때) — 이번 영상이 그 뒤에 찍혔는지만 본다.
 * 같은 날 연달아 찍은 공도 견준다(한 구씩의 변화라 결론은 안 낸다 — note). 찍은 때를 모르면 지난 분석을 요청한 때. 촬영 조건은 화면이 묻는다('same').
 */
export function previousComparisonOf(
  prev: { reportId: string; requestedAt: string },
  before: AnalysisSnapshot,
  after: AnalysisSnapshot
): PreviousComparison {
  const shot = (before.context?.files ?? []).flatMap((f) => (f.at ? [f.at] : [])).sort().at(-1);
  const c = compareAnalysis({ ...before, savedAt: shot ?? prev.requestedAt }, after, 'same');
  const reason = c.reasons[0] ?? null;
  return {
    reportId: prev.reportId,
    requestedAt: prev.requestedAt,
    compared: c.kind === 'measurement',
    reason: c.kind === 'measurement' ? null : reason?.startsWith('기준 등록') ? '지난번 영상보다 먼저 찍은 영상이에요.' : reason,
    rows: c.rows.flatMap((r) =>
      r.delta === null || r.before === null || r.after === null
        ? []
        : [{ key: r.key, element: r.element, label: r.label, before: r.before, after: r.after, delta: r.delta, unit: r.unit }]
    ),
    note: c.note,
  };
}
