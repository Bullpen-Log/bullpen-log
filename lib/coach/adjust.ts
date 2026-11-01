import type { DayRule } from '@/lib/engine/microcycle';
import type { DaySlot, ReasonCode, SlotItem } from '@/lib/coach/week';

/**
 * 코치 조정 단추(docs/designs/ai-coach.md 10-5 U35) — 이번 주 틀을 사용자가 고친다. 계획기를 처음부터 다시 돌리지 않고 칸만 옮긴다
 * (다시 돌리면 고르지 않은 날까지 바뀐다). 지난 날 · 시작한 오늘 운동은 못 바꾼다. 6단계 AI 대화도 같은 모양을 쓴다(CoachAdjust).
 * 안전: 등판 · 회복 날로는 운동을 못 옮기고, 옮긴 날이 큰 하체를 못 드는 날이면 큰 하체를 끄고, 이틀 잇는 큰 하체는 뒷날을 끈다(planWeek 와 같은 약속).
 * 순수 파일.
 */
export type CoachAdjust =
  | { kind: 'minutes'; date: string; minutes: number }
  | { kind: 'skip'; date: string }
  | { kind: 'move'; from: string; to: string }
  | { kind: 'busy' };

export const ADJUST_MINUTES = [20, 30, 45, 60, 90] as const;

const DATE = /^\d{4}-\d{2}-\d{2}$/;

/** 앱이 보낸 값 검사 — 모양이 틀리면 null */
export function readAdjust(v: unknown): CoachAdjust | null {
  if (!v || typeof v !== 'object') return null;
  const o = v as Record<string, unknown>;
  const date = (x: unknown) => typeof x === 'string' && DATE.test(x);
  switch (o.kind) {
    case 'minutes':
      return date(o.date) && (ADJUST_MINUTES as readonly unknown[]).includes(o.minutes) ? { kind: 'minutes', date: o.date as string, minutes: o.minutes as number } : null;
    case 'skip':
      return date(o.date) ? { kind: 'skip', date: o.date as string } : null;
    case 'move':
      return date(o.from) && date(o.to) && o.from !== o.to ? { kind: 'move', from: o.from as string, to: o.to as string } : null;
    case 'busy':
      return { kind: 'busy' };
    default:
      return null;
  }
}

const isMain = (x: SlotItem) => x.kind === 'train' || x.kind === 'program' || x.kind === 'mechanics';
const isWork = (x: SlotItem) => x.kind === 'train' || x.kind === 'program';
/** 큰 하체를 들 수 있는 날(dayRuleOf 의 heavyLower 와 같은 규칙) */
const HEAVY_RULES = new Set<DayRule>(['none', 'outingFar']);
/** 운동이 빠지면 그 운동을 설명하던 까닭도 뺀다 */
const WORK_REASONS = new Set<ReasonCode>(['youth', 'lower-yesterday']);

function heavyOf(s: DaySlot): boolean {
  return s.items.some((x) => (x.kind === 'train' && x.fence.heavyLower) || (x.kind === 'program' && x.heavyLower));
}

/** 운동 빼기(쉬기 · 바쁜 주) — 팀 훈련 · 경기 · 암케어 제안은 남긴다 */
function dropMain(s: DaySlot, why: ReasonCode): void {
  s.items = s.items.filter((x) => !isMain(x));
  if (!s.items.some((x) => x.kind === 'fixed' || x.kind === 'rest')) s.items.unshift({ kind: 'rest' });
  s.reasons = [...s.reasons.filter((r) => !WORK_REASONS.has(r)), why];
}

/** 운동 칸을 다른 날 몫에 맞춘다 — 보조 날이면 가볍게, 큰 하체를 못 드는 날이면 끈다 */
function fitTo(x: SlotItem, dest: DaySlot): SlotItem {
  const heavyOk = HEAVY_RULES.has(dest.rule) && dest.rank !== 'light';
  if (x.kind === 'train') return { kind: 'train', fence: { ...x.fence, light: dest.rank === 'light', heavyLower: x.fence.heavyLower && heavyOk } };
  if (x.kind === 'program') return { kind: 'program', heavyLower: x.heavyLower && heavyOk };
  return x;
}

export function applyAdjust(
  week: readonly DaySlot[],
  adj: CoachAdjust,
  locked: (date: string) => boolean
): { week: DaySlot[]; changed: string[] } | { error: string } {
  const next: DaySlot[] = JSON.parse(JSON.stringify(week));
  const at = (d: string) => next.find((s) => s.date === d);
  const LOCKED = '지난 날 · 시작한 운동은 못 바꿔요.';

  switch (adj.kind) {
    case 'minutes': {
      const s = at(adj.date);
      if (!s) return { error: '이번 주 날이 아니에요.' };
      if (locked(adj.date)) return { error: LOCKED };
      const t = s.items.find((x) => x.kind === 'train');
      if (!t) return { error: s.items.some((x) => x.kind === 'program') ? '프로그램 날은 프로그램대로 해요.' : '그날은 운동이 없어요.' };
      if (t.kind === 'train') t.fence.minutes = adj.minutes;
      break;
    }
    case 'skip': {
      const s = at(adj.date);
      if (!s) return { error: '이번 주 날이 아니에요.' };
      if (locked(adj.date)) return { error: LOCKED };
      if (!s.items.some(isMain)) return { error: '그날은 이미 쉬는 날이에요.' };
      dropMain(s, 'skipped');
      break;
    }
    case 'busy': {
      const s = [...next].reverse().find((x) => !locked(x.date) && x.items.some(isWork));
      if (!s) return { error: '줄일 운동 날이 없어요.' };
      dropMain(s, 'busy');
      break;
    }
    case 'move': {
      const a = at(adj.from);
      const b = at(adj.to);
      if (!a || !b) return { error: '이번 주 날이 아니에요.' };
      if (locked(adj.from) || locked(adj.to)) return { error: LOCKED };
      const fromItems = a.items.filter(isMain);
      const toItems = b.items.filter(isMain);
      if (!fromItems.length) return { error: '옮길 운동이 없는 날이에요.' };
      if (b.rank === 'recovery' || (toItems.length && a.rank === 'recovery')) return { error: '등판 · 회복 날로는 운동을 옮길 수 없어요.' };
      const restOf = (s: DaySlot, moved: SlotItem[]) => {
        s.items = [...s.items.filter((x) => !isMain(x) && x.kind !== 'rest'), ...moved];
        if (!s.items.some((x) => isMain(x) || x.kind === 'fixed')) s.items.unshift({ kind: 'rest' });
      };
      restOf(a, toItems.map((x) => fitTo(x, a)));
      restOf(b, fromItems.map((x) => fitTo(x, b)));
      a.reasons = a.reasons.filter((r) => !WORK_REASONS.has(r) && r !== 'rest' && r !== 'moved');
      b.reasons = [...b.reasons.filter((r) => !WORK_REASONS.has(r) && r !== 'rest' && r !== 'moved'), 'moved'];
      if (toItems.length) a.reasons.push('moved');
      else if (!a.items.some((x) => x.kind === 'fixed')) a.reasons.push('rest');
      break;
    }
  }

  /* 이어진 이틀 큰 하체 없음 — 바꾼 뒤 다시 지킨다(planWeek 와 같은 약속), 고칠 수 있는 날만 */
  for (let i = 1; i < next.length; i++) {
    if (locked(next[i].date) || !heavyOf(next[i - 1]) || !heavyOf(next[i])) continue;
    for (const x of next[i].items) {
      if (x.kind === 'train') x.fence.heavyLower = false;
      if (x.kind === 'program') x.heavyLower = false;
    }
    if (!next[i].reasons.includes('lower-yesterday')) next[i].reasons.push('lower-yesterday');
  }

  const changed = next.filter((s, i) => JSON.stringify(s) !== JSON.stringify(week[i])).map((s) => s.date);
  if (!changed.length) return { error: '바뀌는 게 없어요.' };
  return { week: next, changed };
}

/**
 * AI 대화가 낸 바꿀 거리 거르기(docs/designs/ai-coach.md 10-6) — 모양 검사(readAdjust) + 날짜는 이번 주 · 오늘 뒤 · 안 잠긴 날만 + 같은 것 한 번 + 최대 3개.
 * 남은 것만 미리보기로 간다. AI 글이 이상해도(주입 포함) 일정을 바꾸는 길은 이 거르기 → 사용자 [적용]뿐이다.
 */
export const AI_MAX_ADJUSTS = 3;

export function sanitizeAdjusts(raw: unknown, week: readonly DaySlot[], today: string, locked: (date: string) => boolean): CoachAdjust[] {
  if (!Array.isArray(raw)) return [];
  const out: CoachAdjust[] = [];
  const seen = new Set<string>();
  const ok = (d: string) => d >= today && !locked(d) && week.some((s) => s.date === d);
  for (const r of raw) {
    if (!r || typeof r !== 'object') continue;
    const clean = Object.fromEntries(Object.entries(r as Record<string, unknown>).filter(([, v]) => v != null));
    const a = readAdjust(clean);
    if (!a) continue;
    const dates = a.kind === 'minutes' || a.kind === 'skip' ? [a.date] : a.kind === 'move' ? [a.from, a.to] : [];
    if (!dates.every(ok)) continue;
    const key = JSON.stringify(a);
    if (seen.has(key)) continue;
    seen.add(key);
    out.push(a);
    if (out.length >= AI_MAX_ADJUSTS) break;
  }
  return out;
}
