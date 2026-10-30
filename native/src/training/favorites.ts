import * as Haptics from 'expo-haptics';
import { useSyncExternalStore } from 'react';
import { leave } from '~/mechanics/parts';
import { rpc, RpcError } from '~/lib/rpc';
import { favOf, resetLibrarySync, retryFav, setFavSender, subscribeSync, syncSnap, wantFav, type FavKind } from '~/library/sync';

/**
 * 운동 · 드릴의 즐겨찾기 — 암케어 · 메카닉 줄, 운동 영상 목록 · 상세, 운동 진행 · 운동 추가가 같은 값을 본다(~/library/sync).
 * 저장은 웹과 같은 서버 동작: 운동은 바라는 값(favorite.setExerciseFavorite), 드릴은 뒤집기(favorite.toggleDrillFavorite) — 같은 것을 하나씩 보낸다.
 * 신호가 없어 답을 못 받으면(lost) 서버가 거절한 것과 따로 알리고, [다시 시도]는 같은 바람을 다시 보낸다.
 */
setFavSender(async (kind, id, want) => {
  try {
    return kind === 'exercise'
      ? await rpc<{ favorite: boolean }>('favorite.setExerciseFavorite', id, want)
      : await rpc<{ favorite: boolean }>('favorite.toggleDrillFavorite', id);
  } catch (e) {
    if (e instanceof RpcError && e.code === 'redirect') leave(e.to ?? '/login');
    if (e instanceof RpcError && e.code === 'offline') return { error: '신호가 없어 저장됐는지 확인하지 못했어요.', lost: true };
    return { error: e instanceof RpcError ? e.message : '저장하지 못했어요.' };
  }
});

/** 지금 별인가 — initial 은 화면이 받은 서버 값 */
export const isFav = favOf;

/**
 * 별 · 메모를 읽는 창 — 바뀌면 다시 그린다. 그리는 중에는 isFav 대신 이 창의 fav · note · status 로 읽는다(React Compiler 가
 * 같은 인자의 isFav 호출을 캐시해 바뀐 별을 못 보던 것, ~/library/sync syncSnap).
 */
export const useFavs = () => useSyncExternalStore(subscribeSync, syncSnap);

/** 로그아웃 — 앞사람이 바꾼 별 · 메모 · 목록 조건이 남지 않게 */
export const resetFavorites = resetLibrarySync;

/** 바라는 값으로(운동 진행 · 오늘 계획처럼 제 단추를 가진 곳) */
export function setFavorite(kind: FavKind, id: string, want: boolean, initial: boolean) {
  void Haptics.selectionAsync();
  wantFav(kind, id, want, initial);
}

export function useFav(kind: FavKind, id: string, initial: boolean) {
  const favs = useFavs();
  const on = favs.fav(kind, id, initial);
  const st = favs.status(kind, id);
  return {
    on,
    busy: st.sending,
    error: st.error,
    lost: st.lost,
    canRetry: st.canRetry,
    toggle: () => setFavorite(kind, id, !on, initial),
    retry: () => retryFav(kind, id, initial),
  };
}
