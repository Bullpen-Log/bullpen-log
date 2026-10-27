import { useSyncExternalStore } from 'react';
import { loadJson, saveJson } from '~/lib/store';
import type { IconName } from '~/shell/icon';
import type { ThreadIndex } from './ball/geometry';

/**
 * 내 라커(홈 맨 아래 — 내 공 꾸미기 · 스티커 · 공 잡기)의 저장 — 2026-10-27 홈 개편.
 *
 * 서버 동기화는 없다: 이 폰에만, 계정마다 따로(열쇠 'bullpen-locker:v1:<계정>'). 다른 계정이 로그인하면 메모리를 비우고 그 계정 것을 읽는다
 * (index.tsx ownerKnown → lockerOwner). 로그아웃해도 지우지 않는다 — 같은 사람이 다시 들어오면 그대로.
 *
 * 스티커는 종류마다 '처음 받은 날'만 적는다(하루마다 새로 받는 것이 아니다). 받는 조건은 서버가 확인한 사실만 본다 — 홈이 새로 받은 오늘 자료
 * (체크인 · 투구 · 휴식 기록이 있나, 오늘 운동을 다 했나)와 공 잡기 성공. 저장에 실패한 요청은 홈 자료에 안 나타나니 스티커도 안 준다.
 * 이 저장소는 건강 기록의 원본이 아니다 — 지워져도 기록은 서버에 있고, 다음에 홈을 받으면 체크인 · 투구 · 운동 스티커는 다시(조용히) 찬다.
 * 투구 수 · 구속 · 운동량이 많을수록 유리한 보상은 없다(휴식 기록 · 회복 운동도 같은 스티커).
 */
export type StickerKey = 'checkin' | 'pitch' | 'workout' | 'catch';

export const STICKERS: readonly { key: StickerKey; label: string; how: string }[] = [
  { key: 'checkin', label: '체크인', how: '체크인을 처음 남기면 받아요.' },
  { key: 'pitch', label: '투구 · 휴식', how: '투구나 휴식 기록을 처음 남기면 받아요. 쉰 날도 기록이에요.' },
  { key: 'workout', label: '운동 기록', how: '하루 운동을 처음 다 마치면 받아요. 회복 운동도 같아요.' },
  { key: 'catch', label: '캐치', how: '공 잡기에서 공을 처음 잡으면 받아요.' },
];

export const STICKER_ICON: Record<StickerKey, IconName> = {
  checkin: 'heart-pulse',
  pitch: 'circle-dot',
  workout: 'dumbbell',
  catch: 'hand',
};

export type Locker = {
  v: 1;
  thread: ThreadIndex;
  /** 공 잡기 누적 성공 */
  catches: number;
  /** 종류 → 처음 받은 날(YYYY-MM-DD) */
  stickers: Partial<Record<StickerKey, string>>;
};

export const EMPTY_LOCKER: Locker = { v: 1, thread: 0, catches: 0, stickers: {} };
const KEY = 'bullpen-locker:v1:';
const DATE = /^\d{4}-\d{2}-\d{2}$/;

/** 폰에서 읽은 값 — 모양이 하나라도 다르면 그 칸만 기본값(손으로 고친 값 · 옛 판이 와도 화면이 깨지지 않게) */
export function parseLocker(raw: unknown): Locker {
  if (!raw || typeof raw !== 'object') return EMPTY_LOCKER;
  const o = raw as Record<string, unknown>;
  if (o.v !== 1) return EMPTY_LOCKER;
  const thread = o.thread === 0 || o.thread === 1 || o.thread === 2 ? o.thread : 0;
  const catches = typeof o.catches === 'number' && Number.isInteger(o.catches) && o.catches >= 0 ? Math.min(o.catches, 1_000_000) : 0;
  const stickers: Locker['stickers'] = {};
  if (o.stickers && typeof o.stickers === 'object')
    for (const s of STICKERS) {
      const d = (o.stickers as Record<string, unknown>)[s.key];
      if (typeof d === 'string' && DATE.test(d)) stickers[s.key] = d;
    }
  return { v: 1, thread, catches, stickers };
}

/** 홈 자료가 알려 준 오늘의 사실 → 처음 받는 스티커. 이미 받은 것은 그대로(날짜도 안 바꾼다) */
export function grantStickers(
  locker: Locker,
  facts: Partial<Record<StickerKey, boolean>>,
  today: string
): { next: Locker; gained: StickerKey[] } {
  const gained: StickerKey[] = [];
  const stickers = { ...locker.stickers };
  for (const s of STICKERS)
    if (facts[s.key] && !stickers[s.key]) {
      stickers[s.key] = today;
      gained.push(s.key);
    }
  return gained.length ? { next: { ...locker, stickers }, gained } : { next: locker, gained };
}

export const stickerCount = (l: Locker) => STICKERS.filter((s) => l.stickers[s.key]).length;

/* ── 저장소(메모리 + 폰) ── */
type State = { owner: string | null; ready: boolean; locker: Locker };
let state: State = { owner: null, ready: false, locker: EMPTY_LOCKER };
const listeners = new Set<() => void>();
let readyWaiters: (() => void)[] = [];
const set = (next: State) => {
  state = next;
  listeners.forEach((l) => l());
  if (next.ready) {
    const w = readyWaiters;
    readyWaiters = [];
    w.forEach((f) => f());
  }
};
const save = () => {
  if (state.owner && state.ready) void saveJson(KEY + state.owner, state.locker);
};

/** 마지막으로 로그인한 계정 — 꺼진 망으로 앱을 켜 계정을 아직 모를 때도 그 사람 라커(공 색)를 먼저 보인다. 로그아웃하면 지운다 */
const LAST = 'bullpen-locker:last';

/** 누가 로그인했나(null = 로그아웃) — 메모리를 그 사람 것으로. 앞사람 라커가 한 장면도 비치지 않게 먼저 비운다 */
export async function lockerOwner(owner: string | null): Promise<void> {
  if (owner === state.owner && (state.ready || owner == null)) return;
  set({ owner, ready: false, locker: EMPTY_LOCKER });
  void saveJson(LAST, owner);
  if (!owner) return;
  const raw = await loadJson(KEY + owner);
  if (state.owner !== owner) return;
  set({ owner, ready: true, locker: parseLocker(raw) });
}

/** 지금 계정의 라커를 다 읽은 뒤 — 읽기 전에 스티커를 주면 폰의 값을 덮는다 */
function whenReady(owner: string): Promise<boolean> {
  if (state.ready) return Promise.resolve(state.owner === owner);
  return new Promise((res) => readyWaiters.push(() => res(state.owner === owner)));
}

function update(f: (l: Locker) => Locker) {
  if (!state.ready) return;
  set({ ...state, locker: f(state.locker) });
  save();
}

export const setThread = (thread: ThreadIndex) => update((l) => (l.thread === thread ? l : { ...l, thread }));

/** 공 잡기 성공 한 번 — 처음이면 캐치 스티커도. 받은 스티커를 돌려준다 */
export function recordCatch(today: string): StickerKey[] {
  if (!state.ready) return [];
  const { next, gained } = grantStickers({ ...state.locker, catches: state.locker.catches + 1 }, { catch: true }, today);
  set({ ...state, locker: next });
  save();
  return gained;
}

/** 홈 자료로 스티커 주기 — 지금 계정의 라커를 다 읽은 뒤에. 계정을 아직 모르거나 그새 바뀌었으면 아무것도 안 한다(다음 홈 받기에 다시) */
export async function grantFromHome(facts: Partial<Record<StickerKey, boolean>>, today: string): Promise<StickerKey[]> {
  const owner = state.owner;
  if (!owner || !(await whenReady(owner))) return [];
  const { next, gained } = grantStickers(state.locker, facts, today);
  if (!gained.length) return [];
  set({ ...state, locker: next });
  save();
  return gained;
}

/* 앱을 켤 때 — 계정이 아직 안 정해졌으면 마지막 계정 것을 읽는다(정해지면 lockerOwner 가 맞춘다) */
void loadJson(LAST).then((id) => {
  if (typeof id === 'string' && id && state.owner == null) void lockerOwner(id);
});

export const lockerNow = () => state;
const subscribe = (l: () => void) => {
  listeners.add(l);
  return () => {
    listeners.delete(l);
  };
};
export function useLocker(): State {
  return useSyncExternalStore(subscribe, lockerNow, lockerNow);
}
