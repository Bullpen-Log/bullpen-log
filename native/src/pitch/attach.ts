import * as ImagePicker from 'expo-image-picker';
import { File, FileMode, Paths } from 'expo-file-system';
import { useSyncExternalStore } from 'react';
import { readLabFileFacts } from '@/lib/pitch-lab-file';
import { APP_API_HEADER, APP_API_LEVEL } from '@/lib/app-api';
import { LocalVideo } from '../../modules/local-video';
import { SITE_URL } from '~/lib/site';
import { syncSession } from '~/lib/rpc';
import { ApiError } from './api';

/**
 * 고른 영상을 투구 기록에 붙일 경로로 — 웹 entry-form · video-upload 와 같은 규칙: 회원은 폰의 앱 안(LocalVideo, 서버엔 경로 `{userId}/local-…`
 * 만 — upload-url 이 만들어 준다), 관리자는 서버 저장소(서명 주소로 PUT). 기록 폼 · 지난 영상 가져오기가 같이 쓴다.
 */
async function uploadUrl(body: unknown): Promise<{ path: string; signedUrl?: string }> {
  await syncSession();
  const res = await fetch(`${SITE_URL}/api/pitch-log/upload-url`, {
    method: 'POST',
    credentials: 'include',
    headers: { 'content-type': 'application/json', [APP_API_HEADER]: String(APP_API_LEVEL) },
    body: JSON.stringify(body),
  });
  const json = (await res.json().catch(() => null)) as { path?: string; signedUrl?: string; error?: string } | null;
  if (!res.ok || !json?.path) throw new ApiError(json?.error ?? '영상을 올릴 준비를 못 했어요.');
  return { path: json.path, signedUrl: json.signedUrl };
}

/** 관리자에게 서버가 서명 주소를 내주는 한도 — 사이트 lib/storage.ts ADMIN_MAX_VIDEO_BYTES(서버 전용 파일이라 값만 같게, 2026-10-20 500MB) */
const SERVER_MAX_BYTES = 500 * 1024 * 1024;

/** 파일 크기 — 사진 선택기가 fileSize 를 안 줄 때 파일에서 읽는다(예전엔 1 로 속여 서버를 지나쳐 올리기에서 막혔다) */
function sizeOf(asset: ImagePicker.ImagePickerAsset): number | null {
  if (asset.fileSize) return asset.fileSize;
  try {
    return new File(asset.uri).size ?? null;
  } catch {
    return null;
  }
}

/**
 * 폰의 앱 안에 넣는다. LocalVideo.saveFile 은 앱 임시 · 캐시 폴더의 파일만 받는다 — 사진 선택기가 다른 자리(읽기 전용 · 다른 폴더)의
 * 주소를 주면 'path' 로 막히니, 그때는 캐시로 한 번 복사해 넣고 복사본을 지운다.
 */
async function saveToPhone(uri: string): Promise<string> {
  try {
    return (await LocalVideo.saveFile({ path: uri })).id;
  } catch (e) {
    if ((e as { code?: string }).code !== 'path') throw e;
    const ext = uri.split('?')[0].split('.').pop()?.toLowerCase() || 'mov';
    const copy = new File(Paths.cache, `bullpen-import-${Date.now()}.${ext}`);
    await new File(uri).copy(copy);
    try {
      return (await LocalVideo.saveFile({ path: copy.uri })).id;
    } finally {
      try {
        copy.delete();
      } catch {
        /* 캐시라 iOS 가 언젠가 지운다 */
      }
    }
  }
}

/**
 * 고른 영상 하나를 붙일 경로로 — 회원은 폰에 넣고 경로만 받고, 관리자는 서버에 올린다.
 * 관리자 자료는 늘 서버에 둔다(2026-10-20 김민) — 서버 한도(관리자 500MB)를 넘으면 폰에 넣지 않고 웹과 같은 안내로 막는다
 * (웹 components/video-upload.tsx). 크기를 모르면 서버가 서명 주소를 줄 때 한 번 더 본다.
 */
export async function attach(asset: ImagePicker.ImagePickerAsset, admin: boolean): Promise<string> {
  const size = sizeOf(asset);
  if (!admin) {
    const id = await saveToPhone(asset.uri);
    try {
      return (await uploadUrl({ localId: id })).path;
    } catch (e) {
      /* 경로를 못 받으면 폰에 넣은 파일은 아무도 모른다 — 바로 지운다(안 지우면 영영 남았다) */
      void LocalVideo.remove({ ids: [id] }).catch(() => undefined);
      throw e;
    }
  }
  if (size != null && size > SERVER_MAX_BYTES) {
    throw new ApiError(
      `500MB 이하만 올릴 수 있어요(고른 영상 ${Math.round(size / 1024 / 1024)}MB). 사진 앱의 '편집'에서 던지는 부분만 남기고 잘라 주세요.`
    );
  }
  const type = asset.mimeType?.startsWith('video/') ? asset.mimeType : 'video/quicktime';
  const target = await uploadUrl({ fileName: asset.fileName ?? 'pitch.mov', fileSize: size ?? 1, fileType: type });
  if (!target.signedUrl) throw new ApiError('영상을 올릴 주소를 받지 못했어요.');
  let blob: Blob;
  try {
    blob = await (await fetch(asset.uri)).blob();
  } catch {
    throw new ApiError('영상 파일을 읽지 못했어요. 다시 골라 주세요.');
  }
  const put = await fetch(target.signedUrl, { method: 'PUT', headers: { 'content-type': type }, body: blob }).catch(() => null);
  if (!put) throw new ApiError('신호가 약해 영상을 올리지 못했어요.');
  if (!put.ok) throw new ApiError(put.status === 413 ? '영상이 너무 커서 올리지 못했어요.' : `영상을 올리지 못했어요(${put.status}).`);
  return target.path;
}

/** 영상 넣기 오류 → 화면 글. 서버 글(ApiError) · 폰 모듈 글(LocalVideo 의 '저장할 수 없는 파일이에요.' 등)을 그대로, 나머지는 기본 글 */
export function attachErrorText(e: unknown, fallback: string): string {
  if (e instanceof ApiError) return e.message;
  const msg = e instanceof Error ? e.message : '';
  /* 폰 모듈 글만(한글) — 영어 시스템 글은 기본 글로 */
  return /[가-힣]/.test(msg) ? msg : fallback;
}

/* 사진 앱의 원본 그대로 — 기본(automatic)은 HEVC 를 H.264 로 바꿔 내보내며 60fps · 머리의 찍은 시각을 잃을 수 있다 */
export const PICK_ORIGINAL: ImagePicker.ImagePickerOptions = {
  mediaTypes: ['videos'],
  quality: 1,
  preferredAssetRepresentationMode: ImagePicker.UIImagePickerPreferredAssetRepresentationMode.Current,
};

/**
 * 고른 영상 파일 머리(moov)에서 찍은 시각을 — 웹과 같은 lib/pitch-lab-file.ts 를 쓴다. 그 함수는 Blob 의 slice · arrayBuffer 만 부르니
 * 파일 손잡이(expo-file-system)를 그 모양으로 감싼다(영상 전체를 메모리에 안 올림).
 */
export async function readVideoFacts(uri: string) {
  /* 읽기 전용 — 기본(읽기 · 쓰기)은 사진 선택기가 준 읽기 전용 파일에서 막힌다 */
  const handle = new File(uri).open(FileMode.ReadOnly);
  try {
    const size = handle.size ?? 0;
    const blob = {
      size,
      slice: (from: number, to: number) => ({
        arrayBuffer: async () => {
          handle.offset = from;
          const bytes = await handle.readBytes(Math.max(0, to - from));
          return bytes.buffer.slice(bytes.byteOffset, bytes.byteOffset + bytes.byteLength);
        },
      }),
    };
    return await readLabFileFacts(blob as unknown as Blob);
  } finally {
    handle.close();
  }
}

/* 가져오기 묶음 중 기록으로 남긴 것 — 기록 폼이 저장하면 표시하고, 가져오기 화면이 듣는다(앱을 끄면 사라진다 — 그 화면도 같이 닫힌다) */
const imported = new Set<string>();
const importSubs = new Set<() => void>();
let importVersion = 0;
export function markImported(key: string) {
  imported.add(key);
  importVersion++;
  importSubs.forEach((f) => f());
}
/** 로그아웃 — 앞사람 가져오기 표시를 지운다 */
export function resetImported() {
  imported.clear();
  importVersion++;
  importSubs.forEach((f) => f());
}
export function useImported(): ReadonlySet<string> {
  useSyncExternalStore(
    (f) => {
      importSubs.add(f);
      return () => importSubs.delete(f);
    },
    () => importVersion
  );
  return imported;
}
