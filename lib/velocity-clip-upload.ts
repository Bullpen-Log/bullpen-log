'use client';

import { unstable_rethrow } from 'next/navigation';
import { attachClip, createClipUpload } from '@/app/actions/velocity';
import { localVideoAvailable, saveBlobToPhone } from '@/lib/local-video';

/* 서버 액션이 신호 끊김으로 던지면 — 부르는 쪽(저장 · 전환)이 오류 화면으로 넘어가지 않게 실패로 돌려준다 */
const OFFLINE = { ok: false, error: '신호가 약해 클립을 올리지 못했어요.' } as const;

/**
 * 공 하나의 영상 클립을 저장소에 올리고 공에 적는다 — 측정 화면(카메라 클립)과 관리자의
 * '영상 파일로 재기'가 같이 쓴다. 흐름은 투구 영상 업로드(components/video-upload.tsx)와 같다:
 * 서버 액션으로 서명 주소를 받고 → 브라우저가 PUT 으로 직접 올리고 → 경로를 적는다.
 */
export async function uploadClip(
  pitchId: string,
  blob: Blob,
  info: { sec: number | null; eventSec: number | null },
  onProgress?: (percent: number) => void,
  /** 'wide' 면 같은 공의 광각 카메라 영상 칸에 적는다 */
  kind: 'main' | 'wide' = 'main',
  /**
   * 회원 클립 — 서버가 아니라 폰의 앱 안에(lib/local-video.ts, 2026-10-10 사용자: 회원 클립은 폰, 숫자 계산용 분석
   * 정보만 서버). 부품이 없는 옛 앱 · 웹은 예전처럼 서버. 관리자의 보정용 저장은 늘 서버(false).
   */
  toPhone = false
): Promise<{ ok: true; path: string } | { ok: false; error: string }> {
  const mime = blob.type || 'video/webm';
  if (toPhone && localVideoAvailable()) {
    let localId: string;
    try {
      localId = await saveBlobToPhone(blob, (p) => onProgress?.(Math.round(p * 100)));
    } catch (e) {
      return { ok: false, error: e instanceof Error ? e.message : '폰에 저장하지 못했어요.' };
    }
    try {
      const attached = await attachClip(
        pitchId,
        { path: '', localId, bytes: blob.size, sec: info.sec, mime, eventSec: info.eventSec },
        kind
      );
      return attached;
    } catch (err) {
      unstable_rethrow(err);
      return OFFLINE;
    }
  }
  let target: Awaited<ReturnType<typeof createClipUpload>>;
  try {
    target = await createClipUpload(pitchId, mime, blob.size);
  } catch (err) {
    unstable_rethrow(err);
    return OFFLINE;
  }
  if (!target.ok) return target;

  try {
    await new Promise<void>((resolve, reject) => {
      const xhr = new XMLHttpRequest();
      xhr.open('PUT', target.signedUrl);
      xhr.setRequestHeader('Content-Type', mime);
      xhr.upload.onprogress = (e) => {
        if (e.lengthComputable) onProgress?.(Math.round((e.loaded / e.total) * 100));
      };
      xhr.onload = () =>
        xhr.status >= 200 && xhr.status < 300
          ? resolve()
          : reject(new Error('클립 업로드에 실패했습니다.'));
      xhr.onerror = () =>
        reject(new Error('네트워크 오류로 클립을 올리지 못했습니다.'));
      xhr.send(blob);
    });
  } catch (e) {
    return {
      ok: false,
      error: e instanceof Error ? e.message : '클립을 올리지 못했습니다.',
    };
  }

  let attached: Awaited<ReturnType<typeof attachClip>>;
  try {
    attached = await attachClip(
      pitchId,
      {
        path: target.path,
        bytes: blob.size,
        sec: info.sec,
        mime,
        eventSec: info.eventSec,
      },
      kind
    );
  } catch (err) {
    unstable_rethrow(err);
    return OFFLINE;
  }
  if (!attached.ok) return attached;
  return { ok: true, path: target.path };
}
