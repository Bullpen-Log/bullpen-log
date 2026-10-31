import { EMPTY_VIEW, type LibraryView } from '~/library/browse';
import { EMPTY_DRILL_VIEW, type DrillView } from '~/library/drill-browse';

/**
 * 운동 별 · 메모를 화면끼리 같은 값으로(2026-10-31 시안 01 · 02) — 목록 · 상세 · 운동 진행 · 운동 추가 · 암케어가 같은 저장소를 본다.
 * 화면 없이 셈만(시험: scripts/native-library-selftest.mts). 서버에 보내는 일은 ~/training/favorites.ts 가 붙인다(setFavSender).
 *
 * 우선순위: 진행 중인 바꿈 > 이 앱에서 확인된 바꿈 > 화면이 받은 서버 값. 받은 값(initial)이 바꾸기 시작할 때 본 서버 값(base)과
 * 같으면 늦게 온 옛 목록이라 바꿈을 지키고, 바꾼 값과 같아지면(서버가 따라옴) 바꿈을 내려놓는다. base 와 다른 새 값이면(다른 기기에서
 * 바꿈) 진행 중이 아닐 때 서버를 따른다.
 */

let version = 0;
const subs = new Set<() => void>();
/*
 * 화면이 읽는 창 — 바뀔 때마다 새 객체. React Compiler 는 favOf(kind, id, initial) 처럼 인자가 같은 호출을 캐시해서, 저장소만 바뀌면 옛 값을
 * 그렸다(2026-10-31 미리보기: 목록 카드 별이 안 바뀜). 화면은 이 창(useFavs)을 통해 읽어 창이 바뀌면 다시 셈하게 한다.
 */
export type SyncSnap = { readonly fav: typeof favOf; readonly status: typeof favStatus; readonly note: typeof noteOf; readonly version: number };
let snap: SyncSnap;
const bump = () => {
  version++;
  snap = { fav: favOf, status: favStatus, note: noteOf, version };
  subs.forEach((f) => f());
};
export const subscribeSync = (f: () => void) => {
  subs.add(f);
  return () => {
    subs.delete(f);
  };
};
export const syncVersion = () => version;
export const syncSnap = () => snap;

/* ----------------------------- 별 ----------------------------- */

export type FavKind = 'exercise' | 'drill';
/** 서버에 보낸 답 — lost 는 응답을 못 받음(저장됐는지 모름), 그 밖의 error 는 서버가 확인한 실패 */
export type FavReply = { favorite: boolean } | { error: string; lost?: boolean };
/** 바라는 값을 그대로 보낸다(운동 · 드릴 모두 '켜라 / 꺼라' — 같은 값을 다시 보내도 같다) */
type Sender = (kind: FavKind, id: string, want: boolean) => Promise<FavReply>;

type FavEntry = {
  value: boolean;
  base: boolean;
  confirmed: boolean;
  sending: boolean;
  error: string | null;
  lost: boolean;
  /** 실패한 바람 — [다시 시도]가 같은 값을 다시 보낸다(뒤집기 아님) */
  retry: boolean | null;
};
const favs: Record<FavKind, Map<string, FavEntry>> = { exercise: new Map(), drill: new Map() };
let sender: Sender = async () => ({ error: '저장할 수 없어요.' });
export const setFavSender = (send: Sender) => {
  sender = send;
};

/** 지금 별인가 — initial 은 화면이 받은 서버 값 */
export function favOf(kind: FavKind, id: string, initial: boolean) {
  const e = favs[kind].get(id);
  if (!e) return initial;
  if (!e.sending && e.error == null && (initial === e.value || initial !== e.base)) {
    favs[kind].delete(id);
    return initial;
  }
  return e.value;
}

/** 저장 중 · 실패 상태(별 옆 알림 · 다시 시도) */
export function favStatus(kind: FavKind, id: string) {
  const e = favs[kind].get(id);
  return { sending: e?.sending ?? false, error: e?.error ?? null, lost: e?.lost ?? false, canRetry: e?.retry != null };
}

/**
 * 바라는 값으로 — 누르는 즉시 보이고, 같은 운동은 하나씩 보낸다. 보내는 동안 또 바꾸면 끝난 뒤 마지막 바람만 한 번 더 보낸다
 * (빠른 두 번 누름이 서로 엇갈리지 않게).
 */
export function wantFav(kind: FavKind, id: string, want: boolean, initial: boolean) {
  const shown = favOf(kind, id, initial);
  let e = favs[kind].get(id);
  if (!e) {
    e = { value: shown, base: initial, confirmed: shown, sending: false, error: null, lost: false, retry: null };
    favs[kind].set(id, e);
  }
  e.value = want;
  e.error = null;
  e.lost = false;
  e.retry = null;
  bump();
  if (!e.sending) void pump(kind, id, e);
}

export function retryFav(kind: FavKind, id: string, initial: boolean) {
  const e = favs[kind].get(id);
  if (e?.retry != null) wantFav(kind, id, e.retry, initial);
}

async function pump(kind: FavKind, id: string, e: FavEntry) {
  e.sending = true;
  bump();
  for (;;) {
    const want = e.value;
    const res = await sender(kind, id, want);
    /* 그새 계정이 바뀌었으면(reset) 이 답은 버린다 */
    if (favs[kind].get(id) !== e) return;
    if ('error' in res) {
      e.retry = e.value;
      e.value = e.confirmed;
      e.error = res.error;
      e.lost = res.lost === true;
      break;
    }
    e.confirmed = res.favorite;
    if (e.value === want || e.value === e.confirmed) {
      e.value = e.confirmed;
      break;
    }
    /* 보내는 동안 다시 바꿨다 — 마지막 바람을 한 번 더 */
  }
  e.sending = false;
  bump();
}

/* ----------------------------- 메모 ----------------------------- */

const notes = new Map<string, { value: string | null; base: string | null }>();

/** 지금 메모 — initial 은 화면이 받은 서버 값(목록 · 운동 판). 별과 같은 규칙 */
export function noteOf(id: string, initial: string | null) {
  const e = notes.get(id);
  if (!e) return initial;
  if (initial === e.value || initial !== e.base) {
    notes.delete(id);
    return initial;
  }
  return e.value;
}

/** 저장이 확인된 메모 — base 는 고치기 시작할 때 화면이 본 서버 값 */
export function rememberNote(id: string, value: string | null, base: string | null) {
  if (value === base) notes.delete(id);
  else notes.set(id, { value, base });
  bump();
}

/* ----------------------------- 목록 조건 ----------------------------- */

/** 운동 영상 목록의 조건 — 상세에 다녀와도 · 목록 화면을 다시 열어도 이대로. 계정이 바뀌면 지운다 */
let view: LibraryView = EMPTY_VIEW;
export const libraryView = () => view;
export const saveLibraryView = (next: LibraryView) => {
  view = next;
};
/** 투구 드릴 목록의 조건 — 같은 규칙. 3D 분석 · 훈련에서 들어온 목록은 제 조건을 따로 쓰고 여기 남기지 않는다 */
let drill: DrillView = EMPTY_DRILL_VIEW;
export const drillView = () => drill;
export const saveDrillView = (next: DrillView) => {
  drill = next;
};

/** 로그아웃 · 계정 바뀜 — 앞사람의 별 · 메모 · 목록 조건과 보내던 답을 버린다 */
export function resetLibrarySync() {
  favs.exercise.clear();
  favs.drill.clear();
  notes.clear();
  view = EMPTY_VIEW;
  drill = EMPTY_DRILL_VIEW;
  bump();
}

snap = { fav: favOf, status: favStatus, note: noteOf, version };
