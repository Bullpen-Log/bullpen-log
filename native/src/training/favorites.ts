import * as Haptics from 'expo-haptics';
import { useRef, useState, useSyncExternalStore } from 'react';
import { act } from '~/mechanics/parts';

/**
 * 암케어 운동 · 메커니즘 드릴의 즐겨찾기 — 줄의 별과 머리의 '즐겨찾기' 모음 창이 같은 값을 본다(2026-10-20 김민: "즐겨찾기한 것을 빨리 찾게").
 * 서버가 준 값(initial) 위에 이 화면에서 바꾼 것만 얹는다. 저장은 웹과 같은 서버 동작(favorite.*) — 실패하면 되돌리고 한 줄 알린다.
 */
type Kind = 'exercise' | 'drill';
/* base — 바꿀 때 본 서버 값. 서버가 그와 다른 값을 새로 주면(다시 받음 · 다른 기기에서 바꿈) 바꾼 것을 버리고 서버를 따른다 */
const changed: Record<Kind, Map<string, { value: boolean; base: boolean }>> = { exercise: new Map(), drill: new Map() };
const subs = new Set<() => void>();
let version = 0;
const bump = () => {
  version++;
  subs.forEach((f) => f());
};
const subscribe = (f: () => void) => {
  subs.add(f);
  return () => {
    subs.delete(f);
  };
};

/** 지금 별인가 — 바꾼 적 있으면 그 값, 없으면 서버 값. 서버가 바꾼 값을 따라왔거나 다른 값을 주면 바꾼 것은 버린다 */
export const isFav = (kind: Kind, id: string, initial: boolean) => {
  const o = changed[kind].get(id);
  if (!o) return initial;
  if (initial === o.value || initial !== o.base) {
    changed[kind].delete(id);
    return initial;
  }
  return o.value;
};

/** 별이 바뀌면 다시 그린다(모음 창의 목록처럼 여러 줄을 한 번에 보는 곳) */
export const useFavVersion = () => useSyncExternalStore(subscribe, () => version);

/** 로그아웃 — 앞사람이 바꾼 별이 남지 않게 */
export function resetFavorites() {
  changed.exercise.clear();
  changed.drill.clear();
  bump();
}

export function useFav(kind: Kind, id: string, initial: boolean) {
  useFavVersion();
  const on = isFav(kind, id, initial);
  const [busy, setBusy] = useState(false);
  /* 빠른 두 번 누름 — 상태(busy)는 다음 그림까지 안 바뀌어 둘째 누름이 반대 값을 또 보냈다 */
  const sending = useRef(false);
  const [error, setError] = useState<string | null>(null);
  const toggle = async () => {
    if (sending.current) return;
    sending.current = true;
    const next = !on;
    setBusy(true);
    setError(null);
    void Haptics.selectionAsync();
    changed[kind].set(id, { value: next, base: initial });
    bump();
    const res =
      kind === 'exercise'
        ? await act<{ favorite: boolean }>('favorite.setExerciseFavorite', id, next)
        : await act<{ favorite: boolean }>('favorite.toggleDrillFavorite', id);
    sending.current = false;
    setBusy(false);
    changed[kind].set(id, { value: 'error' in res ? on : res.favorite, base: initial });
    bump();
    if ('error' in res) setError(res.error);
  };
  return { on, busy, error, toggle };
}
