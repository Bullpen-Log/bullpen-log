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
  /* 암케어는 '제안'이라 안 해도 못 함이 아니다(U23) */
  return slot.items.some((x) => PLANNED.has(x.kind)) ? 'missed' : 'off';
}

/** 오늘 칸에서 시작할 것 — 앱 화면 주소(그 화면이 그날 운동을 엔진으로 만든다, R2). 운동 · 프로그램이 먼저 */
export type CoachStart = { kind: 'train' | 'mechanics' | 'armcare'; label: string; path: string };

export function startsOf(slot: DaySlot): CoachStart[] {
  const out: CoachStart[] = [];
  if (slot.items.some((x) => x.kind === 'train' || x.kind === 'program')) out.push({ kind: 'train', label: '운동 시작', path: '/training-today' });
  if (slot.items.some((x) => x.kind === 'mechanics')) out.push({ kind: 'mechanics', label: '메커니즘 드릴', path: '/training-mechanics' });
  if (slot.items.some((x) => x.kind === 'armcare')) out.push({ kind: 'armcare', label: '암케어', path: '/training-armcare' });
  return out;
}
