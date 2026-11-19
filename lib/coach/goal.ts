import { withJosa } from '@/lib/korean';
import { WEEKDAY_LABELS } from '@/lib/coach/answers';
import { weekdayOf } from '@/lib/coach/week';

/**
 * 코치와 정한 목표 하나 · 이어 묻기(docs/designs/ai-coach-knowledge-memory.md 9절, 자비스 2단계) — 순수 파일.
 * 완성 기준: 선수가 다음에 앱을 열었을 때 지난번에 정한 훈련을 정확히 이어 준다.
 * 정하기는 AI 가 제안하고 선수가 [정하기]를 눌러야 저장(sanitizeGoal → goalFromProposal). 이어 묻기 카드는 AI 없이 정해진 문장(goalCardOf).
 * 결과는 선수가 말한 것만 담는다 — 투구 기록 · 구속 · 3D 로 잘 됐다고 판정하지 않는다.
 */
export const GOAL_TRIGGERS = ['불펜', '라이브', '경기'] as const;
export type GoalTrigger = (typeof GOAL_TRIGGERS)[number];
export const GOAL_WHAT_MAX = 60;
export const GOAL_RESULT_MAX = 200;
/** 확인할 날은 오늘부터 이만큼 안 */
export const GOAL_DAYS_AHEAD = 14;
/** 못 했어요 → 다음 기회: 이만큼 뒤까지 그 종류 기록을 기다린다 */
export const GOAL_RETRY_DAYS = 7;
/** 끝난 목표를 AI 맥락에 남기는 날 수 */
export const GOAL_DONE_SHOWN_DAYS = 14;

export type GoalFeel = 'good' | 'meh' | 'bad';
export const FEEL_TEXT: Record<GoalFeel, string> = { good: '잘 됐어요', meh: '그저 그래요', bad: '잘 안 됐어요' };

/** 저장된 목표(날짜는 한국 날짜 YYYY-MM-DD) */
export type CoachGoalState = {
  what: string;
  trigger: GoalTrigger | null;
  checkOn: string;
  watchFrom: string;
  status: 'open' | 'done' | 'dropped';
  feel: GoalFeel | null;
  result: string | null;
  setOn: string;
  laterOn: string | null;
  answeredOn: string | null;
};

/** AI 제안(거른 뒤) — 정하기 · 지우기 */
export type GoalProposal = { kind: 'set'; what: string; trigger: GoalTrigger | null; checkOn: string } | { kind: 'drop' };
/** 대화 마디에 두는 제안 + 선수가 눌렀나 */
export type GoalOffer = GoalProposal & { applied?: boolean };

/** 목표 · 결과에 담지 않는 건강 낱말 — 목표는 동작 · 훈련만(통증 · 진단은 체크인 · 전문가로) */
const HEALTH_RE = /통증|아프|아파|아픈|아팠|부상|저리|저림|찌릿|붓|부었|염증|인대|힘줄|진단|병원|재활|뻐근|쑤시/;
export const hasHealthWords = (t: string) => HEALTH_RE.test(t);

const DAY_RE = /^\d{4}-\d{2}-\d{2}$/;
const shift = (d: string, n: number) => new Date(Date.parse(`${d}T00:00:00Z`) + n * 86_400_000).toISOString().slice(0, 10);
const daysBetween = (a: string, b: string) => Math.round((Date.parse(`${b}T00:00:00Z`) - Date.parse(`${a}T00:00:00Z`)) / 86_400_000);
const validDay = (v: unknown): v is string => typeof v === 'string' && DAY_RE.test(v) && shift(v, 0) === v;
const oneLine = (t: string) => t.replace(/\s+/g, ' ').trim();

/** AI 가 낸 goal 칸 → 저장할 수 있는 제안. 모르는 모양 · 지난 날 · 2주 넘는 날 · 건강 낱말이면 null(카드를 안 보인다) */
export function sanitizeGoal(raw: unknown, today: string): GoalProposal | null {
  if (!raw || typeof raw !== 'object') return null;
  const o = raw as Record<string, unknown>;
  if (o.kind === 'drop') return { kind: 'drop' };
  if (o.kind !== 'set' || typeof o.what !== 'string') return null;
  const what = oneLine(o.what);
  if (!what || what.length > GOAL_WHAT_MAX || hasHealthWords(what)) return null;
  if (!validDay(o.checkOn)) return null;
  const ahead = daysBetween(today, o.checkOn);
  if (ahead < 0 || ahead > GOAL_DAYS_AHEAD) return null;
  const trigger = (GOAL_TRIGGERS as readonly unknown[]).includes(o.trigger) ? (o.trigger as GoalTrigger) : null;
  return { kind: 'set', what, trigger, checkOn: o.checkOn };
}

/** [정하기] — 새 목표(진행 중 하나 · 있으면 덮는다). 오늘부터의 투구 기록을 본다 */
export function goalFromProposal(p: Extract<GoalProposal, { kind: 'set' }>, today: string): CoachGoalState {
  return { what: p.what, trigger: p.trigger, checkOn: p.checkOn, watchFrom: today, status: 'open', feel: null, result: null, setOn: today, laterOn: null, answeredOn: null };
}

/** 날 말 — 오늘 · 어제 · 내일, 앞뒤 6일 안이면 요일, 그 밖은 '11월 21일' */
export function dayWord(date: string, today: string): string {
  const d = daysBetween(today, date);
  if (d === 0) return '오늘';
  if (d === -1) return '어제';
  if (d === 1) return '내일';
  if (Math.abs(d) <= 6) return `${WEEKDAY_LABELS[weekdayOf(date)]}요일`;
  const [, m, day] = date.split('-').map(Number);
  return `${m}월 ${day}일`;
}

/** 목표 줄 — 카드 · 맥락이 같이 쓴다('목요일 불펜에서 확인' · '목요일까지') */
export function goalWhenText(g: Pick<CoachGoalState, 'trigger' | 'checkOn'>, today: string): string {
  return g.trigger ? `${dayWord(g.checkOn, today)} ${g.trigger}에서` : `${dayWord(g.checkOn, today)}까지`;
}

export type GoalLog = { date: string; sessionType: string; pitchCount: number };

/**
 * 앱을 열 때 보일 카드 — null 이면 정한 목표 없음(또는 끝남 · 지움).
 * - how: 정한 뒤 그 종류 투구 기록이 올라왔다 → '어땠어요?'(기록만 보고 결론 내리지 않는다)
 * - did: 확인할 날이 지났는데 그 종류 기록이 없다(날짜만 정한 목표는 그날부터) → '했어요?'(종류가 있으면 그날 기록 남기기 단추)
 * - waiting: 아직 확인할 때가 아니다 · 오늘 [나중에]를 눌렀다 → 정한 목표 한 줄만
 */
export type GoalCard =
  | { kind: 'how'; text: string; logDate: string }
  /* log: 그 종류 기록이 없다 — 했으면 기록 화면을 그 날 · 종류로 채워 연다(자비스 5단계 첫 조각). 남기면 다음에 how 로 바뀐다 */
  | { kind: 'did'; text: string; log?: { date: string; type: GoalTrigger } }
  | { kind: 'waiting'; text: string };

export function goalCardOf(g: CoachGoalState | null, logs: readonly GoalLog[], today: string): GoalCard | null {
  if (!g || g.status !== 'open') return null;
  const what = withJosa(g.what, '을/를');
  const waiting: GoalCard = { kind: 'waiting', text: `정한 목표: ${g.what} · ${goalWhenText(g, today)} 확인해요.` };
  if (g.laterOn === today) return waiting;
  const setWhen = g.setOn === today ? '오늘' : `${dayWord(g.setOn, today)}에`;
  if (g.trigger) {
    const hit = logs
      .filter((l) => l.date >= g.watchFrom && l.date <= today && l.pitchCount > 0 && l.sessionType === g.trigger)
      .map((l) => l.date)
      .sort()
      .at(-1);
    if (hit) {
      const threw = hit === today ? '오늘' : dayWord(hit, today);
      return { kind: 'how', text: `${setWhen} ${what} 확인해 보기로 했어요. ${threw} 던져 보니 어땠어요?`, logDate: hit };
    }
    if (today > g.checkOn) return { kind: 'did', text: `${dayWord(g.checkOn, today)} ${g.trigger}에서 ${what} 해 보기로 했는데, 했어요?`, log: { date: g.checkOn, type: g.trigger } };
    return waiting;
  }
  if (today >= g.checkOn) return { kind: 'did', text: `${dayWord(g.checkOn, today)}까지 ${what} 해 보기로 했는데, 했어요?` };
  return waiting;
}

/** 카드의 답 — how · did-yes 는 느낌(+한 줄), not-done 은 다음 기회 · 그만두기, later 는 오늘은 그만 묻기 */
export type GoalAnswer =
  | { kind: 'how' | 'did-yes'; feel: GoalFeel; text?: string | null }
  | { kind: 'not-done'; next: 'retry' | 'drop' }
  | { kind: 'later' };

export function readGoalAnswer(raw: unknown): GoalAnswer | null {
  if (!raw || typeof raw !== 'object') return null;
  const o = raw as Record<string, unknown>;
  if (o.kind === 'later') return { kind: 'later' };
  if (o.kind === 'not-done') return o.next === 'retry' || o.next === 'drop' ? { kind: 'not-done', next: o.next } : null;
  if ((o.kind === 'how' || o.kind === 'did-yes') && (o.feel === 'good' || o.feel === 'meh' || o.feel === 'bad'))
    return { kind: o.kind, feel: o.feel, text: typeof o.text === 'string' ? o.text : null };
  return null;
}

/** 답 → 바뀐 목표. 결과 글에 건강 낱말이 있으면 막는다(체크인에 적게) */
export function applyGoalAnswer(g: CoachGoalState, a: GoalAnswer, today: string): { next: CoachGoalState } | { error: string } {
  if (g.status !== 'open') return { error: '이미 끝난 목표예요.' };
  switch (a.kind) {
    case 'later':
      return { next: { ...g, laterOn: today } };
    case 'not-done':
      return a.next === 'drop'
        ? { next: { ...g, status: 'dropped', answeredOn: today } }
        : /* 오늘 올린 기록에 다시 걸리지 않게 내일부터 · 일주일 안 그 종류 기록을 기다린다 */
          { next: { ...g, watchFrom: shift(today, 1), checkOn: shift(today, GOAL_RETRY_DAYS), laterOn: null } };
    case 'how':
    case 'did-yes': {
      const text = a.text ? oneLine(a.text) : '';
      if (text.length > GOAL_RESULT_MAX) return { error: `${GOAL_RESULT_MAX}자 안으로 적어 주세요.` };
      if (text && hasHealthWords(text)) return { error: '아픈 곳은 여기 말고 오늘 체크인에 적어 주세요.' };
      return { next: { ...g, status: 'done', feel: a.feel, result: text || null, answeredOn: today } };
    }
  }
}

/** AI 맥락 한 줄 — 결과는 선수가 말한 것만. 끝난 목표는 답한 뒤 2주까지 */
export function goalLine(g: CoachGoalState | null, today: string): string {
  if (!g || g.status === 'dropped') return '정한 목표: 없음';
  if (g.status === 'open')
    return `정한 목표: ${g.what} | 확인: ${g.trigger ? `${g.checkOn} ${g.trigger}` : `${g.checkOn}까지`} | 정한 날 ${g.setOn} | 아직 결과 없음`;
  if (!g.answeredOn || daysBetween(g.answeredOn, today) > GOAL_DONE_SHOWN_DAYS) return '정한 목표: 없음';
  return `정한 목표(지난): ${g.what} | 선수가 말한 결과: ${g.feel ? FEEL_TEXT[g.feel] : '모름'}${g.result ? ` · "${g.result}"` : ''} | 답한 날 ${g.answeredOn}`;
}
