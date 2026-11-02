import { useEffect, useSyncExternalStore } from 'react';
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
  storage = createStorage(compareFs(userId), userId);
  set({ owner: userId, recent: null });
  void refreshRecent();
}

/** 로그아웃 — 메모리의 목록 · 저장소를 놓는다(열린 비교 화면은 소유자가 바뀐 것을 보고 저장을 멈춘다) */
export function resetCompareDocs() {
  storage = null;
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

/** 비교 지우기 — 이 비교만 쓰던 앱 안 복사본(사진 앱에서 가져온 · 찍은 영상)도 폰에서 지운다. 원본(사진 앱 · 기록 영상)은 그대로 */
export async function deleteComparison(id: string): Promise<boolean> {
  const s = storage;
  if (!s) return false;
  const r = await s.remove(id);
  const ids = r.orphanPaths.filter((p) => isPhoneVideoPath(p)).map(phoneAssetId);
  if (ids.length) await LocalVideo.remove({ ids }).catch(() => undefined);
  await refreshRecent();
  return r.ok;
}

/**
 * 사진 앱 · 카메라에서 비교용으로 가져오기 — 앱 안에 복사(원본 그대로, HEVC · 60fps · 찍은 시각 유지)하고 그 경로를 돌려준다.
 * 투구 기록 · 내 영상 목록에는 넣지 않는다(기록 없이 비교만 — R02). 서버에 올리지 않는다.
 * 고르다 취소하면 null(아무것도 안 남김). 넣다 실패하면 선택기 임시 파일을 지우고 던진다.
 */
/* 찍은 날 — 기기 날짜(투구 기록 날짜와 같은 기준) */
const localDateKey = (ms: number) => {
  const d = new Date(ms);
  return `${d.getFullYear()}-${String(d.getMonth() + 1).padStart(2, '0')}-${String(d.getDate()).padStart(2, '0')}`;
};

export type ImportFail = 'owner' | 'permission' | 'save';
export async function importForCompare(kind: 'photos' | 'camera', multi: boolean): Promise<NewSource[] | { error: ImportFail }> {
  const owner = state.owner;
  if (!owner) return { error: 'owner' };
  let res: ImagePicker.ImagePickerResult;
  if (kind === 'camera') {
    const perm = await ImagePicker.requestCameraPermissionsAsync();
    if (!perm.granted) return { error: 'permission' };
    /* 시스템 카메라 — 렌즈(초광각 포함) · 확대 · 방향은 시스템 화면에서 고른다. 장면 수(fps)는 아이폰 설정 > 카메라 를 따른다 */
    res = await ImagePicker.launchCameraAsync({ mediaTypes: ['videos'], quality: 1, videoQuality: ImagePicker.UIImagePickerControllerQualityType.High });
  } else {
    res = await ImagePicker.launchImageLibraryAsync({ ...PICK_ORIGINAL, allowsMultipleSelection: multi, selectionLimit: multi ? 2 : 1 });
  }
  if (res.canceled || !res.assets?.length) return [];
  const out: NewSource[] = [];
  for (const asset of res.assets.slice(0, multi ? 2 : 1)) {
    try {
      const head = await readVideoFacts(asset.uri).catch(() => null);
      const id = await saveToPhone(asset.uri);
      const path = phoneVideoPath(owner, id);
      if (!path) throw new Error('path');
      const ms = head?.startMs ?? null;
      out.push({
        path,
        origin: kind,
        owned: true,
        label: null,
        date: ms ? localDateKey(ms) : null,
        facts: normalizeFacts({ durationSec: head?.durationSec ?? (asset.duration ? asset.duration / 1000 : null), width: asset.width, height: asset.height }),
      });
    } catch {
      dropPickerTemp(asset.uri);
      return out.length ? out : { error: 'save' };
    } finally {
      dropPickerTemp(asset.uri);
    }
  }
  return out;
}
