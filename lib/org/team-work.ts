/**
 * 코치 운동을 선수 하루 운동에 넣는 규칙(2026-10-26 3단계 준비, docs/designs/sinker-team-lesson-contract.md 4절) — 순수 함수만. 저장은 lib/org/team-work-store.ts.
 *
 * 선수 운동 판(TrainingSession)은 하루 하나 · 운동 기록 요약(UserExerciseLog)은 하루 · 운동마다 한 줄이라, 코치 운동을 따로 두면 그날 선수 운동과 부딪힌다.
 * 그래서 코치 운동은 선수의 그날 판에 세트(UserExerciseSet, enteredById · orgEventId)로 붙인다 — 판이 없으면 'org' 판(마친 상태)을 만든다.
 * 요약 · 부하 · 달력 · '최근 운동'은 지금처럼 세트에서 다시 셈하므로 읽는 곳은 손대지 않는다.
 * - 세트 번호는 101 부터 — 선수가 같은 판에서 같은 운동을 하고 있어도(1, 2, 3 …) 겹치지 않는다(@@unique sessionId · exerciseId · setNo).
 * - 한 활동의 코치 세트는 늘 통째로 지우고 다시 넣는다 — 다시 보내도 같은 결과(같은 공 두 번 세지 않게와 같은 뜻).
 * - 판에 붙인 코치 운동은 fromOrg 표시 — 세트가 다 지워지면 판에서도 뺀다. 코치 운동만 남은 'org' 판에 세트가 하나도 없으면 판째 지운다.
 */
import type { FrozenExercise, FrozenPlan } from '@/lib/workout/session-plan';
import type { RecordedLoad } from '@/lib/workout/load/recorded';

export const ORG_THEME_KEY = 'org' as const;
export const ORG_THEME_LABEL = '팀 · 레슨장 운동';
/** 코치 세트 번호는 이 위부터(101 …) */
export const ORG_SET_BASE = 100;
export const ORG_WORK_ITEMS_MAX = 20;
export const ORG_WORK_SETS_MAX = 10;

/**
 * EX-LOAD01 R1-03 — 세트의 무게 기록 칸(선택). 새 화면이 밴드 · 섞인 무게 · 서로 다른 무게 · 기구 이름을 보낼 때 운동 화면의 세트와 같은 약속으로
 * 싣는다(loadProtocol · loadResolver · load(RecordedLoad 모양) · variant). **칸이 없으면 옛 길**(kg 숫자만)이다 — 없음과 null 은 다르다.
 * 거르는 곳은 모양만 보고 그대로 두고(지우지 않는다), 뜻은 쓰는 곳(lib/org/team-work-core.ts prepareOrgWork)이 권위 있는 계약으로 본다.
 */
export type OrgLoadFields = {
  loadProtocol?: number;
  loadResolver?: number;
  load?: RecordedLoad | null;
  variant?: 'band' | 'mass' | null;
};
export type OrgSet = { weightKg: number | null; reps: number | null; holdSeconds: number | null } & OrgLoadFields;
export type OrgWorkItem = { exerciseId: string; sets: OrgSet[] };

/** 무게 기록 칸 한 묶음의 JSON 크기 상한 — 밴드 셋 · 양손 무게 · 기구 이름이면 넉넉하다 */
const LOAD_JSON_MAX = 4000;
export const ORG_LOAD_SHAPE_ERROR = '무게 기록 형식이 올바르지 않아요. 앱을 업데이트한 뒤 다시 적어 주세요.';

/**
 * 들어온 줄 · 세트에서 무게 기록 칸만 꺼낸다 — 모양만 본다(숫자 · 객체 · 고른 변형). 칸이 없으면(undefined) 그대로 없음, 있으면 그대로 싣는다.
 * 값이 받을 수 있는 것인지(밴드 단계 · 역할 · 기준 · 판)는 쓸 때 계약으로 본다(여기서 고치거나 바꾸지 않는다).
 */
export function readOrgLoadFields(o: Record<string, unknown>): OrgLoadFields | { error: string } {
  const out: OrgLoadFields = {};
  if (o.loadProtocol !== undefined) {
    if (typeof o.loadProtocol !== 'number' || !Number.isFinite(o.loadProtocol)) return { error: ORG_LOAD_SHAPE_ERROR };
    out.loadProtocol = o.loadProtocol;
  }
  if (o.loadResolver !== undefined) {
    if (typeof o.loadResolver !== 'number' || !Number.isFinite(o.loadResolver)) return { error: ORG_LOAD_SHAPE_ERROR };
    out.loadResolver = o.loadResolver;
  }
  if (o.load !== undefined) {
    if (o.load !== null && (typeof o.load !== 'object' || Array.isArray(o.load) || typeof (o.load as { kind?: unknown }).kind !== 'string')) return { error: ORG_LOAD_SHAPE_ERROR };
    let json: string;
    try {
      json = JSON.stringify(o.load);
    } catch {
      return { error: ORG_LOAD_SHAPE_ERROR };
    }
    if (json.length > LOAD_JSON_MAX) return { error: ORG_LOAD_SHAPE_ERROR };
    /* JSON 으로 한 번 옮겨 담는다(저장 · 지문이 보낸 값과 같게, 함수 · 순환 같은 것은 못 들어온다) */
    out.load = JSON.parse(json) as RecordedLoad | null;
  }
  if (o.variant !== undefined) {
    if (o.variant !== null && o.variant !== 'band' && o.variant !== 'mass') return { error: ORG_LOAD_SHAPE_ERROR };
    out.variant = o.variant;
  }
  return out;
}

/**
 * 새 화면의 칸(load · variant · loadResolver)을 실었는데 약속 번호(loadProtocol)가 없다 — 옛 길로 읽으면 그 칸을 말없이 버리게 되므로(스키마
 * 미적용의 옛 쓰기는 load 를 보지 않는다) 받지 않는다. 맞으면 null.
 */
export function orgLoadFieldsError(f: OrgLoadFields): string | null {
  if (f.loadProtocol === undefined && (f.load !== undefined || f.variant !== undefined || f.loadResolver !== undefined)) return ORG_LOAD_SHAPE_ERROR;
  return null;
}

/** 무게 기록 칸이 하나라도 있는가 */
export const hasOrgLoadFields = (f: OrgLoadFields) =>
  f.loadProtocol !== undefined || f.loadResolver !== undefined || f.load !== undefined || f.variant !== undefined;

const num = (v: unknown, min: number, max: number, int: boolean): number | null => {
  const n = typeof v === 'number' ? v : v == null || v === '' ? NaN : Number(v);
  if (!Number.isFinite(n) || n < min || n > max) return null;
  return int ? Math.round(n) : Math.round(n * 10) / 10;
};

/** 보낸 코치 운동 거르기 — 아는 운동만(세트는 운동 목록을 가리킨다), 같은 운동은 한 줄로 합침, 세트마다 무게 · 횟수 · 버틴 초 중 하나는 있어야 한다 */
export function cleanOrgWork(raw: unknown, known: ReadonlySet<string>): OrgWorkItem[] | { error: string } {
  if (!Array.isArray(raw)) return { error: '운동을 다시 골라 주세요.' };
  if (raw.length > ORG_WORK_ITEMS_MAX) return { error: `운동은 ${ORG_WORK_ITEMS_MAX}개까지예요.` };
  const out = new Map<string, OrgSet[]>();
  for (const r of raw) {
    const o = (r && typeof r === 'object' ? r : {}) as Record<string, unknown>;
    if (typeof o.exerciseId !== 'string' || !known.has(o.exerciseId)) return { error: '없는 운동이 섞여 있어요. 다시 골라 주세요.' };
    const sets: OrgSet[] = [];
    for (const x of Array.isArray(o.sets) ? o.sets : []) {
      const s = (x && typeof x === 'object' ? x : {}) as Record<string, unknown>;
      /* EX-LOAD01 R1-03 — 무게 기록 칸은 지우지 않고 그대로(모양만 본다). 뜻은 쓸 때 계약으로 */
      const lf = readOrgLoadFields(s);
      if ('error' in lf) return lf;
      const set: OrgSet = { weightKg: num(s.weightKg, 0.5, 500, false), reps: num(s.reps, 1, 200, true), holdSeconds: num(s.holdSeconds, 1, 600, true), ...lf };
      if (set.weightKg != null || set.reps != null || set.holdSeconds != null || set.load != null) sets.push(set);
    }
    const list = [...(out.get(o.exerciseId) ?? []), ...sets];
    if (list.length > ORG_WORK_SETS_MAX) return { error: `한 운동의 세트는 ${ORG_WORK_SETS_MAX}개까지예요.` };
    out.set(o.exerciseId, list);
  }
  return [...out].filter(([, sets]) => sets.length > 0).map(([exerciseId, sets]) => ({ exerciseId, sets }));
}

/** 코치 운동만 있는 판 */
export function orgPlan(add: readonly FrozenExercise[]): FrozenPlan {
  return { themeKey: ORG_THEME_KEY, themeLabel: ORG_THEME_LABEL, goal: null, exercises: add.map((e) => ({ ...e, fromOrg: true })) };
}

/** 판에 코치 운동 붙이기 — 이미 있는 운동(선수가 고른 것이든 코치 것이든)은 그대로, 없는 것만 뒤에 fromOrg 로 */
export function withOrgExercises(plan: FrozenPlan, add: readonly FrozenExercise[]): FrozenPlan {
  const fresh = add.filter((e) => !plan.exercises.some((k) => k.id === e.id)).map((e) => ({ ...e, fromOrg: true }));
  return fresh.length ? { ...plan, exercises: [...plan.exercises, ...fresh] } : plan;
}

/** 세트가 하나도 안 남은 코치 운동을 판에서 빼기 — 뺀 운동 id 도 돌려준다(그 운동의 요약 줄을 지우게) */
export function withoutEmptyOrgExercises(plan: FrozenPlan, withSets: ReadonlySet<string>): { plan: FrozenPlan; dropped: string[] } {
  const dropped = plan.exercises.filter((e) => e.fromOrg && !withSets.has(e.id)).map((e) => e.id);
  return dropped.length ? { plan: { ...plan, exercises: plan.exercises.filter((e) => !dropped.includes(e.id)) }, dropped } : { plan, dropped };
}

/** 'org' 판에 코치 운동이 하나도 안 남았나 — 그러면 판째 지운다 */
export const isEmptyOrgPlan = (plan: FrozenPlan) => plan.themeKey === ORG_THEME_KEY && plan.exercises.length === 0;
