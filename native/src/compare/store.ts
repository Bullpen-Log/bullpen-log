import { useEffect, useSyncExternalStore } from 'react';
import { File } from 'expo-file-system';
import * as ImagePicker from 'expo-image-picker';
import { isPhoneVideoPath, phoneAssetId, phoneVideoPath } from '@/lib/phone-video-path';
import { LocalVideo } from '../../modules/local-video';
import { compareFs } from '~/compare/fs';
import { createStorage, type CompareStorage } from '~/compare/storage';
import type { NewSource, RecentEntry } from '~/compare/doc';
import { normalizeFacts } from '~/compare/timing';
import { PICK_ORIGINAL, dropPickerTemp, readVideoFacts, saveToPhone } from '~/pitch/attach';

/**
 * 비교 문서 저장소(앱 쪽) — 누가 로그인했는지(ownerKnown) 정해지면 그 사람 폴더의 저장소를 연다. 로그아웃하면 메모리만 비운다
 * (문서는 그 사람 폴더에 남아 같은 사람이 다시 로그인하면 이어서 본다 — 다른 계정은 폴더가 달라 못 본다).
 * 최근 비교 목록은 여기서 한 번 읽어 투구 탭 · 비교 화면이 같이 쓴다.
 */
type State = { owner: string | null; recent: RecentEntry[] | null; version: number };
let state: State = { owner: null, recent: null, version: 0 };
let storage: CompareStorage | null = null;
const subs = new Set<() => void>();
const emit = () => subs.forEach((f) => f());
const set = (p: Partial<State>) => {
  state = { ...state, ...p, version: state.version + 1 };
  emit();
};

export function setCompareOwner(userId: string) {
  if (state.owner === userId && storage) return;
  holds.clear();
  storage = createStorage(compareFs(userId), userId);
  set({ owner: userId, recent: null });
  void refreshRecent();
}

/** 로그아웃 — 메모리의 목록 · 저장소를 놓는다(열린 비교 화면은 소유자가 바뀐 것을 보고 저장을 멈춘다) */
export function resetCompareDocs() {
  storage = null;
  holds.clear();
  set({ owner: null, recent: null });
}

export const compareOwner = () => state.owner;
export const compareStorage = () => storage;

export async function refreshRecent() {
  const s = storage;
  const owner = state.owner;
  if (!s) return;
  const list = await s.recent().catch(() => [] as RecentEntry[]);
  if (storage === s && state.owner === owner) set({ recent: list });
}

export function useCompareStore() {
  const s = useSyncExternalStore(
    (f) => {
      subs.add(f);
      return () => subs.delete(f);
    },
    () => state
  );
  useEffect(() => {
    if (s.owner && s.recent === null) void refreshRecent();
  }, [s.owner, s.recent]);
  return s;
}

/*
 * 아직 문서 파일에 안 적힌 참조(열린 비교 화면의 문서 · 가져와서 고르는 중인 영상) — 지우기 · 정리가 이 경로는 남긴다.
 * 열쇠마다 경로 묶음(화면 하나 = 열쇠 하나). 계정이 바뀌면 비운다.
 */
const holds = new Map<string, Set<string>>();
export function holdPaths(key: string, paths: Iterable<string>) {
  holds.set(key, new Set(paths));
}
export function releaseHold(key: string) {
  holds.delete(key);
}
const heldPaths = (): ReadonlySet<string> => {
  const all = new Set<string>();
  for (const s of holds.values()) for (const p of s) all.add(p);
  return all;
};
const removePhoneCopies = async (paths: string[]) => {
  const ids = paths.filter((p) => isPhoneVideoPath(p)).map(phoneAssetId);
  if (ids.length) await LocalVideo.remove({ ids });
};

/**
 * 비교 지우기 — 문서를 지우고, 이 비교만 쓰던 앱 안 복사본(사진 앱에서 가져온 · 찍은 영상)도 폰에서 지운다.
 * '아무도 안 쓰나' 판정과 실제 지우기는 저장소 잠금 안에서 한 번에(사이에 다른 저장이 끼지 않게). 원본(사진 앱 · 기록 영상)은 그대로.
 */
export async function deleteComparison(id: string): Promise<boolean> {
  const s = storage;
  if (!s) return false;
  const r = await s.remove(id, { deleteAssets: removePhoneCopies, keep: heldPaths });
  await refreshRecent();
  return r.ok;
}

/** 가져왔다가 비교에 안 넣은 앱 안 복사본 정리 — 어느 문서도 · 열린 화면도 안 쓰는 것만 */
export async function discardImported(paths: string[]): Promise<void> {
  const s = storage;
  const mine = paths.filter((p) => isPhoneVideoPath(p));
  if (!s || !mine.length) return;
  await s.releaseAssets(mine, { deleteAssets: removePhoneCopies, keep: heldPaths }).catch(() => undefined);
}

/* 찍은 날 — 기기 날짜(투구 기록 날짜와 같은 기준) */
const localDateKey = (ms: number) => {
  const d = new Date(ms);
  return `${d.getFullYear()}-${String(d.getMonth() + 1).padStart(2, '0')}-${String(d.getDate()).padStart(2, '0')}`;
};

export type ImportKind = 'photos' | 'camera' | 'files';
export type ImportFail = 'owner' | 'permission' | 'save' | 'unsupported';
export type ImportResult = { sources: NewSource[]; error: ImportFail | null };

/** 파일 앱 고르기가 이 앱(설치된 expo-file-system)에 있는가 — 없으면 단추를 안 보인다 */
export const filesPickSupported = () => typeof (File as unknown as { pickFileAsync?: unknown }).pickFileAsync === 'function';

/**
 * 사진 앱 · 카메라 · 파일 앱에서 비교용으로 가져오기(F07) — 앱 안에 복사(원본 그대로, HEVC · 60fps · 찍은 시각 유지)하고 그 경로를 돌려준다.
 * 투구 기록 · 내 영상 목록에는 넣지 않는다(기록 없이 비교만 — R02). 서버에 올리지 않는다.
 * - 가져온 복사본은 holdKey 로 붙든다(화면이 문서에 넘기거나 버릴 때까지 — 다른 비교 지우기가 지우지 않게). 화면이 releaseHold · discardImported 한다.
 * - 고르는 사이 계정이 바뀌면(로그아웃 · 다른 계정) 가져온 복사본을 지우고 'owner' — 다른 계정 문서에 들어가지 않게.
 * - 여러 개 중 일부만 되면 된 것은 돌려주고 error 에 까닭(나머지는 지움). 고르다 취소하면 빈 목록.
 */
export async function importForCompare(kind: ImportKind, multi: boolean, holdKey: string): Promise<ImportResult> {
  const owner = state.owner;
  if (!owner) return { sources: [], error: 'owner' };
  const max = multi ? 2 : 1;
  let picked: { uri: string; duration?: number | null; width?: number; height?: number }[] = [];
  try {
    if (kind === 'camera') {
      const perm = await ImagePicker.requestCameraPermissionsAsync();
      if (!perm.granted) return { sources: [], error: 'permission' };
      /* 시스템 카메라 — 렌즈(초광각 포함) · 확대 · 방향은 시스템 화면에서 고른다. 장면 수(fps)는 아이폰 설정 > 카메라 를 따른다 */
      const res = await ImagePicker.launchCameraAsync({ mediaTypes: ['videos'], quality: 1, videoQuality: ImagePicker.UIImagePickerControllerQualityType.High });
      if (res.canceled || !res.assets?.length) return { sources: [], error: null };
      picked = res.assets;
    } else if (kind === 'photos') {
      const res = await ImagePicker.launchImageLibraryAsync({ ...PICK_ORIGINAL, allowsMultipleSelection: multi, selectionLimit: max });
      if (res.canceled || !res.assets?.length) return { sources: [], error: null };
      picked = res.assets;
    } else {
      if (!filesPickSupported()) return { sources: [], error: 'unsupported' };
      const res = multi ? await File.pickFileAsync({ mimeTypes: ['video/*'], multipleFiles: true }) : await File.pickFileAsync({ mimeTypes: ['video/*'] });
      if (res.canceled || !res.result) return { sources: [], error: null };
      picked = (Array.isArray(res.result) ? res.result : [res.result]).map((f) => ({ uri: f.uri }));
    }
  } catch {
    return { sources: [], error: kind === 'files' ? 'unsupported' : 'save' };
  }
  const out: NewSource[] = [];
  let error: ImportFail | null = null;
  for (const asset of picked.slice(0, max)) {
    let path: string | null = null;
    try {
      const head = await readVideoFacts(asset.uri).catch(() => null);
      const id = await saveToPhone(asset.uri);
      path = phoneVideoPath(owner, id);
      if (!path) throw new Error('path');
      /* 넣는 순간부터 붙든다 — 화면이 넘기기 전에 다른 비교 지우기가 이 복사본을 지우지 않게 */
      holdPaths(holdKey, [...(holds.get(holdKey) ?? []), path]);
      const ms = head?.startMs ?? null;
      out.push({
        path,
        origin: kind === 'files' ? 'photos' : kind,
        owned: true,
        label: kind === 'files' ? '파일에서 가져옴' : null,
        date: ms ? localDateKey(ms) : null,
        facts: normalizeFacts({ durationSec: head?.durationSec ?? (asset.duration ? asset.duration / 1000 : null), width: asset.width ?? null, height: asset.height ?? null }),
      });
    } catch {
      error = 'save';
      if (path) void removePhoneCopies([path]).catch(() => undefined);
    } finally {
      dropPickerTemp(asset.uri);
    }
  }
  /* 고르는 사이 계정이 바뀌었다 — 가져온 것을 지우고 버린다 */
  if (state.owner !== owner) {
    releaseHold(holdKey);
    await removePhoneCopies(out.map((s) => s.path)).catch(() => undefined);
    return { sources: [], error: 'owner' };
  }
  return { sources: out, error };
}

export const IMPORT_FAIL_TEXT: Record<ImportFail, string> = {
  permission: '권한이 없어요. 설정 › 싱커에서 카메라 · 사진 접근을 켜 주세요.',
  owner: '로그인이 바뀌어 가져온 영상을 버렸어요. 다시 해 주세요.',
  save: '영상을 다 가져오지 못했어요. 저장 공간을 확인하고 다시 해 주세요.',
  unsupported: '이 앱에서는 파일 앱 고르기를 쓸 수 없어요. 사진 앱에서 골라 주세요.',
};
