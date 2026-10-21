import { NativeModule, requireNativeModule, requireNativeView } from 'expo';
import type { ComponentType } from 'react';
import type { StyleProp, ViewStyle } from 'react-native';
import type { Clip, DualCameraEvents, Point01, Rect01, StartInfo, StartOptions } from './DualCamera.types';

declare class DualCameraModule extends NativeModule<DualCameraEvents> {
  status(): Promise<{ supported: boolean; reason?: string; single?: boolean; modes?: { short: number; long: number; maxFps: number }[] }>;
  start(options: StartOptions): Promise<StartInfo>;
  stop(): Promise<void>;
  setPreview(options: { visible: boolean }): Promise<void>;
  setTrigger(options: { armed?: boolean; roi?: Rect01 }): Promise<void>;
  focus(options: { focus?: Point01; far?: boolean }): Promise<void>;
  /** 카메라 시계(초) — 알림 atSec 과 같은 시계. 옛 앱 판에는 없다 */
  now?(): number;
  clip(options: { atSec: number; beforeSec?: number; afterSec?: number }): Promise<{ main: Clip; wide: Clip | null }>;
  read(options: { path: string; offset: number; length?: number }): Promise<{ data: string; size: number; eof: boolean }>;
  discard(options: { paths: string[] }): Promise<void>;
  /** 폰 기울기 알림('level') 켜고 끄기 */
  level(options: { on: boolean }): Promise<void>;
  /** 회원 클립을 앱 안 영상 폴더로 → 영상 번호(UUID) */
  keep(options: { path: string }): Promise<{ id: string }>;
  /** 관리자 클립을 서명 주소로 PUT */
  upload(options: { path: string; url: string; contentType?: string }): Promise<{ status: number }>;
  /** 소리 안내 — 한국어로 읽는다(앞 말은 끊음). 2026-10-21 판부터, 옛 앱 판에는 없다 */
  speak?(text: string): Promise<void>;
  snapshot(options: { short?: number }): Promise<{ luma: string; width: number; height: number }>;
  diag(): Promise<Record<string, unknown>>;
  tune(options: { stabilization?: boolean; zoom?: number; lens?: number; autoFocus?: boolean }): Promise<Record<string, unknown>>;
}

export const DualCamera = requireNativeModule<DualCameraModule>('DualCamera');

/** 카메라 미리보기 자리 — 카메라를 켜면 이 안을 채운다 */
export const DualCameraPreview: ComponentType<{ style?: StyleProp<ViewStyle> }> = requireNativeView('DualCamera');
