/**
 * 코치가 먼저 말 걸기(docs/designs/ai-coach-knowledge-memory.md 8절 3단계) — 정해진 문장(AI 아님 · 돈 안 듦). 순수 파일.
 * - 목표: 정한 종류 투구 기록이 올라오면 그 자리에서 '어땠어요?'(목표 카드와 같은 글), 확인할 날 18시에 한 번, 그날 기록이 없으면 다음 날 18시에 한 번.
 * - 통증: 체크인에 어깨 · 팔꿈치 통증을 적으면 대화에 코치 말 한 마디(쉬기 먼저 · 오늘 운동 화면 단추).
 * - 3D 다시 재기: 메커니즘 처방을 마쳤는데 다시 안 쟀거나 마지막 3D 가 4주 넘었으면 18시에 대화에 한 마디(3D 동작 분석 단추).
 * 하루 두 번까지(통증 말은 상한 밖) · 같은 글은 하루 한 번 · 코치 설정에서 끈다. 폰 알림 글은 잠금 화면에 보이므로 몸 상태 낱말을 넣지 않는다.
 */
import { goalCardOf, type CoachGoalState, type GoalLog } from '@/lib/coach/goal';
import { withJosa } from '@/lib/korean';
import type { CoachAct } from '@/lib/coach/act';

/** 하루(한국 날짜) 먼저 거는 말 상한 — 주간 돌아보기 알림은 안 센다 */
export const NUDGE_DAILY_CAP = 2;
/** 알림 제목 — 상한 · 같은 글 셈도 이 제목으로 찾는다 */
export const NUDGE_TITLE = '코치';

export type Nudge = {
  /** 폰 알림 글(잠금 화면에 보인다) — 같은 날 같은 글은 다시 안 보낸다 */
  push: string;
  /** 누르면 — 목표는 코치 탭(목표 카드가 거기서 답을 받는다) · 대화 말은 대화 창 */
  link: '/coach' | '/coach-chat';
  /** 대화에 코치 말로 남길 글 · 단추(있으면 AI 동의 · 건강 동의가 있을 때만 보낸다) */
  chat?: { text: string; act: CoachAct | null };
  /** 몸을 지키는 말(통증) — 하루 상한을 안 센다(목표 알림 둘이 먼저 나간 날에도 간다). 같은 글 하루 한 번은 그대로 */
  safety?: true;
  /** 대화 말에 건강정보가 들었다(통증) — 건강 동의도 있어야 보낸다. 없으면 AI 동의만 */
  health?: true;
};

const shift = (d: string, n: number) => new Date(Date.parse(`${d}T00:00:00Z`) + n * 86_400_000).toISOString().slice(0, 10);

/** 투구 기록을 남긴 직후 — 그 기록이 목표 카드를 '어땠어요?'로 바꿨으면 그 글 그대로 */
export function goalLogNudge(goal: CoachGoalState | null, logs: readonly GoalLog[], today: string, savedDate: string): Nudge | null {
  const card = goalCardOf(goal, logs, today);
  return card?.kind === 'how' && card.logDate === savedDate ? { push: card.text, link: '/coach' } : null;
}

/** 매일 18시 — 확인할 날이면 미리 한 번, 그날 정한 종류 기록 없이 지나갔으면 다음 날 한 번(카드의 '했어요?') */
export function goalDayNudge(goal: CoachGoalState | null, logs: readonly GoalLog[], today: string): Nudge | null {
  if (!goal || goal.status !== 'open' || goal.laterOn === today) return null;
  const card = goalCardOf(goal, logs, today);
  if (!card) return null;
  if (goal.trigger && card.kind === 'waiting' && goal.checkOn === today)
    return { push: `오늘 ${goal.trigger}에서 ${withJosa(goal.what, '을/를')} 해 보기로 했어요. 던지고 기록을 남기면 어땠는지 물어볼게요.`, link: '/coach' };
  if (card.kind === 'did' && goal.checkOn === (goal.trigger ? shift(today, -1) : today)) return { push: card.text, link: '/coach' };
  return null;
}

export type PainPart = '어깨' | '팔꿈치';

/** 체크인에 어깨 · 팔꿈치 통증 — 대화에 쉬기 먼저 · 오늘 운동 화면 단추(운동 엔진이 통증을 읽어 오늘 몫을 다시 맞춘다) */
export function painNudge(parts: readonly PainPart[]): Nudge | null {
  if (!parts.length) return null;
  const where = parts.length > 1 ? '어깨와 팔꿈치' : parts[0];
  return {
    push: '오늘 체크인을 보고 코치가 한마디 남겼어요.',
    link: '/coach-chat',
    safety: true,
    health: true,
    chat: {
      text: `오늘 체크인에 ${where} 통증을 적었어요. 아픈 날은 던지지 말고 쉬는 게 먼저예요. 통증이 며칠 이어지면 병원에서 확인받아요. 오늘 운동은 지금 상태에 맞춰 다시 볼 수 있어요.`,
      act: { kind: 'open', screen: 'training' },
    },
  };
}

/** 3D 다시 재기 — 마지막 3D 에서 이만큼 지나면 권하고, 같은 권유도 이 간격에 한 번. 드릴을 이만큼 쉰 사람에게는 안 보낸다 */
export const RECHECK_EVERY_DAYS = 28;
/** 3D 다시 재기 폰 알림 글 — 지난번 보낸 날을 이 글로 찾는다 */
export const RECHECK_PUSH = '3D 동작 분석을 다시 찍어 볼 때예요.';

export type RecheckInput = {
  /** 처방을 시작한 날 · 다 마쳤나 */
  startedOn: string;
  finished: boolean;
  /** 비교 기준 3D 를 둔 날(없으면 처방 시작일) · 다시 잰 3D 를 이은 날들 */
  baselineOn: string | null;
  followupOns: readonly string[];
  /** 메커니즘 세션을 마지막으로 마친 날 */
  lastSessionOn: string | null;
};

const dayGap = (from: string, to: string) => Math.round((Date.parse(`${to}T00:00:00Z`) - Date.parse(`${from}T00:00:00Z`)) / 86_400_000);

/**
 * 매일 18시 — 3D 를 다시 잴 때인가(2026-11-21 김민: AI 코치 검토 3번 — 처방이 효과가 있었는지 재는 고리가 사용자가 스스로 찍을 때만 닫혔다).
 * 처방을 마쳤는데 다시 잰 것이 없거나, 마지막 3D 가 4주 넘었을 때. 좋아졌다 · 나빠졌다는 말하지 않는다(비교는 메커니즘 화면 몫).
 * 최근 사흘 체크인에 팔 통증이 있으면(armPain) 던지라고 권하지 않는다.
 */
export function recheckNudge(x: RecheckInput | null, today: string, lastSentOn: string | null, armPain: boolean): Nudge | null {
  if (!x || armPain) return null;
  if (!x.lastSessionOn || dayGap(x.lastSessionOn, today) > RECHECK_EVERY_DAYS) return null;
  if (lastSentOn && dayGap(lastSentOn, today) < RECHECK_EVERY_DAYS) return null;
  const last = [x.baselineOn ?? x.startedOn, ...x.followupOns].sort().at(-1)!;
  const gap = dayGap(last, today);
  const doneNoCheck = x.finished && x.followupOns.length === 0;
  if (!doneNoCheck && gap < RECHECK_EVERY_DAYS) return null;
  const head = doneNoCheck
    ? '메커니즘 처방을 다 마쳤어요. 3D 동작 분석을 다시 찍으면 처음 것과 나란히 견줄 수 있어요.'
    : `마지막 3D 동작 분석이 ${Math.floor(gap / 7)}주 전이에요. 처방을 시작한 지 ${Math.max(1, Math.floor(dayGap(x.startedOn, today) / 7))}주 됐으니 다시 찍어 처음과 견줘 볼까요?`;
  return {
    push: RECHECK_PUSH,
    link: '/coach-chat',
    chat: {
      text: `${head} 처음과 같은 자리 · 배율로 찍고, 분석이 끝나면 메커니즘 드릴 화면의 '재측정 결과 연결'로 이어요.`,
      act: { kind: 'open', screen: 'lab' },
    },
  };
}

/** 오늘 이미 보낸 글들(같은 제목) → 이 말을 보내도 되나 */
export function nudgeAllowed(sentToday: readonly (string | null)[], n: Nudge): boolean {
  return (n.safety || sentToday.length < NUDGE_DAILY_CAP) && !sentToday.includes(n.push);
}
