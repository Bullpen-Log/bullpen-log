import { NativeModule, requireNativeModule } from 'expo';

/** 촬영 모드 앱 카메라(ios/ShootCameraModule.swift) — 웹 촬영 화면이 작은 다리(lib/cap-bridge.ts)로 부른다 */
declare class ShootCameraModule extends NativeModule {
  status(): Promise<{ version: number; camera: boolean; fps: number }>;
  /** 취소면 { cancelled: true }, 권한 없음 · 카메라 없음 · 이미 열림은 code denied · unavailable · busy */
  record(options: { maxSeconds?: number }): Promise<{ cancelled?: boolean; path?: string; size?: number }>;
  read(options: { path: string; offset?: number; length?: number }): Promise<{ data: string; size: number; eof: boolean }>;
  discard(options: { paths: string[] }): Promise<void>;
}

export const ShootCamera = requireNativeModule<ShootCameraModule>('ShootCamera');
