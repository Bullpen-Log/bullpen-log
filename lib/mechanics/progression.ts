import type { ElementRx } from '@/lib/pitch-3d/v2/report';

export const SKILL_PROTOCOL = '2026-10-26-skill' as const;
export const SKILL_STAGES = ['기초', '연결', '통합'] as const;
export type SkillStage = (typeof SKILL_STAGES)[number];
export type SkillAnswer = 'yes' | 'no' | 'unknown';
export type SkillFeedback = { quality: SkillAnswer; transferred: SkillAnswer };
export type SkillEvidence = {
  id: string;
  fault: string;
  stage: SkillStage;
  on: string;
  quality: SkillAnswer;
  transferred: SkillAnswer;
  during: 'clear' | 'pain';
  nextDay: 'clear' | 'pain' | 'unknown';
  responseOn: string | null;
  /** 자가 확인은 3D 측정·임상 검증과 구분한다. */
  source: 'self';
};
export type SkillProgression = {
  protocol: typeof SKILL_PROTOCOL;
  id: string;
  elements: { fault: string; stage: SkillStage; finished: boolean; reviewFrom?: number }[];
  evidence: SkillEvidence[];
  moves: { id: string; fault: string; from: SkillStage; on: string }[];
  previous?: { done: number; stages: { fault: string; stage: SkillStage }[] };
};
const validDay = (v: unknown): v is string =>
  typeof v === 'string' && /^\d{4}-\d{2}-\d{2}$/.test(v) && Number.isFinite(Date.parse(v)) && new Date(v).toISOString().slice(0, 10) === v;
const answer = (v: unknown): v is SkillAnswer => v === 'yes' || v === 'no' || v === 'unknown';
export function skillFeedback(value: unknown): SkillFeedback | null {
  const v = value as SkillFeedback | null;
  return v && answer(v.quality) && answer(v.transferred) ? { quality: v.quality, transferred: v.transferred } : null;
}
export function readProgression(raw: unknown, rx: ElementRx[]): SkillProgression | null {
  if (!raw || typeof raw !== 'object') return null;
  const v = raw as SkillProgression;
  if (
    v.protocol !== SKILL_PROTOCOL ||
    typeof v.id !== 'string' ||
    !Array.isArray(v.elements) ||
    v.elements.length !== rx.length ||
    new Set(v.elements.map((e) => e?.fault)).size !== rx.length ||
    !rx.every((r) =>
      v.elements.some(
        (e) =>
          e &&
          e.fault === r.fault &&
          SKILL_STAGES.includes(e.stage) &&
          typeof e.finished === 'boolean' &&
          (e.reviewFrom === undefined || (Number.isInteger(e.reviewFrom) && e.reviewFrom >= 0 && e.reviewFrom <= v.evidence?.length))
      )
    ) ||
    !Array.isArray(v.evidence) ||
    !v.evidence.every(
      (e) =>
        e &&
        typeof e.id === 'string' &&
        rx.some((r) => r.fault === e.fault) &&
        SKILL_STAGES.includes(e.stage) &&
        validDay(e.on) &&
        answer(e.quality) &&
        answer(e.transferred) &&
        (e.during === 'clear' || e.during === 'pain') &&
        ['clear', 'pain', 'unknown'].includes(e.nextDay) &&
        (e.responseOn === null || validDay(e.responseOn)) &&
        e.source === 'self'
    ) ||
    !Array.isArray(v.moves) ||
    !v.moves.every(
      (m) => m && typeof m.id === 'string' && typeof m.fault === 'string' && SKILL_STAGES.includes(m.from) && typeof m.on === 'string'
    )
  )
    return null;
  return v;
}
export function newProgression(id: string, rx: ElementRx[], initial?: (r: ElementRx) => SkillStage): SkillProgression {
  return {
    protocol: SKILL_PROTOCOL,
    id,
    elements: rx.map((r) => ({ fault: r.fault, stage: initial?.(r) ?? '기초', finished: false })),
    evidence: [],
    moves: [],
  };
}
export const skillFinished = (p: SkillProgression) => p.elements.length > 0 && p.elements.every((e) => e.finished);
export const skillStage = (p: SkillProgression, fault: string) => p.elements.find((e) => e.fault === fault)?.stage ?? '기초';
// 다음 날의 증상 날짜와 뒤늦게 입력한 날짜를 구분한다.
const followingDay = (on: string) => new Date(new Date(`${on}T00:00:00Z`).getTime() + 86_400_000).toISOString().slice(0, 10);
export const skillPainToday = (p: SkillProgression | undefined, today: string) =>
  p?.evidence.some((e) => (e.on === today && e.during === 'pain') || (followingDay(e.on) === today && e.nextDay === 'pain')) ?? false;

export function readiness(p: SkillProgression, fault: string) {
  const element = p.elements.find((e) => e.fault === fault);
  const evidence = p.evidence
    .slice(element?.reviewFrom ?? 0)
    .reverse()
    .find((e) => e.fault === fault && e.stage === element?.stage);
  let reason = '현재 단계의 필수 드릴을 먼저 수행해 주세요.';
  if (element?.finished) reason = '통합 단계의 자가 확인을 마쳤어요.';
  else if (evidence) {
    if (evidence.during === 'pain' || evidence.nextDay === 'pain') reason = '통증 반응이 있어 단계 진행을 보류해요.';
    else if (evidence.quality !== 'yes') reason = '동작 목표를 유지했는지 확인하며 현재 단계를 연습해 주세요.';
    else if (element?.stage !== '기초' && evidence.transferred !== 'yes')
      reason = '같은 동작 신호를 실제 캐치볼에서도 유지했는지 확인해 주세요.';
    else if (evidence.nextDay !== 'clear' || !evidence.responseOn || evidence.responseOn <= evidence.on)
      reason = '다음 날 반응 확인을 기다리고 있어요.';
    else return { ready: true, reason: '자가 확인 조건을 채웠어요. 다음 단계로 갈지 확인해 주세요.', evidence };
  }
  return { ready: false, reason, evidence: evidence ?? null };
}
export function saveNextDay(
  p: SkillProgression,
  evidenceId: string,
  response: string,
  today: string
): SkillProgression | { error: string } {
  if (!['clear', 'pain', 'unknown'].includes(response)) return { error: '알 수 없는 반응이에요.' };
  const e = p.evidence.find((e) => e.id === evidenceId);
  if (!e) return { error: '수행 기록을 찾을 수 없어요.' };
  if (today <= e.on) return { error: '수행한 다음 날부터 반응을 남겨 주세요.' };
  if (e.nextDay === 'pain' && response !== 'pain')
    return { error: '이미 남긴 통증 반응은 유지해요. 이후 연습의 반응을 새 기록으로 확인해 주세요.' };
  const el = p.elements.find((x) => x.fault === e.fault);
  if (el?.stage !== e.stage || el.finished) return { error: '이미 지난 단계의 기록이에요.' };
  return {
    ...p,
    evidence: p.evidence.map((x) => (x.id === evidenceId ? { ...x, nextDay: response as SkillEvidence['nextDay'], responseOn: today } : x)),
  };
}
export function advanceSkill(
  p: SkillProgression,
  fault: string,
  from: string,
  evidenceId: string,
  requestId: string,
  today: string
): SkillProgression | { error: string } {
  const receipt = p.moves.find((m) => m.id === requestId);
  if (receipt) return receipt.fault === fault && receipt.from === from ? p : { error: '단계 전환 정보가 달라요.' };
  const el = p.elements.find((e) => e.fault === fault);
  if (!el || el.stage !== from || el.finished) return { error: '단계가 바뀌었어요. 다시 불러와 주세요.' };
  const gate = readiness(p, fault);
  if (!gate.ready || gate.evidence?.id !== evidenceId) return { error: gate.reason };
  const index = SKILL_STAGES.indexOf(el.stage);
  return {
    ...p,
    elements: p.elements.map((e) => (e.fault === fault ? { ...e, stage: SKILL_STAGES[Math.min(index + 1, 2)], finished: index === 2 } : e)),
    moves: [...p.moves, { id: requestId, fault, from: el.stage, on: today }],
  };
}
export type SkillView = {
  id: string;
  blockedReason: string | null;
  elements: {
    fault: string;
    element: string;
    stage: SkillStage;
    cue: string;
    finished: boolean;
    ready: boolean;
    reason: string;
    evidenceId: string | null;
    practiceOn: string | null;
    canRespond: boolean;
    response: SkillEvidence['nextDay'] | null;
  }[];
};
export function skillView(p: SkillProgression, rx: ElementRx[], today?: string): SkillView {
  return {
    id: p.id,
    blockedReason: null,
    elements: p.elements.map((el) => {
      const r = rx.find((r) => r.fault === el.fault)!;
      const g = readiness(p, el.fault);
      return {
        ...el,
        element: r.element,
        cue: r.cue,
        ready: g.ready,
        reason: g.reason,
        evidenceId: g.evidence?.id ?? null,
        practiceOn: g.evidence?.on ?? null,
        canRespond: !!today && !!g.evidence && today > g.evidence.on,
        response: g.evidence?.nextDay ?? null,
      };
    }),
  };
}
