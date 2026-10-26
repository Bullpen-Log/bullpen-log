import { nextOutingDays, parseThrowPlan } from '@/lib/checkin';
import { shiftDateKey } from '@/lib/pitch-stats';
import { OUTING_ROLE_LABEL, type OutingRole } from '@/lib/org/team';

/**
 * 팀 확정 등판이 선수의 다른 일정과 날이 다른지(계약 9-6 ①-5 E) — 순수 규칙. 조용히 덮거나 버리지 않고 '어느 쪽이 맞나요'로 보인다.
 * 엔진은 그대로다(체크인 답이 먼저 · 팀 등판은 짐작한 출처 — lib/org/team-load.ts confirmedOutingEvents). 여기는 보여 줄 말만 만든다.
 *
 * - 체크인: 오늘 답한 던지는 일정의 날 범위(lib/checkin.ts nextOutingDays)에 가장 가까운 팀 등판이 안 들어가면. '없음' · '오늘 불펜'은
 *   팀 등판이 3일 안이면(다른 답이 덮는 가장 짧은 범위).
 * - 개인 달력: 등판으로 읽히는 내 일정이 창 안에 있는데 그날 팀 등판이 하나도 없으면(같은 날이 하나라도 있으면 맞는 것으로 본다).
 * - 다른 팀: 두 조직의 등판이 같은 날이면.
 */
export const OUTING_CHECK_DAYS = 7;

export type TeamOuting = { orgId: string; orgName: string; eventId: string; date: string; role: OutingRole; pitchLimit: number | null };

export type OutingConflict =
  | { kind: 'checkin'; outing: TeamOuting; plan: string }
  | { kind: 'calendar'; outing: TeamOuting; date: string }
  | { kind: 'teams'; outing: TeamOuting; other: TeamOuting };

const daysBetween = (from: string, to: string) => Math.round((Date.parse(`${to}T00:00:00Z`) - Date.parse(`${from}T00:00:00Z`)) / 86400000);

export function outingConflicts(input: { today: string; outings: readonly TeamOuting[]; throwPlanToday: string | null; calendarOutings: readonly string[] }): OutingConflict[] {
  const end = shiftDateKey(input.today, OUTING_CHECK_DAYS);
  const soon = input.outings.filter((o) => o.date >= input.today && o.date <= end).sort((a, b) => (a.date < b.date ? -1 : a.date > b.date ? 1 : 0));
  if (soon.length === 0) return [];
  const out: OutingConflict[] = [];

  const plan = parseThrowPlan(input.throwPlanToday);
  if (plan) {
    const near = soon[0];
    const d = daysBetween(input.today, near.date);
    const w = nextOutingDays(plan);
    const off = w ? d < w.min || (w.max != null && d > w.max) : d <= 3;
    if (off) out.push({ kind: 'checkin', outing: near, plan });
  }

  const mine = input.calendarOutings.filter((k) => k >= input.today && k <= end);
  if (mine.length && !mine.some((k) => soon.some((o) => o.date === k))) out.push({ kind: 'calendar', outing: soon[0], date: [...mine].sort()[0] });

  for (let i = 0; i < soon.length; i++)
    for (let j = i + 1; j < soon.length; j++)
      if (soon[i].date === soon[j].date && soon[i].orgId !== soon[j].orgId) out.push({ kind: 'teams', outing: soon[i], other: soon[j] });
  return out;
}

const dayWord = (today: string, key: string) => {
  const d = daysBetween(today, key);
  return d === 0 ? '오늘' : d === 1 ? '내일' : `${Number(key.slice(5, 7))}월 ${Number(key.slice(8, 10))}일`;
};

export const outingText = (o: TeamOuting, today: string) =>
  `${o.orgName} · ${dayWord(today, o.date)} ${OUTING_ROLE_LABEL[o.role]}${o.pitchLimit ? ` · ${o.pitchLimit}구까지` : ''}`;

/** 선수에게 보일 한 줄 — 무엇과 무엇이 다른가 */
export function conflictLine(c: OutingConflict, today: string): string {
  if (c.kind === 'checkin') return `팀은 ${outingText(c.outing, today)}인데, 오늘 체크인에는 '${c.plan}'으로 답했어요.`;
  if (c.kind === 'calendar') return `팀은 ${outingText(c.outing, today)}인데, 내 달력에는 ${dayWord(today, c.date)} 등판이 있어요.`;
  return `${dayWord(today, c.outing.date)} 두 팀 등판이 겹쳐요 — ${c.outing.orgName} ${OUTING_ROLE_LABEL[c.outing.role]} · ${c.other.orgName} ${OUTING_ROLE_LABEL[c.other.role]}.`;
}
