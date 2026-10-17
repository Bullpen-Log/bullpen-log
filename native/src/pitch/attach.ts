import * as ImagePicker from 'expo-image-picker';
import { File } from 'expo-file-system';
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

/** 고른 영상 하나를 붙일 경로로 — 회원은 폰에 넣고 경로만 받고, 관리자는 서버에 올린다 */
export async function attach(asset: ImagePicker.ImagePickerAsset, admin: boolean): Promise<string> {
  if (!admin) {
    const { id } = await LocalVideo.saveFile({ path: asset.uri });
    return (await uploadUrl({ localId: id })).path;
  }
  const type = asset.mimeType ?? 'video/quicktime';
  const target = await uploadUrl({ fileName: asset.fileName ?? 'pitch.mov', fileSize: asset.fileSize ?? 1, fileType: type });
  const blob = await (await fetch(asset.uri)).blob();
  const put = await fetch(target.signedUrl!, { method: 'PUT', headers: { 'content-type': type }, body: blob });
  if (!put.ok) throw new ApiError('영상을 올리지 못했어요.');
  return target.path;
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
  const handle = new File(uri).open();
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
