/**
 * ABS 설정 — 이 기기에만. 웹은 localStorage(components/abs/use-abs-session.ts), 새 앱은 앱 저장소(native velocity/abs/use-abs.ts) —
 * 이 파일은 둘이 같이 쓰는 순수한 몫만(브라우저 것을 섞으면 앱이 못 읽는다, shared-lib:test). 구속 측정 설정(lib/velocity-setup.ts)과 따로 둔다(엔진 파일을 안 건드리려고).
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
