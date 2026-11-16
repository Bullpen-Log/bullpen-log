import type { DaySlot } from '@/lib/coach/week';

/**
 * 코치 칸의 상태(docs/designs/ai-coach.md 10-5) — 저장하지 않고 기록에서 읽는다(트레이닝 탭과 어긋나지 않게 기록 한 곳만 진실).
 * 한 것 = 그날 마친 운동 · 메커니즘 드릴 · 암케어(칸과 다른 날에 해도 센다 — 암케어는 언제든, 사용자 결정). 순수 파일.
 */
export type DayDone = { workout: boolean; armcare: boolean; drill: boolean };

/** done 한 것 · missed 지난 날인데 계획한 운동을 안 함 · today 오늘 · later 뒤 날 · off 지난 쉬는 날(못 함이 아님) */
export type SlotState = 'done' | 'missed' | 'today' | 'later' | 'off';

const PLANNED = new Set<DaySlot['items'][number]['kind']>(['train', 'program', 'mechanics']);

export function slotStateOf(slot: DaySlot, done: DayDone | undefined, today: string): SlotState {
  if (done && (done.workout || done.drill || done.armcare)) return 'done';
  if (slot.date > today) return 'later';
  if (slot.date === today) return 'today';
  /* 암케어는 '제안'이라 안 해도 못 함이 아니다(U23). 틀이 생기기 전에 지난 날(late)도 못 함이 아니다 — 본 적 없는 계획 */
  return !slot.late && slot.items.some((x) => PLANNED.has(x.kind)) ? 'missed' : 'off';
}

/**
 * 과제별 진행(AI 맥락용, 2026-11-16) — slotStateOf 는 하나만 해도 '한 것'이라 암케어만 한 날이 다 한 날로 읽혔다. 여기서는 계획한 과제
 * (운동 · 메커니즘 드릴)마다 했나를 가르고, 계획 밖에 한 것(암케어 · 쉬는 날 운동)은 따로 둔다. 암케어 제안은 안 해도 '안 한 것'이 아니다(U23).
 */
export type SlotProgress = { did: string[]; left: string[]; extra: string[] };

export function slotProgressOf(slot: DaySlot, done: DayDone | undefined): SlotProgress {
  const d = done ?? { workout: false, armcare: false, drill: false };
  const tasks: { label: string; planned: boolean; done: boolean }[] = [
    { label: '운동', planned: !slot.late && slot.items.some((x) => x.kind === 'train' || x.kind === 'program'), done: d.workout },
    { label: '메커니즘 드릴', planned: !slot.late && slot.items.some((x) => x.kind === 'mechanics'), done: d.drill },
    { label: '암케어', planned: false, done: d.armcare },
  ];
  return {
    did: tasks.filter((t) => t.planned && t.done).map((t) => t.label),
    left: tasks.filter((t) => t.planned && !t.done).map((t) => t.label),
    extra: tasks.filter((t) => !t.planned && t.done).map((t) => t.label),
  };
}

/** 오늘 칸에서 시작할 것 — 앱 화면 주소(그 화면이 그날 운동을 엔진으로 만든다, R2). 운동 · 프로그램이 먼저 */
export type CoachStart = { kind: 'train' | 'mechanics' | 'armcare' | 'recovery'; label: string; path: string };

export function startsOf(slot: DaySlot): CoachStart[] {
  const out: CoachStart[] = [];
  if (slot.items.some((x) => x.kind === 'train' || x.kind === 'program')) out.push({ kind: 'train', label: '운동 시작', path: '/training-today' });
  if (slot.items.some((x) => x.kind === 'mechanics')) out.push({ kind: 'mechanics', label: '메커니즘 드릴', path: '/training-mechanics' });
  if (slot.items.some((x) => x.kind === 'armcare')) out.push({ kind: 'armcare', label: '암케어', path: '/training-armcare' });
  /* 등판 다음 날 — 쉬어도 되고, 하고 싶으면 가벼운 회복 운동(그날 엔진이 회복 날 운동을 만든다). 맨 뒤라 큰 단추가 되지 않는다 */
  if (slot.items.some((x) => x.kind === 'rest' && x.light)) out.push({ kind: 'recovery', label: '가벼운 회복 운동(선택)', path: '/training-today' });
  return out;
}
