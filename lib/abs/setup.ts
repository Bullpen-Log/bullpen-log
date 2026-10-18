/**
 * ABS 설정 — 이 기기에만(localStorage). 구속 측정 설정(lib/velocity-setup.ts)과 따로 둔다(엔진 파일을 안 건드리려고).
 * 신장: 숫자 또는 '평균 신장'(AVERAGE_HEIGHT_CM) — 평균을 고르면 '다음 타자' 뒤에도 그대로 유지(사용자 결정 2026-10-18).
 */
import { AVERAGE_HEIGHT_CM, DEFAULT_RULE, HEIGHT_MAX_CM, HEIGHT_MIN_CM, type RuleSetId } from './rules.ts';

export const ABS_SETUP_KEY = 'bullpen-abs-setup';

export type AbsSetup = {
  /** 켜져 있나(구속 측정 세션 종류가 ABS) */
  on: boolean;
  rule: RuleSetId;
  /** 'average' 면 평균 신장 */
  height: number | 'average';
  savedAt: string;
};

export const DEFAULT_ABS_SETUP: Omit<AbsSetup, 'savedAt'> = { on: false, rule: DEFAULT_RULE, height: 'average' };

export function heightCmOf(h: number | 'average'): number {
  return h === 'average' ? AVERAGE_HEIGHT_CM : Math.min(HEIGHT_MAX_CM, Math.max(HEIGHT_MIN_CM, Math.round(h)));
}

export function loadAbsSetup(): AbsSetup {
  if (typeof window === 'undefined') return { ...DEFAULT_ABS_SETUP, savedAt: '' };
  try {
    const raw = window.localStorage.getItem(ABS_SETUP_KEY);
    if (!raw) return { ...DEFAULT_ABS_SETUP, savedAt: '' };
    const p = JSON.parse(raw) as Partial<AbsSetup>;
    return {
      on: p.on === true,
      rule: p.rule === 'mlb-2026' ? 'mlb-2026' : DEFAULT_RULE,
      height: p.height === 'average' ? 'average' : typeof p.height === 'number' && Number.isFinite(p.height) ? heightCmOf(p.height) : 'average',
      savedAt: typeof p.savedAt === 'string' ? p.savedAt : '',
    };
  } catch {
    return { ...DEFAULT_ABS_SETUP, savedAt: '' };
  }
}

export function saveAbsSetup(s: Omit<AbsSetup, 'savedAt'>): AbsSetup {
  const out: AbsSetup = { ...s, savedAt: new Date().toISOString() };
  try {
    window.localStorage.setItem(ABS_SETUP_KEY, JSON.stringify(out));
  } catch {
    /* 저장 못 해도 이번 세션은 돈다 */
  }
  return out;
}
