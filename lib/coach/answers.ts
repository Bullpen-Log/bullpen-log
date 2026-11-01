import type { DaySlot, ReasonCode, SlotItem, Weekday } from '@/lib/coach/week';

/**
 * 코치 처음 질문의 답(CoachProfile.answers, docs/designs/ai-coach.md 10-4) — 서버(app/actions/coach.ts)와 앱 화면(native/src/coach/start)이 같이 쓴다.
 * 앱에 이미 있는 것(나이 · 키 · 장비 · 수준 · 하루 시간)은 다시 안 묻는다(U4). 순수 파일.
 */
export type CoachSaved = {
  /** 우선순위 맨 앞(U30) — 목표 구속 숫자는 묻지 않는다 */
  priority?: CoachPriority;
  role?: CoachRole;
  /** 보통 등판 요일 · 선발 간격(일) */
  outingDays?: Weekday[];
  outingEvery?: number | null;
  /** 매주 되풀이 팀 훈련 요일(달력에 없는 것) */
  teamDays?: Weekday[];
  /** 운동할 수 있는 요일 · 하루 시간 */
  days?: Weekday[];
  minutes?: number;
  place?: CoachPlace;
  /** 피해야 할 동작 — 건강정보라 동의가 있을 때만 저장(U18) */
  limits?: CoachLimit[];
};

export const COACH_PRIORITIES = [
  { value: 'velocity', label: '구속' },
  { value: 'control', label: '제구' },
  { value: 'stamina', label: '체력' },
  { value: 'health', label: '부상 예방' },
] as const;
export const COACH_ROLES = [
  { value: 'starter', label: '선발' },
  { value: 'reliever', label: '불펜' },
  { value: 'both', label: '둘 다' },
  { value: 'none', label: '아직 없어요' },
] as const;
export const COACH_PLACES = [
  { value: 'home', label: '집' },
  { value: 'gym', label: '헬스장' },
  { value: 'field', label: '구장' },
  { value: 'team', label: '팀' },
] as const;
export const COACH_LIMITS = [
  { value: 'overhead', label: '머리 위로 밀기' },
  { value: 'jump', label: '점프' },
  { value: 'heavyLower', label: '무거운 하체' },
  { value: 'throwing', label: '던지기' },
] as const;
export const COACH_MINUTES = [30, 45, 60, 90] as const;
export const WEEKDAY_LABELS = ['월', '화', '수', '목', '금', '토', '일'] as const;

export type CoachPriority = (typeof COACH_PRIORITIES)[number]['value'];
export type CoachRole = (typeof COACH_ROLES)[number]['value'];
export type CoachPlace = (typeof COACH_PLACES)[number]['value'];
export type CoachLimit = (typeof COACH_LIMITS)[number]['value'];

/** 질문 화면(저장하는 것만 — 소개 · 내 정보 확인 · 미리보기는 저장 없음) */
export const COACH_STEPS = ['goal', 'outing', 'fixed', 'availability', 'place', 'limits'] as const;
export type CoachStep = (typeof COACH_STEPS)[number];

const weekdays = (v: unknown): Weekday[] | null =>
  Array.isArray(v) && v.every((d) => Number.isInteger(d) && d >= 0 && d <= 6) ? ([...new Set(v)].sort() as Weekday[]) : null;
const pick = <T extends string>(list: readonly { value: T }[], v: unknown): T | null => (list.some((o) => o.value === v) ? (v as T) : null);

export const savedOf = (json: unknown): CoachSaved => (json && typeof json === 'object' && !Array.isArray(json) ? (json as CoachSaved) : {});

/** 화면 하나의 답을 검사해 합친다 — 모양이 틀리면 null(저장 안 함). 건강 동의가 없으면 제한은 비운다 */
export function mergeStep(prev: CoachSaved, step: CoachStep, v: Record<string, unknown>, healthOk: boolean): CoachSaved | null {
  switch (step) {
    case 'goal': {
      const priority = pick(COACH_PRIORITIES, v.priority);
      return priority ? { ...prev, priority } : null;
    }
    case 'outing': {
      const role = pick(COACH_ROLES, v.role);
      const outingDays = weekdays(v.outingDays ?? []);
      const every = v.outingEvery == null ? null : Number(v.outingEvery);
      if (!role || !outingDays || (every != null && !(Number.isInteger(every) && every >= 3 && every <= 10))) return null;
      return { ...prev, role, outingDays, outingEvery: every };
    }
    case 'fixed': {
      const teamDays = weekdays(v.teamDays ?? []);
      return teamDays ? { ...prev, teamDays } : null;
    }
    case 'availability': {
      const days = weekdays(v.days);
      const minutes = (COACH_MINUTES as readonly number[]).includes(Number(v.minutes)) ? Number(v.minutes) : null;
      return days && days.length && minutes ? { ...prev, days, minutes } : null;
    }
    case 'place': {
      const place = pick(COACH_PLACES, v.place);
      return place ? { ...prev, place } : null;
    }
    case 'limits': {
      if (!healthOk) return { ...prev, limits: [] };
      if (!Array.isArray(v.limits)) return null;
      const limits = v.limits.filter((x): x is CoachLimit => COACH_LIMITS.some((o) => o.value === x));
      return { ...prev, limits: [...new Set(limits)] };
    }
  }
}

/* ─────────── 한 주 칸의 글(앱 · PC 같은 글 — AI 없이 정해진 문장, U7) ─────────── */

export const REASON_TEXT: Record<ReasonCode, string> = {
  outing: '등판',
  'outing-soft': '등판 짐작',
  'after-outing': '등판 다음 날',
  'outing-tomorrow': '내일 등판',
  'outing-near': '등판 3일 안',
  game: '경기',
  'team-practice': '팀 훈련',
  lesson: '레슨',
  'not-available': '못 하는 날',
  rest: '쉬기',
  'lower-yesterday': '어제 하체',
  youth: '성장기',
  'effort-spike': '최근 힘들었음',
  pain: '팔 통증',
  skipped: '쉬기로 함',
  moved: '옮긴 날',
  busy: '바쁜 주라 줄임',
};

function itemText(x: SlotItem): string {
  switch (x.kind) {
    case 'train':
      return `운동 ${x.fence.minutes}분${x.fence.light ? ' · 가볍게' : x.fence.heavyLower ? ' · 하체 무겁게' : ''}`;
    case 'program':
      return x.heavyLower ? '프로그램 · 하체 무겁게' : '프로그램';
    case 'armcare':
      return x.mode === 'strength' ? '암케어' : '회복 암케어';
    case 'mechanics':
      return '메커니즘 드릴';
    case 'fixed':
      return x.what === 'game' ? '경기' : x.what === 'team' ? '팀 훈련' : '레슨';
    case 'rest':
      return '쉬기';
  }
}

/** 한 칸의 한 줄 — 무엇을(제안인 암케어는 뒤로) */
export function slotLine(slot: DaySlot): string {
  const main = slot.items.filter((x) => x.kind !== 'armcare').map(itemText);
  const care = slot.items.filter((x) => x.kind === 'armcare').map(itemText);
  return [...main, ...care].join(' · ');
}
