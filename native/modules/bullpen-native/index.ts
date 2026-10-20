import { requireNativeModule } from 'expo';

/** 앱 공용 부품 — ios/BullpenNativeModule.swift */
export const BullpenNative = requireNativeModule<{
  /** 웹뷰의 사이트 쿠키(로그인)를 앱 요청 저장소로 → 옮긴 수 */
  sync(host: string): Promise<number>;
  /** 거꾸로 — 웹뷰 저장소를 앱 저장소와 같게(앱에 없는 로그인은 웹뷰에서도 지움). 앱 화면이 로그인 · 로그아웃한 뒤 */
  mirror(host: string): Promise<number>;
  /** 두 저장소의 로그인 쿠키 지우기 — 로그인 화면에 왔을 때 */
  clearSession(host: string): Promise<void>;
  /** 앱 테마를 기억 — 다음 시작 화면(라이트 · 다크)이 이 테마로 뜬다 */
  setLaunchStyle?(pick: string): void;
  keepAwake(on: boolean): Promise<void>;
  scheduleAlarm(id: string, at: number, title: string, body: string): Promise<{ scheduled: boolean; denied?: boolean }>;
  cancelAlarm(id: string): Promise<void>;
  /** 운동하는 동안의 시계를 다이나믹 아일랜드 · 잠금 화면에(~/shell/live-activity) — 이 앱 판에 없으면 undefined(옛 앱) */
  liveShow?(kind: string, symbol: string, label: string, title: string, detail: string, sinceMs: number, untilMs: number): Promise<void>;
  liveEnd?(): Promise<void>;
}>('BullpenNative');
