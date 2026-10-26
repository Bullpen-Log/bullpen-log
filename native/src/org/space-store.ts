import * as Linking from 'expo-linking';
import { router } from 'expo-router';
import { useEffect, useState, useSyncExternalStore } from 'react';
import { Alert } from 'react-native';
import type { MySpace } from '@/app/actions/app-org';
import { ME, NO_ORG, parseSpaceKey, resolveSpace, spaceKeyOf, type SpaceKey } from '@/lib/org/space-nav';
import { rpc } from '~/lib/rpc';
import { loadJson, saveJson } from '~/lib/store';
import { toast } from '~/shell/toast';
import { SITE_URL } from '~/lib/site';
import { openWebAfter } from '~/shell/web-nav';

/**
 * 지금 공간(계약 8절) — 내 싱커 · 팀 · 레슨장 가운데 어디를 보고 있나. 껍데기(app/index.tsx)가 아래 탭 · 덮개를 고르고, 고르개(app/org/pick.tsx) ·
 * 소속 관리(app/org/index.tsx) · 홈 머리가 바꾼다. 바꾸기는 서버에 아무것도 쓰지 않는다(소속 · 공유 그대로).
 *
 * - 로그인한 사람마다 따로 폰에 둔다(`bullpen-space:<userId>`) — 다른 계정이 로그인해도 섞이지 않는다.
 * - 저장된 공간은 서버 목록(app-org.loadMySpaces)으로 확인한 뒤에만 믿는다(켤 때 · 앱이 앞으로 올 때 · 권한 없음 뒤 — refreshSpaces).
 * - 마스터 계정은 내 싱커가 없다 — 잃으면 다른 관리 조직, 없으면 '조직 없음'(NO_ORG).
 */
type Spaces = { ok: true; hasSinker: boolean; spaces: MySpace[]; former: MySpace[] };
type State = {
  owner: string | null;
  /** 서버 목록으로 확인했나 */
  ready: boolean;
  hasSinker: boolean;
  spaces: MySpace[];
  former: MySpace[];
  key: SpaceKey;
  /** 공간마다 마지막 탭 — 내 싱커의 탭 · 종목 바 상태와 따로 */
  tabs: Record<string, string>;
};
const EMPTY: State = { owner: null, ready: false, hasSinker: true, spaces: [], former: [], key: ME, tabs: {} };
let state: State = EMPTY;
const subs = new Set<() => void>();
const set = (patch: Partial<State>) => {
  state = { ...state, ...patch };
  subs.forEach((f) => f());
};
const storeKey = (userId: string) => `bullpen-space:${userId}`;
const persist = () => {
  if (state.owner) void saveJson(storeKey(state.owner), { key: state.key, hasSinker: state.hasSinker, spaces: state.spaces, former: state.former, tabs: state.tabs });
};

export const useSpace = () =>
  useSyncExternalStore(
    (f) => {
      subs.add(f);
      return () => subs.delete(f);
    },
    () => state
  );
export const spaceNow = () => state;
export const isOrgKey = (key: SpaceKey) => parseSpaceKey(key) != null;
export const spaceOf = (key: SpaceKey) => state.spaces.find((s) => spaceKeyOf(s) === key) ?? null;

/** 누가 로그인했는지 안 때(껍데기 ownerKnown) — 그 사람의 마지막 공간을 먼저 그리고 서버로 확인한다. 같은 사람이면 확인만(앱이 앞으로 올 때) */
export async function spaceOwner(userId: string) {
  if (state.owner !== userId) {
    state = { ...EMPTY, owner: userId };
    subs.forEach((f) => f());
    const saved = (await loadJson(storeKey(userId))) as Partial<State> | null;
    if (state.owner !== userId) return;
    if (saved && typeof saved.key === 'string' && Array.isArray(saved.spaces))
      set({
        key: saved.key,
        hasSinker: saved.hasSinker !== false,
        spaces: saved.spaces,
        former: Array.isArray(saved.former) ? saved.former : [],
        tabs: saved.tabs && typeof saved.tabs === 'object' ? saved.tabs : {},
      });
  }
  await refreshSpaces();
}

/** 서버 목록으로 다시 확인 — 고른 공간이 사라졌으면 옮기고 한 줄 알린다 */
export async function refreshSpaces(): Promise<void> {
  const owner = state.owner;
  if (!owner) return;
  let r: Spaces | { ok: false };
  try {
    r = await rpc<Spaces | { ok: false; to: string }>('app-org.loadMySpaces');
  } catch {
    return; /* 꺼진 망 — 받아 둔 목록 그대로, 화면은 서버가 동작마다 다시 본다 */
  }
  if (state.owner !== owner || !r.ok) return;
  const before = state.key;
  const lostName = spaceOf(before)?.name ?? null;
  const { key, lost } = resolveSpace(before, r.hasSinker, r.spaces);
  set({ ready: true, hasSinker: r.hasSinker, spaces: r.spaces, former: r.former ?? [], key });
  persist();
  if (lost) {
    const who = lostName ? `${lostName} 공간을` : '그 공간을';
    toast(key === ME ? `${who} 더는 볼 수 없어 내 싱커로 왔어요` : key === NO_ORG ? `${who} 더는 볼 수 없어요` : `${who} 더는 볼 수 없어 다른 곳으로 옮겼어요`, 'error');
  }
}

/** 공간 바꾸기 — 고르개 · 소속 관리 · 알림. 서버에 아무것도 안 쓴다 */
export function setSpace(key: SpaceKey, tab?: string) {
  if (key !== ME && key !== NO_ORG && !spaceOf(key)) return;
  if (key === ME && !state.hasSinker) return;
  orgReturn = null;
  set({ key, tabs: tab ? { ...state.tabs, [key]: tab } : state.tabs });
  persist();
}
export function setSpaceTab(key: SpaceKey, tab: string) {
  if (state.tabs[key] === tab) return;
  set({ tabs: { ...state.tabs, [key]: tab } });
  persist();
}

/** 로그아웃 — 메모리만 비운다(폰의 열쇠는 사람마다라 다음 사람과 안 섞인다) */
export function resetSpace() {
  orgReturn = null;
  drafts.clear();
  state = EMPTY;
  subs.forEach((f) => f());
}

/* ── 조직 일에서 연 개인 운동 — 마치면 그 공간 · 탭으로(계약 8-4) ── */

let orgReturn: { key: SpaceKey; tab: string } | null = null;
export const setOrgReturn = (key: SpaceKey, tab: string) => {
  orgReturn = { key, tab };
};
/** 운동을 마치거나 나갈 때 — 출발한 조직 공간이 아직 있으면 쌓인 화면을 걷고 그 탭으로(true). 없으면 false(부르는 쪽이 원래대로) */
export function consumeOrgReturn(): boolean {
  const r = orgReturn;
  orgReturn = null;
  if (!r || !spaceOf(r.key)) return false;
  if (router.canDismiss()) router.dismissAll();
  set({ key: r.key, tabs: { ...state.tabs, [r.key]: r.tab } });
  persist();
  return true;
}

/* ── 쓰던 글 — 조직 쓰기 화면이 저장 안 한 내용이 있으면 알린다(계약 8-5) ── */

const drafts = new Set<symbol>();
export const markDraft = (id: symbol, dirty: boolean) => {
  if (dirty) drafts.add(id);
  else drafts.delete(id);
};
export const hasDraft = () => drafts.size > 0;
/** 쓰기 화면이 부른다 — dirty 동안 '쓰던 글'로 센다 */
export function useDraftGuard(dirty: boolean) {
  const [id] = useState(() => Symbol('draft'));
  useEffect(() => {
    markDraft(id, dirty);
    return () => markDraft(id, false);
  }, [id, dirty]);
}

/** 덕아웃 열기(조직 공간 더보기) — 내 싱커가 있으면 내 싱커의 덕아웃 탭으로 옮기고, 마스터 계정은 브라우저로(덕아웃은 휴대폰 브라우저에서도 열린다) */
export function openDugout() {
  if (state.hasSinker) openWebAfter('/?dugout=1');
  else void Linking.openURL(`${SITE_URL}/?dugout=1`);
}

/**
 * 조직 동작이 '권한 없음'(ORG_LOST)을 돌려줬을 때 — 앱 useLoad 가 부른다. 쓰던 글이 있으면 화면을 걷지 않고 알리기만 한다(글은 고를 수 있게 남김).
 * 없으면 쌓인 화면을 걷고 공간을 다시 확인한다.
 */
export function orgLost() {
  if (hasDraft()) {
    Alert.alert('이 팀 · 레슨장에 더는 쓸 수 없어요', '나왔거나 명단에서 빠졌을 수 있어요. 적은 글은 복사해 두세요.');
    void refreshSpaces();
    return;
  }
  if (router.canDismiss()) router.dismissAll();
  void refreshSpaces();
}

/** 다른 공간으로 옮겨도 될까 — 쓰던 글이 있으면 묻는다(알림으로 다른 조직을 열 때). 남겨 두기는 아직 없어 버릴지 머무를지 고른다 */
export function confirmLeaveDrafts(): Promise<boolean> {
  if (!hasDraft()) return Promise.resolve(true);
  return new Promise((done) =>
    Alert.alert('저장 안 한 내용이 있어요', '옮기면 적던 내용이 사라져요.', [
      { text: '머무르기', style: 'cancel', onPress: () => done(false) },
      {
        text: '버리고 옮기기',
        style: 'destructive',
        onPress: () => {
          drafts.clear();
          done(true);
        },
      },
    ])
  );
}
