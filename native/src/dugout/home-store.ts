import { useSyncExternalStore } from 'react';
import type { MeetupCard, MeetupDetail } from '@/app/actions/app-dugout';
import { rpc, RpcError } from '~/lib/rpc';
import { cacheEpoch, cacheGet, cacheSet } from '~/lib/store';
import { keepSelected } from './rail-model';

/**
 * 덕아웃 탭 '같이 연습' 모임 목록 — 고른 모임은 자리(번호)가 아니라 모임 id 로 쥔다. 목록을 새로 받거나(돌아왔을 때 · 지역을 바꿨을 때) 더 받거나
 * 마감 · 참가로 숫자가 바뀌어도 같은 모임을 가리키고, 그 모임이 사라졌을 때만 그 자리 근처 모임으로 옮긴다.
 * 이어 받기는 장 단위(한 장 20개, 서버가 처음부터 그 장 수만큼 다시 읽는다 — community.loadAppCommunity 와 같은 방식, 10장까지).
 * 지역은 이 폰에만(로그아웃 때 같이 지운다 — cacheSet).
 */
export type Region = { region: string | null; district: string | null };
type State = {
  region: Region;
  items: MeetupCard[] | null;
  hasMore: boolean;
  pages: number;
  loading: boolean;
  error: string | null;
  selected: string | null;
};
const START: State = { region: { region: null, district: null }, items: null, hasMore: false, pages: 1, loading: false, error: null, selected: null };
let state: State = START;
const subs = new Set<() => void>();
const set = (next: Partial<State>) => {
  state = { ...state, ...next };
  subs.forEach((f) => f());
};
const REGION_KEY = 'dugout-region';
const MAX_PAGES = 10;

const messageOf = (e: unknown) =>
  e instanceof RpcError && e.code === 'offline' ? '신호가 약해 모임을 받지 못했어요.' : e instanceof RpcError && e.code === 'update' ? '앱을 업데이트해 주세요.' : '모임을 불러오지 못했어요.';

let regionRead: Promise<void> | null = null;
const readRegion = () =>
  (regionRead ??= cacheGet(REGION_KEY).then((v) => {
    const r = v as Partial<Region> | null;
    if (r && typeof r.region === 'string') set({ region: { region: r.region, district: typeof r.district === 'string' ? r.district : null } });
  }));

let inflight: Promise<void> | null = null;
/* 지역을 바꾸면 세대를 올린다 — 앞 지역으로 가던 읽기의 답은 버린다 */
let gen = 0;
export function reloadMeetups(pages = state.pages, force = false): Promise<void> {
  if (inflight && !force) return inflight;
  const e = cacheEpoch();
  const g = gen;
  set({ loading: true });
  inflight = readRegion()
    .then(() => rpc<{ ok: true; items: MeetupCard[]; hasMore: boolean } | { ok: false; error: string }>('app-dugout.loadAppMeetups', state.region.region, state.region.district, pages))
    .then((r) => {
      if (e !== cacheEpoch() || g !== gen) return;
      if (!r.ok) return set({ error: r.error, loading: false });
      set({ items: r.items, hasMore: r.hasMore, pages, error: null, loading: false, selected: keepSelected(state.items, r.items, state.selected) });
    })
    .catch((err: unknown) => {
      if (e === cacheEpoch() && g === gen) set({ error: messageOf(err), loading: false });
    })
    .finally(() => {
      if (g === gen) inflight = null;
    });
  const mine = inflight;
  return mine;
}

/** 끝 가까이 오면 다음 장 — 이미 받는 중이거나 더 없으면 그만 */
export function loadMoreMeetups() {
  if (inflight || !state.hasMore || state.pages >= MAX_PAGES) return;
  void reloadMeetups(state.pages + 1);
}

export function setMeetupRegion(region: Region) {
  void cacheSet(REGION_KEY, region);
  gen++;
  inflight = null;
  set({ region, pages: 1, selected: null, items: null, hasMore: false, error: null });
  void reloadMeetups(1, true);
}

export const selectMeetup = (id: string) => {
  if (state.selected !== id) set({ selected: id });
};

/** 상세 화면이 서버에서 받은 지금 모임 — 카드의 인원 · 참가 · 상태를 같은 값으로(목록을 다시 받지 않고) */
export function patchMeetup(m: MeetupDetail) {
  if (!state.items?.some((x) => x.id === m.id)) return;
  const { id, joins, joined, seats, state: st, stateLabel, capacity } = m;
  set({ items: state.items.map((x) => (x.id === id ? { ...x, joins, joined, seats, state: st, stateLabel, capacity } : x)) });
}

export function useMeetups(): State {
  return useSyncExternalStore(
    (f) => {
      subs.add(f);
      return () => subs.delete(f);
    },
    () => state
  );
}

export function resetMeetups() {
  state = START;
  gen++;
  inflight = null;
  regionRead = null;
  subs.forEach((f) => f());
}
