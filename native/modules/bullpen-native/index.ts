import { requireNativeModule } from 'expo';

/** 앱 공용 부품 — ios/BullpenNativeModule.swift */
export const BullpenNative = requireNativeModule<{
  /** 웹뷰의 사이트 쿠키(로그인)를 앱 요청 저장소로 → 옮긴 수 */
  sync(host: string): Promise<number>;
  keepAwake(on: boolean): Promise<void>;
  scheduleAlarm(id: string, at: number, title: string, body: string): Promise<{ scheduled: boolean; denied?: boolean }>;
  cancelAlarm(id: string): Promise<void>;
}>('BullpenNative');
