import type { StageTest, StageTestInput } from '@/lib/armcare/rehab';

/**
 * 단계 시험에 적는 것(가이드라인 9절) — 웹 시트(app/(app)/training/rehab-sheets.tsx)와 앱 화면(native/src/app/rehab-test.tsx ·
 * rehab-weekly.tsx)이 같이 쓴다. 칸은 글자 그대로 쥐고, 판정할 때 숫자로 바꾼다.
 */

export const YES_NO = [
  { value: 'yes', label: '예' },
  { value: 'no', label: '아니요' },
] as const;

/** 숫자 칸 → 숫자(비었거나 숫자가 아니면 null) */
export function num(text: string): number | null {
  const t = text.trim();
  if (t === '') return null;
  const n = Number(t);
  return Number.isFinite(n) && n >= 0 ? n : null;
}

export type StageTestDraft = {
  painFree: string | null;
  similar: string | null;
  injured: string;
  other: string;
  pain: number | null;
  ckcFirst: string;
  ckcNow: string;
};

export function emptyStageTestDraft(ckcFirst: number | null = null): StageTestDraft {
  return {
    painFree: null,
    similar: null,
    injured: '',
    other: '',
    pain: null,
    ckcFirst: ckcFirst == null ? '' : String(ckcFirst),
    ckcNow: '',
  };
}

/** 적은 것 → 판정 입력 */
export function stageTestInput(test: StageTest, d: StageTestDraft): StageTestInput {
  return test.kind === 'rom'
    ? {
        painFree: d.painFree == null ? undefined : d.painFree === 'yes',
        similar: d.similar == null ? undefined : d.similar === 'yes',
      }
    : {
        injured: num(d.injured) ?? undefined,
        other: num(d.other) ?? undefined,
        pain: d.pain ?? undefined,
        ckcNow: num(d.ckcNow),
        ckcFirst: num(d.ckcFirst),
      };
}

/** 판정할 만큼 적었나 — 팔굽혀 터치는 없어도 된다(처음이면 오늘 기록만) */
export function stageTestFilled(test: StageTest, d: StageTestDraft): boolean {
  return test.kind === 'rom'
    ? d.painFree != null && d.similar != null
    : num(d.injured) != null && num(d.other) != null && d.pain != null;
}
