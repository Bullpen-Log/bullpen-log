import { useSyncExternalStore } from 'react';
import type { AddRoutineResult, RoutineChoice } from '@/lib/armcare/routine-target';
import { targetStatus } from '@/lib/armcare/routine-target';
import { rpc, RpcError } from '~/lib/rpc';
import { cacheEpoch, loadJson, trySaveJson } from '~/lib/store';
import { loadMe } from '~/pitch/api';
import { leave } from '~/mechanics/parts';
import { toast } from '~/shell/toast';

type Operation = { routineId: string; exerciseId: string; title: string; status: 'adding' | 'unknown'; startedAt: number };
type State = { owner: string | null; epoch: number; routines: RoutineChoice[] | null; loading: boolean; fresh: boolean; error: string | null; op: Operation | null; checking: boolean; message: string | null; completed: { routineId: string; exerciseId: string } | null };
const empty = (): State => ({ owner: null, epoch: cacheEpoch(), routines: null, loading: false, fresh: false, error: null, op: null, checking: false, message: null, completed: null });
let state = empty();
const listeners = new Set<() => void>();
const emit = (patch: Partial<State>) => { state = { ...state, ...patch }; listeners.forEach((f) => f()); };
const key = (owner: string) => `sinker:armcare-target-operation:${owner}`;
let initializing: Promise<void> | null = null;
const current = (s: State) => s.epoch === cacheEpoch() && s.owner === state.owner;
const accessError = (e: unknown) => {
  if (!(e instanceof RpcError)) return false;
  if (e.code === 'redirect') { leave(e.to ?? '/login'); return true; }
  return ['FEATURE_LOCKED_BETA', 'PERMISSION_DENIED', 'update'].includes(e.code);
};
export const resetRoutineTargets = () => { state = empty(); initializing = null; listeners.forEach((f) => f()); };
async function timed<T>(promise: Promise<T>): Promise<T> {
  let timer: ReturnType<typeof setTimeout> | undefined;
  try { return await Promise.race([promise, new Promise<never>((_, reject) => { timer = setTimeout(() => reject(new Error('timeout')), 25000); })]); }
  finally { clearTimeout(timer); }
}
export const useRoutineTargets = () => useSyncExternalStore((f) => { listeners.add(f); return () => { listeners.delete(f); }; }, () => state);

export async function refreshTargets() {
  if (state.loading) return;
  const s = state;
  emit({ loading: true, error: null });
  try {
    const routines = await timed(rpc<RoutineChoice[]>('armcare.loadMyArmcareTargets'));
    if (current(s)) emit({ routines, loading: false, fresh: true });
  } catch (e) {
    if (!current(s)) return;
    const denied = accessError(e);
    emit({ loading: false, fresh: false, error: e instanceof RpcError && denied ? e.message : '내 루틴을 불러오지 못했어요.' });
  }
}
export function initializeTargets() {
  if (initializing) return initializing;
  const epoch = cacheEpoch();
  const task = (async () => {
    const me = await loadMe();
    if (epoch !== cacheEpoch()) return;
    if (state.owner !== me.userId || state.epoch !== epoch) {
      state = { ...empty(), owner: me.userId };
      const saved = await loadJson(key(me.userId)) as Operation | null;
      if (epoch !== cacheEpoch()) return;
      if (saved && typeof saved.routineId === 'string' && typeof saved.exerciseId === 'string') emit({ op: { ...saved, status: 'unknown' } });
    }
    await refreshTargets();
  })().catch((e: unknown) => {
    if (epoch !== cacheEpoch()) return;
    accessError(e);
    emit({ error: '내 루틴을 확인하지 못했어요.', fresh: false });
  }).finally(() => { if (initializing === task) initializing = null; });
  initializing = task;
  return task;
}
async function finish(s: State, routine: RoutineChoice, added: boolean) {
  if (!current(s)) return;
  // Keep the durable guard until the confirmed result has been persisted.
  await trySaveJson(key(s.owner!), null);
  if (!current(s)) return;
  emit({ op: null, checking: false, completed: { routineId: routine.id, exerciseId: s.op!.exerciseId }, message: added ? '루틴에 담았어요.' : '루틴에 담긴 것을 확인했어요.', routines: state.routines?.map((r) => r.id === routine.id ? routine : r) ?? [routine] });
  toast(added ? '루틴에 담았어요.' : '담긴 것을 확인했어요.');
  void refreshTargets();
}
export async function addToTarget(routineId: string, exerciseId: string, title: string) {
  if (state.op || state.checking || !state.fresh || !state.owner || state.epoch !== cacheEpoch()) return;
  const target = state.routines?.find((r) => r.id === routineId);
  if (!target || targetStatus(target, exerciseId) !== 'available') return;
  const op: Operation = { routineId, exerciseId, title, startedAt: Date.now(), status: 'adding' };
  emit({ op, message: null, completed: null }); // synchronous guard, before any await
  const s = state;
  if (!await trySaveJson(key(s.owner!), op)) {
    if (current(s)) emit({ op: null, message: '저장 준비를 마치지 못했어요. 다시 시도해 주세요.' });
    return;
  }
  if (!current(s)) return;
  try {
    const result = await timed(rpc<AddRoutineResult>('armcare.addToMyArmcareRoutine', routineId, exerciseId));
    if (!current(s)) return;
    if ('error' in result) {
      await trySaveJson(key(s.owner!), null);
      if (!current(s)) return;
      emit({ op: null, message: result.error, fresh: false });
      void refreshTargets();
    } else if (result.routine) await finish(s, result.routine, result.added);
    else { // older server: membership must be read, never infer a new count
      emit({ op: { ...op, status: 'unknown' } });
      await confirmTarget();
    }
  } catch (e) {
    if (!current(s)) return;
    if (accessError(e)) {
      await trySaveJson(key(s.owner!), null);
      if (current(s)) emit({ op: null, message: e instanceof Error ? e.message : '접근할 수 없어요.', fresh: false });
    } else emit({ op: { ...op, status: 'unknown' }, message: '담겼는지 확인이 필요해요.' });
  }
}
/**
 * Read only. A member that is absent after a fresh read means the add did not commit (or the routine is gone):
 * release the guard so the user can add again. Adding is idempotent on the server (already inside → added:false),
 * so a late commit of the first request cannot create a duplicate.
 */
export async function confirmTarget() {
  if (!state.op || state.checking || state.op.status === 'adding' || !state.owner) return;
  const s = state;
  const op = s.op!;
  emit({ checking: true });
  try {
    const routines = await timed(rpc<RoutineChoice[]>('armcare.loadMyArmcareTargets'));
    if (!current(s)) return;
    emit({ routines, fresh: true, error: null });
    const r = routines.find((r) => r.id === op.routineId);
    if (r?.exerciseIds.includes(op.exerciseId)) await finish(s, r, false);
    else {
      await trySaveJson(key(s.owner!), null);
      if (!current(s)) return;
      emit({ op: null, checking: false, message: r ? '루틴에 담기지 않았어요. 다시 담아 주세요.' : '대상 루틴이 없어졌어요. 다른 루틴을 골라 주세요.' });
    }
  } catch (e) {
    if (!current(s)) return;
    accessError(e);
    emit({ checking: false, message: '결과를 확인하지 못했어요. 다시 담지 않고 확인만 진행해요.' });
  }
}
