import { REST_CLOCK_LIMIT_SECONDS } from '@/lib/workout/rest';
import type { PlayerItem } from '@/app/(session)/armcare/play/[id]/armcare-player';

/**
 * 암케어 따라 하기의 진행 셈(순수 — 화면 없이 시험이 바로 부른다, scripts/native-armcare-run-selftest.mts).
 * 화면: native/src/app/armcare/[id].tsx.
 */
/**
 * 버티기 · 쉬기 시계 — 도는 동안은 끝날 시각(endsAt), 멈추면 남은 시간(left, ms). 시계를 바꿀 때마다 새 객체라, 끝난 시계 · 지난 시계의 늦은
 * 알림(타이머 · 앱 복귀 · 단추)은 지금 시계와 같지 않아 버려진다(같은 쪽 · 세트를 두 번 세지 않게).
 */
export type Clock = { kind: 'hold' | 'rest'; endsAt: number; total: number; left?: number };

export type State = {
  index: number;
  /** 운동마다 한 세트 수 */
  sets: number[];
  /** 운동마다 다 했는가(시작 때 이미 한 것 포함) */
  done: boolean[];
  /** 좌우 각각 버티는 운동에서 지금 버틸 쪽 — 0 한쪽, 1 반대쪽 */
  side: 0 | 1;
  clock: Clock | null;
  /** 방금 마친 운동 — [다음 운동]을 누를 때까지 '이 운동 끝'에 머문다 */
  completed: number | null;
  finished: boolean;
};

export type Action =
  | { type: 'hold'; at: number }
  | { type: 'set'; at: number }
  /* 시계가 다 돌았거나 [직접 완료] · [휴식 건너뛰기]를 눌렀다 — 어느 시계인지 함께 */
  | { type: 'clock-end'; clock: Clock; at: number }
  | { type: 'pause'; clock: Clock; at: number }
  | { type: 'resume'; clock: Clock; at: number }
  /* 현재 버티기 취소 — 그 쪽은 안 한 것으로, 마친 쪽 · 세트는 그대로 */
  | { type: 'cancel'; clock: Clock }
  | { type: 'next' }
  | { type: 'go'; index: number }
  | { type: 'finish' }
  /* 완료 화면의 '남은 운동 이어하기' — 첫 안 한 운동으로 */
  | { type: 'reopen' };

/** 좌우 각각 버티는 운동 — 한 세트에 한쪽씩 두 번 버틴다 */
export const twoSides = (it: PlayerItem) => it.perSide && it.holdSeconds != null;

/** 아직 안 한 다음 운동 — 없으면 null */
export function nextUndone(done: boolean[], from: number): number | null {
  for (let k = 1; k <= done.length; k++) {
    const i = (from + k) % done.length;
    if (!done[i]) return i;
  }
  return null;
}

export function reduce(s: State, a: Action, items: PlayerItem[]): State {
  switch (a.type) {
    case 'hold': {
      if (s.clock || s.completed != null || s.done[s.index]) return s;
      const secs = items[s.index].holdSeconds ?? 0;
      return { ...s, clock: { kind: 'hold', endsAt: a.at + secs * 1000, total: secs } };
    }
    case 'set': {
      const i = s.index;
      /* 끝난 운동 · 이미 한 운동의 늦은 누름은 버린다(마지막 세트를 두 번 누르면 다음 운동의 1세트로 들어가던 것) */
      if (s.completed != null || s.done[i]) return s;
      /* 한쪽을 버텼다 — 세트는 반대쪽까지 해야 끝난다 */
      if (twoSides(items[i]) && s.side === 0) return { ...s, side: 1, clock: null };
      const sets = s.sets.map((n, k) => (k === i ? n + 1 : n));
      if (sets[i] < items[i].sets) {
        /* 아직 세트가 남았다 — 쉬는 시계. 운동 화면처럼 10분에서 자른다 */
        const secs = Math.min(items[i].restSeconds, REST_CLOCK_LIMIT_SECONDS);
        return { ...s, sets, side: 0, clock: secs > 0 ? { kind: 'rest', endsAt: a.at + secs * 1000, total: secs } : null };
      }
      /* 이 운동을 마쳤다 — 여기 머문다. 체크는 아래 effect 가 남긴다 */
      const done = s.done.map((d, k) => (k === i ? true : d));
      return { ...s, sets, done, side: 0, clock: null, completed: i };
    }
    case 'clock-end':
      /* 시계가 끝나는 순간 단추도 눌렀으면 둘 다 들어온다 — 먼저 온 것이 시계를 바꿔 두므로 뒤에 온 것은 버린다(한 세트를 두 번 세지 않게) */
      if (s.clock !== a.clock) return s;
      return a.clock.kind === 'hold' ? reduce({ ...s, clock: null }, { type: 'set', at: a.at }, items) : { ...s, clock: null };
    case 'pause':
      if (s.clock !== a.clock || a.clock.left != null) return s;
      return { ...s, clock: { ...a.clock, left: Math.max(0, a.clock.endsAt - a.at) } };
    case 'resume':
      if (s.clock !== a.clock || a.clock.left == null) return s;
      return { ...s, clock: { kind: a.clock.kind, total: a.clock.total, endsAt: a.at + a.clock.left } };
    case 'cancel':
      if (s.clock !== a.clock || a.clock.kind !== 'hold') return s;
      return { ...s, clock: null };
    case 'next': {
      if (s.completed == null) return s;
      const n = nextUndone(s.done, s.completed);
      return n == null ? s : { ...s, index: n, completed: null, side: 0, clock: null };
    }
    case 'go':
      if (a.index < 0 || a.index >= items.length) return s;
      return { ...s, index: a.index, side: 0, clock: null, completed: null };
    case 'finish':
      return { ...s, clock: null, completed: null, finished: true };
    case 'reopen': {
      const first = s.done.findIndex((x) => !x);
      return first === -1 ? s : { ...s, finished: false, index: first, side: 0, clock: null, completed: null };
    }
  }
}

/**
 * 처음 상태 — 시작 때 이미 한 운동(before)은 건너뛰고 첫 안 한 운동부터. before 는 서버가 그날 체크로 준 것(doneBefore)에 폰 대기열의 뜻을 얹은 것
 * (아직 못 보낸 체크는 한 것, 보낼 해제는 안 한 것 — 첫 화면의 수 · 이어하기와 같은 셈). 모두 했으면 완료(기록 열람)로 연다.
 */
export function initState(list: PlayerItem[], before: boolean[] = list.map((it) => it.doneBefore)): State {
  const done = list.map((_, i) => before[i] ?? false);
  const first = done.findIndex((x) => !x);
  return {
    index: first === -1 ? 0 : first,
    sets: list.map((it, i) => (done[i] ? it.sets : 0)),
    done,
    side: 0,
    clock: null,
    completed: null,
    finished: list.length > 0 && first === -1,
  };
}
