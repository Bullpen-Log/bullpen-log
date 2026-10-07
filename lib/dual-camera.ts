'use client';

import { useSyncExternalStore } from 'react';

/**
 * 아이폰 앱의 일반 · 광각 동시 촬영 부품(앱 쪽 'DualCamera' 플러그인 — mobile/ios, 2026-10-03 계획의 2단계)이 있나.
 *
 * 웹 화면(사파리 · 앱 안의 웹뷰)은 카메라를 한 번에 하나만 켠다 — 두 번째를 켜면 앞의 카메라가 멈춘다(WebKit). 그래서
 * 광각 영상을 일반 카메라와 함께 찍는 일은 앱이 카메라를 직접 잡아야 한다(애플 AVCaptureMultiCamSession). 그 부품이
 * 든 앱이면 true. 설정 '광각 영상도 같이 저장'의 안내가 이것을 본다.
 */
export const DUAL_CAMERA_PLUGIN = 'DualCamera';

type CapacitorLike = { isPluginAvailable?: (name: string) => boolean };

export function dualCameraAvailable(): boolean {
  if (typeof window === 'undefined') return false;
  const cap = (window as Window & { Capacitor?: CapacitorLike }).Capacitor;
  return cap?.isPluginAvailable?.(DUAL_CAMERA_PLUGIN) === true;
}

/* ── 이 기기에서 되나(2026-10-03 사용자: "동시에 못 쓰는 아이폰은 설정에서 보이되 못 켜게, 경고") ── */

/** 볼 자리 · 미리보기 자리 */
export type DualRect = { x: number; y: number; w: number; h: number };

/** 일반 카메라로 고를 수 있는 화질(16:9) 하나 — 앱 부품 status 의 modes */
export type DualMode = { short: number; long: number; maxFps: number };

/**
 * 되나 · 안 되면 까닭. 까닭(reason): web(앱이 아님) · old-app(부품이 없는 옛 앱) · multicam(두 카메라를 함께 못 켬) ·
 * no-ultrawide(광각 없음) · pair(그 둘을 함께 못 켬) · fps(함께 켤 때 60fps 를 못 냄) · cost(켜 보니 하드웨어 몫이 넘침) ·
 * error(검사 실패)
 */
export type DualStatus = {
  supported: boolean;
  reason?: string;
  modes?: DualMode[];
  /**
   * 앱 카메라(일반 하나)로 잴 수 있다 — 2026-10-08 부터의 앱(손떨림 보정 · 광각 없이 켜기 · 렌즈 보정 장면). 옛 앱은 이 칸이
   * 없어 웹 카메라로 잰다(광각 설정을 켜면 예전처럼 동시 촬영).
   */
  single?: boolean;
};

/** 상태 — 아직 모르면 null(검사 중) */
let statusNow: DualStatus | null = null;
let statusPromise: Promise<DualStatus> | null = null;
const statusListeners = new Set<() => void>();
const emitStatus = () => statusListeners.forEach((l) => l());

const isAppShell = () =>
  typeof window !== 'undefined' &&
  ((
    window as Window & { Capacitor?: { isNativePlatform?: () => boolean } }
  ).Capacitor?.isNativePlatform?.() === true ||
    navigator.userAgent.includes('BullpenLogApp'));

/** 한 번만 묻고 기억한다(기기가 바뀌지 않으니). 켜 보다 안 되면 markDualUnsupported 로 덮는다 */
export function dualCameraStatus(): Promise<DualStatus> {
  if (statusNow) return Promise.resolve(statusNow);
  if (statusPromise) return statusPromise;
  const settle = (s: DualStatus) => {
    statusNow = s;
    emitStatus();
    return s;
  };
  if (typeof window === 'undefined')
    return Promise.resolve({ supported: false, reason: 'web' });
  if (!dualCameraAvailable()) {
    return Promise.resolve(
      settle({ supported: false, reason: isAppShell() ? 'old-app' : 'web' })
    );
  }
  statusPromise = callDualCamera<DualStatus>('status')
    .then((s) =>
      settle({
        supported: s?.supported === true,
        reason: s?.supported === true ? undefined : (s?.reason ?? 'error'),
        modes: Array.isArray(s?.modes) ? s.modes : undefined,
        single: s?.single === true,
      })
    )
    .catch(() => settle({ supported: false, reason: 'error' }));
  return statusPromise;
}

/** 지금 아는 상태(검사 전이면 null) */
export const dualStatusNow = () => statusNow;

/**
 * 켜 보니 안 됐다(하드웨어 몫이 넘침 등) — 이 기기는 안 되는 것으로 기억한다(앱을 다시 열 때까지). single 이면 일반 카메라
 * 하나로도 안 켜졌다 — 앱 카메라 길을 접고 웹 카메라로 잰다.
 */
export function markDualUnsupported(reason: string, single = false) {
  statusNow = {
    supported: false,
    reason,
    modes: statusNow?.modes,
    single: single ? false : statusNow?.single,
  };
  statusPromise = Promise.resolve(statusNow);
  emitStatus();
}

const subscribeStatus = (cb: () => void) => {
  statusListeners.add(cb);
  void dualCameraStatus();
  return () => {
    statusListeners.delete(cb);
  };
};

/** 화면에서 읽기 — 검사 중이면 null. 서버에서 그릴 때는 null */
export function useDualCameraStatus(): DualStatus | null {
  return useSyncExternalStore(
    subscribeStatus,
    () => statusNow,
    () => null
  );
}

/** 안 되는 까닭을 사람 말로 */
export function dualReasonText(reason: string | undefined): string {
  switch (reason) {
    case 'web':
      return '아이폰 앱에서만 돼요 — 브라우저는 카메라를 한 번에 하나만 켤 수 있어요.';
    case 'old-app':
      return '앱을 최신으로 업데이트하면 쓸 수 있어요.';
    case 'multicam':
      return '이 아이폰은 두 카메라를 함께 켤 수 없어요(아이폰 XS · XR · SE 이전).';
    case 'no-ultrawide':
      return '이 아이폰에는 광각(0.5x) 카메라가 없어요.';
    case 'pair':
      return '이 아이폰은 일반 · 광각 카메라를 함께 켤 수 없어요.';
    case 'fps':
    case 'cost':
      return '이 아이폰은 두 카메라를 함께 켜면 60fps 를 못 내요 — 측정 카메라는 60fps 이상이어야 해요.';
    default:
      return '이 아이폰에서는 일반 · 광각 동시 촬영을 쓸 수 없어요.';
  }
}

export type DualStartInfo = {
  mainFps: number;
  wideFps: number;
  /** 세로 화면 기준 픽셀 */
  mainWidth: number;
  mainHeight: number;
  wideWidth: number;
  wideHeight: number;
  /** 긴 변 방향 화각(도) — 엔진의 '카메라 가로 화각'으로 넘긴다 */
  mainFovDeg: number;
  wideFovDeg: number;
  /** 두 카메라를 함께 켜는 하드웨어 몫(1 이하여야 켜진다) */
  hardwareCost: number;
  /** 일반 카메라의 손떨림 보정 — 'standard' · 'off'(옛 앱은 없음 = 꺼짐) */
  stabilization?: string;
};

/** 앱이 잘라 넘긴 클립 하나 — read 로 조금씩 읽어 Blob 으로 만든다 */
export type DualClip = {
  path: string;
  /** 클립 안에서 던짐이 일어난 시각(초) */
  eventSec: number;
  durationSec: number;
  bytes: number;
  fps: number;
  width: number;
  height: number;
  fovDeg: number;
  /** 화각을 어디서 얻었나 — intrinsics(렌즈 값) · format(보정 없음) · estimate(보정이 자른 몫을 짐작). 옛 앱은 없음 = format */
  fovSource?: string;
  stabilized?: boolean;
};

type NativeBridge = {
  nativePromise?: (
    plugin: string,
    method: string,
    options?: unknown
  ) => Promise<unknown>;
};

/** 앱 부품 부르기 — 앱이 아니거나 부품이 없으면 던진다 */
export async function callDualCamera<T>(method: string, options?: unknown): Promise<T> {
  const cap = (window as Window & { Capacitor?: NativeBridge }).Capacitor;
  if (!cap?.nativePromise || !dualCameraAvailable()) {
    throw new Error('이 기기에는 일반 · 광각 동시 촬영이 없어요.');
  }
  return (await cap.nativePromise(DUAL_CAMERA_PLUGIN, method, options)) as T;
}

/** 클립 파일을 조금씩(1MB) 읽어 Blob 으로 — 다 읽으면 앱의 임시 파일을 지운다 */
export async function readDualClip(clip: DualClip): Promise<Blob> {
  const parts: BlobPart[] = [];
  let offset = 0;
  for (;;) {
    const chunk = await callDualCamera<{ data: string; size: number; eof: boolean }>(
      'read',
      {
        path: clip.path,
        offset,
        length: 1024 * 1024,
      }
    );
    const bytes = Uint8Array.from(atob(chunk.data), (c) => c.charCodeAt(0));
    parts.push(bytes);
    offset += bytes.length;
    if (chunk.eof || bytes.length === 0) break;
  }
  await callDualCamera('discard', { paths: [clip.path] }).catch(() => undefined);
  return new Blob(parts, { type: 'video/mp4' });
}
