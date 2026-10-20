/**
 * 타격 기록 — 종류 · 검사 · 표시(2026-10-20 타격 1단계 T5, docs/designs/hitting-restructure.md).
 * 순수 함수만 — 서버 동작(app/actions/hitting-log.ts)과 시험(scripts/hitting-log-selftest.mts)이 같이 쓴다.
 * 투구 기록(PitchLog)과 같은 꼴이지만 1단계는 운동 엔진 부하에 넣지 않는다(D2).
 */

export const HITTING_TYPES = ['티배팅', '토스', '머신', '라이브', '경기'] as const;
export type HittingType = (typeof HITTING_TYPES)[number];

export const MAX_SWINGS = 1000;
export const MAX_MEMO = 1000;
/** 같은 날 · 같은 종류 · 같은 스윙 수를 이 안에 다시 보내면 새로 안 만든다(끊긴 응답에 다시 누름 — 투구 기록과 같은 2분) */
export const DUPLICATE_WINDOW_MS = 2 * 60 * 1000;

export type HittingInput = {
  date: string;
  sessionType: string;
  swings: number | string;
  effortPct?: number | string | null;
  memo?: string | null;
  satisfaction?: number | string | null;
};

export type HittingValue = {
  date: string;
  sessionType: HittingType;
  swings: number;
  effortPct: number | null;
  memo: string | null;
  satisfaction: number | null;
};

export function isHittingType(v: unknown): v is HittingType {
  return typeof v === 'string' && (HITTING_TYPES as readonly string[]).includes(v);
}

const DATE_KEY = /^\d{4}-\d{2}-\d{2}$/;

function toInt(v: unknown): number | null {
  if (v === null || v === undefined || v === '') return null;
  const n = typeof v === 'number' ? v : Number(String(v).trim());
  return Number.isInteger(n) ? n : NaN;
}

/** 입력을 검사해 저장할 값으로 — 오늘(today, YYYY-MM-DD)보다 뒤 날짜는 막는다 */
export function validateHitting(
  input: HittingInput,
  today: string
): { value: HittingValue } | { error: string; field: string } {
  const date = String(input.date ?? '').trim();
  if (!DATE_KEY.test(date) || Number.isNaN(Date.parse(`${date}T00:00:00Z`))) {
    return { error: '날짜가 올바르지 않아요.', field: 'date' };
  }
  if (date > today) return { error: '앞날의 기록은 남길 수 없어요.', field: 'date' };
  if (!isHittingType(input.sessionType)) return { error: '종류를 골라 주세요.', field: 'sessionType' };

  const swings = toInt(input.swings);
  if (swings === null || Number.isNaN(swings) || swings < 0 || swings > MAX_SWINGS) {
    return { error: `스윙 수는 0~${MAX_SWINGS} 사이로 적어 주세요.`, field: 'swings' };
  }

  const effort = toInt(input.effortPct);
  if (
    effort !== null &&
    (Number.isNaN(effort) || effort < 5 || effort > 100 || effort % 5 !== 0)
  ) {
    return { error: '체감 강도가 올바르지 않아요.', field: 'effortPct' };
  }

  const sat = toInt(input.satisfaction);
  if (sat !== null && (Number.isNaN(sat) || sat < 1 || sat > 5)) {
    return { error: '만족도가 올바르지 않아요.', field: 'satisfaction' };
  }

  const memoRaw = (input.memo ?? '').trim();
  if (memoRaw.length > MAX_MEMO) {
    return { error: `메모는 ${MAX_MEMO}자까지 적을 수 있어요.`, field: 'memo' };
  }

  return {
    value: {
      date,
      sessionType: input.sessionType,
      swings,
      effortPct: effort,
      memo: memoRaw || null,
      satisfaction: sat,
    },
  };
}

/** 목록 · 달력에 쓰는 한 줄 — '티배팅 120회 · 강도 7' */
export function hittingLine(log: { sessionType: string; swings: number; effortPct: number | null }): string {
  const parts = [`${log.sessionType} ${log.swings}회`];
  if (log.effortPct != null) parts.push(`강도 ${Math.round(log.effortPct / 10)}`);
  return parts.join(' · ');
}
