'use client';

import type { LumaPlane } from '@/lib/abs/plate-detect';

let canvas: HTMLCanvasElement | null = null;

/** <video> 의 지금 장면을 루마(밝기) 면으로 — 플레이트 찾기용. 영상이 아직 없으면 null */
export function lumaOfVideo(video: HTMLVideoElement | null): LumaPlane | null {
  if (!video) return null;
  const w = video.videoWidth;
  const h = video.videoHeight;
  if (!w || !h || video.readyState < 2) return null;
  try {
    canvas ??= document.createElement('canvas');
    if (canvas.width !== w || canvas.height !== h) {
      canvas.width = w;
      canvas.height = h;
    }
    const ctx = canvas.getContext('2d', { willReadFrequently: true });
    if (!ctx) return null;
    ctx.drawImage(video, 0, 0, w, h);
    return lumaOfImageData(ctx.getImageData(0, 0, w, h));
  } catch {
    return null;
  }
}

/** 이미지(앱 카메라 스냅샷 등)를 루마 면으로 */
export function lumaOfImage(img: CanvasImageSource, w: number, h: number): LumaPlane | null {
  try {
    canvas ??= document.createElement('canvas');
    canvas.width = w;
    canvas.height = h;
    const ctx = canvas.getContext('2d', { willReadFrequently: true });
    if (!ctx) return null;
    ctx.drawImage(img, 0, 0, w, h);
    return lumaOfImageData(ctx.getImageData(0, 0, w, h));
  } catch {
    return null;
  }
}

export function lumaOfImageData(img: ImageData): LumaPlane {
  const n = img.width * img.height;
  const out = new Uint8Array(n);
  const d = img.data;
  for (let i = 0, j = 0; i < n; i++, j += 4) out[i] = (d[j] * 77 + d[j + 1] * 150 + d[j + 2] * 29) >> 8;
  return { data: out, width: img.width, height: img.height };
}
