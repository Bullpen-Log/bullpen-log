import { useSyncExternalStore } from 'react';
import type { VelocitySessionView } from '@/lib/velocity-meta';
import { cacheEpoch, loadJson, removeKeysWhere, trySaveJson } from '~/lib/store';
import { rpc } from '~/lib/rpc';
import { ApiError, OfflineError, createLog, linkVelocity, loadMonth, updateLog, type PitchEntry, type PitchLog } from './api';
import { draftKey, findCreated, linkStatus, matchesEntry, readDraftBody, type DraftBody, type LinkResult, type LinkStatus } from './entry-model';
import { applySavedLog, monthOf, refreshMonth, reloadVelocityDays } from './store';

/**
 * 투구 기록 퀵스텝의 저장 — 남기기(POST) · 고치기(PATCH), 답을 못 받았을 때 '저장 여부 확인', 측정 연결 확인, 계정별 초안.
 * 저장 성공과 측정 연결 성공은 따로다. 확인된 저장 뒤의 다시 받기 · 연결 확인 실패는 저장 실패가 아니다(기록을 다시 보내지 않는다).
 */

export type SaveOutcome =
  /** 서버가 저장을 확인해 줌(답 · 또는 다시 읽어 찾음) */
  | { kind: 'saved'; log: PitchLog; link: LinkResult | null; linkStatus: LinkStatus }
  /** 서버가 받지 않음(검사 · 권한 등) — 고쳐서 다시 */
  | { kind: 'rejected'; message: string }
  /** 저장 안 됨이 확인됨(서버에 못 닿았고 다시 읽어 보니 없음) — 다시 저장해도 겹치지 않는다 */
  | { kind: 'notSaved'; message: string }
  /** 저장됐는지 모름(답을 못 받았고 다시 읽기도 못 함) — 확인부터 */
  | { kind: 'unknown'; message: string }
  /** 고치려던 기록이 그새 지워짐 */
  | { kind: 'deleted'; message: string };

/** 보내기 전에 그 달에 있던 기록 id — 답을 못 받으면 '보내기 전에 없던 기록'으로 방금 것을 찾는다. 못 읽으면 null(신호가 없다) */
export async function knownIdsOf(date: string, cached: readonly PitchLog[] | null): Promise<Set<string> | null> {
  if (cached) return new Set(cached.map((l) => l.id));
  try {
    return new Set((await loadMonth(monthOf(date))).map((l) => l.id));
  } catch {
    return null;
  }
}

/** 새 기록 */
export async function createEntry(entry: PitchEntry, knownIds: ReadonlySet<string>): Promise<SaveOutcome> {
  try {
    const r = await createLog(entry);
    const { velocityLink, ...log } = r;
    const link = velocityLink ?? (entry.velocitySessionIds?.length ? await confirmLinkViaDay(entry.date, log.id, entry.velocitySessionIds) : null);
    return { kind: 'saved', log, link, linkStatus: linkStatus(link, entry.velocitySessionIds ?? []) };
  } catch (e) {
    if (e instanceof OfflineError) return reconcileCreate(entry, knownIds);
    return { kind: 'rejected', message: e instanceof ApiError ? e.message : '저장하지 못했어요.' };
  }
}

/** 답을 못 받은 새 기록 — 그 달을 다시 읽어 생겼는지 본다. 생겼으면 저장된 것(다시 보내지 않는다) */
export async function reconcileCreate(entry: PitchEntry, knownIds: ReadonlySet<string>): Promise<SaveOutcome> {
  let logs: PitchLog[];
  try {
    logs = await loadMonth(monthOf(entry.date));
  } catch {
    return { kind: 'unknown', message: '저장됐는지 확인하지 못했어요. 신호가 돌아오면 확인해 주세요.' };
  }
  const found = findCreated(logs, entry, knownIds);
  /* 그 달을 읽었는데 없으면 저장 안 된 것 — 확인만 되풀이하면 그 날짜를 영영 못 남긴다 */
  if (!found) return { kind: 'notSaved', message: '저장되지 않았어요. 입력한 내용은 그대로 있어요. 다시 저장해 주세요.' };
  const ids = entry.velocitySessionIds ?? [];
  const link = ids.length ? await confirmLinkViaDay(entry.date, found.id, ids) : null;
  return { kind: 'saved', log: found, link, linkStatus: linkStatus(link, ids) };
}

/** 고치기(같은 id) — 답을 못 받으면 다시 읽어 그 값이 들어갔는지 본다. 고치기는 같은 값을 다시 보내도 같은 기록이 고쳐질 뿐이다 */
export async function updateEntry(id: string, entry: PitchEntry): Promise<SaveOutcome> {
  try {
    const log = await updateLog(id, entry);
    return { kind: 'saved', log, link: null, linkStatus: 'none' };
  } catch (e) {
    if (e instanceof ApiError && e.status === 404) return { kind: 'deleted', message: '이 기록은 다른 곳에서 지워졌어요.' };
    if (!(e instanceof OfflineError)) return { kind: 'rejected', message: e instanceof ApiError ? e.message : '저장하지 못했어요.' };
    try {
      const logs = await loadMonth(monthOf(entry.date));
      const now = logs.find((l) => l.id === id);
      if (!now) return { kind: 'deleted', message: '이 기록은 다른 곳에서 지워졌어요.' };
      /* 영상은 서버가 다른 기기 것을 더해 둘 수 있어 값만 견준다 */
      if (matchesEntry({ ...now, videoPaths: entry.videoPaths }, entry)) return { kind: 'saved', log: now, link: null, linkStatus: 'none' };
      return { kind: 'notSaved', message: '저장하지 못했어요. 입력한 내용은 그대로 있어요.' };
    } catch {
      return { kind: 'unknown', message: '저장됐는지 확인하지 못했어요. 다시 저장해도 같은 기록이 고쳐질 뿐이에요.' };
    }
  }
}

/**
 * 옛 서버(기록 답에 연결 결과가 없음) · 다시 읽어 찾은 기록 — 그날 측정을 읽어 그 세션이 이 기록을 가리키는지 본다. 못 읽으면 null(연결 확인 못 함)
 */
async function confirmLinkViaDay(date: string, logId: string, ids: string[]): Promise<LinkResult | null> {
  try {
    const r = await rpc<{ ok: true; sessions: VelocitySessionView[] } | { ok: false; error: string }>('app.loadAppVelocityDay', date);
    if (!r.ok) return null;
    const byId = new Map(r.sessions.map((s) => [s.id, s]));
    const linked: string[] = [];
    const failed: LinkResult['failed'] = [];
    for (const id of ids) {
      const s = byId.get(id);
      if (!s) failed.push({ id, reason: 'missing' });
      else if (s.pitchLogId === logId) linked.push(id);
      else if (s.pitchLogId) failed.push({ id, reason: 'other' });
      else failed.push({ id, reason: 'error' });
    }
    return { requested: ids, linked, failed };
  } catch {
    return null;
  }
}

/* ------------------------------------------------------------------ *
 * 저장 뒤 측정 연결이 확인되지 않은 기록 — 그날 화면 위에 한 줄로 남기고 '연결 다시 시도'만 한다(기록은 다시 보내지 않는다).
 * 앱을 켠 동안만(메모리). 로그아웃하면 지운다(resetLinkNotes).
 * ------------------------------------------------------------------ */
export type LinkNote = { date: string; logId: string; sessionIds: string[]; result: LinkResult | null; busy: boolean };
const notes = new Map<string, LinkNote>();
const subs = new Set<() => void>();
let version = 0;
const emit = () => {
  version++;
  subs.forEach((f) => f());
};
export function resetLinkNotes() {
  notes.clear();
  emit();
}
export function noteLink(n: Omit<LinkNote, 'busy'>) {
  const s = linkStatus(n.result, n.sessionIds);
  if (s === 'linked' || s === 'none') notes.delete(n.date);
  else notes.set(n.date, { ...n, busy: false });
  emit();
}
export function dismissLinkNote(date: string) {
  notes.delete(date);
  emit();
}
export function useLinkNote(date: string): LinkNote | null {
  useSyncExternalStore(
    (f) => {
      subs.add(f);
      return () => subs.delete(f);
    },
    () => version
  );
  return notes.get(date) ?? null;
}
/** 연결만 다시 — 다른 계정으로 바뀌었으면 결과를 버린다 */
export async function retryLink(date: string): Promise<void> {
  const n = notes.get(date);
  if (!n || n.busy) return;
  const epoch = cacheEpoch();
  notes.set(date, { ...n, busy: true });
  emit();
  let result: LinkResult | null = null;
  try {
    result = await linkVelocity(n.logId, n.sessionIds);
  } catch {
    result = await confirmLinkViaDay(date, n.logId, n.sessionIds);
  }
  if (epoch !== cacheEpoch()) return;
  noteLink({ date, logId: n.logId, sessionIds: n.sessionIds, result: result ?? n.result });
  const after = notes.get(date);
  if (after && result == null) notes.set(date, { ...after, busy: false });
  emit();
  void reloadVelocityDays();
}

/**
 * 확인된 저장 뒤 — 받아 둔 달에 바로 넣고(다시 받기는 뒤에서), 측정을 이었으면 달력 측정 점도 새로. 다시 받기가 실패해도 저장은 그대로다.
 */
export function afterSaved(log: PitchLog, date: string, epoch: number, linkedSomething: boolean) {
  applySavedLog(log, epoch);
  void refreshMonth(monthOf(date));
  if (linkedSomething) void reloadVelocityDays();
}

/* ------------------------------------------------------------------ *
 * 초안 — 계정(userId) · 날짜 · 기록마다. 영상은 담지 않는다.
 * ------------------------------------------------------------------ */
export async function loadEntryDraft(owner: string, date: string, recordId: string | null): Promise<DraftBody | null> {
  const raw = await loadJson(draftKey(owner, date, recordId));
  return readDraftBody(raw, { owner, date, recordId }, Date.now());
}
/** 남겼는지 돌려준다 — 못 남겼으면 '이 폰에 남겨 뒀어요'라고 하지 않는다 */
export const saveEntryDraft = (d: Omit<DraftBody, 'v' | 'savedAt'>) => trySaveJson(draftKey(d.owner, d.date, d.recordId), { ...d, v: 2, savedAt: Date.now() });
export const clearEntryDraft = (owner: string, date: string, recordId: string | null) => trySaveJson(draftKey(owner, date, recordId), null);
/**
 * 누가 로그인했는지 안 때 — 다른 계정의 초안과 주인을 모르는 옛 초안('pitch-draft:날짜:…', 계정 칸 없음)을 지운다.
 * 옛 초안은 누구 것인지 확인할 수 없어 새 계정에 채우지 않는다(같은 사람 것이었어도 — 신호가 끊겼을 때 7일만 남기던 글자 초안이다).
 */
export function dropPitchDraftsNotOf(userId: string) {
  void removeKeysWhere('pitch-draft:', (k) => !k.startsWith(`pitch-draft:v2:${userId}:`));
}

/** Durable unknown-write guard: reopening a form may only check the same request. */
type PendingEntry = { entry: PitchEntry; knownIds: string[]; form: DraftBody['form']; step: DraftBody['step'] };
const pendingKey = (owner: string, date: string) => `pitch-pending:${owner}:${date}`;
export const savePendingEntry = (owner: string, date: string, value: PendingEntry) => trySaveJson(pendingKey(owner, date), value);
export const clearPendingEntry = (owner: string, date: string) => trySaveJson(pendingKey(owner, date), null);
export async function loadPendingEntry(owner: string, date: string): Promise<PendingEntry | null> {
  const raw = await loadJson(pendingKey(owner, date)) as PendingEntry | null;
  return raw?.entry?.date === date && Array.isArray(raw.knownIds) && raw.form ? raw : null;
}
